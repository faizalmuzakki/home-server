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

if (failures > 0) {
    console.error(`\n${failures} footer check(s) failed.`);
    process.exit(1);
}
console.log('All AI footer checks passed.');
