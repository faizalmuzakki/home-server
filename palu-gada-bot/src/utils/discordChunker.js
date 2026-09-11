/**
 * Splits text for Discord's per-message limits without breaking words or
 * leaving a code fence open across a message boundary.
 *
 * Pure string -> string[]. Never throws.
 */

const FENCE_RE = /^\s*(`{3,})(.*)$/;
const DEFAULT_LIMIT = 2000;

/**
 * @param {string} text
 * @param {object} [opts]
 * @param {number} [opts.limit] - characters per chunk, default 2000
 * @returns {string[]} - empty when there is nothing to send
 */
export function chunkForDiscord(text, opts = {}) {
    if (typeof text !== 'string' || text.trim() === '') return [];

    // A default parameter only fires on undefined, so an explicit null
    // would slip past it and throw on the property read below.
    const options = opts && typeof opts === 'object' ? opts : {};
    const limit = Number.isFinite(options.limit) && options.limit > 0
        ? Math.floor(options.limit)
        : DEFAULT_LIMIT;

    const chunks = [];
    let buffer = [];
    let length = 0;
    let lang = null; // language tag of the fence we are inside, if any

    const flush = () => {
        if (buffer.length === 0) return;
        const reopened = lang !== null;
        const body = buffer.join('\n');
        chunks.push(reopened ? `${body}\n\`\`\`` : body);
        buffer = [];
        length = 0;
    };

    for (const rawLine of text.split('\n')) {
        // Reserve room for the closing fence we may have to append.
        const budget = lang === null ? limit : limit - 4;

        for (const line of splitLongLine(rawLine, budget)) {
            const cost = buffer.length === 0 ? line.length : line.length + 1;

            if (length + cost > budget && buffer.length > 0) {
                const carried = lang;
                flush();
                if (carried !== null) {
                    buffer.push(`\`\`\`${carried}`);
                    length = 3 + carried.length;
                }
            }

            buffer.push(line);
            length += buffer.length === 1 ? line.length : line.length + 1;

            const fence = FENCE_RE.exec(line);
            if (fence) lang = lang === null ? fence[2].trim() : null;
        }
    }

    flush();
    return chunks;
}

/** Splits one over-long line on spaces, hard-cutting only a long token. */
function splitLongLine(line, limit) {
    if (line.length <= limit) return [line];

    const parts = [];
    let current = '';

    for (const word of line.split(' ')) {
        if (word.length > limit) {
            if (current !== '') {
                parts.push(current);
                current = '';
            }
            for (let i = 0; i < word.length; i += limit) {
                parts.push(word.slice(i, i + limit));
            }
            continue;
        }
        const cost = current === '' ? word.length : word.length + 1;
        if (current.length + cost > limit) {
            parts.push(current);
            current = word;
        } else {
            current = current === '' ? word : `${current} ${word}`;
        }
    }

    if (current !== '') parts.push(current);
    return parts;
}
