#!/usr/bin/env node
/**
 * Fixture runner for the Discord markdown utilities.
 * No test framework by design — run with: npm run check:markdown
 */
import { toDiscordMarkdown } from '../src/utils/discordMarkdown.js';
import { chunkForDiscord } from '../src/utils/discordChunker.js';

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
    'a code span in a cell keeps its underscores and asterisks',
    toDiscordMarkdown('| a |\n|---|\n| `foo_bar_baz` |'),
    '```\na\nfoo_bar_baz\n```'
);

check(
    'a code span in a cell keeps bracketed text',
    toDiscordMarkdown('| a |\n|---|\n| `[x](y)` |'),
    '```\na\n[x](y)\n```'
);

check(
    'prose resumes after a table',
    toDiscordMarkdown('| a |\n|---|\n| b |\n\nAfter.'),
    '```\na\nb\n```\n\nAfter.'
);

// --- rules, images, task lists, indentation ---------------------------

check(
    'horizontal rule and its trailing blank line are dropped',
    toDiscordMarkdown('Before.\n\n---\n\nAfter.'),
    'Before.\n\nAfter.'
);

check(
    'asterisk and underscore rules are dropped too',
    toDiscordMarkdown('a\n***\nb\n___\nc'),
    'a\nb\nc'
);

check(
    'a rule inside a fence survives',
    toDiscordMarkdown('```\n---\n```'),
    '```\n---\n```'
);

check(
    'image becomes a link',
    toDiscordMarkdown('![Diagram](https://e.com/d.png)'),
    '[Diagram](https://e.com/d.png)'
);

check(
    'image with no alt text becomes a bare url',
    toDiscordMarkdown('![](https://e.com/d.png)'),
    'https://e.com/d.png'
);

check(
    'task list items become box characters',
    toDiscordMarkdown('- [ ] todo\n- [x] done'),
    '☐ todo\n☑ done'
);

check(
    'four-space nesting normalises to two',
    toDiscordMarkdown('- a\n    - b\n        - c'),
    '- a\n  - b\n    - c'
);

check(
    'two-space nesting is left as is',
    toDiscordMarkdown('- a\n  - b'),
    '- a\n  - b'
);

check(
    'a rule followed by a fence drops the blank after the rule, not after the fence',
    toDiscordMarkdown('---\n```\ncode\n```\n\nAfter.'),
    '```\ncode\n```\n\nAfter.'
);

check(
    'a rule followed by a table drops the blank after the rule, not after the table',
    toDiscordMarkdown('---\n| a |\n|---|\n| b |\n\nAfter.'),
    '```\na\nb\n```\n\nAfter.'
);

check(
    'indentation depth resets after prose',
    toDiscordMarkdown('- a\n    - b\n\nProse.\n\n- c'),
    '- a\n  - b\n\nProse.\n\n- c'
);

// --- chunking ---------------------------------------------------------

const chunkCheck = (name, actual, expected) =>
    check(name, JSON.stringify(actual), JSON.stringify(expected));

chunkCheck('empty input yields no chunks', chunkForDiscord(''), []);
chunkCheck('whitespace only yields no chunks', chunkForDiscord('   \n  '), []);
chunkCheck('short text is one chunk', chunkForDiscord('hello'), ['hello']);

chunkCheck(
    'splits on a line boundary, never mid-word',
    chunkForDiscord('aaaa\nbbbb\ncccc', { limit: 10 }),
    ['aaaa\nbbbb', 'cccc']
);

chunkCheck(
    'a single oversized line is split on a space',
    chunkForDiscord('aaa bbb ccc ddd', { limit: 8 }),
    ['aaa bbb', 'ccc ddd']
);

chunkCheck(
    'a single oversized token is hard cut',
    chunkForDiscord('aaaaaaaaaaaa', { limit: 5 }),
    ['aaaaa', 'aaaaa', 'aa']
);

// Fence splitting is asserted by property, not by exact output. The
// boundary depends on budget arithmetic that is easy to get off by one
// while writing a plan, and an exact-string fixture would send the fix
// loop after the fixture instead of the code. These are the properties
// that actually matter.

function fenceBalance(chunk) {
    return (chunk.match(/^\s*```/gm) || []).length % 2 === 0;
}

const fenced = chunkForDiscord('```js\naaaa\nbbbb\ncccc\n```', { limit: 20 });

check('a fenced block splits into more than one chunk', String(fenced.length > 1), 'true');
check('every chunk respects the limit', String(fenced.every(c => c.length <= 20)), 'true');
check('no chunk leaves a fence open', String(fenced.every(fenceBalance)), 'true');
check(
    'every continuation chunk reopens with the language tag',
    String(fenced.slice(1).every(c => c.startsWith('```js'))),
    'true'
);
check(
    'no content line is lost or duplicated',
    fenced.join('\n').split('\n').filter(l => !l.startsWith('```')).join(','),
    'aaaa,bbbb,cccc'
);

const bare = chunkForDiscord('```\naaaa\nbbbb\ncccc\n```', { limit: 17 });

check('a bare fence also splits', String(bare.length > 1), 'true');
check('no bare chunk leaves a fence open', String(bare.every(fenceBalance)), 'true');
check(
    'a continuation of a bare fence carries no language tag',
    String(bare.slice(1).every(c => c.split('\n')[0] === '```')),
    'true'
);

// --- chunker properties -----------------------------------------------

function chunkerViolations(text, limit) {
    const chunks = chunkForDiscord(text, { limit });
    const problems = [];

    for (const chunk of chunks) {
        if (chunk.length > limit) problems.push(`over limit: ${chunk.length} > ${limit}`);
        const markers = (chunk.match(/^\s*```/gm) || []).length;
        if (markers % 2 !== 0) problems.push('unbalanced fence');
        if (/[\uD800-\uDBFF]$/.test(chunk)) problems.push('chunk ends on a high surrogate');
        if (/^[\uDC00-\uDFFF]/.test(chunk)) problems.push('chunk starts on a low surrogate');
    }

    const strip = value => value.split('\n').filter(l => !/^\s*```/.test(l)).join('\n');
    if (strip(chunks.join('\n')) !== strip(text.replace(/\r\n/g, '\n'))) {
        problems.push('content lost or duplicated');
    }

    return problems;
}

function randomChunkerCase(seed) {
    // Deterministic PRNG so a failure is reproducible from its seed.
    let state = seed;
    const next = () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
    };
    const pick = list => list[Math.floor(next() * list.length)];

    const lines = [];
    const count = Math.floor(next() * 30);
    let open = false;
    for (let i = 0; i < count; i++) {
        if (next() < 0.15) {
            lines.push(open ? '```' : `\`\`\`${pick(['', 'js', 'python', 'x'.repeat(40)])}`);
            open = !open;
        } else {
            lines.push(pick(['', 'short', 'a '.repeat(20).trim(), 'z'.repeat(60), 'emoji 😀 here', 'á combining']));
        }
    }
    return lines.join(pick(['\n', '\n', '\r\n']));
}

let fuzzFailures = 0;
let firstFuzzFailure = '';
const LIMITS = [1, 2, 3, 4, 5, 8, 10, 17, 20, 50, 100, 2000];

for (let seed = 1; seed <= 2000; seed++) {
    const text = randomChunkerCase(seed);
    for (const limit of LIMITS) {
        let problems;
        try {
            problems = chunkerViolations(text, limit);
        } catch (error) {
            problems = [`threw: ${error.message}`];
        }
        if (problems.length > 0) {
            fuzzFailures++;
            if (firstFuzzFailure === '') {
                firstFuzzFailure = `seed ${seed} limit ${limit}: ${problems.join(', ')}`;
            }
        }
    }
}

check(
    `chunker property fuzz over ${2000 * LIMITS.length} cases`,
    fuzzFailures === 0 ? 'clean' : `${fuzzFailures} failures, first: ${firstFuzzFailure}`,
    'clean'
);

const longDoc = Array.from({ length: 400 }, (_, i) => `Line ${i} of prose.`).join('\n');
const produced = chunkForDiscord(longDoc, { limit: 2000 });
check(
    'no produced chunk exceeds the limit',
    String(produced.every(c => c.length <= 2000)),
    'true'
);
check(
    'chunking loses no words',
    produced.join('\n').replace(/\s+/g, ' ').trim(),
    longDoc.replace(/\s+/g, ' ').trim()
);

// --- summary ----------------------------------------------------------

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
