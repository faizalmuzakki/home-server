const MAX_CHUNK_CHARS = 200;

/**
 * Split text into chunks of at most MAX_CHUNK_CHARS characters.
 * Splits on sentence boundaries (.!?) first; if a sentence is still too long,
 * greedily packs words up to the limit.
 */
export function chunkText(text) {
    const trimmed = text.trim();
    if (trimmed.length === 0) return [];
    if (trimmed.length <= MAX_CHUNK_CHARS) return [trimmed];

    // Split on sentence terminators, keeping the terminator with its sentence.
    const sentences = trimmed.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [trimmed];

    const chunks = [];
    for (const rawSentence of sentences) {
        const sentence = rawSentence.trim();
        if (sentence.length === 0) continue;

        if (sentence.length <= MAX_CHUNK_CHARS) {
            chunks.push(sentence);
            continue;
        }

        // Sentence too long — split on whitespace, greedy pack.
        const words = sentence.split(/\s+/);
        let current = '';
        for (const word of words) {
            if (word.length > MAX_CHUNK_CHARS) {
                // Single word longer than the limit: flush current, hard-slice the word.
                if (current) { chunks.push(current); current = ''; }
                for (let i = 0; i < word.length; i += MAX_CHUNK_CHARS) {
                    chunks.push(word.slice(i, i + MAX_CHUNK_CHARS));
                }
                continue;
            }
            const candidate = current ? `${current} ${word}` : word;
            if (candidate.length > MAX_CHUNK_CHARS) {
                chunks.push(current);
                current = word;
            } else {
                current = candidate;
            }
        }
        if (current) chunks.push(current);
    }
    return chunks;
}
