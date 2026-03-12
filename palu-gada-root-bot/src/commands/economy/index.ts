import { rootServer, ChannelMessageCreatedEvent, MessageType } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";
import db from "../../database";

// --- Type Interfaces ---
interface GuildSetting {
    value: string;
}

interface LevelRow {
    user_id: string;
    guild_id: string;
    xp: number;
    level: number;
    last_message_time: number;
}

// --- Constants ---
const XP_PER_MESSAGE = 20;
const COOLDOWN_SECONDS = 60;
const ROLE_UPDATE_COOLDOWN_MS = 60_000; // 60s debounce for role updates

// --- Debounce & Cache ---
const roleUpdateCooldowns: Map<string, number> = new Map();
const previousTopHolders: Map<string, Map<string, string | null>> = new Map(); // guildId -> (roleKey -> userId)

// Helper to add XP
export function addXp(userId: string, guildId: string): boolean {
    const stmt = db.prepare("SELECT * FROM levels WHERE user_id = ? AND guild_id = ?");
    const user = stmt.get(userId, guildId) as LevelRow | undefined;

    const now = Math.floor(Date.now() / 1000);

    if (user) {
        if (now - user.last_message_time < COOLDOWN_SECONDS) return false;

        const newXp = user.xp + XP_PER_MESSAGE;
        const newLevel = Math.floor(0.1 * Math.sqrt(newXp));

        db.prepare("UPDATE levels SET xp = ?, level = ?, last_message_time = ? WHERE user_id = ? AND guild_id = ?")
            .run(newXp, newLevel, now, userId, guildId);

        updateTopRoles(guildId).catch(error => console.error("Error updating top roles:", error));
        return newLevel > user.level;
    } else {
        db.prepare("INSERT INTO levels (user_id, guild_id, xp, level, last_message_time) VALUES (?, ?, ?, ?, ?)")
            .run(userId, guildId, XP_PER_MESSAGE, 0, now);
        updateTopRoles(guildId).catch(error => console.error("Error updating top roles:", error));
        return false;
    }
}

/**
 * Syncs a single role: assigns it to the new holder and removes it from the previous holder if changed.
 */
async function syncSingleRole(roleId: string, newHolder: string | null, previousHolder: string | null): Promise<void> {
    // Note: Root SDK uses branded types (CommunityRoleGuid, UserGuid) but our IDs are stored as plain strings in the DB.
    const typedRoleId = roleId as any;

    // Assign role to the new holder
    if (newHolder) {
        await rootServer.community.communityMemberRoles.add({ communityRoleId: typedRoleId, userIds: [newHolder as any] });
    }

    // Remove from previous holder only if they changed
    if (previousHolder && previousHolder !== newHolder) {
        await rootServer.community.communityMemberRoles.remove({ communityRoleId: typedRoleId, userIds: [previousHolder as any] });
    }
}

async function updateTopRoles(guildId: string) {
    // Debounce: skip if last update was less than 60s ago
    const lastUpdate = roleUpdateCooldowns.get(guildId) || 0;
    const now = Date.now();
    if (now - lastUpdate < ROLE_UPDATE_COOLDOWN_MS) {
        return;
    }
    roleUpdateCooldowns.set(guildId, now);

    const roleKeys = ['top1_role_id', 'top2_role_id', 'top3_role_id'] as const;

    // Fetch configured role IDs
    const roleSettings = roleKeys.map(key =>
        db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = ?").get(guildId, key) as GuildSetting | undefined
    );

    // Early exit if no roles are configured
    if (roleSettings.every(s => !s?.value)) return;

    // Fetch current top 3 users
    const topUsers = db.prepare("SELECT user_id FROM levels WHERE guild_id = ? ORDER BY xp DESC LIMIT 3").all(guildId) as Pick<LevelRow, 'user_id'>[];
    const currentTop: (string | null)[] = [
        topUsers[0]?.user_id ?? null,
        topUsers[1]?.user_id ?? null,
        topUsers[2]?.user_id ?? null,
    ];

    // Get previous holders from cache
    const prevHolders = previousTopHolders.get(guildId) || new Map<string, string | null>();

    try {
        for (let i = 0; i < roleKeys.length; i++) {
            const roleId = roleSettings[i]?.value;
            if (!roleId) continue;

            const newHolder = currentTop[i];
            const previousHolder = prevHolders.get(roleKeys[i]) ?? null;

            await syncSingleRole(roleId, newHolder, previousHolder);

            // Update cache
            prevHolders.set(roleKeys[i], newHolder);
        }

        previousTopHolders.set(guildId, prevHolders);
    } catch (e) {
        console.error("Failed to sync top roles:", e);
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

export * from "./toproles";
