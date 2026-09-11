#!/usr/bin/env node
/**
 * Fixture runner for the Discord markdown utilities.
 * No test framework by design — run with: npm run check:markdown
 */
import { toDiscordMarkdown } from '../src/utils/discordMarkdown.js';
import { chunkForDiscord } from '../src/utils/discordChunker.js';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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

// A \r left on a line makes every anchored regex here miss, because `.`
// never matches \r. The heading used to survive raw into an embed.
check(
    'a CRLF heading is still converted',
    toDiscordMarkdown('## Title\r\nbody', { headings: 'bold' }),
    '**Title**\nbody'
);

check(
    'a CRLF fenced block keeps its table verbatim',
    toDiscordMarkdown('```\r\n| a | b |\r\n|---|---|\r\n| c | d |\r\n```'),
    '```\n| a | b |\n|---|---|\n| c | d |\n```'
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

// --- setext headings and subtext ---------------------------------------

check(
    'a dash run under prose is a setext H2, not a rule',
    toDiscordMarkdown('Title\n---\nbody'),
    '## Title\nbody'
);

check(
    'a setext H2 flattens to bold in bold mode',
    toDiscordMarkdown('Title\n---\nbody', { headings: 'bold' }),
    '**Title**\nbody'
);

check(
    'a dash run after a blank line is still a rule',
    toDiscordMarkdown('Before.\n\n---\n\nAfter.'),
    'Before.\n\nAfter.'
);

check(
    'a dash run at the very start of the input is still a rule',
    toDiscordMarkdown('---\nAfter.'),
    'After.'
);

check(
    'a dash run under a list item is still a rule',
    toDiscordMarkdown('- a\n---\nAfter.'),
    '- a\nAfter.'
);

check(
    'subtext keeps its prefix in keep mode',
    toDiscordMarkdown('-# small print'),
    '-# small print'
);

check(
    'subtext loses its prefix in bold mode',
    toDiscordMarkdown('-# small print', { headings: 'bold' }),
    'small print'
);

check(
    'subtext inside a fence is left alone',
    toDiscordMarkdown('```\n-# small print\n```', { headings: 'bold' }),
    '```\n-# small print\n```'
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

// A blank first line used to sit alone in the buffer at length 0; the next
// piece cost more than the budget, so the buffer flushed as ''. Discord
// rejects that with "Cannot send an empty message".
chunkCheck(
    'a blank line before an over-long line emits no empty chunk',
    chunkForDiscord('\n' + 'x'.repeat(10), { limit: 10 }),
    ['xxxxxxxxxx']
);

check(
    'no chunk is ever empty or whitespace-only',
    String(chunkForDiscord('\n\n  \n' + 'y'.repeat(20) + '\n \n', { limit: 20 })
        .every(c => c.trim() !== '')),
    'true'
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

// The converter accepts ~~~ as well as ```, and passes a tilde block
// through verbatim. A chunker that only knew backticks split straight
// through one, leaving an unterminated code block on Discord.
const tilde = chunkForDiscord('~~~js\naaaa\nbbbb\ncccc\n~~~', { limit: 20 });

function tildeBalance(chunk) {
    return (chunk.match(/^\s*~~~/gm) || []).length % 2 === 0;
}

check('a tilde fence splits into more than one chunk', String(tilde.length > 1), 'true');
check('every tilde chunk respects the limit', String(tilde.every(c => c.length <= 20)), 'true');
check('no tilde chunk leaves a fence open', String(tilde.every(tildeBalance)), 'true');
check(
    'a tilde continuation reopens with a tilde marker and the language tag',
    String(tilde.slice(1).every(c => c.startsWith('~~~js'))),
    'true'
);
check(
    'a backtick line inside a tilde fence does not close it',
    String(chunkForDiscord('~~~\n```\naaaa\n~~~', { limit: 200 }).length),
    '1'
);

// --- chunker property fuzz (child process) ----------------------------

const fuzzScript = join(dirname(fileURLToPath(import.meta.url)), 'check-markdown-fuzz.js');
const fuzzRun = spawnSync(process.execPath, [fuzzScript], {
    encoding: 'utf8',
    timeout: 120000,
});

const fuzzOutcome = fuzzRun.signal || fuzzRun.error
    ? `fuzz did not finish within 120s (signal ${fuzzRun.signal ?? 'none'}) — probable non-terminating loop in the chunker`
    : (fuzzRun.stdout || '').trim() || `fuzz produced no output (exit ${fuzzRun.status})`;

check('chunker property fuzz over 24000 cases', fuzzOutcome, 'clean');

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

// --- sendAiReply ------------------------------------------------------

import { sendAiReply } from '../src/utils/aiReply.js';

function fakeInteraction() {
    const calls = [];
    return {
        calls,
        editReply: async payload => { calls.push(['edit', payload]); },
        followUp: async payload => { calls.push(['follow', payload]); },
    };
}

const messageMode = fakeInteraction();
await sendAiReply(messageMode, {
    header: { author: { name: 'someone asked:' }, description: 'a question' },
    body: '## Heading\n\nSome prose.',
    footer: { text: 'Powered by Claude' },
    mode: 'message',
});

check(
    'message mode edits with a header embed carrying no prose',
    JSON.stringify(messageMode.calls[0]),
    JSON.stringify(['edit', { embeds: [{
        color: 0x5865F2,
        author: { name: 'someone asked:' },
        description: 'a question',
    }] }])
);

check(
    'message mode posts prose as content with the heading intact',
    messageMode.calls[1][1].content,
    '## Heading\n\nSome prose.\n-# Powered by Claude'
);

const embedMode = fakeInteraction();
await sendAiReply(embedMode, {
    header: { title: 'Translated' },
    body: '## Heading\n\nSome prose.',
    footer: { text: 'Powered by Claude' },
    mode: 'embed',
});

check(
    'embed mode downgrades headings to bold inside the description',
    embedMode.calls[0][1].embeds[0].description,
    '**Heading**\n\nSome prose.'
);

check(
    'embed mode sends exactly one message',
    String(embedMode.calls.length),
    '1'
);

// An empty body must still SAY something. Asserting only that at least
// one call happened passes when the followUp is deleted, because the
// header editReply alone satisfies it -- so assert the exact call shape.
const emptyBody = fakeInteraction();
await sendAiReply(emptyBody, { header: { title: 'x' }, body: '', mode: 'message' });
check(
    'an empty body still sends a visible "no response" message',
    JSON.stringify(emptyBody.calls.map(([kind, payload]) => [kind, payload.content ?? null])),
    JSON.stringify([['edit', null], ['follow', '*No response.*']])
);

check(
    'an oversized footer is cut without splitting a surrogate pair',
    await (async () => {
        const fake = fakeInteraction();
        // Position an emoji so a raw 2000-character slice would bisect it.
        const footer = 'f'.repeat(1996) + '😀' + 'f'.repeat(20);
        await sendAiReply(fake, {
            header: { title: 'x' },
            body: 'short body',
            footer: { text: footer },
            mode: 'message',
        });
        const contents = fake.calls
            .map(([, payload]) => payload.content)
            .filter(content => typeof content === 'string');
        const halves = contents.filter(
            content => /[\uD800-\uDBFF]$/.test(content) || /^[\uDC00-\uDFFF]/.test(content)
        );
        // Assert the footer SURVIVES, not merely that it is not corrupt.
        // An earlier fix passed the corruption check by discarding the
        // footer entirely and sending the bare '-#' prefix.
        const footerMessage = contents.find(content => content.startsWith('-#'));
        const kept = footerMessage && footerMessage.length > 1900;
        return `${halves.length} ${kept ? 'kept' : 'lost'}`;
    })(),
    '0 kept'
);

// An over-limit count of 0 is satisfied by sending NOTHING, so this
// fixture also pins what actually went out: 8 chunks capped at 2, one
// truncation notice, and the oversized footer in its own message =
// 1 editReply + 2 chunks + notice + footer = 5 calls. That makes it fail
// if the notice is dropped or the maxChunks cap is removed.
check(
    'a long footer on a truncated response does not exceed the message limit',
    await (async () => {
        const fake = fakeInteraction();
        await sendAiReply(fake, {
            header: { title: 'x' },
            body: 'word '.repeat(3000),
            footer: { text: 'f'.repeat(1990) },
            mode: 'message',
            maxChunks: 2,
        });
        const contents = fake.calls
            .map(([, payload]) => payload.content)
            .filter(content => typeof content === 'string');
        const overLong = contents.filter(content => content.length > 2000);
        const notices = contents.filter(content => content.includes('Response truncated'));
        return `${overLong.length} ${notices.length} ${fake.calls.length}`;
    })(),
    '0 1 5'
);

// The cap itself, stated plainly: a body long enough for 8 chunks sends
// exactly maxChunks of them and then says it stopped.
check(
    'message mode sends at most maxChunks chunks and announces the truncation',
    await (async () => {
        const fake = fakeInteraction();
        await sendAiReply(fake, {
            header: { title: 'x' },
            body: 'word '.repeat(3000),
            mode: 'message',
            maxChunks: 3,
        });
        const contents = fake.calls
            .map(([, payload]) => payload.content)
            .filter(content => typeof content === 'string');
        const notices = contents.filter(content => content.includes('Response truncated'));
        return `${contents.length - notices.length} ${notices.length}`;
    })(),
    '3 1'
);

// A private /ask leaking into a public channel is the worst failure this
// module can produce, so every followUp on every branch is pinned:
// the chunk sends, the truncation notice, the split-off footer, and the
// empty-body notice.
check(
    'every followUp of an ephemeral reply stays ephemeral',
    await (async () => {
        const long = fakeInteraction();
        await sendAiReply(long, {
            header: { title: 'x' },
            body: 'word '.repeat(3000),
            footer: { text: 'f'.repeat(1990) },
            ephemeral: true,
            mode: 'message',
            maxChunks: 2,
        });
        const empty = fakeInteraction();
        await sendAiReply(empty, {
            header: { title: 'x' },
            body: '',
            ephemeral: true,
            mode: 'message',
        });
        const embed = fakeInteraction();
        await sendAiReply(embed, {
            header: { title: 'x' },
            body: 'word '.repeat(1600),
            ephemeral: true,
            mode: 'embed',
            maxChunks: 1,
        });
        const follows = [...long.calls, ...empty.calls, ...embed.calls]
            .filter(([kind]) => kind === 'follow');
        const leaked = follows.filter(([, payload]) => payload.ephemeral !== true);
        return `${follows.length} ${leaked.length}`;
    })(),
    '6 0'
);

// A public reply must stay public: the flag is forwarded, not hardcoded.
check(
    'a non-ephemeral reply forwards ephemeral false',
    await (async () => {
        const fake = fakeInteraction();
        await sendAiReply(fake, {
            header: { title: 'x' },
            body: 'hello',
            mode: 'message',
        });
        const follows = fake.calls.filter(([kind]) => kind === 'follow');
        return `${follows.length} ${follows.every(([, payload]) => payload.ephemeral === false)}`;
    })(),
    '1 true'
);

// A continuation embed carries no header, so it has to re-apply
// header.color explicitly or the reply changes colour mid-thread.
check(
    'a continuation embed keeps the header colour',
    await (async () => {
        const fake = fakeInteraction();
        await sendAiReply(fake, {
            header: { title: 'Long', color: 0x7289da },
            body: 'word '.repeat(1600),
            footer: { text: 'f' },
            mode: 'embed',
        });
        const embeds = fake.calls.map(([, payload]) => payload.embeds[0]);
        const wrongColor = embeds.filter(embed => embed.color !== 0x7289da);
        return `${embeds.length} ${wrongColor.length}`;
    })(),
    '2 0'
);

// --- summary ----------------------------------------------------------

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
