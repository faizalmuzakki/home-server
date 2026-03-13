import { Command, CommandContext } from "../Command";
import db from "../../database";

export const leaderboardCommand: Command = {
    name: "leaderboard",
    description: "View the server leaderboard",
    category: "Economy",
    aliases: ["top", "lb"],
    usage: "/leaderboard [levels|economy] [page]",
    execute: async (context: CommandContext): Promise<void> => {
        const { event, args, server } = context;
        const guildId = event.communityId || "default";

        // Parse arguments
        let typeArgument = args[0]?.toLowerCase();
        let pageArgument = args[1];

        // If first argument is a number, treat it as a page number for levels
        if (typeArgument && !isNaN(parseInt(typeArgument))) {
            pageArgument = typeArgument;
            typeArgument = 'levels';
        }

        const type = typeArgument === 'economy' ? 'economy' : 'levels';
        const page = Math.max(1, parseInt(pageArgument || "1") || 1);
        const limit = 10;
        const offset = (page - 1) * limit;

        if (type === 'levels') {
            const rows = db.prepare("SELECT user_id, xp, level FROM levels WHERE guild_id = ? ORDER BY xp DESC LIMIT ? OFFSET ?").all(guildId, limit, offset) as any[];
            const totalCountRow = db.prepare("SELECT COUNT(*) as count FROM levels WHERE guild_id = ?").get(guildId) as { count: number };
            const totalCount = totalCountRow?.count || 0;
            const totalPages = Math.ceil(totalCount / limit) || 1;

            if (rows.length === 0) {
                await server.community.channelMessages.create({
                    channelId: event.channelId,
                    content: page === 1 ? "No one has earned XP yet! Start chatting to appear on the leaderboard." : `Page ${page} is empty. Total pages: ${totalPages}`,
                });
                return;
            }

            const entries = rows.map((row, index) => {
                const rank = offset + index + 1;
                const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `**${rank}.**`;
                return `${medal} <@${row.user_id}>\nLevel ${row.level} • ${row.xp.toLocaleString()} XP`;
            }).join("\n\n");

            await server.community.channelMessages.create({
                channelId: event.channelId,
                content: `🏆 **Leaderboard (Levels)**\n\n${entries}\n\nPage **${page}** of **${totalPages}**\nUse \`/leaderboard levels <page>\` to see more.`,
            });
        } else {
            const rows = db.prepare("SELECT user_id, balance FROM economy ORDER BY balance DESC LIMIT ? OFFSET ?").all(limit, offset) as any[];
            const totalCountRow = db.prepare("SELECT COUNT(*) as count FROM economy").get() as { count: number };
            const totalCount = totalCountRow?.count || 0;
            const totalPages = Math.ceil(totalCount / limit) || 1;

            if (rows.length === 0) {
                await server.community.channelMessages.create({
                    channelId: event.channelId,
                    content: page === 1 ? "No one has any coins yet! Use `/daily` to get started." : `Page ${page} is empty. Total pages: ${totalPages}`,
                });
                return;
            }

            const entries = rows.map((row, index) => {
                const rank = offset + index + 1;
                const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `**${rank}.**`;
                return `${medal} <@${row.user_id}>\n💰 ${row.balance.toLocaleString()} coins`;
            }).join("\n\n");

            await server.community.channelMessages.create({
                channelId: event.channelId,
                content: `🏆 **Leaderboard (Economy)**\n\n${entries}\n\nPage **${page}** of **${totalPages}**\nUse \`/leaderboard economy <page>\` to see more.`,
            });
        }
    }
};
