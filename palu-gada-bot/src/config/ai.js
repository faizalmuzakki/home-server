/**
 * Turns a model id into a display name: claude-sonnet-4-6 -> Claude Sonnet 4.6
 */
const prettyModel = (id) =>
    id.replace(/-(\d+)-(\d+)$/, ' $1.$2').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Generates the footer object for Discord embeds with attribution.
 * @param {string} [extraText] - Optional text to precede the attribution.
 * @param {string} [model] - Model id reported by claude-api for this call.
 * @returns {{text: string}} The footer object
 */
export const getAiFooter = (extraText = '', model = '') => {
    // ponytail: the model is whatever claude-api actually used — never hardcode a
    // name here, the footer lied about the model for months that way.
    const attribution = `Powered by ${model ? prettyModel(model) : 'Claude'}`;
    return {
        text: extraText ? `${extraText} • ${attribution}` : attribution,
    };
};

/**
 * Appended to every AI command's system prompt so the model emits what
 * Discord can render. The converter in src/utils/discordMarkdown.js
 * stays regardless — this reduces how often it has to act, it does not
 * replace it.
 */
export const DISCORD_FORMAT_PROMPT = [
    'Format your response for Discord.',
    'Do not use Markdown tables, horizontal rules, or image syntax.',
    'Headings go no deeper than ###.',
    'Prefer short bullet lists over long paragraphs.',
    'Bold, italics, inline code, fenced code blocks, blockquotes and links all work normally.',
].join(' ');
