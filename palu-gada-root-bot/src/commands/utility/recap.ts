import { ChannelMessageListRequest, MessageDirectionTake, rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";
import { askAI, AIKeyMissingError } from "../../lib/ai";

export const recapCommand: Command = {
    name: "recap",
    description: "Generate an AI recap of recent channel activity",
    usage: "/recap [hours]",
    category: "Utility",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const hours = Math.max(1, Math.min(72, parseInt(args[0] || "24", 10) || 24));

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

            const text = await askAI(
                `Write a friendly recap of the last ${hours} hour(s) of chat in this channel. Mention main topics, important questions, decisions, and notable action items. Use markdown bullet points when useful.\n\nChat log:\n---\n${chatLog}\n---`,
                { maxTokens: 1400 },
            );

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `**Channel Recap (Last ${hours}h)**\n${text}`,
            });
        } catch (error) {
            if (error instanceof AIKeyMissingError) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Anthropic API key is not configured.",
                });
                return;
            }
            console.error("Recap command error:", error);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Failed to generate a recap.",
            });
        }
    },
};
