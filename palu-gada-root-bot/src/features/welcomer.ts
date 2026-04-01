import { rootServer, CommunityEvent, CommunityJoinedEvent, ChannelGuid } from "@rootsdk/server-bot";
import db from "../database";

function formatWelcomeMessage(template: string, userId: string, communityName: string, memberCount: number): string {
    return template
        .replace(/{user}/gi, `<@${userId}>`)
        .replace(/{username}/gi, `<@${userId}>`)
        .replace(/{server}/gi, communityName)
        .replace(/{membercount}/gi, String(memberCount));
}

export function initWelcomerFeature() {
    rootServer.community.communities.on(CommunityEvent.CommunityJoined, async (event: CommunityJoinedEvent) => {
        const enabled = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = 'welcome_enabled'")
            .get(event.communityId) as { value: string } | undefined;
        const channel = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = 'welcome_channel_id'")
            .get(event.communityId) as { value: string } | undefined;
        const messageRow = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = 'welcome_message'")
            .get(event.communityId) as { value: string } | undefined;

        if (enabled?.value !== "1" || !channel?.value) return;

        try {
            const community = await rootServer.community.communities.get();
            const members = await rootServer.community.communityMembers.listAll();
            const template = messageRow?.value || "Welcome to **{server}**, {user}! You are member #{membercount}.";

            await rootServer.community.channelMessages.create({
                channelId: channel.value as unknown as ChannelGuid,
                content: formatWelcomeMessage(template, event.userId, community.name, members.length),
            });
        } catch (error) {
            console.error("Welcomer feature error:", error);
        }
    });
}
