/**
 * The single send path for AI command output.
 *
 * Discord renders no headings inside embeds, so long-form prose goes in
 * message content ('message' mode) with only the metadata in an embed.
 * Short structured output stays framed in an embed ('embed' mode) with
 * headings downgraded to bold.
 */
import { toDiscordMarkdown } from './discordMarkdown.js';
import { chunkForDiscord } from './discordChunker.js';

const MESSAGE_LIMIT = 2000;
// Deliberately under Discord's real 4096 so a continuation embed's own
// framing cannot push a payload over the edge. Not a drifted constant.
const EMBED_DESC_LIMIT = 4000;
const DEFAULT_COLOR = 0x5865F2;
const DEFAULT_MAX_CHUNKS = 5;
const TRUNCATED = '*Response truncated due to length…*';
const EMPTY = '*No response.*';

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 *   - must already be deferred
 * @param {object} opts
 * @param {object} [opts.header] - embed fields: author, title,
 *   description, fields, color
 * @param {string} opts.body - raw model output
 * @param {{text: string}} [opts.footer]
 * @param {boolean} [opts.ephemeral]
 * @param {'message'|'embed'} [opts.mode]
 * @param {number} [opts.maxChunks]
 */
export async function sendAiReply(interaction, opts) {
    // A default parameter does not fire on an explicit null, so this is
    // guarded the same way as toDiscordMarkdown/chunkForDiscord's opts.
    const options = opts && typeof opts === 'object' ? opts : {};

    const header = options.header && typeof options.header === 'object' ? options.header : {};
    const body = typeof options.body === 'string' ? options.body : '';
    const footer = options.footer;
    const ephemeral = options.ephemeral === true;
    const mode = options.mode === 'embed' ? 'embed' : 'message';
    const maxChunks = Number.isInteger(options.maxChunks) && options.maxChunks > 0
        ? options.maxChunks
        : DEFAULT_MAX_CHUNKS;

    if (mode === 'embed') {
        return sendEmbedMode(interaction, { header, body, footer, ephemeral, maxChunks });
    }
    return sendMessageMode(interaction, { header, body, footer, ephemeral, maxChunks });
}

async function sendMessageMode(interaction, { header, body, footer, ephemeral, maxChunks }) {
    await interaction.editReply({
        embeds: [{ color: DEFAULT_COLOR, ...header }],
    });

    const text = toDiscordMarkdown(body, { headings: 'keep' });
    const chunks = chunkForDiscord(text, { limit: MESSAGE_LIMIT });

    if (chunks.length === 0) {
        await interaction.followUp({ content: EMPTY, ephemeral });
        return;
    }

    const shown = chunks.slice(0, maxChunks);
    const complete = chunks.length <= maxChunks;
    const footerLine = footer?.text ? `-# ${footer.text}` : '';

    for (let i = 0; i < shown.length; i++) {
        const content = shown[i];
        const isLast = i === shown.length - 1;

        // Belt and braces against the chunker: Discord 400s on an empty
        // message, so never hand it one even if a chunk arrives blank.
        // The footer still has to go out, so a blank last chunk falls
        // through to the truncation/footer handling below rather than
        // being sent.
        if (content.trim() === '') {
            if (isLast && complete && footerLine !== '') {
                await interaction.followUp({ content: footerLine, ephemeral });
            }
            continue;
        }

        if (isLast && complete) {
            await sendWithFooter(interaction, content, footerLine, ephemeral);
            continue;
        }

        await interaction.followUp({ content, ephemeral });
    }

    if (!complete) {
        await sendWithFooter(interaction, TRUNCATED, footerLine, ephemeral);
    }
}

/**
 * Sends `content`, appending `footerLine` only when the result still fits
 * in a message. Otherwise the footer goes in its own message.
 *
 * Both the last-chunk path and the truncation path need this. The first
 * version of this file inlined the length check in one and not the other,
 * so a long footer on a truncated response produced a 2029-character send
 * against a 2000 limit.
 */
async function sendWithFooter(interaction, content, footerLine, ephemeral) {
    if (footerLine === '') {
        await interaction.followUp({ content, ephemeral });
        return;
    }

    if (content.length + footerLine.length + 1 <= MESSAGE_LIMIT) {
        await interaction.followUp({ content: `${content}\n${footerLine}`, ephemeral });
        return;
    }

    await interaction.followUp({ content, ephemeral });
    await interaction.followUp({ content: safeSlice(footerLine, MESSAGE_LIMIT), ephemeral });
}

/**
 * Truncates to `limit` without bisecting a surrogate pair.
 *
 * Do NOT reach for `chunkForDiscord` here. It splits on word boundaries,
 * and a footer is a single line whose only space follows the `-#` prefix,
 * so its first chunk is the prefix alone and the whole footer is lost.
 * This needs a character cut, not a word-aware split.
 */
function safeSlice(text, limit) {
    if (text.length <= limit) return text;
    const code = text.charCodeAt(limit - 1);
    const end = code >= 0xD800 && code <= 0xDBFF ? limit - 1 : limit;
    return text.slice(0, end);
}

async function sendEmbedMode(interaction, { header, body, footer, ephemeral, maxChunks }) {
    const text = toDiscordMarkdown(body, { headings: 'bold' });
    const chunks = chunkForDiscord(text, { limit: EMBED_DESC_LIMIT });
    const shown = chunks.length === 0 ? [EMPTY] : chunks.slice(0, maxChunks);
    const complete = chunks.length <= maxChunks;

    for (let i = 0; i < shown.length; i++) {
        const isFirst = i === 0;
        const isLast = i === shown.length - 1;

        const embed = isFirst
            ? { color: DEFAULT_COLOR, ...header, description: shown[i] }
            : { color: header.color ?? DEFAULT_COLOR, description: shown[i] };

        if (isLast) {
            if (footer) embed.footer = footer;
            embed.timestamp = new Date().toISOString();
        }

        if (isFirst) await interaction.editReply({ embeds: [embed] });
        else await interaction.followUp({ embeds: [embed], ephemeral });
    }

    if (!complete) {
        await interaction.followUp({ content: TRUNCATED, ephemeral });
    }
}
