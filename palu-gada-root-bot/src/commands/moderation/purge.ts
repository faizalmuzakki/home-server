import { ChannelMessageListRequest, MessageDirectionTake, rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";
import { isAdmin, PERMISSION_DENIED } from "../permissions";

const MAX_PURGE = 50;

async function send(channelId: unknown, content: string): Promise<void> {
    await rootServer.community.channelMessages.create({ channelId: channelId as any, content });
}

export const purgeCommand: Command = {
    name: "purge",
    description: "Delete the last N messages in this channel (admin-only)",
    usage: "/purge <amount> [userId] [contains-text]",
    category: "Moderation",
    execute: async (context: CommandContext) => {
        const { event, args } = context;

        if (!isAdmin(event.userId)) {
            await send(event.channelId, PERMISSION_DENIED);
            return;
        }

        const amount = parseInt(args[0] || "", 10);
        if (isNaN(amount) || amount < 1 || amount > MAX_PURGE) {
            await send(event.channelId, `Usage: \`/purge <1-${MAX_PURGE}> [userId] [contains-text]\``);
            return;
        }

        const targetUserId = args[1] && /^[0-9a-f-]{36}$/i.test(args[1]) ? args[1] : undefined;
        const containsText = (targetUserId ? args.slice(2) : args.slice(1)).join(" ").toLowerCase() || undefined;

        try {
            // Pull the most recent messages in this channel. Older direction
            // from "now" gives us the newest messages first.
            const listReq: ChannelMessageListRequest = {
                channelId: event.channelId,
                messageDirectionTake: MessageDirectionTake.Older,
                dateAt: new Date(),
            };
            const response = await rootServer.community.channelMessages.list(listReq);
            const messages = (response.messages || []).filter((msg) => {
                if (!msg.messageContent?.trim()) return false;
                if (msg.id === event.id) return false; // don't delete the /purge invocation itself
                if (targetUserId && msg.userId !== targetUserId) return false;
                if (containsText && !msg.messageContent.toLowerCase().includes(containsText)) return false;
                return true;
            }).slice(0, amount);

            if (messages.length === 0) {
                await send(event.channelId, "No matching messages found.");
                return;
            }

            let deleted = 0;
            let failed = 0;
            for (const msg of messages) {
                try {
                    await rootServer.community.channelMessages.delete({
                        channelId: event.channelId,
                        id: msg.id,
                    });
                    deleted++;
                } catch (err) {
                    failed++;
                    console.error("/purge delete failed for", msg.id, err);
                }
            }

            const filterDesc: string[] = [];
            if (targetUserId) filterDesc.push(`from \`${targetUserId}\``);
            if (containsText) filterDesc.push(`containing "${containsText}"`);
            const filters = filterDesc.length ? ` (${filterDesc.join(", ")})` : "";
            const failMsg = failed > 0 ? ` (${failed} failed)` : "";
            await send(event.channelId, `🗑️ Deleted **${deleted}** message${deleted === 1 ? "" : "s"}${filters}${failMsg}.`);
        } catch (error) {
            console.error("/purge error:", error);
            const msg = error instanceof Error ? error.message : String(error);
            await send(event.channelId, `❌ Purge failed: ${msg.slice(0, 300)}`);
        }
    },
};
