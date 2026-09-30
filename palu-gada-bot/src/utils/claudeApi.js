/**
 * Client for the self-hosted Claude API service.
 * Replaces direct @anthropic-ai/sdk usage — routes through claude-api container
 * which uses the Max subscription via OAuth.
 */

import { randomUUID } from 'crypto';

const CLAUDE_API_URL = process.env.CLAUDE_API_URL || 'http://claude-api:3100';
const CLAUDE_API_SECRET = process.env.CLAUDE_API_SECRET;

/**
 * Send a prompt to Claude via the self-hosted API.
 * @param {string} prompt - The user message
 * @param {object} [opts]
 * @param {string} [opts.systemPrompt] - System prompt
 * @param {string} [opts.model] - Model override (default: the `sonnet` alias)
 * @param {string} [opts.effort] - Effort level (default high)
 * @param {number} [opts.maxTurns] - Max turns (default 6)
 * @returns {Promise<{text: string, model: string, effort: string|null, usage: object|null}>}
 *   The response text, the model claude-api used, the effort it ran at, and
 *   that model's token/cost counters
 */
export async function askClaude(prompt, opts = {}) {
    // Shared with claude-api so a failure reported here can be matched to the
    // CLI diagnostics it logged for the same call.
    const requestId = randomUUID();

    const res = await fetch(`${CLAUDE_API_URL}/api/prompt`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${CLAUDE_API_SECRET}`,
            'X-Request-Id': requestId,
        },
        body: JSON.stringify({
            prompt: opts.systemPrompt
                ? `System instructions: ${opts.systemPrompt}\n\n${prompt}`
                : prompt,
            // ponytail: an alias, not an id — the CLI resolves it to the newest
            // Sonnet, so a new release is picked up without a code change.
            model: opts.model ?? 'sonnet',
            // Explicit, so the footer can say what it was. High is also what an
            // unset effort means on the API, so this changes nothing on its own.
            effort: opts.effort ?? 'high',
            // Claude often needs a tool call before it can answer. With a
            // 1-turn budget those runs died at the turn limit, which surfaced
            // as a random "Claude CLI failed" on roughly any question that
            // tempted a tool. 6 leaves room for a couple of tool round-trips.
            maxTurns: opts.maxTurns ?? 6,
        }),
    });

    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const err = new Error(body.error || `Claude API returned ${res.status}`);
        err.status = res.status;
        err.requestId = requestId;
        err.sessionId = body.id;
        throw err;
    }

    const data = await res.json();

    // claude-api returns { id, result, duration_ms }
    // result is the Claude Code JSON output with a .result field containing the text,
    // and modelUsage keyed by the model id that actually served the request.
    const model = Object.keys(data.result?.modelUsage ?? {})[0] ?? '';
    const usage = toUsage(data.result?.modelUsage?.[model]);
    const effort = data.result?.effort ?? null;

    if (data.result?.result) {
        return { text: data.result.result, model, effort, usage };
    }
    if (typeof data.result === 'string') {
        return { text: data.result, model, effort: null, usage: null };
    }
    const err = new Error('Unexpected response format from Claude API');
    err.requestId = requestId;
    throw err;
}

/**
 * Normalises one modelUsage entry.
 *
 * costUSD is what Claude Code itself billed the call at list API rates —
 * never recompute it from a local price table here. The account behind
 * claude-api is a Max subscription, so the figure is what this traffic
 * would have cost on the API, not a bill. cc-usage makes the same point
 * about the same numbers.
 */
function toUsage(entry) {
    if (!entry || typeof entry !== 'object') return null;

    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    return {
        inputTokens: num(entry.inputTokens),
        outputTokens: num(entry.outputTokens),
        cachedTokens: num(entry.cacheReadInputTokens) + num(entry.cacheCreationInputTokens),
        costUSD: typeof entry.costUSD === 'number' ? entry.costUSD : null,
    };
}
