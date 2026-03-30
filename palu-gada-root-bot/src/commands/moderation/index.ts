import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";
import db from "../../database";

const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

function isAdmin(userId: string): boolean {
    return !!ADMIN_USER_ID && userId === ADMIN_USER_ID;
}

function logModAction(userId: string, guildId: string, moderatorId: string, reason: string, actionType: string) {
    db.prepare(
        "INSERT INTO warnings (user_id, guild_id, reason, moderator_id, timestamp, action_type) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(userId, guildId, reason, moderatorId, Date.now(), actionType);
}

function extractUserId(arg: string): string | null {
    if (!arg) return null;
    // Basic UUID regex or length check
    // Root UUIDs are strings, likely standard UUIDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    // Check if it's a mention format like <@uuid> (if that exists)
    // For now assuming raw UUID or trying to match regex
    const match = arg.match(uuidRegex);
    return match ? match[0] : null;
}

export const warnCommand: Command = {
    name: "warn",
    description: "Warn a user",
    usage: "/warn <userId> <reason>",
    category: "Moderation",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        if (!isAdmin(event.userId)) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "⛔ You don't have permission to use this command.",
            });
            return;
        }
        if (args.length < 2) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: /warn <userId> <reason>",
            });
            return;
        }

        const targetId = extractUserId(args[0]);
        if (!targetId) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Invalid user ID.",
            });
            return;
        }

        const reason = args.slice(1).join(" ");
        const modId = event.userId;
        const communityId = event.communityId || "default";

        logModAction(targetId, communityId, modId, reason, "warn");

        await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content: `✅ <@${targetId}> has been warned for: ${reason}`,
        });
    }
};

export const warningsCommand: Command = {
    name: "warnings",
    description: "View warnings for a user",
    usage: "/warnings <userId>",
    category: "Moderation",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        if (args.length < 1) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: /warnings <userId>",
            });
            return;
        }

        const targetId = extractUserId(args[0]);
        if (!targetId) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Invalid user ID.",
            });
            return;
        }

        const communityId = event.communityId || "default";
        const rows = db.prepare("SELECT * FROM warnings WHERE user_id = ? AND guild_id = ? ORDER BY timestamp DESC").all(targetId, communityId) as any[];

        if (rows.length === 0) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `<@${targetId}> has no warnings.`,
            });
            return;
        }

        const warningList = rows.map((w, i) => {
            const date = new Date(w.timestamp).toLocaleDateString();
            return `${i + 1}. [${date}] ${w.reason} (Mod: <@${w.moderator_id}>)`;
        }).join("\n");

        await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content: `**Warnings for <@${targetId}>**:\n${warningList}`,
        });
    }
};

export const kickCommand: Command = {
    name: "kick",
    description: "Kick a user from the community",
    usage: "/kick <userId> [reason]",
    category: "Moderation",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        if (!isAdmin(event.userId)) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "⛔ You don't have permission to use this command.",
            });
            return;
        }
        if (args.length < 1) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: /kick <userId> [reason]",
            });
            return;
        }

        const targetId = extractUserId(args[0]);
        if (!targetId) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Invalid user ID.",
            });
            return;
        }

        const reason = args.slice(1).join(" ") || "No reason provided";

        try {
            // Need to verify if memberBans is accessible via community.memberBans
            // Inspecting types showed CommunityMemberBanClient which has kick method.
            // Assuming it's mapped to 'memberBans' on community client.
            await (rootServer.community as any).memberBans.kick({
                userId: targetId
            });

            logModAction(targetId, event.communityId || "default", event.userId, reason, "kick");
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `👢 **Kicked** <@${targetId}>. Reason: ${reason}`,
            });

        } catch (error) {
            console.error("Kick error:", error);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Failed to kick user. Check permissions or if user exists.",
            });
        }
    }
};

export const banCommand: Command = {
    name: "ban",
    description: "Ban a user from the community",
    usage: "/ban <userId> [reason]",
    category: "Moderation",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        if (!isAdmin(event.userId)) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "⛔ You don't have permission to use this command.",
            });
            return;
        }
        if (args.length < 1) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: /ban <userId> [reason]",
            });
            return;
        }

        const targetId = extractUserId(args[0]);
        if (!targetId) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Invalid user ID.",
            });
            return;
        }

        const reason = args.slice(1).join(" ") || "No reason provided";

        try {
            await (rootServer.community as any).memberBans.create({
                userId: targetId,
                reason: reason
            });

            logModAction(targetId, event.communityId || "default", event.userId, reason, "ban");
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `🔨 **Banned** <@${targetId}>. Reason: ${reason}`,
            });

        } catch (error) {
            console.error("Ban error:", error);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Failed to ban user. Check permissions or if user exists.",
            });
        }
    }
};
export const timeoutCommand: Command = {
    name: "timeout",
    description: "Temporarily mute a user",
    usage: "/timeout <userId> <duration> [reason]  (duration: 10m, 1h, 1d)",
    category: "Moderation",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        if (!isAdmin(event.userId)) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "⛔ You don't have permission to use this command.",
            });
            return;
        }

        if (args.length < 2) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: `/timeout <userId> <duration> [reason]`\nDuration examples: `10m`, `1h`, `6h`, `1d`",
            });
            return;
        }

        const targetId = extractUserId(args[0]);
        if (!targetId) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Invalid user ID.",
            });
            return;
        }

        // Parse duration
        const durationStr = args[1];
        const durationMatch = durationStr.match(/^(\d+)([mhd])$/i);
        if (!durationMatch) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Invalid duration. Use `10m`, `1h`, `6h`, `1d`, etc.",
            });
            return;
        }

        const value = parseInt(durationMatch[1]);
        const unit = durationMatch[2].toLowerCase();
        const multipliers: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000 };
        const durationMs = value * multipliers[unit];
        const expiresAt = Date.now() + durationMs;

        const reason = args.slice(2).join(" ") || "No reason provided";
        const guildId = event.communityId || "default";

        // Deactivate any existing active timeout for this user
        db.prepare("UPDATE timeouts SET active = 0 WHERE user_id = ? AND guild_id = ? AND active = 1")
            .run(targetId, guildId);

        db.prepare(
            "INSERT INTO timeouts (user_id, guild_id, moderator_id, reason, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(targetId, guildId, event.userId, reason, expiresAt, Date.now());

        logModAction(targetId, guildId, event.userId, `Timeout ${durationStr}: ${reason}`, "timeout");

        const expiresTs = Math.floor(expiresAt / 1000);
        await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content: `🔇 **Timed out** <@${targetId}> for **${durationStr}**.\nExpires: <t:${expiresTs}:R>\nReason: ${reason}`,
        });
    }
};

export const untimeoutCommand: Command = {
    name: "untimeout",
    description: "Remove a timeout from a user",
    usage: "/untimeout <userId>",
    category: "Moderation",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        if (!isAdmin(event.userId)) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "⛔ You don't have permission to use this command.",
            });
            return;
        }

        const targetId = extractUserId(args[0]);
        if (!targetId) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: `/untimeout <userId>`",
            });
            return;
        }

        const guildId = event.communityId || "default";
        const result = db.prepare("UPDATE timeouts SET active = 0 WHERE user_id = ? AND guild_id = ? AND active = 1")
            .run(targetId, guildId);

        if ((result as any).changes === 0) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `<@${targetId}> is not currently timed out.`,
            });
            return;
        }

        await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content: `🔊 Timeout removed for <@${targetId}>.`,
        });
    }
};

export const modlogCommand: Command = {
    name: "modlog",
    description: "View moderation history for a user",
    usage: "/modlog <userId> [page]",
    category: "Moderation",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        if (!isAdmin(event.userId)) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "⛔ You don't have permission to use this command.",
            });
            return;
        }

        const targetId = extractUserId(args[0]);
        if (!targetId) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: `/modlog <userId> [page]`",
            });
            return;
        }

        const guildId = event.communityId || "default";
        const page = Math.max(1, parseInt(args[1] || "1") || 1);
        const limit = 5;
        const offset = (page - 1) * limit;

        const rows = db.prepare(
            "SELECT * FROM warnings WHERE user_id = ? AND guild_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?"
        ).all(targetId, guildId, limit, offset) as any[];

        const totalRow = db.prepare(
            "SELECT COUNT(*) as count FROM warnings WHERE user_id = ? AND guild_id = ?"
        ).get(targetId, guildId) as { count: number };

        if (rows.length === 0) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `📋 <@${targetId}> has no moderation history.`,
            });
            return;
        }

        const actionEmoji: Record<string, string> = {
            warn: "⚠️",
            kick: "👢",
            ban: "🔨",
            timeout: "🔇",
        };

        const totalPages = Math.ceil(totalRow.count / limit) || 1;
        const entries = rows.map((r, i) => {
            const emoji = actionEmoji[r.action_type] || "📌";
            const date = new Date(r.timestamp).toLocaleDateString("en-GB");
            return `**${offset + i + 1}.** ${emoji} \`${r.action_type.toUpperCase()}\` — ${r.reason}\n   *${date} by <@${r.moderator_id}>*`;
        }).join("\n\n");

        await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content: `📋 **Moderation history for <@${targetId}>** (${totalRow.count} total)\n\n${entries}\n\nPage **${page}** of **${totalPages}**`,
        });
    }
};

export * from "./autorole";
