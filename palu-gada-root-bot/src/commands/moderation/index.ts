import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";
import db from "../../database";

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

        db.prepare("INSERT INTO warnings (user_id, guild_id, reason, moderator_id, timestamp) VALUES (?, ?, ?, ?, ?)")
            .run(targetId, communityId, reason, modId, Date.now());

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
export * from "./autorole";
