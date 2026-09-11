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
    const lines = text.split('\n');
    const out = [];

    // The opening fence while inside a block. CommonMark closes a fence
    // only on the same character AT LEAST AS LONG as the opener, so a
    // three-backtick line inside a four-backtick block is content.
    let fence = null; // { char, length } | null

    let table = []; // consecutive pipe rows awaiting a flush

    const indents = []; // mutable stack of enclosing list indent widths
    let dropBlank = false; // a rule was just removed

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

        if (RULE_RE.test(line)) {
            out.push(...flushTable(table));
            table = [];
            dropBlank = true;
            continue;
        }

        if (dropBlank) {
            dropBlank = false;
            if (line.trim() === '') continue;
        }

        out.push(...flushTable(table));
        table = [];
        out.push(convertLine(line, headings, indents));
    }

    out.push(...flushTable(table));

    return out.join('\n');
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
