// Default model used by lightweight commands (translate, tldr, etc.)
export const AI_MODEL = 'claude-haiku-4-5';
export const AI_MODEL_NAME = 'Claude 4.5 Haiku';

// Heavier model for commands where intelligence/quality matters more
// (summarize, recap, explain, ask). Costs a few cents more per call.
export const AI_MODEL_SMART = 'claude-sonnet-4-6';
export const AI_MODEL_SMART_NAME = 'Claude 4.6 Sonnet';

/**
 * Generates the footer object for Discord embeds with attribution.
 * @param {string} [extraText] - Optional text to precede the attribution.
 * @param {{ smart?: boolean }} [opts] - Pass { smart: true } for Sonnet attribution.
 * @returns {{text: string}} The footer object
 */
export const getAiFooter = (extraText = '', opts = {}) => {
    const name = opts.smart ? AI_MODEL_SMART_NAME : AI_MODEL_NAME;
    const attribution = `Powered by ${name}`;
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
