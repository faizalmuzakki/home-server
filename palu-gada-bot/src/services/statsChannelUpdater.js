import { getAllStatsChannels } from '../database/models.js';
import { getStatValue, formatStatName } from '../commands/statschannel.js';

export function start(client) {
    async function updateStatsChannels() {
        try {
            const rows = getAllStatsChannels();
            for (const row of rows) {
                const guild = client.guilds.cache.get(row.guild_id);
                if (!guild) continue;
                const channel = guild.channels.cache.get(row.channel_id);
                if (!channel) continue;
                try {
                    const count = await getStatValue(guild, row.stat_type);
                    const newName = formatStatName(row.stat_type, count);
                    if (channel.name !== newName) {
                        await channel.setName(newName);
                    }
                } catch {
                    // No ManageChannels permission or rate-limited — skip
                }
            }
        } catch (e) {
            console.error('[ERROR] Stats channel updater error:', e);
        }
    }

    setInterval(updateStatsChannels, 10 * 60 * 1000);
    updateStatsChannels();
    console.log('[INFO] Stats channel updater started');
}
