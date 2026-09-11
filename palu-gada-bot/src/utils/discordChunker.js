/**
 * Splits text for Discord's per-message limits without breaking words or
 * leaving a code fence open across a message boundary.
 *
 * Pure string -> string[]. Never throws, never hangs.
 */

// Both fence characters, matching the converter in discordMarkdown.js.
// The converter passes a ~~~ block through verbatim, so a chunker that
// only knew backticks split straight through one and left it unterminated.
const FENCE_RE = /^\s*(`{3,}|~{3,})(.*)$/;
const DEFAULT_LIMIT = 2000;

function isHighSurrogate(code) {
    return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code) {
    return code >= 0xdc00 && code <= 0xdfff;
}

/**
 * Hard-cuts a single over-long token into fragments no longer than
 * `limit`, never splitting a surrogate pair unless `limit` itself leaves
 * no room for one (invariant 1, staying under the limit, outranks
 * invariant 4, not splitting a pair).
 */
function hardCut(word, limit) {
    const safeLimit = Math.max(1, limit);
    const parts = [];
    let i = 0;

    while (i < word.length) {
        let end = Math.min(i + safeLimit, word.length);

        if (
            end < word.length &&
            end > i &&
            isHighSurrogate(word.charCodeAt(end - 1)) &&
            isLowSurrogate(word.charCodeAt(end))
        ) {
            end -= 1;
            if (end <= i) end = i + 1; // safeLimit === 1 against a pair
        }

        parts.push(word.slice(i, end));
        i = end;
    }

    return parts;
}

/**
 * Wraps one logical line to `limit`, splitting on spaces and only
 * hard-cutting a single token that itself exceeds `limit`.
 */
function wrapLine(line, limit) {
    const safeLimit = Math.max(1, limit);
    if (line.length <= safeLimit) return [line];

    const parts = [];
    let current = '';

    for (const word of line.split(' ')) {
        if (word.length > safeLimit) {
            if (current !== '') {
                parts.push(current);
                current = '';
            }
            for (const fragment of hardCut(word, safeLimit)) {
                parts.push(fragment);
            }
            continue;
        }
        const cost = current === '' ? word.length : word.length + 1;
        if (current.length + cost > safeLimit) {
            parts.push(current);
            current = word;
        } else {
            current = current === '' ? word : `${current} ${word}`;
        }
    }

    if (current !== '') parts.push(current);
    return parts;
}

/**
 * @param {string} text
 * @param {object} [opts]
 * @param {number} [opts.limit] - characters per chunk, default 2000
 * @returns {string[]} - empty when there is nothing to send
 */
export function chunkForDiscord(text, opts) {
    if (typeof text !== 'string') return [];

    // A default parameter does not fire on an explicit null.
    const options = opts && typeof opts === 'object' ? opts : {};
    const limit = Number.isInteger(options.limit) && options.limit > 0
        ? options.limit
        : DEFAULT_LIMIT;

    // A carriage return left on a fence-marker line defeats fence
    // detection, because `.` in a JS regex never matches `\r`.
    const normalized = text.replace(/\r\n/g, '\n');
    if (normalized.trim() === '') return [];

    const chunks = [];
    let buffer = [];
    let length = 0;

    // Fence state as of the end of the buffer's last placed line.
    let lang = null;       // active fence's language tag, or null
    let char = '`';        // active fence's marker character
    let trackable = false; // whether we're reserving/reopening for it

    const flush = () => {
        if (buffer.length === 0) return;
        const body = buffer.join('\n');
        buffer = [];
        length = 0;

        // Discord rejects an empty message outright ("Cannot send an empty
        // message"), so a buffer holding nothing but whitespace must never
        // become a chunk. This happens whenever a blank line sits alone in
        // the buffer and the next piece costs more than the remaining
        // budget -- a blank line followed by a line at least as long as the
        // limit, such as a long URL.
        if (body.trim() === '') return;

        const closing = lang !== null && trackable;
        chunks.push(closing ? `${body}\n${char.repeat(3)}` : body);
    };

    for (const rawLine of normalized.split('\n')) {
        const marker = FENCE_RE.exec(rawLine);

        // The state active for the buffer we're carrying INTO this line
        // -- used for any flush that happens before this line's pieces,
        // never for the state this line itself leaves behind.
        const carriedLang = lang;
        const carriedChar = char;
        const carriedTrackable = trackable;

        // Decide the state this line will leave behind BEFORE testing
        // whether the line fits -- an opener changes the reservation for
        // the chunk it lands in, and that has to apply to the opener's
        // own line too, not just the lines after it.
        let postLang = lang;
        let postChar = char;
        let postTrackable = trackable;
        if (marker) {
            // CommonMark closes a fence only on its own character, so a
            // ~~~ line inside a backtick block is content, not a close.
            const markerChar = marker[1][0];
            if (lang === null) {
                const tag = marker[2].trim();
                postChar = markerChar;
                const markerLen = 3 + tag.length;
                postLang = tag;
                // Reopening is only worth attempting if the marker, at
                // least one line of real content, and the eventual
                // closing fence can all fit inside the limit at once --
                // not just the marker and the close with nothing between
                // them. Otherwise the room left for content rounds down
                // to zero or less, and a chunk that opens this fence
                // could never hold anything but the reopen and the
                // close. Invariant 1 outranks invariant 2: when there's
                // no room to spare, stop tracking this fence rather than
                // risk an over-limit chunk later.
                postTrackable = (markerLen + 6) <= limit;
            } else if (markerChar === char) {
                postLang = null;
                postTrackable = false;
            }
        }

        // The ceiling for everything this chunk can hold, reserving room
        // for the closing fence for the whole time we're inside a
        // tracked fence -- including the chunk that merely opens it.
        const lineBudget = postTrackable ? limit - 4 : limit;

        // Split on the full per-chunk budget, not a margin shrunk for a
        // reopen that may never happen -- shrinking it unconditionally
        // would hard-cut words that would have fit fine, scattering
        // spurious line breaks through content that never needed them.
        // A piece only gets split further, below, on the narrow occasion
        // it lands right after a real reopen and doesn't actually fit.
        const queue = wrapLine(rawLine, lineBudget);

        let qi = 0;
        while (qi < queue.length) {
            const piece = queue[qi];
            const cost = buffer.length === 0 ? piece.length : piece.length + 1;

            if (length + cost > lineBudget && buffer.length > 0) {
                flush();
                if (carriedLang !== null && carriedTrackable) {
                    const reopen = `${carriedChar.repeat(3)}${carriedLang}`;
                    buffer.push(reopen);
                    length = reopen.length;
                }

                const freshCost = buffer.length === 0 ? piece.length : piece.length + 1;
                if (length + freshCost > lineBudget) {
                    // Doesn't fit even in the chunk we just (re)opened --
                    // split it further using exactly the room actually
                    // left, rather than a budget assumed up front, and
                    // retry with those smaller pieces in its place.
                    const available = Math.max(
                        1,
                        lineBudget - length - (buffer.length === 0 ? 0 : 1)
                    );
                    queue.splice(qi, 1, ...wrapLine(piece, available));
                    continue;
                }
            }

            buffer.push(piece);
            length += buffer.length === 1 ? piece.length : piece.length + 1;
            qi += 1;
        }

        lang = postLang;
        char = postChar;
        trackable = postTrackable;
    }

    flush();
    return chunks;
}
