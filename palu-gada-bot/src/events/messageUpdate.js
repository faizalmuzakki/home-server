import { Events } from 'discord.js';
import { getGuildSettings, addAuditLog } from '../database/models.js';
import { checkGuildAccess } from '../config.js';

export function register(client) {
    client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
        if (newMessage.author?.bot) return;
        if (!newMessage.guild) return;
        if (!checkGuildAccess(newMessage.guild.id)) return;

        if (oldMessage.partial) {
            try {
                await oldMessage.fetch();
            } catch {
                return;
            }
        }

        if (newMessage.partial) {
            try {
                await newMessage.fetch();
            } catch {
                return;
            }
        }

        if (oldMessage.content === newMessage.content) return;

        const settings = getGuildSettings(newMessage.guild.id);
        if (!settings?.log_enabled || !settings?.message_edit_log_enabled || !settings?.log_channel_id) return;

        const logChannel = newMessage.guild.channels.cache.get(settings.log_channel_id);
        if (!logChannel) return;

        const maxLength = 1024;
        const oldContent = oldMessage.content?.length > maxLength
            ? oldMessage.content.slice(0, maxLength - 3) + '...'
            : (oldMessage.content || '*No content*');
        const newContent = newMessage.content?.length > maxLength
            ? newMessage.content.slice(0, maxLength - 3) + '...'
            : (newMessage.content || '*No content*');

        try {
            await logChannel.send({
                embeds: [{
                    color: 0x5865F2,
                    author: {
                        name: newMessage.author.tag,
                        icon_url: newMessage.author.displayAvatarURL({ dynamic: true }),
                    },
                    title: `Message Edited in #${newMessage.channel.name}`,
                    url: newMessage.url,
                    fields: [
                        {
                            name: 'Before',
                            value: oldContent,
                            inline: false,
                        },
                        {
                            name: 'After',
                            value: newContent,
                            inline: false,
                        },
                    ],
                    footer: {
                        text: `User ID: ${newMessage.author.id}`,
                    },
                    timestamp: new Date().toISOString(),
                }],
            });

            addAuditLog(
                newMessage.guild.id,
                'MESSAGE_EDIT',
                newMessage.author.id,
                null,
                `Edited message in #${newMessage.channel.name}`
            );
        } catch (error) {
            console.error('[ERROR] Failed to log message edit:', error);
        }
    });
}
