import { rootServer, ChannelMessageCreatedEvent } from "@rootsdk/server-bot";
import db from "../database";

export async function handleAfkOnMessage(event: ChannelMessageCreatedEvent): Promise<void> {
    if (!event.userId) return;
    const rawContent = event.messageContent ?? "";
    const isCommand = rawContent.startsWith("/");

    const activeAfk = db.prepare("SELECT message, since FROM afk_status WHERE user_id = ?")
        .get(event.userId) as { message: string; since: number } | undefined;

    if (activeAfk && !isCommand) {
        db.prepare("DELETE FROM afk_status WHERE user_id = ?").run(event.userId);
        const secondsAway = Math.max(1, Math.floor((Date.now() - activeAfk.since) / 1000));
        await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content: `👋 Welcome back, <@${event.userId}>. Your AFK status has been removed after ${secondsAway}s away.`,
        });
    }

    const mentions = Array.from(rawContent.matchAll(/<@([A-Za-z0-9_-]+)>/g))
        .map(match => match[1])
        .filter(id => id !== event.userId);

    if (mentions.length === 0) return;

    const noticeParts: string[] = [];
    const afkLookup = db.prepare("SELECT message, since FROM afk_status WHERE user_id = ?");
    for (const mentionedId of [...new Set(mentions)].slice(0, 5)) {
        const afk = afkLookup.get(mentionedId) as { message: string; since: number } | undefined;
        if (!afk) continue;
        const minutesAway = Math.max(1, Math.floor((Date.now() - afk.since) / 60000));
        noticeParts.push(`<@${mentionedId}> is AFK: ${afk.message} (${minutesAway}m ago)`);
    }

    if (noticeParts.length > 0) {
        await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content: noticeParts.join("\n"),
        });
    }
}
