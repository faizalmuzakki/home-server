import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";
import db from "../../database";
import { isAdmin, PERMISSION_DENIED } from "../permissions";

export const levelchannelCommand: Command = {
    name: "levelchannel",
    description: "Configure level-up notification channel",
    usage: "/levelchannel <set/enable/disable/status> [channel_id]",
    category: "Automation",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const guildId = event.communityId || "default";
        const subcommand = args[0]?.toLowerCase();

        const adminSubcommands = ["set", "enable", "disable"];
        if (adminSubcommands.includes(subcommand ?? "") && !isAdmin(event.userId)) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: PERMISSION_DENIED,
            });
            return;
        }

        if (subcommand === "set") {
            const channelId = args[1];
            if (!channelId) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Usage: `/levelchannel set <channel_id>`",
                });
                return;
            }

            db.prepare("INSERT OR REPLACE INTO guild_settings (guild_id, key, value) VALUES (?, ?, ?)")
                .run(guildId, "level_channel_id", channelId);
            db.prepare("INSERT OR REPLACE INTO guild_settings (guild_id, key, value) VALUES (?, ?, ?)")
                .run(guildId, "level_enabled", "1");

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `✅ Level-up notifications will be sent to <${channelId}>.`,
            });
            return;
        }

        if (subcommand === "enable" || subcommand === "disable") {
            db.prepare("INSERT OR REPLACE INTO guild_settings (guild_id, key, value) VALUES (?, ?, ?)")
                .run(guildId, "level_enabled", subcommand === "enable" ? "1" : "0");
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `Level-up notifications ${subcommand === "enable" ? "enabled" : "disabled"}.`,
            });
            return;
        }

        const channel = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = 'level_channel_id'")
            .get(guildId) as { value: string } | undefined;
        const enabled = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = 'level_enabled'")
            .get(guildId) as { value: string } | undefined;

        await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content: channel?.value
                ? `**Level Channel**\nStatus: ${enabled?.value === "1" ? "Enabled" : "Disabled"}\nChannel: <${channel.value}>`
                : "No level channel configured. Use `/levelchannel set <channel_id>`.",
        });
    }
};
