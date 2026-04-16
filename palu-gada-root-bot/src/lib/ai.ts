/**
 * Client for the self-hosted Claude API service.
 * Routes through claude-api container which uses the Max subscription via OAuth.
 */

const CLAUDE_API_URL = process.env.CLAUDE_API_URL || "http://claude-api:3100";
const CLAUDE_API_SECRET = process.env.CLAUDE_API_SECRET;

export const AI_MODEL = "claude-haiku-4-5";
export const AI_MODEL_NAME = "Claude 4.5 Haiku";

export type AskOptions = {
    maxTokens?: number;
    system?: string;
    model?: string;
};

export class AIKeyMissingError extends Error {
    constructor() {
        super("Claude API secret is not configured.");
        this.name = "AIKeyMissingError";
    }
}

export async function askAI(prompt: string, opts: AskOptions = {}): Promise<string> {
    if (!CLAUDE_API_SECRET) {
        throw new AIKeyMissingError();
    }

    const res = await fetch(`${CLAUDE_API_URL}/api/prompt`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${CLAUDE_API_SECRET}`,
        },
        body: JSON.stringify({
            prompt: opts.system
                ? `System instructions: ${opts.system}\n\n${prompt}`
                : prompt,
            model: opts.model,
            maxTurns: 1,
        }),
    });

    if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, string>;
        const err = new Error(body.error || `Claude API returned ${res.status}`);
        (err as any).status = res.status;
        throw err;
    }

    const data = (await res.json()) as any;

    if (data.result?.result) {
        return data.result.result;
    }
    if (typeof data.result === "string") {
        return data.result;
    }
    throw new Error("Unexpected response format from Claude API");
}

export const AI_ATTRIBUTION = `— Powered by ${AI_MODEL_NAME}`;
