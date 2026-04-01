import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";

function normalizeUserId(raw: string | undefined, fallback: string): string {
    if (!raw) return fallback;
    const match = raw.match(/^<@([A-Za-z0-9_-]+)>$/);
    return match?.[1] ?? raw;
}

export const userinfoCommand: Command = {
    name: "userinfo",
    description: "Get information about a user in this community",
    usage: "/userinfo [@user|userId]",
    category: "Utility",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const targetId = normalizeUserId(args[0], event.userId);

        try {
            const member = await rootServer.community.communityMembers.get({ userId: targetId as any });

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `**User Info**\nUser: <@${targetId}>\nNickname: ${member.nickname || "None"}\nPrimary Role: ${member.primaryCommunityRoleName || "None"}\nSubscribed: ${member.subscribedAt ? member.subscribedAt.toISOString() : "Unknown"}\nRole Count: ${member.communityRoleIds?.length || 0}\nProfile Picture: ${member.profilePictureAssetUri || "None"}`,
            });
        } catch (error) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Could not fetch info for that user.",
            });
        }
    }
};
