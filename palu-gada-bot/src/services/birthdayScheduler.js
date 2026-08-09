import { getTodayBirthdays, getGuildSettings } from '../database/models.js';
import { checkGuildAccess } from '../config.js';

async function checkBirthdays(client) {
    for (const [guildId, guild] of client.guilds.cache) {
        if (!checkGuildAccess(guildId)) continue;

        try {
            const settings = getGuildSettings(guildId);
            if (!settings?.birthday_channel_id) continue;

            const channel = guild.channels.cache.get(settings.birthday_channel_id);
            if (!channel) continue;

            const birthdays = getTodayBirthdays(guildId);
            for (const entry of birthdays) {
                const user = await client.users.fetch(entry.user_id).catch(() => null);
                if (!user) continue;

                await channel.send({
                    embeds: [{
                        color: 0xEB459E,
                        title: '🎂 Happy Birthday!',
                        description: `Today is **${user.displayName || user.username}**'s birthday! 🎉\n\nWish them a happy birthday!`,
                        thumbnail: { url: user.displayAvatarURL({ dynamic: true }) },
                        timestamp: new Date().toISOString(),
                    }],
                }).catch(err => console.error(`[ERROR] Birthday message failed for ${entry.user_id}:`, err));
            }
        } catch (e) {
            console.error(`[ERROR] Birthday check failed for guild ${guildId}:`, e);
        }
    }
}

export function start(client) {
    const now = new Date();
    const nextMidnight = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1,
    ));
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();

    setTimeout(() => {
        checkBirthdays(client);
        setInterval(() => checkBirthdays(client), 24 * 60 * 60 * 1000);
    }, msUntilMidnight);

    console.log(`[INFO] Birthday checker scheduled — first run in ${Math.round(msUntilMidnight / 60000)} min`);
}
