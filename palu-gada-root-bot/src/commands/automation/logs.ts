import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";
import db from "../../database";
import { isAdmin, PERMISSION_DENIED } from "../permissions";

export const logsCommand: Command = {
    name: "logs",
    description: "Configure server logging",
    usage: "/logs <setup/enable/disable/status/view/message-edits/message-deletes> [args]",
    category: "Automation",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const guildId = event.communityId || "default";
        const subcommand = args[0]?.toLowerCase();

        const adminSubcommands = ["setup", "enable", "disable", "message-edits", "message-deletes"];
        if (adminSubcommands.includes(subcommand ?? "") && !isAdmin(event.userId)) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: PERMISSION_DENIED,
            });
            return;
        }

        if (subcommand === "setup") {
            const channelId = args[1];
            if (!channelId) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Usage: `/logs setup <channel_id>`",
                });
                return;
            }

            db.prepare("INSERT OR REPLACE INTO guild_settings (guild_id, key, value) VALUES (?, ?, ?)")
                .run(guildId, "log_channel_id", channelId);
            db.prepare("INSERT OR REPLACE INTO guild_settings (guild_id, key, value) VALUES (?, ?, ?)")
                .run(guildId, "log_enabled", "1");

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `✅ Logs will be sent to <${channelId}>.`,
            });
            return;
        }

        if (subcommand === "enable" || subcommand === "disable") {
            db.prepare("INSERT OR REPLACE INTO guild_settings (guild_id, key, value) VALUES (?, ?, ?)")
                .run(guildId, "log_enabled", subcommand === "enable" ? "1" : "0");
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `Logging ${subcommand === "enable" ? "enabled" : "disabled"}.`,
            });
            return;
        }

        if (subcommand === "message-edits" || subcommand === "message-deletes") {
            const enabled = args[1]?.toLowerCase();
            if (enabled !== "on" && enabled !== "off") {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: `Usage: \`/logs ${subcommand} <on|off>\``,
                });
                return;
            }
            const key = subcommand === "message-edits" ? "message_edit_log_enabled" : "message_delete_log_enabled";
            db.prepare("INSERT OR REPLACE INTO guild_settings (guild_id, key, value) VALUES (?, ?, ?)")
                .run(guildId, key, enabled === "on" ? "1" : "0");
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `${subcommand} ${enabled === "on" ? "enabled" : "disabled"}.`,
            });
            return;
        }

        if (subcommand === "view") {
            const limit = Math.min(25, Number(args[1] || 10));
            const rows = db.prepare("SELECT * FROM audit_logs WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?")
                .all(guildId, limit) as Array<{ action: string; user_id: string | null; target_id: string | null; details: string | null; created_at: number }>;

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: rows.length > 0
                    ? `**Recent Logs**\n${rows.map(row => `• ${row.action} (${new Date(row.created_at).toLocaleString()})${row.target_id ? ` target=<@${row.target_id}>` : ""}${row.details ? ` - ${row.details}` : ""}`).join("\n")}`
                    : "No log entries found.",
            });
            return;
        }

        const channel = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = 'log_channel_id'")
            .get(guildId) as { value: string } | undefined;
        const enabled = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = 'log_enabled'")
            .get(guildId) as { value: string } | undefined;
        const editLogs = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = 'message_edit_log_enabled'")
            .get(guildId) as { value: string } | undefined;
        const deleteLogs = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = 'message_delete_log_enabled'")
            .get(guildId) as { value: string } | undefined;

        await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content: channel?.value
                ? `**Logs Status**\nStatus: ${enabled?.value === "1" ? "Enabled" : "Disabled"}\nChannel: <${channel.value}>\nMessage edits: ${editLogs?.value === "1" ? "On" : "Off"}\nMessage deletes: ${deleteLogs?.value === "1" ? "On" : "Off"}`
                : "Logs are not configured. Use `/logs setup <channel_id>`.",
        });
    }
};
