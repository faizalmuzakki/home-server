import { Command, CommandContext } from "../Command";
import db from "../../database";

export const autoroleCommand: Command = {
    name: "autorole",
    description: "Automatically assign a role to new members (set/enable/disable/status)",
    execute: async (context: CommandContext): Promise<void> => { // Explicitly added Promise<void> return type
        const { event, args, server } = context;
        const subcommand = args[0]?.toLowerCase();

        if (subcommand === 'set') {
            const roleId = args[1];
            if (!roleId) {
                await server.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Please provide a role ID. Example: `/autorole set <role-id>`",
                });
                return;
            }

            // Save settings
            db.prepare("INSERT OR REPLACE INTO guild_settings (guild_id, key, value) VALUES (?, ?, ?)")
                .run(event.communityId!, 'autorole_id', roleId);
            db.prepare("INSERT OR REPLACE INTO guild_settings (guild_id, key, value) VALUES (?, ?, ?)")
                .run(event.communityId!, 'autorole_enabled', '1');

            await server.community.channelMessages.create({
                channelId: event.channelId,
                content: `✅ Auto-role configured. New members will receive the role with ID: ${roleId}`,
            });

        } else if (subcommand === 'enable') {
            const roleIdSetting = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = ?")
                .get(event.communityId!, 'autorole_id');

            if (!roleIdSetting || !roleIdSetting.value) {
                await server.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Please run `/autorole set <role-id>` first to configure the role.",
                });
                return;
            }

            db.prepare("INSERT OR REPLACE INTO guild_settings (guild_id, key, value) VALUES (?, ?, ?)")
                .run(event.communityId!, 'autorole_enabled', '1');

            await server.community.channelMessages.create({
                channelId: event.channelId,
                content: "✅ Auto-role has been **enabled**.",
            });

        } else if (subcommand === 'disable') {
            db.prepare("INSERT OR REPLACE INTO guild_settings (guild_id, key, value) VALUES (?, ?, ?)")
                .run(event.communityId!, 'autorole_enabled', '0');

            await server.community.channelMessages.create({
                channelId: event.channelId,
                content: "⚠️ Auto-role has been **disabled**.",
            });

        } else if (subcommand === 'status' || !subcommand) {
            const enabledSetting = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = ?")
                .get(event.communityId!, 'autorole_enabled');
            const roleIdSetting = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = ?")
                .get(event.communityId!, 'autorole_id');

            const isEnabled = enabledSetting?.value === '1';
            const roleId = roleIdSetting?.value || 'Not configured';

            await server.community.channelMessages.create({
                channelId: event.channelId,
                content: `📋 **Auto-Role Status**\nStatus: ${isEnabled ? '✅ Enabled' : '❌ Disabled'}\nRole ID: ${roleId}`,
            });
        } else {
            await server.community.channelMessages.create({
                channelId: event.channelId,
                content: "Invalid subcommand. Use `/autorole set/enable/disable/status`",
            });
        }
    }
};
