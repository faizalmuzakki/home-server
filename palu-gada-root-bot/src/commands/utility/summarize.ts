import { ChannelMessageListRequest, MessageDirectionTake, rootServer, ChannelMessage, MessageReferenceMaps } from "@rootsdk/server-bot";
import Anthropic from '@anthropic-ai/sdk';
import { Command, CommandContext } from "../Command";
import { CONFIG } from "../../config";

export const summarizeCommand: Command = {
    name: "summarize",
    description: "Summarize the last hour of chat history in this channel",
    usage: "/summarize [hours]",
    category: "Utility",
    execute: async (context: CommandContext) => {
        const { event, args } = context;

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

        const hours = parseInt(args[0]) || 1;
        if (isNaN(hours) || hours < 1 || hours > 24) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Please specify a number of hours between 1 and 24.",
            });
            return;
        }

        await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content: `Generating summary for the last ${hours} hour(s)...`,
        });

        try {
            const dateAt = new Date(Date.now() - (hours * 60 * 60 * 1000));
            const request: ChannelMessageListRequest = {
                channelId: event.channelId,
                messageDirectionTake: MessageDirectionTake.Newer,
                dateAt: dateAt,
            };

            const response = await rootServer.community.channelMessages.list(request);
            const messages = response.messages;
            const refMaps = response.referenceMaps;

            if (!messages || messages.length === 0) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "No messages found in the specified time range.",
                });
                return;
            }

            // Create a lookup map for users if available
            const userMap = new Map<string, string>();
            if (refMaps?.users) {
                refMaps.users.forEach(u => userMap.set(u.userId, u.name));
            }

            const chatLog = messages.map(m => {
                const authorName = userMap.get(m.userId) || m.userId;
                return `[${authorName}]: ${m.messageContent}`;
            }).join('\n');

            const aiResponse = await anthropic.messages.create({
                model: 'claude-3-5-haiku-20241022',
                max_tokens: 1024,
                messages: [
                    {
                        role: 'user',
                        content: `Please summarize the following chat conversation. Focus on:
- Main topics discussed
- Key decisions or conclusions reached
- Important questions asked
- Any action items or next steps mentioned

Keep the summary concise but informative. Use bullet points for clarity.

Chat log from the last ${hours} hour(s):
---
${chatLog}
---

Summary:`,
                    },
                ],
            });

            const summary = (aiResponse.content[0] as any).text;

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `**Chat Summary (Last ${hours}h)**\n\n${summary}`,
            });

        } catch (error) {
            console.error("Summarize error:", error);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Failed to generate summary. Check logs for details.",
            });
        }
    }
};
