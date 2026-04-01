import { rootServer } from "@rootsdk/server-bot";
import Anthropic from "@anthropic-ai/sdk";
import { Command, CommandContext } from "../Command";
import { CONFIG } from "../../config";

const LEVELS: Record<string, string> = {
    eli5: "Explain this like I'm 5. Use very simple words and concrete examples.",
    beginner: "Explain this for a complete beginner. Avoid jargon where possible.",
    intermediate: "Explain this for someone with some background knowledge.",
    advanced: "Explain this with technical depth for an advanced learner.",
    expert: "Explain this at an expert level with nuance and precision.",
};

export const explainCommand: Command = {
    name: "explain",
    description: "Explain a concept or topic",
    usage: "/explain <topic> [eli5|beginner|intermediate|advanced|expert]",
    category: "Utility",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const levelCandidate = args[args.length - 1]?.toLowerCase();
        const level = LEVELS[levelCandidate] ? levelCandidate : "beginner";
        const topic = (LEVELS[levelCandidate] ? args.slice(0, -1) : args).join(" ").trim();

        if (!topic) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: `/explain <topic> [eli5|beginner|intermediate|advanced|expert]`",
            });
            return;
        }

        if (!CONFIG.ANTHROPIC_API_KEY) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Anthropic API key is not configured.",
            });
            return;
        }

        const anthropic = new Anthropic({ apiKey: CONFIG.ANTHROPIC_API_KEY });

        try {
            const response = await anthropic.messages.create({
                model: "claude-3-5-haiku-20241022",
                max_tokens: 1200,
                system: "You are an expert educator. Structure explanations clearly with markdown.",
                messages: [{
                    role: "user",
                    content: `${LEVELS[level]}\n\nTopic: ${topic}`,
                }],
            });

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `**${topic}** (${level})\n${(response.content[0] as any).text}`,
            });
        } catch (error) {
            console.error("Explain command error:", error);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Failed to explain that topic.",
            });
        }
    }
};
