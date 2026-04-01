import { ChannelMessageListRequest, MessageDirectionTake, rootServer } from "@rootsdk/server-bot";
import Anthropic from "@anthropic-ai/sdk";
import { Command, CommandContext } from "../Command";
import { CONFIG } from "../../config";

export const recapCommand: Command = {
    name: "recap",
    description: "Generate an AI recap of recent channel activity",
    usage: "/recap [hours]",
    category: "Utility",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const hours = Math.max(1, Math.min(72, parseInt(args[0] || "24", 10) || 24));

        if (!CONFIG.ANTHROPIC_API_KEY) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Anthropic API key is not configured.",
            });
            return;
        }

        const anthropic = new Anthropic({ apiKey: CONFIG.ANTHROPIC_API_KEY });

        try {
            const request: ChannelMessageListRequest = {
                channelId: event.channelId,
                messageDirectionTake: MessageDirectionTake.Newer,
                dateAt: new Date(Date.now() - hours * 60 * 60 * 1000),
            };
            const response = await rootServer.community.channelMessages.list(request);
            const messages = (response.messages || []).filter(msg => msg.messageContent?.trim()).slice(-300);

            if (messages.length === 0) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: `No messages found in the last ${hours} hour(s).`,
                });
                return;
            }

            const userMap = new Map<string, string>();
            response.referenceMaps?.users?.forEach(user => userMap.set(user.userId, user.name));
            const chatLog = messages.map(msg => `[${userMap.get(msg.userId) || msg.userId}]: ${msg.messageContent}`).join("\n");

            const aiResponse = await anthropic.messages.create({
                model: "claude-3-5-haiku-20241022",
                max_tokens: 1400,
                messages: [{
                    role: "user",
                    content: `Write a friendly recap of the last ${hours} hour(s) of chat in this channel. Mention main topics, important questions, decisions, and notable action items. Use markdown bullet points when useful.\n\nChat log:\n---\n${chatLog}\n---`,
                }],
            });

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `**Channel Recap (Last ${hours}h)**\n${(aiResponse.content[0] as any).text}`,
            });
        } catch (error) {
            console.error("Recap command error:", error);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Failed to generate a recap.",
            });
        }
    }
};
