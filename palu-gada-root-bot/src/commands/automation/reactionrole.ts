import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";
import db from "../../database";
import { isAdmin, PERMISSION_DENIED } from "../permissions";

export const reactionroleCommand: Command = {
    name: "reactionrole",
    description: "Configure reaction roles",
    usage: "/reactionrole <create/add/remove/list/delete> [args]",
    category: "Automation",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const guildId = event.communityId || "default";
        const subcommand = args[0]?.toLowerCase();

        const adminSubcommands = ["create", "add", "remove", "delete"];
        if (adminSubcommands.includes(subcommand ?? "") && !isAdmin(event.userId)) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: PERMISSION_DENIED,
            });
            return;
        }

        if (subcommand === "create") {
            const full = args.slice(1).join(" ");
            const parts = full.split("|").map(part => part.trim());
            const title = parts[0];
            const description = parts[1];
            const targetChannel = parts[2] || event.channelId;

            if (!title || !description) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Usage: `/reactionrole create <title> | <description> | [channel_id]`",
                });
                return;
            }

            const message = await rootServer.community.channelMessages.create({
                channelId: targetChannel as any,
                content: `**${title}**\n${description}\n\nReact to get roles.`,
            });

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `Reaction role message created.\nMessage ID: \`${message.id}\`\nChannel: <${targetChannel}>`,
            });
            return;
        }

        if (subcommand === "add") {
            const messageId = args[1];
            const emoji = args[2];
            const roleId = args[3];
            const channelId = args[4] || event.channelId;

            if (!messageId || !emoji || !roleId) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Usage: `/reactionrole add <message_id> <emoji> <role_id> [channel_id]`",
                });
                return;
            }

            db.prepare(
                "INSERT OR REPLACE INTO reaction_roles (guild_id, channel_id, message_id, emoji, role_id) VALUES (?, ?, ?, ?, ?)"
            ).run(guildId, channelId, messageId, emoji, roleId);

            try {
                await rootServer.community.channelMessages.reactionCreate({
                    channelId: channelId as any,
                    messageId: messageId as any,
                    shortcode: emoji,
                });
            } catch {
                // ignore invalid emoji support differences
            }

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `✅ Added mapping ${emoji} -> role \`${roleId}\` for message \`${messageId}\`.`,
            });
            return;
        }

        if (subcommand === "remove") {
            const messageId = args[1];
            const emoji = args[2];
            if (!messageId || !emoji) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Usage: `/reactionrole remove <message_id> <emoji>`",
                });
                return;
            }

            const result = db.prepare(
                "DELETE FROM reaction_roles WHERE guild_id = ? AND message_id = ? AND emoji = ?"
            ).run(guildId, messageId, emoji);

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: result.changes > 0
                    ? `✅ Removed reaction role for ${emoji} on message \`${messageId}\`.`
                    : "No matching reaction role mapping found.",
            });
            return;
        }

        if (subcommand === "delete") {
            const messageId = args[1];
            if (!messageId) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Usage: `/reactionrole delete <message_id>`",
                });
                return;
            }

            const result = db.prepare("DELETE FROM reaction_roles WHERE guild_id = ? AND message_id = ?")
                .run(guildId, messageId);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: result.changes > 0
                    ? `✅ Deleted ${result.changes} reaction role mapping(s) for message \`${messageId}\`.`
                    : "No reaction roles found for that message.",
            });
            return;
        }

        const rows = db.prepare("SELECT * FROM reaction_roles WHERE guild_id = ? ORDER BY message_id ASC")
            .all(guildId) as Array<{ message_id: string; channel_id: string; emoji: string; role_id: string }>;

        await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content: rows.length > 0
                ? `**Reaction Roles**\n${rows.map(row => `Message \`${row.message_id}\` in <${row.channel_id}>: ${row.emoji} -> \`${row.role_id}\``).join("\n")}`
                : "No reaction roles configured.",
        });
    }
};
