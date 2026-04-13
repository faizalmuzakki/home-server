import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";
import { askAI, AIKeyMissingError } from "../../lib/ai";

const STYLE_INSTRUCTIONS: Record<string, string> = {
    bullets: "Summarize in 3-5 bullet points.",
    sentence: "Summarize in exactly one sentence.",
    paragraph: "Summarize in a short paragraph of 2-3 sentences.",
    takeaways: "List 3-5 key takeaways.",
};

export const tldrCommand: Command = {
    name: "tldr",
    description: "Get a TL;DR summary of text or a URL",
    usage: "/tldr <text or URL> [bullets|sentence|paragraph|takeaways]",
    category: "Utility",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const styleCandidate = args[args.length - 1]?.toLowerCase();
        const style = STYLE_INSTRUCTIONS[styleCandidate] ? styleCandidate : "bullets";
        const input = (STYLE_INSTRUCTIONS[styleCandidate] ? args.slice(0, -1) : args).join(" ").trim();

        if (!input) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: `/tldr <text or URL> [bullets|sentence|paragraph|takeaways]`",
            });
            return;
        }

        try {
            const text = await askAI(
                `${STYLE_INSTRUCTIONS[style]}\n\nSummarize this content:\n${input}`,
                {
                    maxTokens: 500,
                    system: "You are excellent at concise summarization. Use markdown when helpful.",
                },
            );
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `**TL;DR** (${style})\n${text}`,
            });
        } catch (error) {
            if (error instanceof AIKeyMissingError) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Anthropic API key is not configured.",
                });
                return;
            }
            console.error("TLDR command error:", error);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Failed to generate a TL;DR summary.",
            });
        }
    },
};
