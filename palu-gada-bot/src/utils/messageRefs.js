/** How many messages one /reply may reference. Keeps the prompt and embed small. */
export const MAX_MESSAGE_REFS = 5;

/**
 * Splits a /reply `message` option into message ids. Accepts bare ids and
 * .../channels/<guild>/<channel>/<message> links, separated by spaces or
 * commas, in any mix. Duplicates collapse; order is kept.
 */
export function parseMessageRefs(input) {
    const ids = input
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(ref => ref.replace(/\/+$/, '').split('/').pop());
    return [...new Set(ids)];
}
