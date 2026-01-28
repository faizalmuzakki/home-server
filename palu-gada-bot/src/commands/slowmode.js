import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';

const SLOWMODE_PRESETS = {
    off: 0,
    '5s': 5,
    '10s': 10,
    '15s': 15,
    '30s': 30,
    '1m': 60,
    '2m': 120,
    '5m': 300,
    '10m': 600,
    '15m': 900,
    '30m': 1800,
    '1h': 3600,
    '2h': 7200,
    '6h': 21600,
};

export default {
    data: new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('Set channel slowmode')
        .addStringOption(option =>
            option
                .setName('duration')
                .setDescription('Slowmode duration')
                .setRequired(true)
                .addChoices(
                    { name: 'Off', value: 'off' },
                    { name: '5 seconds', value: '5s' },
                    { name: '10 seconds', value: '10s' },
                    { name: '15 seconds', value: '15s' },
                    { name: '30 seconds', value: '30s' },
                    { name: '1 minute', value: '1m' },
                    { name: '2 minutes', value: '2m' },
                    { name: '5 minutes', value: '5m' },
                    { name: '10 minutes', value: '10m' },
                    { name: '15 minutes', value: '15m' },
                    { name: '30 minutes', value: '30m' },
                    { name: '1 hour', value: '1h' },
                    { name: '2 hours', value: '2h' },
                    { name: '6 hours', value: '6h' }
                )
        )
        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('Channel to set slowmode (defaults to current)')
                .setRequired(false)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildForum, ChannelType.PublicThread, ChannelType.PrivateThread)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for setting slowmode')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(interaction) {
        const duration = interaction.options.getString('duration');
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const reason = interaction.options.getString('reason') || 'No reason provided';

        const seconds = SLOWMODE_PRESETS[duration];

        // Check permissions
        const permissions = channel.permissionsFor(interaction.guild.members.me);
        if (!permissions.has('ManageChannels')) {
            return interaction.reply({
                content: `I don't have permission to manage ${channel}.`,
                flags: MessageFlags.Ephemeral,
            });
        }

        try {
            await channel.setRateLimitPerUser(seconds, `${reason} | Set by ${interaction.user.tag}`);

            const embed = {
                color: seconds === 0 ? 0x57F287 : 0x5865F2,
                title: seconds === 0 ? '🐇 Slowmode Disabled' : '🐢 Slowmode Enabled',
                fields: [
                    {
                        name: 'Channel',
                        value: channel.toString(),
                        inline: true,
                    },
                ],
                footer: {
                    text: `Set by ${interaction.user.tag}`,
                },
                timestamp: new Date().toISOString(),
            };

            if (seconds > 0) {
                embed.fields.push({
                    name: 'Duration',
                    value: formatDuration(seconds),
                    inline: true,
                });
            }

            if (reason !== 'No reason provided') {
                embed.fields.push({
                    name: 'Reason',
                    value: reason,
                    inline: false,
                });
            }

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            await logCommandError(interaction, error, 'slowmode');
            await interaction.reply({
                content: 'Failed to set slowmode. Please check my permissions.',
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};

function formatDuration(seconds) {
    if (seconds >= 3600) {
        const hours = Math.floor(seconds / 3600);
        return `${hours} hour${hours !== 1 ? 's' : ''}`;
    }
    if (seconds >= 60) {
        const minutes = Math.floor(seconds / 60);
        return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
}
