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
