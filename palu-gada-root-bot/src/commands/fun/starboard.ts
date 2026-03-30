import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";
import db from "../../database";

const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

function isAdmin(userId: string): boolean {
    return !!ADMIN_USER_ID && userId === ADMIN_USER_ID;
}

export const starboardCommand: Command = {
    name: "starboard",
    description: "Configure the starboard feature",
    usage: "/starboard <setup|disable|status> [channel_id]",
    category: "Fun",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const guildId = event.communityId || "default";
        const subcommand = args[0]?.toLowerCase();

        if (subcommand === "setup") {
            if (!isAdmin(event.userId)) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "⛔ Only admins can configure the starboard.",
                });
                return;
            }

            const channelId = args[1];
            const threshold = parseInt(args[2] || "3", 10);

            if (!channelId) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Usage: `/starboard setup <channel_id> [threshold]`\nExample: `/starboard setup abc123 3`",
                });
                return;
            }

            if (isNaN(threshold) || threshold < 1) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Threshold must be a positive number.",
                });
                return;
            }

            db.prepare("INSERT OR REPLACE INTO guild_settings (guild_id, key, value) VALUES (?, ?, ?)").run(guildId, "starboard_channel_id", channelId);
            db.prepare("INSERT OR REPLACE INTO guild_settings (guild_id, key, value) VALUES (?, ?, ?)").run(guildId, "starboard_threshold", threshold.toString());
            db.prepare("INSERT OR REPLACE INTO guild_settings (guild_id, key, value) VALUES (?, ?, ?)").run(guildId, "starboard_enabled", "1");

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `⭐ **Starboard configured!**\nChannel: <#${channelId}>\nThreshold: **${threshold}** ⭐\n\nReact with ⭐ on any message to nominate it.`,
            });

        } else if (subcommand === "disable") {
            if (!isAdmin(event.userId)) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "⛔ Only admins can configure the starboard.",
                });
                return;
            }

            db.prepare("INSERT OR REPLACE INTO guild_settings (guild_id, key, value) VALUES (?, ?, ?)").run(guildId, "starboard_enabled", "0");

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "⭐ Starboard has been **disabled**. Use `/starboard setup` to re-enable it.",
            });

        } else if (subcommand === "status" || !subcommand) {
            const channelSetting = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = 'starboard_channel_id'").get(guildId) as any;
            const thresholdSetting = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = 'starboard_threshold'").get(guildId) as any;
            const enabledSetting = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = 'starboard_enabled'").get(guildId) as any;

            if (!channelSetting?.value) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "⭐ **Starboard is not configured.**\nUse `/starboard setup <channel_id>` to set it up.",
                });
                return;
            }

            const enabled = enabledSetting?.value === "1";
            const threshold = thresholdSetting?.value || "3";

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `⭐ **Starboard Status**\nStatus: ${enabled ? "✅ Enabled" : "❌ Disabled"}\nChannel: <#${channelSetting.value}>\nThreshold: **${threshold}** ⭐`,
            });

        } else {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: `/starboard setup <channel_id> [threshold]` · `/starboard disable` · `/starboard status`",
            });
        }
    }
};
