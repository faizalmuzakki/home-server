import { getConfig } from '../database/models.js';

/**
 * Key in bot_config. Off unless the owner turns it on in the admin panel,
 * because the figure is a list-rate estimate and not everyone reading a
 * channel should be shown a dollar amount.
 */
export const COST_FOOTER_KEY = 'ai_cost_footer';

/**
 * Turns a model id into a display name:
 * claude-sonnet-4-6 -> Claude Sonnet 4.6
 * gemini-3.8-flash -> Gemini 3.8 Flash
 * gpt-oss-120b -> GPT-OSS 120B
 * qwen-2.1 -> Qwen 2.1
 */
export const prettyModel = (id) => {
    if (!id) return '';
    return id
        .replace(/^[^/]+\//, '')
        .replace(/:free$/i, '')
        .replace(/-\d{8}$/, '')
        .replace(/-(\d+)-(\d+)$/, ' $1.$2')
        .replace(/\b(\d+)b\b/gi, (m, n) => `${n}B`)
        .replace(/-/g, ' ')
        .replace(/\bgpt oss\b/gi, 'GPT-OSS')
        .replace(/\b\w/g, (c) => c.toUpperCase());
};

/**
 * 18569 -> 18.6k. Raw digits for anything under a thousand.
 */
const compactTokens = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/**
 * Enough decimals that a sub-cent call does not render as $0.00.
 */
const formatCost = (usd) => `$${usd < 0.01 ? usd.toFixed(4) : usd.toFixed(2)}`;

/**
 * Builds the footer text. Separate from getAiFooter so it can be checked
 * without a database behind it — the only thing getAiFooter adds is
 * reading the opt-in.
 * @returns {{text: string}} The footer object
 */
export const formatAiFooter = ({
    extraText = '',
    model = '',
    effort = null,
    usage = null,
    fallback = false,
    showCost = false,
}) => {
    // ponytail: the model is whatever claude-api actually used — never hardcode a
    // name here, the footer lied about the model for months that way.
    const modelLabel = model ? prettyModel(model) : (fallback ? 'AI' : 'Claude');
    const parts = [
        extraText,
        `Powered by ${modelLabel}${fallback ? ' (fallback)' : ''}`,
        effort ? `${effort} effort` : '',
    ];

    if (usage) {
        const tokens = [
            `${compactTokens(usage.inputTokens)} in`,
            `${compactTokens(usage.outputTokens)} out`,
            usage.cachedTokens ? `${compactTokens(usage.cachedTokens)} cached` : '',
        ].filter(Boolean).join(' / ');
        parts.push(tokens);

        // The cost is a list-rate estimate — claude-api runs on a subscription,
        // so nothing here is actually billed per token. Hence "~" and the opt-in.
        if (usage.costUSD !== null && showCost) {
            parts.push(`~${formatCost(usage.costUSD)}`);
        }
    }

    return { text: parts.filter(Boolean).join(' • ') };
};

/**
 * Generates the footer object for Discord embeds with attribution.
 * @param {string} [extraText] - Optional text to precede the attribution.
 * @param {string} [model] - Model id reported by claude-api for this call.
 * @param {object} [usage] - Token counters from askClaude, when available.
 * @param {string} [effort] - Effort level claude-api ran the call at.
 * @param {boolean} [fallback] - Whether the call was served by a fallback model.
 * @returns {{text: string}} The footer object
 */
export const getAiFooter = (extraText = '', model = '', usage = null, effort = null, fallback = false) =>
    formatAiFooter({
        extraText,
        model,
        effort,
        usage,
        fallback,
        showCost: getConfig(COST_FOOTER_KEY, false) === true,
    });

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
