import { rootServer, ChannelMessageCreatedEvent } from "@rootsdk/server-bot";
import db from "../database";

/**
 * Auto-thread adaptation: the Root platform does not expose a native thread-creation
 * API, so we approximate the behaviour by posting a reply prompt on every new message
 * in a configured channel. Users can use this reply as a discussion anchor.
 *
 * If the platform ever adds thread support, replace the channelMessages.create call
 * below with a proper thread-create call and remove this note.
 */
export async function handleAutothreadOnMessage(event: ChannelMessageCreatedEvent): Promise<void> {
    if (!event.communityId || !event.userId) return;
    const rawContent = event.messageContent ?? "";
    if (!rawContent || rawContent.startsWith("/")) return;

    const threadChannel = db.prepare(
        "SELECT 1 FROM thread_channels WHERE guild_id = ? AND channel_id = ?"
    ).get(event.communityId, event.channelId) as { 1: number } | undefined;

    if (!threadChannel) return;

    await rootServer.community.channelMessages.create({
        channelId: event.channelId,
        content: "Follow-up discussion for this message can continue in replies here.",
        parentMessageIds: [event.id],
        needsParentMessageNotification: false,
    });
}
