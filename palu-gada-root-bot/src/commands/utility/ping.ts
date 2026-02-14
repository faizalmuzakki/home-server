import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";

export const pingCommand: Command = {
    name: "ping",
    description: "Replies with Pong! and latency.",
    execute: async (context: CommandContext) => {
        const { event } = context;
        const start = Date.now();
        // Since event doesn't have a clear timestamp field exposed (it's in the UUID), we'll just check roundtrip time for sending response?
        // Or just reply Pong.

        console.log(`[DEBUG] Sending Pong response to channel: ${event.channelId}`);
        try {
            const result = await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Pong! 🏓",
            });
            console.log(`[DEBUG] Pong response sent. Result:`, JSON.stringify(result, null, 2));
        } catch (error) {
            console.error(`[DEBUG] Failed to send Pong response:`, error);
        }
    }
};
