import {
    rootServer,
    ChannelGuid,
    ChannelMessageEvent,
    ChannelMessageEditedEvent,
    ChannelMessageDeletedEvent,
    CommunityEvent,
    CommunityJoinedEvent
} from "@rootsdk/server-bot";
import db from "../database";

async function sendLog(guildId: string, content: string): Promise<void> {
    const settings = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = 'log_channel_id'")
        .get(guildId) as { value: string } | undefined;
    const enabled = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = 'log_enabled'")
        .get(guildId) as { value: string } | undefined;

    if (!settings?.value || enabled?.value !== "1") return;

    await rootServer.community.channelMessages.create({
        channelId: settings.value as unknown as ChannelGuid,
        content,
    });
}

export function addAuditLogEntry(
    guildId: string,
    action: string,
    userId: string | null,
    targetId: string | null,
    details: string | null
): void {
    db.prepare(
        "INSERT INTO audit_logs (guild_id, action, user_id, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(guildId, action, userId, targetId, details, Date.now());
}

export async function sendConfiguredLog(
    guildId: string,
    action: string,
    userId: string | null,
    targetId: string | null,
    details: string | null
): Promise<void> {
    addAuditLogEntry(guildId, action, userId, targetId, details);
    const line = [
        `**${action}**`,
        userId ? `By: <@${userId}>` : null,
        targetId ? `Target: <@${targetId}>` : null,
        details ? `Details: ${details}` : null,
    ].filter(Boolean).join("\n");
    await sendLog(guildId, line);
}

export function initLogsFeature(): void {
    rootServer.community.communities.on(CommunityEvent.CommunityJoined, async (event: CommunityJoinedEvent) => {
        await sendConfiguredLog(event.communityId, "member_join", event.userId, event.userId, "User joined the community.");
    });

    rootServer.community.channelMessages.on(ChannelMessageEvent.ChannelMessageEdited, async (event: ChannelMessageEditedEvent) => {
        const guildId = event.communityId;
        if (!guildId) return;

        const enabled = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = 'message_edit_log_enabled'")
            .get(guildId) as { value: string } | undefined;
        if (enabled?.value !== "1") return;

        await sendConfiguredLog(guildId, "message_edit", event.userId, null, `Channel: <#${event.channelId}>\nContent: ${event.messageContent || "(empty)"}`);
    });

    rootServer.community.channelMessages.on(ChannelMessageEvent.ChannelMessageDeleted, async (event: ChannelMessageDeletedEvent) => {
        const guildId = event.communityId;
        if (!guildId) return;

        const enabled = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = 'message_delete_log_enabled'")
            .get(guildId) as { value: string } | undefined;
        if (enabled?.value !== "1") return;

        await sendConfiguredLog(guildId, "message_delete", null, null, `Channel: <#${event.channelId}>\nMessage ID: ${event.id}`);
    });
}
