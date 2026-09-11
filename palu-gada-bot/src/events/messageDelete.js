import { Events } from 'discord.js';
import { getGuildSettings, addAuditLog } from '../database/models.js';
import { checkGuildAccess } from '../config.js';

export function register(client) {
    client.on(Events.MessageDelete, async (message) => {
        if (message.author?.bot) return;
        if (!message.guild) return;
        if (!checkGuildAccess(message.guild.id)) return;

        const settings = getGuildSettings(message.guild.id);
        if (!settings?.log_enabled || !settings?.message_delete_log_enabled || !settings?.log_channel_id) return;

        const logChannel = message.guild.channels.cache.get(settings.log_channel_id);
        if (!logChannel) return;

        if (!message.content && !message.attachments?.size) return;

        const maxLength = 1024;
        const content = message.content?.length > maxLength
            ? message.content.slice(0, maxLength - 3) + '...'
            : (message.content || '*No text content*');

        const fields = [
            {
                name: 'Content',
                value: content,
                inline: false,
            },
        ];

        if (message.attachments?.size > 0) {
            const attachmentList = message.attachments.map(a => a.name).join(', ');
            fields.push({
                name: 'Attachments',
                value: attachmentList.slice(0, 1024),
                inline: false,
            });
        }

        try {
            await logChannel.send({
                embeds: [{
                    color: 0xED4245,
                    author: {
                        name: message.author?.tag || 'Unknown User',
                        icon_url: message.author?.displayAvatarURL({ dynamic: true }),
                    },
                    title: `Message Deleted in #${message.channel.name}`,
                    fields,
                    footer: {
                        text: `User ID: ${message.author?.id || 'Unknown'}`,
                    },
                    timestamp: new Date().toISOString(),
                }],
            });

            addAuditLog(
                message.guild.id,
                'MESSAGE_DELETE',
                message.author?.id,
                null,
                `Deleted message in #${message.channel.name}`
            );
        } catch (error) {
            console.error('[ERROR] Failed to log message delete:', error);
        }
    });
}
