/**
 * Client for the self-hosted Claude API service.
 * Replaces direct @anthropic-ai/sdk usage — routes through claude-api container
 * which uses the Max subscription via OAuth.
 */

const CLAUDE_API_URL = process.env.CLAUDE_API_URL || 'http://claude-api:3100';
const CLAUDE_API_SECRET = process.env.CLAUDE_API_SECRET;

/**
 * Send a prompt to Claude via the self-hosted API.
 * @param {string} prompt - The user message
 * @param {object} [opts]
 * @param {string} [opts.systemPrompt] - System prompt
 * @param {string} [opts.model] - Model override
 * @param {number} [opts.maxTurns] - Max turns (default 1)
 * @returns {Promise<{text: string, model: string}>} The response text and the model claude-api used
 */
export async function askClaude(prompt, opts = {}) {
    const res = await fetch(`${CLAUDE_API_URL}/api/prompt`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${CLAUDE_API_SECRET}`,
        },
        body: JSON.stringify({
            prompt: opts.systemPrompt
                ? `System instructions: ${opts.systemPrompt}\n\n${prompt}`
                : prompt,
            model: opts.model,
            maxTurns: opts.maxTurns ?? 1,
        }),
    });

    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const err = new Error(body.error || `Claude API returned ${res.status}`);
        err.status = res.status;
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
    throw new Error('Unexpected response format from Claude API');
}
