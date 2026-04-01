import { rootServer, ChannelMessageCreatedEvent } from "@rootsdk/server-bot";
import db from "../database";

export async function handleAutoresponderOnMessage(event: ChannelMessageCreatedEvent): Promise<void> {
    if (!event.communityId || !event.userId) return;
    const rawContent = event.messageContent ?? "";
    if (!rawContent || rawContent.startsWith("/")) return;

    const responders = db.prepare(
        "SELECT id, trigger, response, match_type FROM autoresponders WHERE guild_id = ? ORDER BY created_at ASC"
    ).all(event.communityId) as Array<{ id: number; trigger: string; response: string; match_type: string }>;

    const lowered = rawContent.toLowerCase();
    const matched = responders.find(row => {
        switch (row.match_type) {
            case "exact":      return lowered === row.trigger;
            case "startswith": return lowered.startsWith(row.trigger);
            default:           return lowered.includes(row.trigger);
        }
    });

    if (!matched) return;

    await rootServer.community.channelMessages.create({
        channelId: event.channelId,
        content: matched.response,
        parentMessageIds: [event.id],
        needsParentMessageNotification: false,
    });
}
