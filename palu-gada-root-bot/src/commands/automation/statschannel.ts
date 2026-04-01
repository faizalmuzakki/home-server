import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";
import db from "../../database";
import { isAdmin, PERMISSION_DENIED } from "../permissions";

export const statschannelCommand: Command = {
    name: "statschannel",
    description: "Link a channel name to a live stat",
    usage: "/statschannel <set/remove/list> [args]",
    category: "Automation",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const guildId = event.communityId || "default";
        const subcommand = args[0]?.toLowerCase();

        if ((subcommand === "set" || subcommand === "remove") && !isAdmin(event.userId)) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: PERMISSION_DENIED,
            });
            return;
        }

        if (subcommand === "set") {
            const type = args[1]?.toLowerCase();
            const channelId = args[2];

            if (type !== "members" || !channelId) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Usage: `/statschannel set members <channel_id>`",
                });
                return;
            }

            db.prepare("INSERT OR REPLACE INTO stats_channels (guild_id, channel_id, stat_type) VALUES (?, ?, ?)")
                .run(guildId, channelId, type);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `✅ Stats channel set: <${channelId}> will display **members**.`,
            });
            return;
        }

        if (subcommand === "remove") {
            const type = args[1]?.toLowerCase();
            if (!type) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Usage: `/statschannel remove <type>`",
                });
                return;
            }

            const result = db.prepare("DELETE FROM stats_channels WHERE guild_id = ? AND stat_type = ?").run(guildId, type);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: result.changes > 0 ? `✅ Removed ${type} stats channel.` : `No stats channel configured for ${type}.`,
            });
            return;
        }

        const rows = db.prepare("SELECT * FROM stats_channels WHERE guild_id = ? ORDER BY stat_type ASC")
            .all(guildId) as Array<{ channel_id: string; stat_type: string }>;

        await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content: rows.length > 0
                ? `**Stats Channels**\n${rows.map(row => `${row.stat_type} -> <${row.channel_id}>`).join("\n")}`
                : "No stats channels configured. Supported stat types: `members`.",
        });
    }
};
