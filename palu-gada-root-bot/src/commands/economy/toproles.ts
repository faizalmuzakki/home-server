import { Command, CommandContext } from "../Command";
import db from "../../database";

const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

function isAdmin(userId: string): boolean {
    return !!ADMIN_USER_ID && userId === ADMIN_USER_ID;
}

export const topRolesCommand: Command = {
    name: "toproles",
    description: "Configure special roles for the top 3 users with the most XP",
    execute: async (context: CommandContext): Promise<void> => {
        const { event, args, server } = context;
        if (!event.communityId) return;

        const subcommand = args[0]?.toLowerCase();

        if (subcommand === 'set') {
            if (!isAdmin(event.userId)) {
                await server.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "⛔ You don't have permission to configure top roles.",
                });
                return;
            }

            const role1 = args[1];
            const role2 = args[2];
            const role3 = args[3];

            if (!role1 || !role2 || !role3) {
                await server.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Please provide 3 role IDs. Example: `/toproles set <role1_id> <role2_id> <role3_id>`",
                });
                return;
            }

            db.prepare("INSERT OR REPLACE INTO guild_settings (guild_id, key, value) VALUES (?, ?, ?)").run(event.communityId, 'top1_role_id', role1);
            db.prepare("INSERT OR REPLACE INTO guild_settings (guild_id, key, value) VALUES (?, ?, ?)").run(event.communityId, 'top2_role_id', role2);
            db.prepare("INSERT OR REPLACE INTO guild_settings (guild_id, key, value) VALUES (?, ?, ?)").run(event.communityId, 'top3_role_id', role3);

            await server.community.channelMessages.create({
                channelId: event.channelId,
                content: `✅ Top Roles Configured.\n🥇 Rank 1 Role: ${role1}\n🥈 Rank 2 Role: ${role2}\n🥉 Rank 3 Role: ${role3}`,
            });

        } else if (subcommand === 'clear') {
            if (!isAdmin(event.userId)) {
                await server.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "⛔ You don't have permission to clear top roles.",
                });
                return;
            }

            db.prepare("DELETE FROM guild_settings WHERE guild_id = ? AND key IN ('top1_role_id', 'top2_role_id', 'top3_role_id')").run(event.communityId);

            await server.community.channelMessages.create({
                channelId: event.channelId,
                content: "🗑️ Top leveling roles configuration has been removed.",
            });

        } else if (subcommand === 'status' || !subcommand) {
            const top1 = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = ?").get(event.communityId, 'top1_role_id') as { value: string } | undefined;
            const top2 = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = ?").get(event.communityId, 'top2_role_id') as { value: string } | undefined;
            const top3 = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = ?").get(event.communityId, 'top3_role_id') as { value: string } | undefined;

            await server.community.channelMessages.create({
                channelId: event.channelId,
                content: `🏆 **Top Roles Settings**\n🥇 Rank 1 Role: ${top1?.value || 'Not configured'}\n🥈 Rank 2 Role: ${top2?.value || 'Not configured'}\n🥉 Rank 3 Role: ${top3?.value || 'Not configured'}`,
            });
        } else {
            await server.community.channelMessages.create({
                channelId: event.channelId,
                content: "Invalid subcommand. Use `/toproles set/clear/status`",
            });
        }
    }
};
