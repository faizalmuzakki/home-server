import { ChannelMessageEvent, ChannelMessageReactionCreatedEvent, ChannelMessageReactionDeletedEvent, rootServer } from "@rootsdk/server-bot";
import db from "../database";

export function initReactionRoleFeature(): void {
    rootServer.community.channelMessages.on(ChannelMessageEvent.ChannelMessageReactionCreated, async (event: ChannelMessageReactionCreatedEvent) => {
        const guildId = event.communityId || "default";
        const mapping = db.prepare(
            "SELECT role_id FROM reaction_roles WHERE guild_id = ? AND message_id = ? AND emoji = ?"
        ).get(guildId, event.messageId, event.shortcode) as { role_id: string } | undefined;

        if (!mapping) return;

        try {
            await rootServer.community.communityMemberRoles.add({
                communityRoleId: mapping.role_id as any,
                userIds: [event.userId],
            });
        } catch (error) {
            console.error("Reaction role add failed:", error);
        }
    });

    rootServer.community.channelMessages.on(ChannelMessageEvent.ChannelMessageReactionDeleted, async (event: ChannelMessageReactionDeletedEvent) => {
        const guildId = event.communityId || "default";
        const mapping = db.prepare(
            "SELECT role_id FROM reaction_roles WHERE guild_id = ? AND message_id = ? AND emoji = ?"
        ).get(guildId, event.messageId, event.shortcode) as { role_id: string } | undefined;

        if (!mapping) return;

        try {
            await rootServer.community.communityMemberRoles.remove({
                communityRoleId: mapping.role_id as any,
                userIds: [event.userId],
            });
        } catch (error) {
            console.error("Reaction role remove failed:", error);
        }
    });
}
