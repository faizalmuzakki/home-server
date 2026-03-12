import { getGuildSettings, getLeaderboard } from '../database/models.js';

const ROLE_UPDATE_COOLDOWN_MS = 60_000; // 60s debounce for role updates
const roleUpdateCooldowns = new Map();

/**
 * Updates the Top 3 roles for a guild based on the current leaderboard.
 * Debounced to run at most once per guild per 60 seconds.
 * @param {Client} client The Discord client instance.
 * @param {string} guildId The ID of the guild to update roles in.
 */
export async function updateTopRoles(client, guildId) {
    // Debounce: skip if last update was less than 60s ago
    const lastUpdate = roleUpdateCooldowns.get(guildId) || 0;
    const now = Date.now();
    if (now - lastUpdate < ROLE_UPDATE_COOLDOWN_MS) {
        return;
    }
    roleUpdateCooldowns.set(guildId, now);

    const settings = getGuildSettings(guildId);
    if (!settings) return;

    const hasRoles = settings.top1_role_id || settings.top2_role_id || settings.top3_role_id;
    if (!hasRoles) return;

    try {
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) return;

        // Ensure roles exist in the guild cache
        const top1Role = settings.top1_role_id ? await guild.roles.fetch(settings.top1_role_id).catch(() => null) : null;
        const top2Role = settings.top2_role_id ? await guild.roles.fetch(settings.top2_role_id).catch(() => null) : null;
        const top3Role = settings.top3_role_id ? await guild.roles.fetch(settings.top3_role_id).catch(() => null) : null;

        const allRoles = [top1Role, top2Role, top3Role].filter(Boolean);
        if (allRoles.length === 0) return;

        // Fetch leaderboard currently in the DB
        const leaderboard = getLeaderboard(guildId, 3);
        const topUsers = [
            leaderboard.length > 0 ? leaderboard[0].user_id : null,
            leaderboard.length > 1 ? leaderboard[1].user_id : null,
            leaderboard.length > 2 ? leaderboard[2].user_id : null,
        ];

        // Process Rank 1
        if (top1Role) {
            await syncRole(guild, top1Role, topUsers[0], allRoles);
        }

        // Process Rank 2
        if (top2Role) {
            await syncRole(guild, top2Role, topUsers[1], allRoles);
        }

        // Process Rank 3
        if (top3Role) {
            await syncRole(guild, top3Role, topUsers[2], allRoles);
        }

    } catch (error) {
        console.error(`[ERROR] Failed to update top roles for guild ${guildId}:`, error);
    }
}

/**
 * Syncs a specific role to ensure only the target user has it, and removes it from anyone else.
 * Also removes conflicting top roles if a user holds multiple.
 */
async function syncRole(guild, role, targetUserId, allTopRoles) {
    // 1. Give the role to the target user if they don't have it
    if (targetUserId) {
        try {
            const targetMember = await guild.members.fetch(targetUserId).catch(() => null);
            if (targetMember) {
                if (!targetMember.roles.cache.has(role.id)) {
                    await targetMember.roles.add(role);
                }
                
                // If the target member has any OTHER top roles (e.g., they moved from Rank 2 to Rank 1), remove them
                for (const otherRole of allTopRoles) {
                    if (otherRole.id !== role.id && targetMember.roles.cache.has(otherRole.id)) {
                        await targetMember.roles.remove(otherRole);
                    }
                }
            }
        } catch (err) {
            // Ignore fetch errors
        }
    }

    // 2. Remove the role from anyone else who currently has it
    for (const [memberId, member] of role.members) {
        if (memberId !== targetUserId) {
            try {
                await member.roles.remove(role);
            } catch (err) {
                // Ignore removal errors
            }
        }
    }
}
