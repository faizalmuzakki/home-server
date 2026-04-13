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
