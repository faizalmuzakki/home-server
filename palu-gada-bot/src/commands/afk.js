import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { setAfk, removeAfk, getAfk } from '../database/models.js';

export default {
    data: new SlashCommandBuilder()
        .setName('afk')
        .setDescription('Set or remove your AFK status')
        .addStringOption(option =>
            option
                .setName('message')
                .setDescription('Your AFK message (leave empty to remove AFK status)')
                .setRequired(false)
        ),

    async execute(interaction) {
        const message = interaction.options.getString('message');
        const userId = interaction.user.id;

        if (!message) {
            // Check if user is AFK
            const afkStatus = getAfk(userId);

            if (!afkStatus) {
                return interaction.reply({
                    content: 'You are not currently AFK. Use `/afk <message>` to set your AFK status.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            // Remove AFK status
            removeAfk(userId);

            const since = new Date(afkStatus.since);
            const duration = formatDuration(Date.now() - since.getTime());

            await interaction.reply({
                content: `👋 Welcome back! Your AFK status has been removed.\nYou were AFK for **${duration}**.`,
                flags: MessageFlags.Ephemeral,
            });

        } else {
            // Set AFK status
            setAfk(userId, message);

            const embed = {
                color: 0x5865F2,
                title: '💤 AFK Status Set',
                description: `**Message:** ${message}`,
                footer: {
                    text: 'I\'ll let others know when they mention you.',
                },
                timestamp: new Date().toISOString(),
            };

            await interaction.reply({ embeds: [embed] });
        }
    },
};

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours % 24 > 0) parts.push(`${hours % 24}h`);
    if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
    if (seconds % 60 > 0 && parts.length < 2) parts.push(`${seconds % 60}s`);

    return parts.join(' ') || 'less than a second';
}
