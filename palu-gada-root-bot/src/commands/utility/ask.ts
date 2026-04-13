import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";
import { askAI, AIKeyMissingError } from "../../lib/ai";

export const askCommand: Command = {
    name: "ask",
    description: "Ask a question to the AI",
    usage: "/ask <question>",
    category: "Utility",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const prompt = args.join(" ");

        if (!prompt) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: /ask <question>",
            });
            return;
        }

        try {
            const responseText = await askAI(prompt);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: responseText,
            });
        } catch (error) {
            if (error instanceof AIKeyMissingError) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Anthropic API key is not configured.",
                });
                return;
            }
            console.error("Ask command error:", error);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Failed to get a response from AI. Check logs for details.",
            });
        }
    },
};
