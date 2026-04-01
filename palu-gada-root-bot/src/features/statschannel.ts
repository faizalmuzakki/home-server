import { rootServer, ChannelGuid, RootGuidType, RootGuidConverter } from "@rootsdk/server-bot";
import db from "../database";

async function getMemberCount(): Promise<number> {
    const members = await rootServer.community.communityMembers.listAll();
    return members.length;
}

function formatStatName(type: string, count: number): string {
    switch (type) {
        case "members":
            return `Members: ${count}`;
        default:
            return `${type}: ${count}`;
    }
}

async function updateStatsChannels(): Promise<void> {
    const rows = db.prepare("SELECT guild_id, channel_id, stat_type FROM stats_channels").all() as Array<{
        guild_id: string;
        channel_id: string;
        stat_type: string;
    }>;

    for (const row of rows) {
        try {
            const channel = await rootServer.community.channels.get({
                id: row.channel_id as unknown as ChannelGuid,
            });
            const count = row.stat_type === "members" ? await getMemberCount() : 0;
            const newName = formatStatName(row.stat_type, count);

            if (channel.name !== newName) {
                await rootServer.community.channels.edit({
                    id: row.channel_id as unknown as ChannelGuid,
                    name: newName,
                    description: channel.description,
                    updateIcon: false,
                    useChannelGroupPermission: channel.useChannelGroupPermission,
                });
            }
        } catch (error) {
            console.error(`Stats channel update failed for ${row.channel_id}:`, error);
        }
    }
}

export function initStatsChannelFeature(): void {
    setInterval(() => {
        updateStatsChannels().catch(error => {
            console.error("Stats channel updater error:", error);
        });
    }, 10 * 60 * 1000);

    updateStatsChannels().catch(error => {
        console.error("Initial stats channel update failed:", error);
    });
}
