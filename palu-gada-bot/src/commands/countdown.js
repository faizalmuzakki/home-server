import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';

// Parse various datetime formats
function parseDateTime(dateStr) {
    // Try ISO format first (2024-12-25T15:30:00)
    let date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
        return date;
    }

    // Try common formats: "2024-12-25 15:30", "25/12/2024 15:30", "Dec 25, 2024 3:30 PM"
    const formats = [
        // YYYY-MM-DD HH:mm
        /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/,
        // DD/MM/YYYY HH:mm
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/,
        // YYYY-MM-DD
        /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
        // DD/MM/YYYY
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    ];

    // YYYY-MM-DD HH:mm
    let match = dateStr.match(formats[0]);
    if (match) {
        return new Date(match[1], match[2] - 1, match[3], match[4], match[5]);
    }

    // DD/MM/YYYY HH:mm
    match = dateStr.match(formats[1]);
    if (match) {
        return new Date(match[3], match[2] - 1, match[1], match[4], match[5]);
    }

    // YYYY-MM-DD
    match = dateStr.match(formats[2]);
    if (match) {
        return new Date(match[1], match[2] - 1, match[3], 0, 0, 0);
    }

    // DD/MM/YYYY
    match = dateStr.match(formats[3]);
    if (match) {
        return new Date(match[3], match[2] - 1, match[1], 0, 0, 0);
    }

    return null;
}

function formatCountdown(ms) {
    const isNegative = ms < 0;
    ms = Math.abs(ms);

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    const parts = [];

    if (years > 0) {
        parts.push(`${years} year${years !== 1 ? 's' : ''}`);
        const remainingMonths = Math.floor((days % 365) / 30);
        if (remainingMonths > 0) parts.push(`${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`);
    } else if (months > 0) {
        parts.push(`${months} month${months !== 1 ? 's' : ''}`);
        const remainingDays = days % 30;
        if (remainingDays > 0) parts.push(`${remainingDays} day${remainingDays !== 1 ? 's' : ''}`);
    } else if (weeks > 0) {
        parts.push(`${weeks} week${weeks !== 1 ? 's' : ''}`);
        const remainingDays = days % 7;
        if (remainingDays > 0) parts.push(`${remainingDays} day${remainingDays !== 1 ? 's' : ''}`);
    } else if (days > 0) {
        parts.push(`${days} day${days !== 1 ? 's' : ''}`);
        const remainingHours = hours % 24;
        if (remainingHours > 0) parts.push(`${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`);
    } else if (hours > 0) {
        parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
        const remainingMinutes = minutes % 60;
        if (remainingMinutes > 0) parts.push(`${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`);
    } else if (minutes > 0) {
        parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
        const remainingSeconds = seconds % 60;
        if (remainingSeconds > 0) parts.push(`${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`);
    } else {
        parts.push(`${seconds} second${seconds !== 1 ? 's' : ''}`);
    }

    const timeStr = parts.join(', ');
    return isNegative ? `${timeStr} ago` : timeStr;
}

export default {
    data: new SlashCommandBuilder()
        .setName('countdown')
        .setDescription('Calculate the time until a given date/time')
        .addStringOption(option =>
            option
                .setName('datetime')
                .setDescription('Target date/time (e.g., 2024-12-25 15:30, 25/12/2024, Dec 25 2024)')
                .setRequired(true)
        ),

    async execute(interaction) {
        const dateStr = interaction.options.getString('datetime');

        try {
            const targetDate = parseDateTime(dateStr);

            if (!targetDate || isNaN(targetDate.getTime())) {
                return interaction.reply({
                    content: '❌ Invalid date format! Try formats like:\n• `2024-12-25 15:30`\n• `2024-12-25`\n• `25/12/2024 15:30`\n• `25/12/2024`\n• `Dec 25, 2024`',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const now = new Date();
            const diffMs = targetDate.getTime() - now.getTime();
            const isPast = diffMs < 0;

            const embed = {
                color: isPast ? 0xED4245 : 0x57F287,
                title: isPast ? '⏰ Time Since' : '⏳ Countdown',
                fields: [
                    {
                        name: 'Target Date',
                        value: `<t:${Math.floor(targetDate.getTime() / 1000)}:F>`,
                        inline: true,
                    },
                    {
                        name: 'Relative',
                        value: `<t:${Math.floor(targetDate.getTime() / 1000)}:R>`,
                        inline: true,
                    },
                    {
                        name: isPast ? 'Time Elapsed' : 'Time Remaining',
                        value: formatCountdown(diffMs),
                        inline: false,
                    },
                ],
                footer: {
                    text: `Requested by ${interaction.user.tag}`,
                },
                timestamp: new Date().toISOString(),
            };

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            await logCommandError(interaction, error, 'countdown');
            await interaction.reply({
                content: '❌ Failed to calculate countdown. Please check your date format.',
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
