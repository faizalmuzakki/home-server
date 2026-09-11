import { ChannelType } from 'discord.js';
import { addXp, getGuildSettings } from '../database/models.js';
import { checkGuildAccess } from '../config.js';

const voiceXpInterval = 5 * 60 * 1000; // 5 minutes
const voiceXpAmount = { min: 5, max: 10 }; // XP range per interval

export function start(client) {
    setInterval(async () => {
        for (const [guildId, guild] of client.guilds.cache) {
            if (!checkGuildAccess(guildId)) continue;

            for (const [, channel] of guild.channels.cache) {
                if (channel.type !== ChannelType.GuildVoice) continue;

                const members = channel.members.filter(m => !m.user.bot);
                if (members.size < 2) continue;

                for (const [, member] of members) {
                    if (member.voice.serverDeaf) continue;

                    const xpGained = Math.floor(Math.random() * (voiceXpAmount.max - voiceXpAmount.min + 1)) + voiceXpAmount.min;
                    const result = addXp(guildId, member.user.id, xpGained);

                    if (result && result.leveledUp) {
                        const settings = getGuildSettings(guildId);
                        const levelEnabled = settings?.level_enabled !== 0;

                        if (levelEnabled) {
                            let targetChannel = null;

                            if (settings?.level_channel_id) {
                                targetChannel = guild.channels.cache.get(settings.level_channel_id);
                            }

                            if (!targetChannel) {
                                targetChannel = guild.channels.cache.find(
                                    c => c.type === 0 && c.permissionsFor(guild.members.me)?.has('SendMessages')
                                );
                            }

                            if (targetChannel) {
                                try {
                                    await targetChannel.send({
                                        content: `🎉 ${member.user} leveled up to **Level ${result.newLevel}** while vibing in voice!`,
                                    });
                                } catch {
                                    // Couldn't send
                                }
                            }
                        }
                    }
                }
            }
        }
    }, voiceXpInterval);

    console.log('[INFO] Voice XP tracker initialized (awards XP every 5 minutes)');
}
