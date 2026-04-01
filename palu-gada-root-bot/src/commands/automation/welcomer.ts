import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";
import db from "../../database";
import { isAdmin, PERMISSION_DENIED } from "../permissions";

export const welcomerCommand: Command = {
    name: "welcomer",
    description: "Configure welcome messages for new members",
    usage: "/welcomer <setup/enable/disable/test/status> [args]",
    category: "Automation",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const guildId = event.communityId || "default";
        const subcommand = args[0]?.toLowerCase();

        const adminSubcommands = ["setup", "enable", "disable", "test"];
        if (adminSubcommands.includes(subcommand ?? "") && !isAdmin(event.userId)) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: PERMISSION_DENIED,
            });
            return;
        }

        if (subcommand === "setup") {
            const channelId = args[1];
            const message = args.slice(2).join(" ").trim() || "Welcome to **{server}**, {user}! You are member #{membercount}.";

            if (!channelId) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Usage: `/welcomer setup <channel_id> [message]`",
                });
                return;
            }

            db.prepare("INSERT OR REPLACE INTO guild_settings (guild_id, key, value) VALUES (?, ?, ?)")
                .run(guildId, "welcome_channel_id", channelId);
            db.prepare("INSERT OR REPLACE INTO guild_settings (guild_id, key, value) VALUES (?, ?, ?)")
                .run(guildId, "welcome_message", message);
            db.prepare("INSERT OR REPLACE INTO guild_settings (guild_id, key, value) VALUES (?, ?, ?)")
                .run(guildId, "welcome_enabled", "1");

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `✅ Welcomer configured for <${channelId}>.\nMessage: ${message}`,
            });
            return;
        }

        if (subcommand === "enable" || subcommand === "disable") {
            db.prepare("INSERT OR REPLACE INTO guild_settings (guild_id, key, value) VALUES (?, ?, ?)")
                .run(guildId, "welcome_enabled", subcommand === "enable" ? "1" : "0");
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `Welcome messages ${subcommand === "enable" ? "enabled" : "disabled"}.`,
            });
            return;
        }

        if (subcommand === "test") {
            const channel = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = 'welcome_channel_id'")
                .get(guildId) as { value: string } | undefined;
            const message = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = 'welcome_message'")
                .get(guildId) as { value: string } | undefined;

            if (!channel?.value) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Welcomer is not configured yet.",
                });
                return;
            }

            const community = await rootServer.community.communities.get();
            const members = await rootServer.community.communityMembers.listAll();
            const rendered = (message?.value || "Welcome {user}!")
                .replace(/{user}/gi, `<@${event.userId}>`)
                .replace(/{server}/gi, community.name)
                .replace(/{membercount}/gi, String(members.length));

            await rootServer.community.channelMessages.create({
                channelId: channel.value as any,
                content: `(Test) ${rendered}`,
            });
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `Sent test welcome message to <${channel.value}>.`,
            });
            return;
        }

        const channel = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = 'welcome_channel_id'")
            .get(guildId) as { value: string } | undefined;
        const message = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = 'welcome_message'")
            .get(guildId) as { value: string } | undefined;
        const enabled = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = 'welcome_enabled'")
            .get(guildId) as { value: string } | undefined;

        await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content: channel?.value
                ? `**Welcomer Status**\nStatus: ${enabled?.value === "1" ? "Enabled" : "Disabled"}\nChannel: <${channel.value}>\nMessage: ${message?.value || "Default"}`
                : "Welcomer is not configured. Use `/welcomer setup <channel_id> [message]`.",
        });
    }
};
