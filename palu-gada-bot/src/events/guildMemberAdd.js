import { Events } from 'discord.js';
import { getGuildSettings } from '../database/models.js';
import { checkGuildAccess } from '../config.js';

export function register(client) {
    client.on(Events.GuildMemberAdd, async (member) => {
        if (!checkGuildAccess(member.guild.id)) return;

        const settings = getGuildSettings(member.guild.id);

        if (settings.welcome_enabled && settings.welcome_channel_id) {
            const channel = member.guild.channels.cache.get(settings.welcome_channel_id);
            if (channel) {
                const message = (settings.welcome_message || 'Welcome {user} to {server}!')
                    .replace(/{user}/g, `${member}`)
                    .replace(/{username}/g, member.user.username)
                    .replace(/{server}/g, member.guild.name)
                    .replace(/{membercount}/g, member.guild.memberCount.toString());

                try {
                    await channel.send({
                        embeds: [{
                            color: 0x57F287,
                            title: '👋 Welcome!',
                            description: message,
                            thumbnail: { url: member.user.displayAvatarURL({ dynamic: true, size: 256 }) },
                            footer: { text: `Member #${member.guild.memberCount}` },
                            timestamp: new Date().toISOString(),
                        }],
                    });
                } catch (error) {
                    console.error('[ERROR] Failed to send welcome message:', error);
                }
            }
        }

        if (settings.welcome_dm_enabled && settings.welcome_dm_message) {
            const dmText = settings.welcome_dm_message
                .replace(/{user}/gi, `${member}`)
                .replace(/{username}/gi, member.user.username)
                .replace(/{server}/gi, member.guild.name)
                .replace(/{membercount}/gi, member.guild.memberCount.toString());

            try {
                await member.user.send({
                    embeds: [{
                        color: 0x5865F2,
                        title: `👋 Welcome to ${member.guild.name}!`,
                        description: dmText,
                        thumbnail: { url: member.guild.iconURL({ dynamic: true, size: 256 }) || '' },
                        timestamp: new Date().toISOString(),
                    }],
                });
            } catch {
                // User has DMs disabled — silently ignore
            }
        }

        if (settings.autorole_enabled && settings.autorole_id) {
            const role = member.guild.roles.cache.get(settings.autorole_id);
            if (role) {
                try {
                    await member.roles.add(role);
                } catch (error) {
                    console.error('[ERROR] Failed to add autorole:', error);
                }
            }
        }
    });
}
