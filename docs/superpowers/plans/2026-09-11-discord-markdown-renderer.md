# Discord Markdown Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Claude's Markdown render as formatting in all seven AI commands of `palu-gada-bot`, and stop four of them from throwing on long responses.

**Architecture:** Two pure string functions (`toDiscordMarkdown`, `chunkForDiscord`) with no `discord.js` import, plus one `sendAiReply` helper that owns every embed, chunk loop and follow-up. Commands shrink to building a header and calling the helper.

**Tech Stack:** Node 18+, ESM (`"type": "module"`), discord.js v14. No new dependencies — this is a hard constraint, see Global Constraints.

**Spec:** `docs/superpowers/specs/2026-09-11-discord-markdown-renderer-design.md`

## Global Constraints

- **No new npm dependencies.** Not in `dependencies`, not in `devDependencies`. If a task seems to need a library, write the function instead.
- **ESM only.** Every import needs its file extension: `'./discordMarkdown.js'`, never `'./discordMarkdown'`.
- **Four-space indent, single quotes, semicolons.** Match the surrounding files.
- **The converter and chunker never throw.** Every branch has a pass-through fallback. A malformed table emits its original lines unchanged.
- **Discord limits, exact:** message content 2000, embed description 4096, embed field value 1024, total embed payload 6000. The plan targets 4000 for descriptions to leave headroom.
- **Verification runs with plain `node`.** There is no test framework in this repo and none is being added.
- **Fixtures may be corrected, code may not be bent to match them.** Every expected value in this plan was written by hand and some are wrong. If a traced behaviour is defensible and the task's stated invariants hold, fix the fixture and say so in your report. Never contort the implementation to satisfy a fixture you believe is wrong.
- **Pre-existing breakage, do not fix here:** `npm run check` points at `scripts/check-imports.js`, which does not exist. Leave it. Add `check:markdown` as a separate script.

---

## File Structure

**Create:**
- `src/utils/discordMarkdown.js` — GitHub Markdown to Discord Markdown. Pure.
- `src/utils/discordChunker.js` — fence-aware splitting. Pure.
- `src/utils/aiReply.js` — the only file that touches `interaction`.
- `scripts/check-markdown.js` — fixture runner, exits non-zero on mismatch.

**Modify:**
- `src/config/ai.js` — add `DISCORD_FORMAT_PROMPT`.
- `package.json` — add the `check:markdown` script.
- `src/commands/{ask,explain,tldr,summarize,answer,recap,translate,fallacy}.js`

---

### Task 1: Test harness and converter skeleton

Fence passthrough and headings. Everything else passes through untouched, which later tasks narrow.

**Files:**
- Create: `src/utils/discordMarkdown.js`
- Create: `scripts/check-markdown.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `toDiscordMarkdown(text: string, opts?: { headings?: 'keep' | 'bold' }) => string`. Default `headings: 'keep'`. Also `check(name, actual, expected)` in the harness, used by every later task.

- [ ] **Step 1: Write the failing test**

Create `scripts/check-markdown.js`:

```js
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

// --- summary ----------------------------------------------------------

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd palu-gada-bot && node scripts/check-markdown.js
```

Expected: `ERR_MODULE_NOT_FOUND` for `src/utils/discordMarkdown.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/discordMarkdown.js`:

```js
/**
 * Converts GitHub-flavoured Markdown to the dialect Discord renders.
 *
 * Pure string -> string. Never throws: every branch falls back to
 * emitting the original line unchanged.
 */

const FENCE_RE = /^\s*(`{3,}|~{3,})(.*)$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;

/**
 * @param {string} text - GitHub-flavoured Markdown
 * @param {object} [opts]
 * @param {'keep'|'bold'} [opts.headings] - 'keep' for message content,
 *   'bold' for embeds, which render no headings at all.
 * @returns {string}
 */
export function toDiscordMarkdown(text, opts) {
    if (typeof text !== 'string' || text === '') return '';

    // A default parameter only fires on undefined, so an explicit null
    // would slip past it and throw on the property read below.
    const options = opts && typeof opts === 'object' ? opts : {};
    const headings = options.headings === 'bold' ? 'bold' : 'keep';
    const lines = text.split('\n');
    const out = [];

    // The opening fence while inside a block. CommonMark closes a fence
    // only on the same character AT LEAST AS LONG as the opener, so a
    // three-backtick line inside a four-backtick block is content.
    let fence = null; // { char, length } | null

    for (const line of lines) {
        const fenceMatch = FENCE_RE.exec(line);
        if (fenceMatch) {
            const marker = fenceMatch[1];
            if (fence === null) {
                fence = { char: marker[0], length: marker.length };
            } else if (marker[0] === fence.char && marker.length >= fence.length) {
                fence = null;
            }
            out.push(line);
            continue;
        }

        if (fence !== null) {
            out.push(line);
            continue;
        }

        out.push(convertLine(line, headings));
    }

    return out.join('\n');
}

function convertLine(line, headings) {
    const heading = HEADING_RE.exec(line);
    if (heading) {
        const body = heading[2].trim();
        if (headings === 'bold') return body === '' ? '' : `**${body}**`;
        const level = Math.min(heading[1].length, 3);
        return `${'#'.repeat(level)} ${body}`;
    }

    return line;
}
```

- [ ] **Step 4: Wire up the script and run it**

Add to `package.json` `scripts`, after `"check"`:

```json
"check:markdown": "node scripts/check-markdown.js"
```

```bash
cd palu-gada-bot && npm run check:markdown
```

Expected: `9 passed, 0 failed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add palu-gada-bot/src/utils/discordMarkdown.js palu-gada-bot/scripts/check-markdown.js palu-gada-bot/package.json
git commit -m "feat(palu-gada-bot): add discord markdown converter with heading handling"
```

---

### Task 2: Pipe tables to monospace blocks

The construct that prompted the whole change. A table has no Discord equivalent, so it becomes an aligned block inside a bare fence.

**Files:**
- Modify: `src/utils/discordMarkdown.js`
- Modify: `scripts/check-markdown.js`

**Interfaces:**
- Consumes: `toDiscordMarkdown` from Task 1, `check` from the harness.
- Produces: no new exports. Internal helpers `splitRow`, `stripInline`, `flushTable` stay private to the module.

- [ ] **Step 1: Write the failing test**

Append to `scripts/check-markdown.js`, above the summary block:

```js
// --- tables -----------------------------------------------------------

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
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd palu-gada-bot && npm run check:markdown
```

Expected: exit 1, five table failures, the Task 1 checks still passing.

- [ ] **Step 3: Write minimal implementation**

In `src/utils/discordMarkdown.js`, add next to the other constants:

```js
const ROW_RE = /^\s*\|.*\|\s*$/;
const ALIGN_CELL_RE = /^:?-{3,}:?$/;
```

Add these helpers below `convertLine`:

```js
/** Splits `| a | b |` into ['a', 'b']. */
function splitRow(line) {
    const trimmed = line.trim();
    return trimmed
        .slice(1, -1)
        .split('|')
        .map(cell => cell.trim());
}

/**
 * Removes inline markup. Nothing renders inside a code fence, so leaving
 * the asterisks in would just print them literally.
 */
function stripInline(text) {
    // Code spans come out first and go back in last. Their contents are
    // literal: a cell holding `snake_case_name` must not have _case_
    // eaten by the italic rule.
    const spans = [];
    let result = text.replace(/`([^`]*)`/g, (_match, code) => {
        spans.push(code);
        return `\u0000${spans.length - 1}\u0000`;
    });

    result = result
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/(\*\*|__)(.*?)\1/g, '$2')
        .replace(/(\*|_)(.*?)\1/g, '$2')
        .replace(/~~(.*?)~~/g, '$1');

    return result.replace(/\u0000(\d+)\u0000/g, (_match, i) => spans[Number(i)]);
}

/**
 * Renders buffered pipe rows as an aligned monospace block.
 * Returns the original lines when the buffer is not actually a table.
 */
function flushTable(buffer) {
    if (buffer.length === 0) return [];

    const rows = buffer.map(splitRow);
    const alignAt = rows.findIndex(
        row => row.length > 0 && row.every(cell => ALIGN_CELL_RE.test(cell))
    );
    if (alignAt === -1) return buffer;

    const body = rows
        .filter((_, i) => i !== alignAt)
        .map(row => row.map(stripInline));
    if (body.length === 0) return buffer;

    const columns = Math.max(...body.map(row => row.length));
    const widths = [];
    for (let c = 0; c < columns; c++) {
        widths.push(Math.max(...body.map(row => (row[c] ?? '').length)));
    }

    const rendered = body.map(row => {
        const cells = [];
        for (let c = 0; c < columns; c++) {
            cells.push((row[c] ?? '').padEnd(widths[c]));
        }
        return cells.join('  ').trimEnd();
    });

    return ['```', ...rendered, '```'];
}
```

Then rewrite the loop body in `toDiscordMarkdown` so rows accumulate. Replace the `for (const line of lines)` block with:

```js
    let table = []; // consecutive pipe rows awaiting a flush

    for (const line of lines) {
        const fenceMatch = FENCE_RE.exec(line);
        if (fenceMatch) {
            out.push(...flushTable(table));
            table = [];
            const marker = fenceMatch[1];
            if (fence === null) {
                fence = { char: marker[0], length: marker.length };
            } else if (marker[0] === fence.char && marker.length >= fence.length) {
                fence = null;
            }
            out.push(line);
            continue;
        }

        if (fence !== null) {
            out.push(line);
            continue;
        }

        if (ROW_RE.test(line)) {
            table.push(line);
            continue;
        }

        out.push(...flushTable(table));
        table = [];
        out.push(convertLine(line, headings));
    }

    out.push(...flushTable(table));
```

- [ ] **Step 4: Run it to verify it passes**

```bash
cd palu-gada-bot && npm run check:markdown
```

Expected: `16 passed, 0 failed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add palu-gada-bot/src/utils/discordMarkdown.js palu-gada-bot/scripts/check-markdown.js
git commit -m "feat(palu-gada-bot): render pipe tables as aligned monospace blocks"
```

---

### Task 3: Rules, images, task lists, list indentation

The remaining line-level conversions.

**Files:**
- Modify: `src/utils/discordMarkdown.js`
- Modify: `scripts/check-markdown.js`

**Interfaces:**
- Consumes: `toDiscordMarkdown`, `check`.
- Produces: no new exports. `toDiscordMarkdown` is complete after this task.

- [ ] **Step 1: Write the failing test**

Append to `scripts/check-markdown.js`, above the summary block:

```js
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
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd palu-gada-bot && npm run check:markdown
```

Expected: exit 1, nine new failures.

- [ ] **Step 3: Write minimal implementation**

Add the constants:

```js
const RULE_RE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const TASK_RE = /^(\s*)[-*+]\s+\[([ xX])\]\s+/;
const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+/;
```

Indentation depth needs state across lines, so it lives in the main loop, not in `convertLine`. Replace `convertLine` with:

```js
/**
 * Converts one non-fenced line.
 * @param {string} line
 * @param {'keep'|'bold'} headings
 * @param {number[]} indents - mutable stack of enclosing list indent
 *   widths, used to map raw indentation onto Discord's 2-space step.
 *   Callers own the array; this function mutates it.
 */
function convertLine(line, headings, indents) {
    const heading = HEADING_RE.exec(line);
    if (heading) {
        indents.length = 0;
        const body = heading[2].trim();
        if (headings === 'bold') return body === '' ? '' : `**${body}**`;
        const level = Math.min(heading[1].length, 3);
        return `${'#'.repeat(level)} ${body}`;
    }

    let result = line.replace(IMAGE_RE, (_m, alt, url) =>
        alt ? `[${alt}](${url})` : url
    );

    const task = TASK_RE.exec(result);
    if (task) {
        const depth = listDepth(task[1], indents);
        const box = task[2] === ' ' ? '☐' : '☑';
        return `${'  '.repeat(depth)}${box} ${result.slice(task[0].length)}`;
    }

    const list = LIST_RE.exec(result);
    if (list) {
        const depth = listDepth(list[1], indents);
        return `${'  '.repeat(depth)}${list[2]} ${result.slice(list[0].length)}`;
    }

    if (result.trim() !== '') indents.length = 0;
    return result;
}

/**
 * Maps a raw leading-whitespace string onto a nesting depth, by tracking
 * the widths actually seen. This works whether the source indents by two
 * spaces or four, which a fixed divisor would not.
 */
function listDepth(leading, indents) {
    const width = leading.replace(/\t/g, '  ').length;

    while (indents.length > 0 && indents[indents.length - 1] > width) {
        indents.pop();
    }
    if (indents.length === 0 || indents[indents.length - 1] < width) {
        indents.push(width);
    }
    return indents.length - 1;
}
```

In `toDiscordMarkdown`, declare the state before the loop:

```js
    const indents = [];
    let dropBlank = false; // a rule was just removed
```

Two branches go into the loop, at two DIFFERENT positions. Do not put
them together — that is the defect this wording exists to prevent.

**The `dropBlank` consumption goes FIRST, at the very top of the loop
body**, ahead of the fence branches and ahead of `ROW_RE`. Every one of
those branches can `continue`, and any `continue` that skips this check
carries the flag forward to eat a blank line much later in the document.
A rule followed by a table, or a rule followed by a fenced block, both
lose the wrong blank line if this check sits any lower.

Placing it first is safe because `dropBlank` is only ever set by the
`RULE_RE` branch, which runs only outside a fence, and the very next line
either clears the flag or is the blank it consumes. The flag is therefore
never true while inside a fence:

```js
        if (dropBlank) {
            dropBlank = false;
            if (line.trim() === '') continue;
        }
```

**The `RULE_RE` branch goes AFTER the `ROW_RE` branch.** A table
alignment row then never reaches the rule test:

```js
        if (RULE_RE.test(line)) {
            out.push(...flushTable(table));
            table = [];
            dropBlank = true;
            continue;
        }
```

The finished loop dispatches in this order: `dropBlank` consumption,
fence match, inside-fence passthrough, `ROW_RE` buffering, `RULE_RE`,
then flush plus `convertLine`.

And change the final dispatch from `convertLine(line, headings)` to `convertLine(line, headings, indents)`.

Note on ordering: `RULE_RE` must be tested after `ROW_RE`, so a table
alignment row `|---|---|` is never mistaken for a horizontal rule. In
practice `RULE_RE` cannot match a line containing pipes, so this is
defensive, but keep the order.

The rule branch flushes any buffered table before dropping the line, so
place it after `table.push(line); continue;` in source order but before
the final `convertLine` dispatch. The `dropBlank` consumption is the
opposite: it must run before EVERY branch that can `continue`, the fence
branches included.

- [ ] **Step 4: Run it to verify it passes**

```bash
cd palu-gada-bot && npm run check:markdown
```

Expected: `27 passed, 0 failed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add palu-gada-bot/src/utils/discordMarkdown.js palu-gada-bot/scripts/check-markdown.js
git commit -m "feat(palu-gada-bot): drop rules, convert images and task lists, normalise list indent"
```

---

### Task 4: Fence-aware chunker

**Files:**
- Create: `src/utils/discordChunker.js`
- Modify: `scripts/check-markdown.js`

**Interfaces:**
- Consumes: `check` from the harness.
- Produces: `chunkForDiscord(text: string, opts?: { limit?: number }) => string[]`. Default limit 2000. Returns `[]` for empty or whitespace-only input.

- [ ] **Step 1: Write the failing test**

Add the import at the top of `scripts/check-markdown.js`, below the existing one:

```js
import { chunkForDiscord } from '../src/utils/discordChunker.js';
```

Append above the summary block:

```js
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
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd palu-gada-bot && npm run check:markdown
```

Expected: `ERR_MODULE_NOT_FOUND` for `src/utils/discordChunker.js`.

- [ ] **Step 3: Write the implementation**

There is deliberately no reference implementation here. The first one in
this plan was hand-written and failed its own primary invariant on 57% of
random fenced inputs. What follows is the contract; derive the algorithm
from it and let the property test in Step 3b prove it.

Create `src/utils/discordChunker.js` exporting
`chunkForDiscord(text, opts)`.

**The contract, in priority order:**

1. No returned chunk exceeds `limit`. Nothing else in this file matters
   as much; this is what stops the Discord API rejecting a message.
2. No chunk leaves a code fence open. A boundary inside a fence closes it
   on the way out and reopens it with the same language tag on the way in.
3. Joining the chunks recovers every input line, none lost, none
   duplicated, none invented.
4. Boundaries land on line breaks. A line longer than the available room
   splits on spaces; only a single token longer than the room is cut
   mid-token, and a cut never separates a surrogate pair.
5. It never throws and never hangs, for any `text` and any `opts`.

**The accounting that the first attempt got wrong, stated explicitly:**

- The reopen marker costs its own length plus a newline, and it is part
  of the chunk it opens. Budget for it before placing any line into a
  reopened chunk, not after.
- The closing fence costs a newline plus three backticks. Reserve it for
  the whole time the chunk is inside a fence, including the chunk that
  merely opens the fence — that chunk will need closing too if it flushes.
- A line that opens a fence changes the reservation for the chunk it
  lands in. Decide the post-line fence state BEFORE testing whether the
  line fits, or the opener lands in a chunk with no room left to close it.
- Reopening is not always possible. When the marker plus its closing
  fence cannot fit inside `limit` at all, stop tracking the fence rather
  than emitting an over-limit chunk. Invariant 1 outranks invariant 2.
- Any per-line room calculation can go to zero or below once the
  reservations are subtracted. Floor it at 1 before it reaches a loop that
  advances by that amount, or the loop does not terminate.

**Input normalisation:** convert `\r\n` to `\n` before splitting. A
carriage return left on a fence marker line defeats fence detection
entirely, because `.` in a JavaScript regex does not match `\r`. Line
endings are not content for this purpose.

**Degenerate `opts`:** guard with
`opts && typeof opts === 'object' ? opts : {}` — a default parameter does
not fire on an explicit `null`. A limit that is negative, zero,
non-integer, `Infinity` or `NaN` falls back to the default of 2000.

- [ ] **Step 3b: Write the property test — this is not optional**

This goes in its OWN file, `scripts/check-markdown-fuzz.js`, because the
main suite must run it in a child process. A regression in the chunker's
budget arithmetic does not fail — it loops forever inside a single
`chunkForDiscord` call, which no in-process guard can interrupt. Run
in-process, such a regression hangs the whole suite with no output at all,
which reads like a stalled terminal rather than a test failure. Both
original Criticals behave that way, verified.

It is a permanent fixture, not a scratch probe: it is the only thing
standing between this file and the failure mode the hand-written version
shipped.

```js
// --- chunker properties -----------------------------------------------

function chunkerViolations(text, limit, fenceRepresentable) {
    const chunks = chunkForDiscord(text, { limit });
    const problems = [];

    // Invariants 1 and 4 are absolute and checked at every limit. Neither
    // has anything to do with fences, so neither sits behind the gate
    // below — putting the surrogate check there made it dead code, since
    // the gate is never open at limit 1, the only limit that forces a
    // hard cut through the generator's emoji.
    for (const chunk of chunks) {
        if (chunk.length > limit) problems.push(`over limit: ${chunk.length} > ${limit}`);
        // At limit 1 a surrogate pair cannot fit at all, so invariant 1
        // wins and the split is sanctioned. Everywhere else it is a defect.
        if (limit > 1) {
            if (/[\uD800-\uDBFF]$/.test(chunk)) problems.push('chunk ends on a high surrogate');
            if (/^[\uDC00-\uDFFF]/.test(chunk)) problems.push('chunk starts on a low surrogate');
        }
    }

    // Invariants 2 and 3 are conditional. When the limit cannot hold a
    // fence marker plus its closing fence, the contract says to stop
    // tracking the fence rather than emit an over-limit chunk, so marker
    // balance and marker-line accounting are not meaningful there.
    if (!fenceRepresentable) return problems;

    for (const chunk of chunks) {
        const markers = (chunk.match(/^\s*```/gm) || []).length;
        if (markers % 2 !== 0) problems.push('unbalanced fence');
    }

    // Drop whole fence-marker lines before comparing: a reopened fence
    // legitimately repeats its language tag, which is invariant 2 working,
    // not duplicated content. Then ignore whitespace, because wrapping a
    // long line inserts newlines the source did not have.
    const signature = value => value
        .split('\n')
        .filter(line => !/^\s*```/.test(line))
        .join('')
        .replace(/\s/g, '');

    if (signature(chunks.join('\n')) !== signature(text.replace(/\r\n/g, '\n'))) {
        problems.push('content lost or duplicated');
    }

    return problems;
}

/** Widest fence marker in the text, so the caller can gate invariants 2-3. */
function widestMarker(text) {
    let widest = 0;
    // Normalise CRLF first. A carriage return left on a marker line makes
    // the regex below fail to match, because `.` never matches \r — the
    // same defect that made the chunker itself blind to CRLF fences. The
    // helper would then report width 0 and open the gate too early.
    for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
        const match = /^\s*(```.*)$/.exec(line);
        if (match) widest = Math.max(widest, match[1].trimEnd().length);
    }
    return widest;
}

function randomChunkerCase(seed) {
    // Deterministic PRNG so a failure is reproducible from its seed alone.
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
            lines.push(open ? '```' : '```' + pick(['', 'js', 'python', 'x'.repeat(40)]));
            open = !open;
        } else {
            lines.push(pick([
                '',
                'short',
                'a '.repeat(20).trim(),
                'z'.repeat(60),
                'emoji \u{1F600} here',
                'a\u0301 combining',
            ]));
        }
    }
    return lines.join(pick(['\n', '\n', '\r\n']));
}

export function runChunkerFuzz() {
    let failures = 0;
    let first = '';
    const LIMITS = [1, 2, 3, 4, 5, 8, 10, 17, 20, 50, 100, 2000];

    for (let seed = 1; seed <= 2000; seed++) {
        const text = randomChunkerCase(seed);
        for (const limit of LIMITS) {
            let problems;
            try {
                const representable = limit >= widestMarker(text) + 6;
                problems = chunkerViolations(text, limit, representable);
            } catch (error) {
                problems = [`threw: ${error.message}`];
            }
            if (problems.length > 0) {
                failures++;
                if (first === '') first = `seed ${seed} limit ${limit}: ${problems.join(', ')}`;
            }
        }
    }

    return failures === 0 ? 'clean' : `${failures} failures, first: ${first}`;
}

// CLI entry: the parent suite spawns this file so a non-terminating loop
// in the chunker surfaces as a killed child rather than a silent hang.
if (process.argv[1] && process.argv[1].endsWith('check-markdown-fuzz.js')) {
    console.log(runChunkerFuzz());
}
```

The limits list keeps 1 through 4 deliberately. Fence tracking cannot
survive there, and that is the point: invariant 1 must still hold when
invariant 2 has been abandoned. The `fenceRepresentable` gate is what
separates the two.

Compute the gate as `limit >= widestMarker(text) + 6` — the marker, a
newline, at least one content character, and the four characters of
`\n\`\`\`` that close it.

Then in `scripts/check-markdown.js`, above the summary block, drive it as
a child process with a kill timer. There is no `timeout` binary on macOS,
so the timer has to come from `spawnSync` itself:

```js
// --- chunker property fuzz (child process) ----------------------------

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const fuzzScript = join(dirname(fileURLToPath(import.meta.url)), 'check-markdown-fuzz.js');
const fuzzRun = spawnSync(process.execPath, [fuzzScript], {
    encoding: 'utf8',
    timeout: 120000,
});

const fuzzOutcome = fuzzRun.signal || fuzzRun.error
    ? `fuzz did not finish within 120s (signal ${fuzzRun.signal ?? 'none'}) — probable non-terminating loop in the chunker`
    : (fuzzRun.stdout || '').trim() || `fuzz produced no output (exit ${fuzzRun.status})`;

check('chunker property fuzz over 24000 cases', fuzzOutcome, 'clean');
```

Run the suite normally:

```bash
cd palu-gada-bot && npm run check:markdown
```

- [ ] **Step 4: Run it to verify it passes**

```bash
cd palu-gada-bot && npm run check:markdown
```

Expected: `44 passed, 0 failed`, exit 0.

- [ ] **Step 5: Add a guard that no chunk exceeds its limit**

Append above the summary block:

```js
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
```

```bash
cd palu-gada-bot && npm run check:markdown
```

Expected: `44 passed, 0 failed`.

- [ ] **Step 6: Commit**

```bash
git add palu-gada-bot/src/utils/discordChunker.js palu-gada-bot/scripts/check-markdown.js
git commit -m "feat(palu-gada-bot): add fence-aware chunker for discord message limits"
```

---

### Task 5: The `sendAiReply` helper

**Files:**
- Create: `src/utils/aiReply.js`

**Interfaces:**
- Consumes: `toDiscordMarkdown`, `chunkForDiscord`.
- Produces: `sendAiReply(interaction, options) => Promise<void>` where options is
  `{ header?: object, body: string, footer?: { text: string }, ephemeral?: boolean, mode?: 'message' | 'embed', maxChunks?: number }`.
  `header` is spread into the embed, so it accepts any embed field: `author`, `title`, `description`, `fields`, `color`.

- [ ] **Step 1: Write the failing test**

There is no way to assert on Discord I/O without a framework, so this task is verified against a fake interaction. Append to `scripts/check-markdown.js`, above the summary block:

```js
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

const emptyBody = fakeInteraction();
await sendAiReply(emptyBody, { header: { title: 'x' }, body: '', mode: 'message' });
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
        const overLong = fake.calls
            .filter(([, payload]) => typeof payload.content === 'string')
            .filter(([, payload]) => payload.content.length > 2000);
        return String(overLong.length);
    })(),
    '0'
);

check(
    'an empty body still produces a visible reply',
    String(emptyBody.calls.length >= 1),
    'true'
);
```

Change the harness shebang line's file to top-level await by confirming it is ESM — `package.json` already sets `"type": "module"`, so top-level `await` works.

- [ ] **Step 2: Run it to verify it fails**

```bash
cd palu-gada-bot && npm run check:markdown
```

Expected: `ERR_MODULE_NOT_FOUND` for `src/utils/aiReply.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/aiReply.js`:

```js
/**
 * The single send path for AI command output.
 *
 * Discord renders no headings inside embeds, so long-form prose goes in
 * message content ('message' mode) with only the metadata in an embed.
 * Short structured output stays framed in an embed ('embed' mode) with
 * headings downgraded to bold.
 */
import { toDiscordMarkdown } from './discordMarkdown.js';
import { chunkForDiscord } from './discordChunker.js';

const MESSAGE_LIMIT = 2000;
// Deliberately under Discord's real 4096 so a continuation embed's own
// framing cannot push a payload over the edge. Not a drifted constant.
const EMBED_DESC_LIMIT = 4000;
const DEFAULT_COLOR = 0x5865F2;
const TRUNCATED = '*Response truncated due to length…*';
const EMPTY = '*No response.*';

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 *   - must already be deferred
 * @param {object} options
 * @param {object} [options.header] - embed fields: author, title,
 *   description, fields, color
 * @param {string} options.body - raw model output
 * @param {{text: string}} [options.footer]
 * @param {boolean} [options.ephemeral]
 * @param {'message'|'embed'} [options.mode]
 * @param {number} [options.maxChunks]
 */
export async function sendAiReply(interaction, options) {
    const {
        header = {},
        body = '',
        footer,
        ephemeral = false,
        mode = 'message',
        maxChunks = 5,
    } = options;

    if (mode === 'embed') {
        return sendEmbedMode(interaction, { header, body, footer, ephemeral, maxChunks });
    }
    return sendMessageMode(interaction, { header, body, footer, ephemeral, maxChunks });
}

async function sendMessageMode(interaction, { header, body, footer, ephemeral, maxChunks }) {
    await interaction.editReply({
        embeds: [{ color: DEFAULT_COLOR, ...header }],
    });

    const text = toDiscordMarkdown(body, { headings: 'keep' });
    const chunks = chunkForDiscord(text, { limit: MESSAGE_LIMIT });

    if (chunks.length === 0) {
        await interaction.followUp({ content: EMPTY, ephemeral });
        return;
    }

    const shown = chunks.slice(0, maxChunks);
    const complete = chunks.length <= maxChunks;
    const footerLine = footer?.text ? `-# ${footer.text}` : '';

    for (let i = 0; i < shown.length; i++) {
        let content = shown[i];
        const isLast = i === shown.length - 1;

        if (isLast && complete) {
            await sendWithFooter(interaction, content, footerLine, ephemeral);
            continue;
        }

        await interaction.followUp({ content, ephemeral });
    }

    if (!complete) {
        await sendWithFooter(interaction, TRUNCATED, footerLine, ephemeral);
    }
}

/**
 * Sends `content`, appending `footerLine` only when the result still fits
 * in a message. Otherwise the footer goes in its own message.
 *
 * Both the last-chunk path and the truncation path need this. The first
 * version of this file inlined the length check in one and not the other,
 * so a long footer on a truncated response produced a 2029-character send
 * against a 2000 limit.
 */
async function sendWithFooter(interaction, content, footerLine, ephemeral) {
    if (footerLine === '') {
        await interaction.followUp({ content, ephemeral });
        return;
    }

    if (content.length + footerLine.length + 1 <= MESSAGE_LIMIT) {
        await interaction.followUp({ content: `${content}\n${footerLine}`, ephemeral });
        return;
    }

    await interaction.followUp({ content, ephemeral });
    await interaction.followUp({ content: safeSlice(footerLine, MESSAGE_LIMIT), ephemeral });
}

/**
 * Truncates to `limit` without bisecting a surrogate pair.
 *
 * Do NOT reach for `chunkForDiscord` here. It splits on word boundaries,
 * and a footer is a single line whose only space follows the `-#` prefix,
 * so its first chunk is the prefix alone and the whole footer is lost.
 * This needs a character cut, not a word-aware split.
 */
function safeSlice(text, limit) {
    if (text.length <= limit) return text;
    const code = text.charCodeAt(limit - 1);
    const end = code >= 0xD800 && code <= 0xDBFF ? limit - 1 : limit;
    return text.slice(0, end);
}

async function sendEmbedMode(interaction, { header, body, footer, ephemeral, maxChunks }) {
    const text = toDiscordMarkdown(body, { headings: 'bold' });
    const chunks = chunkForDiscord(text, { limit: EMBED_DESC_LIMIT });
    const shown = chunks.length === 0 ? [EMPTY] : chunks.slice(0, maxChunks);
    const complete = chunks.length <= maxChunks;

    for (let i = 0; i < shown.length; i++) {
        const isFirst = i === 0;
        const isLast = i === shown.length - 1;

        const embed = isFirst
            ? { color: DEFAULT_COLOR, ...header, description: shown[i] }
            : { color: header.color ?? DEFAULT_COLOR, description: shown[i] };

        if (isLast) {
            if (footer) embed.footer = footer;
            embed.timestamp = new Date().toISOString();
        }

        if (isFirst) await interaction.editReply({ embeds: [embed] });
        else await interaction.followUp({ embeds: [embed], ephemeral });
    }

    if (!complete) {
        await interaction.followUp({ content: TRUNCATED, ephemeral });
    }
}
```

Note: `header` is spread before `description` in embed mode, so a caller passing both a header description and a body gets the body. Commands that want a question echoed alongside prose put it in `header.fields`, not `header.description`.

- [ ] **Step 4: Run it to verify it passes**

```bash
cd palu-gada-bot && npm run check:markdown
```

Expected: `51 passed, 0 failed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add palu-gada-bot/src/utils/aiReply.js palu-gada-bot/scripts/check-markdown.js
git commit -m "feat(palu-gada-bot): add sendAiReply helper owning embed and chunk dispatch"
```

---

### Task 6: Shared Discord formatting preamble

**Files:**
- Modify: `src/config/ai.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `DISCORD_FORMAT_PROMPT` — a string constant exported from `src/config/ai.js`.

- [ ] **Step 1: Add the constant**

Append to `src/config/ai.js`:

```js
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
```

- [ ] **Step 2: Verify it parses**

```bash
cd palu-gada-bot && node -e "import('./src/config/ai.js').then(m => console.log(m.DISCORD_FORMAT_PROMPT))"
```

Expected: the sentence prints on one line.

- [ ] **Step 3: Commit**

```bash
git add palu-gada-bot/src/config/ai.js
git commit -m "feat(palu-gada-bot): add shared discord formatting prompt preamble"
```

---

### Task 7: Convert `/ask`

The reference conversion. Later command tasks follow this shape.

**Files:**
- Modify: `src/commands/ask.js:24-95`

**Interfaces:**
- Consumes: `sendAiReply`, `DISCORD_FORMAT_PROMPT`.
- Produces: nothing other commands depend on.

- [ ] **Step 1: Replace the imports**

At the top of `src/commands/ask.js`, change:

```js
import { getAiFooter } from '../config/ai.js';
```

to:

```js
import { getAiFooter, DISCORD_FORMAT_PROMPT } from '../config/ai.js';
import { sendAiReply } from '../utils/aiReply.js';
```

- [ ] **Step 2: Append the preamble to the system prompt**

Change the `askClaude` call's `systemPrompt` from the string ending `'...politely decline to answer.'` to:

```js
                systemPrompt: `You are a helpful assistant in a Discord server. Keep your responses concise and friendly. If the question is inappropriate or harmful, politely decline to answer. ${DISCORD_FORMAT_PROMPT}`,
```

The old prompt said "Use Discord markdown formatting when appropriate" — that clause is dropped because `DISCORD_FORMAT_PROMPT` supersedes it.

- [ ] **Step 3: Replace the whole send block**

Delete everything in the `try` block after the `askClaude` call — both the `if (answer.length > 2000)` branch and its `else` — and replace with:

```js
            await sendAiReply(interaction, {
                header: {
                    author: {
                        name: `${interaction.user.tag} asked:`,
                        icon_url: interaction.user.displayAvatarURL({ dynamic: true }),
                    },
                    description: question.slice(0, 256) + (question.length > 256 ? '...' : ''),
                },
                body: answer,
                footer: getAiFooter('', { smart: true }),
                ephemeral: isPrivate,
                mode: 'message',
            });
```

Leave the `catch` block exactly as it is.

- [ ] **Step 4: Verify the module loads and the file shrank**

```bash
cd palu-gada-bot && node -e "import('./src/commands/ask.js').then(m => console.log(m.default.data.name))"
```

Expected: `ask`.

```bash
cd palu-gada-bot && wc -l src/commands/ask.js
```

Expected: around 55 lines, down from 107.

- [ ] **Step 5: Commit**

```bash
git add palu-gada-bot/src/commands/ask.js
git commit -m "fix(palu-gada-bot): render /ask answers as message content so headings work"
```

---

### Task 8: Convert `/explain`, `/tldr`, `/summarize`

Three commands whose prose goes into an embed description, two of them uncapped.

**Files:**
- Modify: `src/commands/explain.js:52-82`
- Modify: `src/commands/tldr.js:62-91`
- Modify: `src/commands/summarize.js:100-135`

**Interfaces:**
- Consumes: `sendAiReply`, `DISCORD_FORMAT_PROMPT`.
- Produces: nothing.

- [ ] **Step 1: Convert `/explain`**

Change the import to `import { getAiFooter, DISCORD_FORMAT_PROMPT } from '../config/ai.js';` and add `import { sendAiReply } from '../utils/aiReply.js';`.

Append the preamble to its system prompt:

```js
                systemPrompt: `You are an expert educator who excels at explaining complex topics. Keep explanations focused and well-structured. ${DISCORD_FORMAT_PROMPT}`,
```

Replace the `const embed = {...}` block, the `editReply`, and the `if (explanation.length > 4096)` follow-up with:

```js
            await sendAiReply(interaction, {
                header: { title: `📚 ${topic}`.slice(0, 256) },
                body: explanation,
                footer: getAiFooter(`Level: ${levelLabels[level]}`, { smart: true }),
                ephemeral: isPrivate,
                mode: 'message',
            });
```

Keep the `levelLabels` map — it is still used by the footer.

- [ ] **Step 2: Convert `/tldr`**

Same two import changes. System prompt becomes:

```js
                systemPrompt: `You are an expert at summarizing content. Be concise and capture the essential information. If the content is too short or unclear to summarize meaningfully, say so politely. ${DISCORD_FORMAT_PROMPT}`,
```

Replace the `const embed = {...}` block, the preview-field push, and the `editReply` with:

```js
            const header = { title: '📝 TL;DR' };
            if (!isUrl && text.length > 100) {
                header.fields = [{
                    name: 'Original (preview)',
                    value: text.slice(0, 200) + (text.length > 200 ? '...' : ''),
                    inline: false,
                }];
            }

            await sendAiReply(interaction, {
                header,
                body: summary,
                footer: getAiFooter(`Style: ${styleLabels[style]}`),
                ephemeral: isPrivate,
                mode: 'message',
            });
```

This is the fix for the uncapped description that could throw past 4096.

- [ ] **Step 3: Convert `/summarize`**

Same two import changes. Append `DISCORD_FORMAT_PROMPT` to its system prompt the same way.

`/summarize` has no `private` option and defers non-ephemerally, so omit `ephemeral`. Replace its `editReply` block with:

```js
            await sendAiReply(interaction, {
                header: {
                    title: '📋 Channel Summary',
                    fields: [
                        { name: 'Channel', value: `${targetChannel}`, inline: true },
                        { name: 'Time Range', value: `Last ${hours} hour(s)`, inline: true },
                        { name: 'Messages', value: `${messages.length}`, inline: true },
                    ],
                },
                body: summary,
                footer: getAiFooter('', { smart: true }),
                mode: 'message',
            });
```

Read the existing embed first and carry over its actual title and field names rather than assuming these — the field names above come from `src/commands/summarize.js:119-133` but the title may differ.

- [ ] **Step 4: Verify all three load**

```bash
cd palu-gada-bot && for c in explain tldr summarize; do
  node -e "import('./src/commands/$c.js').then(m => console.log('$c ok:', m.default.data.name))"
done
```

Expected: three `ok` lines.

- [ ] **Step 5: Commit**

```bash
git add palu-gada-bot/src/commands/explain.js palu-gada-bot/src/commands/tldr.js palu-gada-bot/src/commands/summarize.js
git commit -m "fix(palu-gada-bot): route explain, tldr and summarize through sendAiReply"
```

---

### Task 9: Convert `/answer` and `/recap`

`/answer` has an uncapped description. `/recap` has its own splitter that the shared chunker replaces.

**Files:**
- Modify: `src/commands/answer.js:186-210`
- Modify: `src/commands/recap.js:91-127`

**Interfaces:**
- Consumes: `sendAiReply`, `DISCORD_FORMAT_PROMPT`.
- Produces: nothing.

- [ ] **Step 1: Convert `/answer`**

Add the two imports. Append `DISCORD_FORMAT_PROMPT` to its system prompt.

Careful: `/answer` parses the model response with `aiResponse.match(/REPLYING TO:/)` at `src/commands/answer.js:170-171`. Do not touch that parsing. Only `answerText` goes through the helper.

Replace the `editReply` block with:

```js
            await sendAiReply(interaction, {
                header: {
                    author: {
                        name: `${targetName} might say...`,
                        icon_url: targetUser.displayAvatarURL({ dynamic: true }),
                    },
                    fields: [
                        { name: 'Responding to', value: displayQuestion, inline: false },
                        {
                            name: 'Context analyzed',
                            value: `${messages.length} messages from last ${hours}h`,
                            inline: true,
                        },
                    ],
                },
                body: answerText,
                footer: getAiFooter('AI-generated response based on your conversation style'),
                mode: 'message',
            });
```

- [ ] **Step 2: Convert `/recap`**

Add the two imports. Append `DISCORD_FORMAT_PROMPT` to its system prompt.

Delete the entire `const MAX = 4000;` splitter loop and the `for (let i = 0; i < chunks.length; i++)` send loop at `src/commands/recap.js:91-127`. Replace both with:

```js
            await sendAiReply(interaction, {
                header: {
                    title: `📰 Server Recap — Last ${hours}h`,
                    fields: [{
                        name: 'Stats',
                        value: `${totalMessages} messages across ${channelDigests.length} channel(s)`,
                        inline: true,
                    }],
                },
                body: digest,
                footer: getAiFooter('', { smart: true }),
                mode: 'message',
            });
```

Note the behaviour change: stats previously sat on the last embed of a multi-embed reply. They now sit on the single header embed at the top. That is intended — the header carries metadata, the messages carry prose.

`/recap` builds its prompt with a `---\n${chatLog}\n---` delimiter at `src/commands/recap.js:85-87`. That is prompt input, not model output, so the converter never sees it. Leave it.

- [ ] **Step 3: Verify both load**

```bash
cd palu-gada-bot && for c in answer recap; do
  node -e "import('./src/commands/$c.js').then(m => console.log('$c ok:', m.default.data.name))"
done
```

Expected: two `ok` lines.

- [ ] **Step 4: Commit**

```bash
git add palu-gada-bot/src/commands/answer.js palu-gada-bot/src/commands/recap.js
git commit -m "fix(palu-gada-bot): route answer and recap through sendAiReply"
```

---

### Task 10: Convert `/translate` and `/fallacy`

Both keep their embeds. Their output is short and structured, and reads better framed.

**Files:**
- Modify: `src/commands/translate.js:82-130`
- Modify: `src/commands/fallacy.js:165-216`

**Interfaces:**
- Consumes: `toDiscordMarkdown`, `chunkForDiscord`, `DISCORD_FORMAT_PROMPT`.
- Produces: nothing.

- [ ] **Step 1: Fix `/translate`'s uncapped follow-up**

`/translate` keeps its two-field embed, which is the right shape for source and translation side by side. The bug is the follow-up at `src/commands/translate.js:125-128`, which sends the full translation with no length guard and throws past 2000.

Add `import { chunkForDiscord } from '../utils/discordChunker.js';` and `import { toDiscordMarkdown } from '../utils/discordMarkdown.js';`.

Append `DISCORD_FORMAT_PROMPT` to its system prompt.

Replace the follow-up block:

```js
            if (translation.length > 1024) {
                const full = toDiscordMarkdown(translation, { headings: 'bold' });
                const chunks = chunkForDiscord(`**Full translation:**\n${full}`, { limit: 2000 });
                for (const chunk of chunks.slice(0, 5)) {
                    await interaction.followUp({ content: chunk, ephemeral: isPrivate });
                }
                // Say so rather than dropping the tail silently, matching
                // how /fallacy reports omitted findings.
                if (chunks.length > 5) {
                    await interaction.followUp({
                        content: '*Translation truncated due to length…*',
                        ephemeral: isPrivate,
                    });
                }
            }
```

Headings go to bold here even though this is message content, because the embed above already shows a truncated copy — matching the two keeps them consistent.

- [ ] **Step 2: Sanitise `/fallacy` findings**

`/fallacy` formats JSON it parses itself, so it needs no layout change. The risk is a stray table or rule inside a finding's text leaking into an embed field.

Add `import { toDiscordMarkdown } from '../utils/discordMarkdown.js';`.

**Do NOT append `DISCORD_FORMAT_PROMPT` to `/fallacy`'s `SYSTEM_PROMPT`.**
Every other command sends model prose to Discord, so shaping that prose is
the point. `/fallacy` does not: it asks for strict JSON and parses it, and
the only text that reaches Discord is the parsed field values, which the
converter already handles. Appending a preamble that asks for bullet lists
and says fenced code blocks work normally actively fights the JSON
instruction sitting closer to generation. The existing `stripJsonFence`
and the `JSON.parse` try/catch bound the damage to an occasional failed
analysis rather than corruption, but the right move is not to create the
tension at all.

Find where each finding's text is composed into `entries`. Wrap the
model-authored text in `toDiscordMarkdown(text, { headings: 'bold' })` at
the point it is inserted. Read the surrounding code to place it correctly;
the plan does not assume its exact variable names.

**Convert the quoted user message too, and blockquote every line of it.**
The entry template prefixes only the FIRST line with `> `, so a horizontal
rule sitting on a later line of a real user message renders as a raw,
unquoted rule that splits the embed description. That is a layout break,
not cosmetic litter. Converting the preview costs no fidelity of record:
the entry already carries a jump link to the verbatim original.

```js
const quote = toDiscordMarkdown(truncate(rawContent, QUOTE_MAX_CHARS), { headings: 'bold' })
    .split('\n')
    .map(line => `> ${line}`)
    .join('\n');
```

Then drop the now-redundant `> ` from the template's own interpolation of
the quote, or the first line ends up double-prefixed.

Leave the `while (description.length > EMBED_DESC_LIMIT)` entry-dropping loop alone. It already handles overflow correctly.

- [ ] **Step 3: Verify both load**

```bash
cd palu-gada-bot && for c in translate fallacy; do
  node -e "import('./src/commands/$c.js').then(m => console.log('$c ok:', m.default.data.name))"
done
```

Expected: two `ok` lines.

- [ ] **Step 4: Run the full check suite**

```bash
cd palu-gada-bot && npm run check:markdown
```

Expected: `51 passed, 0 failed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add palu-gada-bot/src/commands/translate.js palu-gada-bot/src/commands/fallacy.js
git commit -m "fix(palu-gada-bot): cap translate follow-up and sanitise fallacy findings"
```

---

### Task 11: Live verification and deploy

The fixture suite proves the pure functions. Only the live bot proves the rendering.

**Files:**
- None. This task changes no code unless verification finds a defect.

**Interfaces:**
- Consumes: everything above.
- Produces: a verified branch ready for a PR.

- [ ] **Step 1: Confirm every command still loads**

```bash
cd palu-gada-bot && for f in src/commands/*.js; do
  node -e "import('./$f').then(() => {}).catch(e => { console.error('$f', e.message); process.exit(1); })" || exit 1
done && echo "all commands load"
```

Expected: `all commands load`.

- [ ] **Step 2: Deploy to the bot host and restart**

```bash
cd palu-gada-bot && ./scripts/deploy.sh
```

Read `scripts/deploy.sh` first to confirm what it targets. If it deploys to the live server from the current checkout, verify you are on `feat/discord-markdown-renderer` before running it.

- [ ] **Step 3: Run the original failing case**

In Discord, run:

```
/ask question: biaya homelab server dual xeon 2673 v4 + RAM 128GB ECC DDR4 beserta tagihan listrik bulanan
```

Confirm all four:
- Headings render at heading size, no literal `##`.
- The cost table appears as an aligned monospace block, not pipes.
- No `---` anywhere in the output.
- The attribution appears as small subtext under the last message.

- [ ] **Step 4: Spot-check the other six**

Run each and confirm no raw syntax and no error reply:

```
/tldr text: <a few paragraphs>
/explain topic: kubernetes ingress  level: beginner
/summarize hours: 24
/recap hours: 24
/answer <a question>
/translate text: selamat pagi  to: english
/fallacy
```

- [ ] **Step 5: Open the PR**

```bash
gh pr create -R faizalmuzakki/home-server \
  --base main \
  --head feat/discord-markdown-renderer \
  --title "fix(palu-gada-bot): render AI markdown correctly across all commands" \
  --body-file -
```

Body should cover: the dialect problem with the `/ask` screenshot as evidence, the four latent overflow crashes, the message-vs-embed convention and why, and that no dependency was added.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 Architecture, three modules | 1, 4, 5 |
| §2 `toDiscordMarkdown` | 1, 2, 3 |
| §3 `chunkForDiscord` | 4 |
| §4 `sendAiReply` | 5 |
| §5 Prompt preamble | 6, applied in 7–10 |
| §6 Per-command changes, all 8 | 7, 8, 9, 10 |
| §7 Error handling | 5, and each command's `catch` left untouched |
| §8 Testing | 1 (harness), extended in 2, 3, 4, 5; live check in 11 |
| §9 Risks | mobile width accepted; fence language covered by Task 4 fixtures |

No gaps.

**Placeholder scan:** No TBDs. Two steps direct the implementer to read surrounding code before editing — Task 8 Step 3 for `/summarize`'s embed title, and Task 10 Step 2 for `/fallacy`'s entry shape. These are deliberate: the plan does not have those exact strings in hand and guessing them would produce a wrong edit. Both name the file and line range to read.

**Type consistency:** `toDiscordMarkdown(text, opts)` with `opts.headings` of `'keep' | 'bold'` is used identically in Tasks 1, 2, 3, 5, 10. `chunkForDiscord(text, opts)` with `opts.limit` is used identically in Tasks 4, 5, 10. `sendAiReply(interaction, options)` with `mode` of `'message' | 'embed'` is used identically in Tasks 5, 7, 8, 9. `DISCORD_FORMAT_PROMPT` is a string in Tasks 6 through 10.
