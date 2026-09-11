#!/usr/bin/env node
/**
 * Fixture runner for the Discord markdown utilities.
 * No test framework by design — run with: npm run check:markdown
 */
import { toDiscordMarkdown } from '../src/utils/discordMarkdown.js';

let failures = 0;
let passes = 0;

export function check(name, actual, expected) {
    if (actual === expected) {
        passes++;
        return;
    }
    failures++;
    console.error(`\n✗ ${name}`);
    console.error('--- expected ---');
    console.error(JSON.stringify(expected));
    console.error('--- actual ---');
    console.error(JSON.stringify(actual));
}

// --- headings ---------------------------------------------------------

check(
    'heading kept in keep mode',
    toDiscordMarkdown('## Estimasi Biaya'),
    '## Estimasi Biaya'
);

check(
    'heading past level 3 degrades to 3',
    toDiscordMarkdown('##### Deep'),
    '### Deep'
);

check(
    'heading becomes bold in bold mode',
    toDiscordMarkdown('## Estimasi Biaya', { headings: 'bold' }),
    '**Estimasi Biaya**'
);

check(
    'hash inside a fence is left alone',
    toDiscordMarkdown('```py\n# not a heading\n```', { headings: 'bold' }),
    '```py\n# not a heading\n```'
);

check('empty input', toDiscordMarkdown(''), '');
check('null input', toDiscordMarkdown(null), '');

check(
    'a null options argument does not throw',
    toDiscordMarkdown('## Heading', null),
    '## Heading'
);

check(
    'a non-object options argument does not throw',
    toDiscordMarkdown('## Heading', 42),
    '## Heading'
);

check(
    'a shorter run does not close a longer fence',
    toDiscordMarkdown('````\n```\n##### still inside\n````'),
    '````\n```\n##### still inside\n````'
);

// --- tables -------------------------------------------------------------

check(
    'pipe table becomes an aligned fence',
    toDiscordMarkdown(
        '| Komponen | Estimasi Harga |\n' +
        '|---|---|\n' +
        '| 2x Xeon E5-2673 v4 | Rp 500rb - 1,2jt |\n' +
        '| **Total Estimasi** | ~Rp 4jt - 10jt |'
    ),
    '```\n' +
    'Komponen            Estimasi Harga\n' +
    '2x Xeon E5-2673 v4  Rp 500rb - 1,2jt\n' +
    'Total Estimasi      ~Rp 4jt - 10jt\n' +
    '```'
);

check(
    'a pipe block with no alignment row is not a table',
    toDiscordMarkdown('| a | b |\n| c | d |'),
    '| a | b |\n| c | d |'
);

check(
    'ragged rows pad to the widest row',
    toDiscordMarkdown('| a | b |\n|---|---|\n| c |'),
    '```\na  b\nc\n```'
);

check(
    'a table inside a fence is left alone',
    toDiscordMarkdown('```\n| a | b |\n|---|---|\n```'),
    '```\n| a | b |\n|---|---|\n```'
);

check(
    'prose resumes after a table',
    toDiscordMarkdown('| a |\n|---|\n| b |\n\nAfter.'),
    '```\na\nb\n```\n\nAfter.'
);

// --- summary ----------------------------------------------------------

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
