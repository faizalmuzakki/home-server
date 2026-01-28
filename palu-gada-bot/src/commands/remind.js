import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';
import { addReminder, getUserReminders, deleteReminder } from '../database/models.js';

// Parse time string like "1h30m", "2d", "30m", "1w"
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

// Parse date string with timezone support
// Formats: "2026-01-15 14:30", "15/01/2026 14:30", "Jan 15 2026 2:30pm"
function parseDateWithTimezone(dateStr, timezone = 'Asia/Jakarta') {
    try {
        // Try to parse various date formats
        let parsedDate;
        
        // Format: YYYY-MM-DD HH:mm or YYYY-MM-DD HH:mm:ss
        const isoMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
        if (isoMatch) {
            const [, year, month, day, hour, minute, second = '0'] = isoMatch;
            parsedDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}`);
        }
        
        // Format: DD/MM/YYYY HH:mm or DD-MM-YYYY HH:mm
        const ddmmMatch = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
        if (ddmmMatch) {
            const [, day, month, year, hour, minute, second = '0'] = ddmmMatch;
            parsedDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}`);
        }
        
        // If no specific format matched, try native Date parsing
        if (!parsedDate || isNaN(parsedDate.getTime())) {
            parsedDate = new Date(dateStr);
        }
        
        if (isNaN(parsedDate.getTime())) {
            return null;
        }
        
        // Calculate timezone offset
        const timezoneOffsets = {
            'Asia/Jakarta': 7,
            'Asia/Singapore': 8,
            'Asia/Tokyo': 9,
            'Asia/Hong_Kong': 8,
            'Asia/Manila': 8,
            'Asia/Bangkok': 7,
            'Asia/Kuala_Lumpur': 8,
            'UTC': 0,
            'GMT': 0,
            'America/New_York': -5,
            'America/Los_Angeles': -8,
            'Europe/London': 0,
            'Europe/Paris': 1,
            'Australia/Sydney': 11,
        };
        
        const offset = timezoneOffsets[timezone] ?? 7; // Default to Asia/Jakarta
        
        // Adjust for timezone (assuming input is in the specified timezone)
        const utcTime = parsedDate.getTime() - (offset * 60 * 60 * 1000);
        
        return new Date(utcTime);
    } catch (error) {
        return null;
    }
}

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);

    const parts = [];
    if (weeks > 0) parts.push(`${weeks}w`);
    if (days % 7 > 0) parts.push(`${days % 7}d`);
    if (hours % 24 > 0) parts.push(`${hours % 24}h`);
    if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
    if (seconds % 60 > 0 && parts.length === 0) parts.push(`${seconds % 60}s`);

    return parts.join(' ') || '0s';
}

export default {
    data: new SlashCommandBuilder()
        .setName('remind')
        .setDescription('Set a reminder')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set a new reminder (countdown)')
                .addStringOption(option =>
                    option
                        .setName('time')
                        .setDescription('When to remind (e.g., 1h30m, 2d, 30m, 1w)')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('message')
                        .setDescription('What to remind you about')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('at')
                .setDescription('Set a reminder at a specific date/time')
                .addStringOption(option =>
                    option
                        .setName('datetime')
                        .setDescription('Date and time (e.g., "2026-01-15 14:30" or "15/01/2026 14:30")')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('message')
                        .setDescription('What to remind you about')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('timezone')
                        .setDescription('Timezone (default: Asia/Jakarta)')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Asia/Jakarta (WIB, UTC+7)', value: 'Asia/Jakarta' },
                            { name: 'Asia/Singapore (SGT, UTC+8)', value: 'Asia/Singapore' },
                            { name: 'Asia/Tokyo (JST, UTC+9)', value: 'Asia/Tokyo' },
                            { name: 'Asia/Hong Kong (HKT, UTC+8)', value: 'Asia/Hong_Kong' },
                            { name: 'Asia/Manila (PHT, UTC+8)', value: 'Asia/Manila' },
                            { name: 'Asia/Bangkok (ICT, UTC+7)', value: 'Asia/Bangkok' },
                            { name: 'UTC/GMT (UTC+0)', value: 'UTC' },
                            { name: 'America/New York (EST, UTC-5)', value: 'America/New_York' },
                            { name: 'America/Los Angeles (PST, UTC-8)', value: 'America/Los_Angeles' },
                            { name: 'Europe/London (GMT, UTC+0)', value: 'Europe/London' },
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List your pending reminders')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('cancel')
                .setDescription('Cancel a reminder')
                .addIntegerOption(option =>
                    option
                        .setName('id')
                        .setDescription('The reminder ID to cancel')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'set') {
            const timeStr = interaction.options.getString('time');
            const message = interaction.options.getString('message');

            const durationMs = parseTimeString(timeStr);

            if (durationMs === 0) {
                return interaction.reply({
                    content: 'Invalid time format! Use formats like `1h30m`, `2d`, `30m`, `1w`',
                    flags: MessageFlags.Ephemeral,
                });
            }

            // Max 30 days
            if (durationMs > 30 * 24 * 60 * 60 * 1000) {
                return interaction.reply({
                    content: 'Reminders can be set for a maximum of 30 days.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const remindAt = new Date(Date.now() + durationMs);
            const remindAtStr = remindAt.toISOString().replace('T', ' ').replace('Z', '').slice(0, 19);

            try {
                const result = addReminder(
                    interaction.user.id,
                    interaction.channel.id,
                    interaction.guild?.id || null,
                    message,
                    remindAtStr
                );

                const embed = {
                    color: 0x57F287,
                    title: '⏰ Reminder Set',
                    fields: [
                        {
                            name: 'Reminder',
                            value: message.slice(0, 1024),
                            inline: false,
                        },
                        {
                            name: 'When',
                            value: `<t:${Math.floor(remindAt.getTime() / 1000)}:R> (<t:${Math.floor(remindAt.getTime() / 1000)}:F>)`,
                            inline: false,
                        },
                    ],
                    footer: {
                        text: `Reminder ID: ${result.lastInsertRowid}`,
                    },
                    timestamp: new Date().toISOString(),
                };

                await interaction.reply({ embeds: [embed] });
            } catch (error) {
                await logCommandError(interaction, error, 'remind');
                await interaction.reply({
                    content: 'Failed to set reminder. Please try again.',
                    flags: MessageFlags.Ephemeral,
                });
            }
        } else if (subcommand === 'at') {
            const datetimeStr = interaction.options.getString('datetime');
            const message = interaction.options.getString('message');
            const timezone = interaction.options.getString('timezone') || 'Asia/Jakarta';

            const remindAt = parseDateWithTimezone(datetimeStr, timezone);

            if (!remindAt) {
                return interaction.reply({
                    content: 'Invalid date format! Use formats like:\n• `2026-01-15 14:30`\n• `15/01/2026 14:30`\n• `Jan 15 2026 2:30pm`',
                    flags: MessageFlags.Ephemeral,
                });
            }

            // Check if date is in the past
            if (remindAt.getTime() <= Date.now()) {
                return interaction.reply({
                    content: 'The specified date/time is in the past!',
                    flags: MessageFlags.Ephemeral,
                });
            }

            // Max 365 days
            if (remindAt.getTime() - Date.now() > 365 * 24 * 60 * 60 * 1000) {
                return interaction.reply({
                    content: 'Reminders can be set for a maximum of 365 days in the future.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const remindAtStr = remindAt.toISOString().replace('T', ' ').replace('Z', '').slice(0, 19);

            try {
                const result = addReminder(
                    interaction.user.id,
                    interaction.channel.id,
                    interaction.guild?.id || null,
                    message,
                    remindAtStr
                );

                const embed = {
                    color: 0x57F287,
                    title: '⏰ Reminder Set',
                    fields: [
                        {
                            name: 'Reminder',
                            value: message.slice(0, 1024),
                            inline: false,
                        },
                        {
                            name: 'When',
                            value: `<t:${Math.floor(remindAt.getTime() / 1000)}:R> (<t:${Math.floor(remindAt.getTime() / 1000)}:F>)`,
                            inline: false,
                        },
                        {
                            name: 'Timezone',
                            value: timezone,
                            inline: true,
                        },
                    ],
                    footer: {
                        text: `Reminder ID: ${result.lastInsertRowid}`,
                    },
                    timestamp: new Date().toISOString(),
                };

                await interaction.reply({ embeds: [embed] });
            } catch (error) {
                await logCommandError(interaction, error, 'remind');
                await interaction.reply({
                    content: 'Failed to set reminder. Please try again.',
                    flags: MessageFlags.Ephemeral,
                });
            }
        } else if (subcommand === 'list') {
            const reminders = getUserReminders(interaction.user.id);

            if (reminders.length === 0) {
                return interaction.reply({
                    content: 'You have no pending reminders.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const embed = {
                color: 0x5865F2,
                title: '⏰ Your Reminders',
                description: reminders.slice(0, 10).map((r, i) => {
                    const remindAt = new Date(r.remind_at + 'Z').getTime();
                    return `**${i + 1}.** (ID: ${r.id})\n${r.message.slice(0, 100)}${r.message.length > 100 ? '...' : ''}\n<t:${Math.floor(remindAt / 1000)}:R>`;
                }).join('\n\n'),
                footer: {
                    text: reminders.length > 10
                        ? `Showing 10 of ${reminders.length} reminders`
                        : `${reminders.length} reminder${reminders.length !== 1 ? 's' : ''}`,
                },
                timestamp: new Date().toISOString(),
            };

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } else if (subcommand === 'cancel') {
            const id = interaction.options.getInteger('id');

            const result = deleteReminder(id, interaction.user.id);

            if (result.changes === 0) {
                return interaction.reply({
                    content: 'Reminder not found or you don\'t have permission to cancel it.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            await interaction.reply({
                content: `✅ Reminder #${id} has been cancelled.`,
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
