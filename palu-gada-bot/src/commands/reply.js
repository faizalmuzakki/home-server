import { SlashCommandBuilder } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';
import { askClaude } from '../utils/claudeApi.js';
import { getAiFooter, DISCORD_FORMAT_PROMPT } from '../config/ai.js';
import { sendAiReply } from '../utils/aiReply.js';
import { MAX_MESSAGE_REFS, parseMessageRefs } from '../utils/messageRefs.js';

const TONES = {
    friendly: 'Warm and friendly, but not sappy.',
    professional: 'Professional and businesslike.',
    casual: 'Casual and conversational, like chatting with a friend.',
    funny: 'Light and funny. Keep the joke short.',
    formal: 'Formal and polite.',
};

/** Renders text as a Discord blockquote, so the embed shows it as quoted. */
const quote = (text) => text.split('\n').map(line => `> ${line}`).join('\n');

/**
 * Drafts one reply to one or more messages and sends it. Shared with the
 * message context menu command in reply-context.js, which resolves its
 * single target the easy way.
 */
export async function draftReply(interaction, targets, { tone, instructions, ephemeral }) {
    const messages = targets.length === 1
        ? [`Write a reply to this Discord message from ${targets[0].author.username}:`, '', targets[0].content]
        : [
            `Write one reply that responds to all ${targets.length} of these Discord messages:`,
            ...targets.flatMap((t, i) => ['', `Message ${i + 1}, from ${t.author.username}:`, t.content]),
        ];
    const prompt = [
        ...messages,
        '',
        `Tone: ${TONES[tone]}`,
        instructions ? `The reply must: ${instructions}` : '',
        'Output only the reply itself — no preamble, no quotes around it, no explanation.',
    ].filter(Boolean).join('\n');

    const { text: draft, model, usage } = await askClaude(prompt, {
        systemPrompt: `You write short, natural chat replies as the user. Match the language of the message you are replying to. Keep it to a few sentences unless the message clearly needs more. ${DISCORD_FORMAT_PROMPT}`,
    });

    await sendAiReply(interaction, {
        header: {
            title: '💬 Suggested reply',
            description: [
                // ponytail: 200 chars × MAX_MESSAGE_REFS stays well under the 4096 embed description cap
                ...targets.flatMap(t => [
                    `Replying to [${t.author.username}'s message](${t.url}):`,
                    quote(t.content.slice(0, 200)),
                ]),
                instructions ? `Instructions:\n${quote(instructions)}` : '',
            ].filter(Boolean).join('\n'),
            timestamp: new Date().toISOString(),
        },
        body: draft,
        footer: getAiFooter(`Tone: ${tone}`, model, usage),
        ephemeral,
        mode: 'message',
    });
}

/**
 * Turns an API error into the line the user sees. Both /reply and the
 * context menu command need the same three cases.
 */
export function replyErrorMessage(error) {
    if (error.status === 401) return 'API key is invalid or not configured.';
    if (error.status === 429) return 'Rate limited. Please try again later.';
    return 'Failed to draft a reply with Claude AI.';
}

/**
 * A slash command carries no reply context of its own, so the targets are
 * resolved in three steps, most explicit first:
 *   1. the `message` option — up to MAX_MESSAGE_REFS message ids or
 *      Discord message links, space- or comma-separated,
 *   2. the message you most recently replied to in this channel,
 *   3. the last message in the channel that is not yours.
 * Step 2 is the same trick /answer uses: find your own recent message
 * that has a `reference` and follow it.
 */
async function resolveTargets(interaction, ids) {
    const channel = interaction.channel;

    // One missing id rejects the whole lot; the caller reports it.
    if (ids.length) return Promise.all(ids.map(id => channel.messages.fetch(id)));

    const recent = await channel.messages.fetch({ limit: 25 });

    const ownReply = recent.find(m => m.author.id === interaction.user.id && m.reference?.messageId);
    if (ownReply) return [await channel.messages.fetch(ownReply.reference.messageId)];

    const last = recent.find(m => m.author.id !== interaction.user.id && m.content.trim() !== '');
    return last ? [last] : [];
}

export default {
    data: new SlashCommandBuilder()
        .setName('reply')
        .setDescription('Draft an AI reply to a message you replied to, or to messages you name by id/link')
        .addStringOption(option =>
            option
                .setName('message')
                .setDescription(`Up to ${MAX_MESSAGE_REFS} message ids/links, space-separated (default: the one you last replied to)`)
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('tone')
                .setDescription('Tone of the reply')
                .setRequired(false)
                .addChoices(
                    { name: 'Friendly', value: 'friendly' },
                    { name: 'Professional', value: 'professional' },
                    { name: 'Casual', value: 'casual' },
                    { name: 'Funny', value: 'funny' },
                    { name: 'Formal', value: 'formal' }
                )
        )
        .addStringOption(option =>
            option
                .setName('instructions')
                .setDescription('What the reply should say or do (e.g. "decline politely")')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option
                .setName('private')
                .setDescription('Only show the response to you')
                .setRequired(false)
        ),

    async execute(interaction) {
        const input = interaction.options.getString('message');
        const ids = input ? parseMessageRefs(input) : [];
        const tone = interaction.options.getString('tone') || 'friendly';
        const instructions = interaction.options.getString('instructions');
        const isPrivate = interaction.options.getBoolean('private') || false;

        await interaction.deferReply({ ephemeral: isPrivate });

        if (ids.length > MAX_MESSAGE_REFS) {
            await interaction.editReply({
                content: `❌ Too many messages: ${ids.length}. /reply takes at most ${MAX_MESSAGE_REFS}.`,
            });
            return;
        }

        let targets;
        try {
            targets = await resolveTargets(interaction, ids);
        } catch {
            targets = [];
        }

        if (!targets.length || targets.some(t => t.content.trim() === '')) {
            await interaction.editReply({
                content: input
                    ? '❌ One or more of those ids/links is not a text message in this channel.'
                    : '❌ No message to reply to. Reply to one here first, or pass its id or link.',
            });
            return;
        }

        try {
            await draftReply(interaction, targets, { tone, instructions, ephemeral: isPrivate });
        } catch (error) {
            await logCommandError(interaction, error, 'reply');
            await interaction.editReply({ content: `❌ ${replyErrorMessage(error)}` });
        }
    },
};
