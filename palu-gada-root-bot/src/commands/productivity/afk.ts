import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";
import db from "../../database";

function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours % 24 > 0) parts.push(`${hours % 24}h`);
    if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
    if (seconds % 60 > 0 && parts.length < 2) parts.push(`${seconds % 60}s`);

    return parts.join(" ") || "less than a second";
}

export const afkCommand: Command = {
    name: "afk",
    description: "Set or remove your AFK status",
    usage: "/afk [message]",
    category: "Productivity",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const message = args.join(" ").trim();

        const existing = db.prepare("SELECT message, since FROM afk_status WHERE user_id = ?")
            .get(event.userId) as { message: string; since: number } | undefined;

        if (!message) {
            if (!existing) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "You are not currently AFK. Use `/afk <message>` to set your AFK status.",
                });
                return;
            }

            db.prepare("DELETE FROM afk_status WHERE user_id = ?").run(event.userId);

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `👋 Welcome back! Your AFK status has been removed. You were AFK for **${formatDuration(Date.now() - existing.since)}**.`,
            });
            return;
        }

        db.prepare("INSERT OR REPLACE INTO afk_status (user_id, message, since) VALUES (?, ?, ?)")
            .run(event.userId, message, Date.now());

        await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content: `💤 AFK status set: ${message}`,
        });
    }
};
