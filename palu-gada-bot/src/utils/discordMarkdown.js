/**
 * Converts GitHub-flavoured Markdown to the dialect Discord renders.
 *
 * Pure string -> string. Never throws: every branch falls back to
 * emitting the original line unchanged.
 */

const FENCE_RE = /^\s*(`{3,}|~{3,})(.*)$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const ROW_RE = /^\s*\|.*\|\s*$/;
const ALIGN_CELL_RE = /^:?-{3,}:?$/;
const RULE_RE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
// A dash run directly under a non-blank prose line is a setext H2, not a
// thematic break. Dropping it as a rule deleted the heading outright.
const DASH_RULE_RE = /^\s*-{3,}\s*$/;
// Discord's subtext. Renders in message content, prints literally in an
// embed, so 'bold' mode strips the prefix and 'keep' mode leaves it.
const SUBTEXT_RE = /^(\s*)-#\s+(.*)$/;
const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const TASK_RE = /^(\s*)[-*+]\s+\[([ xX])\]\s+/;
const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+/;

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

    // A carriage return left on the end of a line defeats every anchored
    // regex here, because `.` in a JS regex never matches \r: FENCE_RE and
    // HEADING_RE both fail on a \r-terminated line, so a CRLF heading was
    // left raw and a CRLF fenced block had its inner table converted into
    // a nested fence. Same defect the chunker already normalises away.
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const out = [];

    // The opening fence while inside a block. CommonMark closes a fence
    // only on the same character AT LEAST AS LONG as the opener, so a
    // three-backtick line inside a four-backtick block is content.
    let fence = null; // { char, length } | null

    let table = []; // consecutive pipe rows awaiting a flush

    const indents = []; // mutable stack of enclosing list indent widths
    let dropBlank = false; // a rule was just removed

    // Index in `out` of the plain prose line a following dash run would
    // underline as a setext H2, or -1 when the previous line cannot be
    // underlined (blank, a list item, a heading, a fence or a table row).
    let setextAt = -1;

    for (const line of lines) {
        if (dropBlank) {
            dropBlank = false;
            if (line.trim() === '') continue;
        }

        const fenceMatch = FENCE_RE.exec(line);
        if (fenceMatch) {
            setextAt = -1;
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
            setextAt = -1;
            table.push(line);
            continue;
        }

        if (RULE_RE.test(line)) {
            // A dash run underlining prose is a setext H2. Rewrite the line
            // it underlines instead of deleting the pair.
            if (DASH_RULE_RE.test(line) && setextAt !== -1 && table.length === 0) {
                const title = out[setextAt].trim();
                out[setextAt] = headings === 'bold' ? `**${title}**` : `## ${title}`;
                setextAt = -1;
                continue;
            }
            setextAt = -1;
            out.push(...flushTable(table));
            table = [];
            dropBlank = true;
            continue;
        }

        out.push(...flushTable(table));
        table = [];
        out.push(convertLine(line, headings, indents));
        setextAt = underlinable(line) ? out.length - 1 : -1;
    }

    out.push(...flushTable(table));

    return out.join('\n');
}

/**
 * Whether a dash run on the next line would make this one a setext H2.
 * Only plain, non-blank prose qualifies: a blank line makes the dashes a
 * thematic break, and an ATX heading, list item or subtext line is not
 * something a setext underline applies to.
 */
function underlinable(line) {
    if (line.trim() === '') return false;
    if (HEADING_RE.test(line)) return false;
    if (SUBTEXT_RE.test(line)) return false;
    if (TASK_RE.test(line)) return false;
    if (LIST_RE.test(line)) return false;
    return true;
}

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

    const subtext = SUBTEXT_RE.exec(result);
    if (subtext) {
        indents.length = 0;
        // Message content renders '-# ' fine, so 'keep' leaves it alone. An
        // embed prints the prefix literally, so 'bold' drops it.
        return headings === 'bold' ? subtext[2] : result;
    }

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
