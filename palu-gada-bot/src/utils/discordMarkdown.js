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
export function toDiscordMarkdown(text, opts = {}) {
    if (typeof text !== 'string' || text === '') return '';

    const headings = opts.headings === 'bold' ? 'bold' : 'keep';
    const lines = text.split('\n');
    const out = [];

    let fence = null; // the opening marker while inside a fenced block

    for (const line of lines) {
        const fenceMatch = FENCE_RE.exec(line);
        if (fenceMatch) {
            const marker = fenceMatch[1];
            if (fence === null) {
                fence = marker[0]; // ` or ~
            } else if (marker[0] === fence) {
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
