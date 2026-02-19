export const AI_MODEL = 'claude-haiku-4-5';
export const AI_MODEL_NAME = 'Claude 4.5 Haiku';

/**
 * Generates the footer object for Discord embeds with attribution
 * @param {string} [extraText] - Optional text to precede the attribution
 * @returns {{text: string}} The footer object
 */
export const getAiFooter = (extraText = '') => {
    const attribution = `Powered by ${AI_MODEL_NAME}`;
    return {
        text: extraText ? `${extraText} • ${attribution}` : attribution,
    };
};
