import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";

export const serverinfoCommand: Command = {
    name: "serverinfo",
    description: "Get information about the current community",
    usage: "/serverinfo",
    category: "Utility",
    execute: async (context: CommandContext) => {
        const { event } = context;

        try {
            const community = await rootServer.community.communities.get();
            const members = await rootServer.community.communityMembers.listAll();
            const roles = await rootServer.community.communityRoles.list();

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `**Server Info**\nName: ${community.name}\nCommunity ID: ${community.communityId}\nOwner: <@${community.ownerUserId}>\nMembers: ${members.length}\nRoles: ${roles.length}\nDefault Channel: ${community.defaultChannelId ? `<#${community.defaultChannelId}>` : "None"}\nPicture: ${community.pictureAssetUri || "None"}`,
            });
        } catch (error) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Failed to fetch community info.",
            });
        }
    }
};
