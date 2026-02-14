import { rootServer, ChannelMessageCreatedEvent, MessageType } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";
import db from "../../database";

const XP_PER_MESSAGE = 20;
const COOLDOWN_SECONDS = 60;

// Helper to add XP
export function addXp(userId: string, guildId: string): boolean {
    const stmt = db.prepare("SELECT * FROM levels WHERE user_id = ? AND guild_id = ?");
    const user = stmt.get(userId, guildId) as any;

    const now = Math.floor(Date.now() / 1000);

    if (user) {
        if (now - user.last_message_time < COOLDOWN_SECONDS) return false;

        const newXp = user.xp + XP_PER_MESSAGE;
        const newLevel = Math.floor(0.1 * Math.sqrt(newXp));

        db.prepare("UPDATE levels SET xp = ?, level = ?, last_message_time = ? WHERE user_id = ? AND guild_id = ?")
            .run(newXp, newLevel, now, userId, guildId);

        return newLevel > user.level;
    } else {
        db.prepare("INSERT INTO levels (user_id, guild_id, xp, level, last_message_time) VALUES (?, ?, ?, ?, ?)")
            .run(userId, guildId, XP_PER_MESSAGE, 0, now);
        return false;
    }
}

export const balanceCommand: Command = {
    name: "balance",
    description: "Check your wallet balance",
    category: "Economy",
    aliases: ["bal"],
    execute: async (context: CommandContext) => {
        const { event } = context;
        const userId = event.userId;

        const row = db.prepare("SELECT balance FROM economy WHERE user_id = ?").get(userId) as any;
        const balance = row ? row.balance : 0;

        await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content: `💰 **Balance**: ${balance} coins`,
        });
    }
};

export const dailyCommand: Command = {
    name: "daily",
    description: "Claim your daily reward",
    category: "Economy",
    execute: async (context: CommandContext) => {
        const { event } = context;
        const userId = event.userId;
        const REWARD = 200;

        const now = Date.now();
        const row = db.prepare("SELECT last_daily, balance FROM economy WHERE user_id = ?").get(userId) as any;

        if (row) {
            const lastDaily = row.last_daily;
            const oneDay = 24 * 60 * 60 * 1000;

            if (now - lastDaily < oneDay) {
                const remaining = oneDay - (now - lastDaily);
                const hours = Math.floor(remaining / (1000 * 60 * 60));
                const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: `⏳ You can claim your daily reward in **${hours}h ${minutes}m**.`,
                });
                return;
            }

            db.prepare("UPDATE economy SET balance = balance + ?, last_daily = ? WHERE user_id = ?")
                .run(REWARD, now, userId);
        } else {
            db.prepare("INSERT INTO economy (user_id, balance, last_daily) VALUES (?, ?, ?)")
                .run(userId, REWARD, now);
        }

        await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content: `✅ You claimed **${REWARD} coins**!`,
        });
    }
};

export const levelCommand: Command = {
    name: "level",
    description: "Check your current level",
    category: "Economy",
    aliases: ["rank"],
    execute: async (context: CommandContext) => {
        const { event } = context;
        const userId = event.userId;
        const guildId = event.communityId || "default";

        const row = db.prepare("SELECT level, xp FROM levels WHERE user_id = ? AND guild_id = ?").get(userId, guildId) as any;

        if (!row) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "You don't have any XP yet. Chat more to earn XP!",
            });
            return;
        }

        await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content: `📊 **Level**: ${row.level}\n✨ **XP**: ${row.xp}`,
        });
    }
};
