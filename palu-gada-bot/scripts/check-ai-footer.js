#!/usr/bin/env node
/**
 * Fixture runner for the AI footer text.
 * No test framework by design — run with: npm run check:footer
 */
import { formatAiFooter } from '../src/config/ai.js';

let failures = 0;

function check(name, actual, expected) {
    if (actual === expected) return;
    failures++;
    console.error(`\n✗ ${name}`);
    console.error(`  expected: ${JSON.stringify(expected)}`);
    console.error(`  actual:   ${JSON.stringify(actual)}`);
}

const usage = { inputTokens: 2, outputTokens: 10, cachedTokens: 29224, costUSD: 0.0304553 };

check(
    'cost hidden by default',
    formatAiFooter({ model: 'claude-sonnet-5', usage }).text,
    'Powered by Claude Sonnet 5 • 2 in / 10 out / 29.2k cached'
);

check(
    'cost shown when opted in',
    formatAiFooter({ model: 'claude-sonnet-5', usage, showCost: true }).text,
    'Powered by Claude Sonnet 5 • 2 in / 10 out / 29.2k cached • ~$0.03'
);

check(
    'extra text leads, cache omitted when zero',
    formatAiFooter({
        extraText: 'Tone: friendly',
        model: 'claude-opus-5',
        usage: { inputTokens: 1200, outputTokens: 40, cachedTokens: 0, costUSD: 1.5 },
        showCost: true,
    }).text,
    'Tone: friendly • Powered by Claude Opus 5 • 1.2k in / 40 out • ~$1.50'
);

check(
    'no usage means no counters — an older claude-api reply still works',
    formatAiFooter({ model: 'claude-sonnet-5', showCost: true }).text,
    'Powered by Claude Sonnet 5'
);

check(
    'unpriced call shows counters only',
    formatAiFooter({
        model: 'claude-sonnet-5',
        usage: { inputTokens: 5, outputTokens: 6, cachedTokens: 0, costUSD: null },
        showCost: true,
    }).text,
    'Powered by Claude Sonnet 5 • 5 in / 6 out'
);

check(
    'effort follows the model name',
    formatAiFooter({ extraText: 'Tone: friendly', model: 'claude-sonnet-5', effort: 'high', usage }).text,
    'Tone: friendly • Powered by Claude Sonnet 5 • high effort • 2 in / 10 out / 29.2k cached'
);

check(
    'fallback model appends (fallback) tag',
    formatAiFooter({
        model: 'gemini-3.8-flash',
        effort: 'high',
        fallback: true,
        usage: { inputTokens: 8003, outputTokens: 120, cachedTokens: 0, costUSD: null },
    }).text,
    'Powered by Gemini 3.8 Flash (fallback) • high effort • 8.0k in / 120 out'
);

check(
    'open-weight model id renders correctly in fallback',
    formatAiFooter({
        model: 'gpt-oss-120b',
        effort: 'high',
        fallback: true,
        usage: { inputTokens: 500, outputTokens: 50, cachedTokens: 0, costUSD: null },
    }).text,
    'Powered by GPT-OSS 120B (fallback) • high effort • 500 in / 50 out'
);

check(
    'qwen model id renders correctly with extra text and fallback',
    formatAiFooter({
        extraText: 'Tone: casual',
        model: 'qwen-2.1',
        effort: 'high',
        fallback: true,
    }).text,
    'Tone: casual • Powered by Qwen 2.1 (fallback) • high effort'
);

if (failures > 0) {
    console.error(`\n${failures} footer check(s) failed.`);
    process.exit(1);
}
console.log('All AI footer checks passed.');
