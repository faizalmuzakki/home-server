import Anthropic from "@anthropic-ai/sdk";
import { CONFIG } from "../config";

export const AI_MODEL = "claude-haiku-4-5";
export const AI_MODEL_NAME = "Claude 4.5 Haiku";

const client = new Anthropic({ apiKey: CONFIG.ANTHROPIC_API_KEY || "missing" });

export type AskOptions = {
    maxTokens?: number;
    system?: string;
    model?: string;
};

export class AIKeyMissingError extends Error {
    constructor() {
        super("Anthropic API key is not configured.");
        this.name = "AIKeyMissingError";
    }
}

export async function askAI(prompt: string, opts: AskOptions = {}): Promise<string> {
    if (!CONFIG.ANTHROPIC_API_KEY) {
        throw new AIKeyMissingError();
    }
    const response = await client.messages.create({
        model: opts.model || AI_MODEL,
        max_tokens: opts.maxTokens ?? 1024,
        ...(opts.system ? { system: opts.system } : {}),
        messages: [{ role: "user", content: prompt }],
    });
    const block = response.content[0];
    if (block.type !== "text") {
        throw new Error(`Unexpected response block type: ${block.type}`);
    }
    return block.text;
}

export const AI_ATTRIBUTION = `— Powered by ${AI_MODEL_NAME}`;
