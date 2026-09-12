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
 * @param {string} [opts.model] - Model override
 * @param {number} [opts.maxTurns] - Max turns (default 6)
 * @returns {Promise<{text: string, model: string}>} The response text and the model claude-api used
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
            model: opts.model,
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

    if (data.result?.result) {
        return { text: data.result.result, model };
    }
    if (typeof data.result === 'string') {
        return { text: data.result, model };
    }
    const err = new Error('Unexpected response format from Claude API');
    err.requestId = requestId;
    throw err;
}
