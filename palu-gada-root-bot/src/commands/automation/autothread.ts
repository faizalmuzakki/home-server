import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";
import db from "../../database";
import { isAdmin, PERMISSION_DENIED } from "../permissions";

export const autothreadCommand: Command = {
    name: "autothread",
    description: "Adapted auto-threading using reply prompts",
    usage: "/autothread <add/remove/list> [args]",
    category: "Automation",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const guildId = event.communityId || "default";
        const subcommand = args[0]?.toLowerCase();

        if ((subcommand === "add" || subcommand === "remove") && !isAdmin(event.userId)) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: PERMISSION_DENIED,
            });
            return;
        }

        if (subcommand === "add") {
            const channelId = args[1];
            const archiveDuration = Number(args[2] || 1440);
            if (!channelId) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Usage: `/autothread add <channel_id> [archive_minutes]`",
                });
                return;
            }

            db.prepare("INSERT OR REPLACE INTO thread_channels (guild_id, channel_id, archive_duration) VALUES (?, ?, ?)")
                .run(guildId, channelId, archiveDuration);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `✅ Auto-thread adaptation enabled for <${channelId}>. New messages will get a reply prompt instead of a Discord thread.`,
            });
            return;
        }

        if (subcommand === "remove") {
            const channelId = args[1];
            if (!channelId) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Usage: `/autothread remove <channel_id>`",
                });
                return;
            }

            const result = db.prepare("DELETE FROM thread_channels WHERE guild_id = ? AND channel_id = ?").run(guildId, channelId);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: result.changes > 0 ? `✅ Removed auto-thread adaptation for <${channelId}>.` : `Channel <${channelId}> was not configured.`,
            });
            return;
        }

        const rows = db.prepare("SELECT * FROM thread_channels WHERE guild_id = ? ORDER BY channel_id ASC")
            .all(guildId) as Array<{ channel_id: string; archive_duration: number }>;

        await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content: rows.length > 0
                ? `**Auto-Thread Adaptations**\n${rows.map(row => `<${row.channel_id}> - reply prompt mode`).join("\n")}`
                : "No auto-thread channels configured.",
        });
    }
};
