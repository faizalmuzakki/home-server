import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";
import db from "../../database";
import { isAdmin, PERMISSION_DENIED } from "../permissions";

export const autoresponderCommand: Command = {
    name: "autoresponder",
    description: "Auto-reply to messages that match a trigger",
    usage: "/autoresponder <add/remove/list> [args]",
    category: "Automation",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const guildId = event.communityId || "default";
        const subcommand = args[0]?.toLowerCase();

        if ((subcommand === "add" || subcommand === "remove") && !isAdmin(event.userId)) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: PERMISSION_DENIED,
            });
            return;
        }

        if (subcommand === "add") {
            const full = args.slice(1).join(" ");
            const parts = full.split("|").map(part => part.trim());
            const trigger = parts[0];
            const response = parts[1];
            const matchType = (parts[2] || "contains").toLowerCase();

            if (!trigger || !response) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Usage: `/autoresponder add <trigger> | <response> | [contains|exact|startswith]`",
                });
                return;
            }

            db.prepare(
                "INSERT INTO autoresponders (guild_id, trigger, response, match_type, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)"
            ).run(guildId, trigger.toLowerCase(), response, matchType, event.userId, Date.now());

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `✅ Added autoresponder for \`${trigger}\` (${matchType}).`,
            });
            return;
        }

        if (subcommand === "remove") {
            const id = Number(args[1]);
            if (Number.isNaN(id)) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Usage: `/autoresponder remove <id>`",
                });
                return;
            }

            const result = db.prepare("DELETE FROM autoresponders WHERE id = ? AND guild_id = ?").run(id, guildId);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: result.changes > 0 ? `✅ Removed autoresponder #${id}.` : `Autoresponder #${id} not found.`,
            });
            return;
        }

        const rows = db.prepare("SELECT * FROM autoresponders WHERE guild_id = ? ORDER BY created_at DESC")
            .all(guildId) as Array<{ id: number; trigger: string; response: string; match_type: string }>;

        await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content: rows.length > 0
                ? `**Autoresponders**\n${rows.map(row => `#${row.id} \`${row.trigger}\` (${row.match_type}) -> ${row.response.slice(0, 60)}`).join("\n")}`
                : "No autoresponders configured.",
        });
    }
};
