import { rootServer } from "@rootsdk/server-bot";
import Anthropic from '@anthropic-ai/sdk';
import { Command, CommandContext } from "../Command";
import { CONFIG } from "../../config";

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

        if (!CONFIG.ANTHROPIC_API_KEY) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Anthropic API key is not configured.",
            });
            return;
        }

        const anthropic = new Anthropic({
            apiKey: CONFIG.ANTHROPIC_API_KEY,
        });

        try {
            const aiResponse = await anthropic.messages.create({
                model: 'claude-3-5-haiku-20241022',
                max_tokens: 1024,
                messages: [
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
            });

            const responseText = (aiResponse.content[0] as any).text;

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: responseText,
            });

        } catch (error) {
            console.error("Ask command error:", error);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Failed to get a response from AI. Check logs for details.",
            });
        }
    }
};
