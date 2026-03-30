import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';
import {
    addScheduledMessage,
    getUserScheduledMessages,
    deleteScheduledMessage,
} from '../database/models.js';

// Re-use the same time parser as remind.js
function parseTimeString(timeStr) {
    const regex = /(\d+)\s*(w|d|h|m|s)/gi;
    let totalMs = 0;
    let match;
    while ((match = regex.exec(timeStr)) !== null) {
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        switch (unit) {
            case 'w': totalMs += value * 7 * 24 * 60 * 60 * 1000; break;
            case 'd': totalMs += value * 24 * 60 * 60 * 1000; break;
            case 'h': totalMs += value * 60 * 60 * 1000; break;
            case 'm': totalMs += value * 60 * 1000; break;
            case 's': totalMs += value * 1000; break;
        }
    }
    return totalMs;
}

export default {
    data: new SlashCommandBuilder()
        .setName('schedule')
        .setDescription('Schedule a message to be posted in a channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Schedule a new message')
                .addChannelOption(opt =>
                    opt.setName('channel')
                        .setDescription('Channel to post in')
                        .setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName('message')
                        .setDescription('Message content to post')
                        .setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName('in')
                        .setDescription('When to post (e.g. 1h30m, 2d, 30m)')
                        .setRequired(false)
                )
                .addStringOption(opt =>
                    opt.setName('at')
                        .setDescription('Exact date/time to post (YYYY-MM-DD HH:mm, server UTC)')
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List your pending scheduled messages')
        )
        .addSubcommand(sub =>
            sub.setName('cancel')
                .setDescription('Cancel a scheduled message')
                .addIntegerOption(opt =>
                    opt.setName('id')
                        .setDescription('ID of the scheduled message to cancel')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'add') {
            const channel = interaction.options.getChannel('channel');
            const message = interaction.options.getString('message');
            const inStr = interaction.options.getString('in');
            const atStr = interaction.options.getString('at');

            if (!inStr && !atStr) {
                return interaction.reply({
                    content: 'Provide either `in` (e.g. `1h30m`) or `at` (e.g. `2026-04-01 09:00`).',
                    flags: MessageFlags.Ephemeral,
                });
            }

            let sendAt;

            if (inStr) {
                const ms = parseTimeString(inStr);
                if (ms === 0) {
                    return interaction.reply({
                        content: 'Invalid duration! Use formats like `1h30m`, `2d`, `30m`.',
                        flags: MessageFlags.Ephemeral,
                    });
                }
                if (ms > 365 * 24 * 60 * 60 * 1000) {
                    return interaction.reply({
                        content: 'Maximum schedule window is 365 days.',
                        flags: MessageFlags.Ephemeral,
                    });
                }
                sendAt = new Date(Date.now() + ms);
            } else {
                sendAt = new Date(atStr);
                if (isNaN(sendAt.getTime())) {
                    return interaction.reply({
                        content: 'Invalid date format! Use `YYYY-MM-DD HH:mm` (UTC).',
                        flags: MessageFlags.Ephemeral,
                    });
                }
                if (sendAt <= Date.now()) {
                    return interaction.reply({
                        content: 'The scheduled time must be in the future.',
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }

            const sendAtStr = sendAt.toISOString().replace('T', ' ').slice(0, 19);

            try {
                const result = addScheduledMessage(
                    interaction.guild.id,
                    channel.id,
                    interaction.user.id,
                    message,
                    sendAtStr
                );

                await interaction.reply({
                    embeds: [{
                        color: 0x5865F2,
                        title: '📅 Message Scheduled',
                        fields: [
                            { name: 'Channel', value: `<#${channel.id}>`, inline: true },
                            { name: 'When', value: `<t:${Math.floor(sendAt.getTime() / 1000)}:F> (<t:${Math.floor(sendAt.getTime() / 1000)}:R>)`, inline: true },
                            { name: 'Message', value: message.slice(0, 1024) },
                        ],
                        footer: { text: `Schedule ID: ${result.lastInsertRowid}` },
                        timestamp: new Date().toISOString(),
                    }],
                    flags: MessageFlags.Ephemeral,
                });
            } catch (error) {
                await logCommandError(interaction, error, 'schedule add');
                await interaction.reply({
                    content: 'Failed to schedule message. Please try again.',
                    flags: MessageFlags.Ephemeral,
                });
            }

        } else if (sub === 'list') {
            const scheduled = getUserScheduledMessages(interaction.user.id, interaction.guild.id);

            if (scheduled.length === 0) {
                return interaction.reply({
                    content: 'You have no pending scheduled messages in this server.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const entries = scheduled.slice(0, 10).map(s => {
                const ts = Math.floor(new Date(s.send_at + 'Z').getTime() / 1000);
                return `**ID ${s.id}** → <#${s.channel_id}> at <t:${ts}:F>\n> ${s.message.slice(0, 100)}${s.message.length > 100 ? '…' : ''}`;
            }).join('\n\n');

            await interaction.reply({
                embeds: [{
                    color: 0x5865F2,
                    title: '📅 Your Scheduled Messages',
                    description: entries,
                    footer: {
                        text: scheduled.length > 10
                            ? `Showing 10 of ${scheduled.length} scheduled messages`
                            : `${scheduled.length} scheduled message${scheduled.length !== 1 ? 's' : ''}`,
                    },
                }],
                flags: MessageFlags.Ephemeral,
            });

        } else if (sub === 'cancel') {
            const id = interaction.options.getInteger('id');
            const result = deleteScheduledMessage(id, interaction.user.id);

            if (result.changes === 0) {
                return interaction.reply({
                    content: 'Scheduled message not found or you don\'t have permission to cancel it.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            await interaction.reply({
                content: `✅ Scheduled message #${id} cancelled.`,
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
