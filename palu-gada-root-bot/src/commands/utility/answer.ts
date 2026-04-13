import { ChannelMessageListRequest, MessageDirectionTake, rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";
import { askAI, AIKeyMissingError } from "../../lib/ai";

export const answerCommand: Command = {
    name: "answer",
    description: "Generate a reply based on recent conversation style",
    usage: "/answer [hours]",
    category: "Utility",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const hours = Math.max(1, Math.min(6, parseInt(args[0] || "2", 10) || 2));

        try {
            const request: ChannelMessageListRequest = {
                channelId: event.channelId,
                messageDirectionTake: MessageDirectionTake.Newer,
                dateAt: new Date(Date.now() - hours * 60 * 60 * 1000),
            };
            const response = await rootServer.community.channelMessages.list(request);
            const messages = (response.messages || []).filter(msg => msg.messageContent?.trim()).slice(-200);

            if (messages.length < 3) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: `Not enough conversation context found in the last ${hours} hour(s).`,
                });
                return;
            }

            const userMap = new Map<string, string>();
            response.referenceMaps?.users?.forEach(user => userMap.set(user.userId, user.name));
            const targetName = userMap.get(event.userId) || "the current user";
            const chatLog = messages.map(msg => {
                const authorName = userMap.get(msg.userId) || msg.userId;
                const marker = msg.userId === event.userId ? " (YOU)" : "";
                return `[${authorName}${marker}]: ${msg.messageContent}`;
            }).join("\n");

            const text = await askAI(
                `You are helping ${targetName} answer in chat. Study their tone and style from the recent conversation, identify the most recent thing they should respond to, and write a concise reply as them.

Respond in this format:
REPLYING TO: [short description of the question/topic]
RESPONSE: [1-3 sentence reply as ${targetName}]

Conversation:
---
${chatLog}
---`,
                { maxTokens: 700 },
            );

            const replyingTo = text.match(/REPLYING TO:\s*(.+?)(?=\nRESPONSE:|$)/s)?.[1]?.trim() || "Auto-detected topic";
            const reply = text.match(/RESPONSE:\s*([\s\S]+)/)?.[1]?.trim() || text.trim();

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `**${targetName} might say...**\n${reply}\n\nResponding to: ${replyingTo}`,
            });
        } catch (error) {
            if (error instanceof AIKeyMissingError) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Anthropic API key is not configured.",
                });
                return;
            }
            console.error("Answer command error:", error);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Failed to generate an answer.",
            });
        }
    },
};
