import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";

function normalizeUserId(raw: string | undefined, fallback: string): string {
    if (!raw) return fallback;
    const match = raw.match(/^<@([A-Za-z0-9_-]+)>$/);
    return match?.[1] ?? raw;
}

export const avatarCommand: Command = {
    name: "avatar",
    description: "Get a user's profile picture",
    usage: "/avatar [@user|userId]",
    category: "Utility",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const targetId = normalizeUserId(args[0], event.userId);

        try {
            const member = await rootServer.community.communityMembers.get({ userId: targetId as any });
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: member.profilePictureAssetUri
                    ? `**Avatar for <@${targetId}>**\n${member.profilePictureAssetUri}`
                    : `<@${targetId}> does not have a profile picture set in this community.`,
            });
        } catch (error) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Could not fetch that avatar.",
            });
        }
    }
};
