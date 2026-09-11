#!/usr/bin/env node
/**
 * Property fuzz for the Discord chunker.
 *
 * This lives in its own file because the main suite must run it in a child
 * process. A regression in the chunker's budget arithmetic does not fail —
 * it loops forever inside a single `chunkForDiscord` call, which no
 * in-process guard can interrupt. Run in-process, such a regression hangs
 * the whole suite with no output at all, which reads like a stalled
 * terminal rather than a test failure.
 */
import { chunkForDiscord } from '../src/utils/discordChunker.js';

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
                // A single long token carrying surrogate pairs at offsets a
                // naive cut lands on. Without it the only multi-code-unit
                // token is the bare 2-code-unit emoji above, which is only
                // ever hard-cut when the budget is 1 -- the one limit the
                // surrogate check exempts -- so the check would be live but
                // unreachable. Verified: deleting the chunker's surrogate
                // guard fails this fuzz from limit 2 upwards because of this
                // line, and passes without it.
                'z\u{1F600}'.repeat(20),
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
