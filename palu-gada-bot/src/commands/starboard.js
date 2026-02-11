import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { getGuildSettings, updateGuildSettings } from '../database/models.js';

export default {
    data: new SlashCommandBuilder()
        .setName('starboard')
        .setDescription('Configure the starboard')
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Set up the starboard channel')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel for starboard messages')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText)
                )
                .addIntegerOption(option =>
                    option
                        .setName('threshold')
                        .setDescription('Number of stars required (default: 3)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(25)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('threshold')
                .setDescription('Change the star threshold')
                .addIntegerOption(option =>
                    option
                        .setName('count')
                        .setDescription('Number of stars required')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(25)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Enable or disable the starboard')
                .addBooleanOption(option =>
                    option
                        .setName('enabled')
                        .setDescription('Enable or disable')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View current starboard settings')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const settings = getGuildSettings(interaction.guildId);

        if (subcommand === 'setup') {
            const channel = interaction.options.getChannel('channel');
            const threshold = interaction.options.getInteger('threshold') || 3;

            // Check bot permissions in the channel
            const permissions = channel.permissionsFor(interaction.guild.members.me);
            if (!permissions.has('SendMessages') || !permissions.has('EmbedLinks')) {
                return interaction.reply({
                    content: `I don't have permission to send messages or embeds in ${channel}.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            updateGuildSettings(interaction.guildId, {
                starboard_channel_id: channel.id,
                starboard_threshold: threshold,
                starboard_enabled: true,
            });

            await interaction.reply({
                embeds: [{
                    color: 0xFFAC33,
                    title: '⭐ Starboard Set Up!',
                    description: `Starboard has been configured!`,
                    fields: [
                        {
                            name: 'Channel',
                            value: `${channel}`,
                            inline: true,
                        },
                        {
                            name: 'Threshold',
                            value: `${threshold} ⭐`,
                            inline: true,
                        },
                    ],
                    footer: {
                        text: 'React with ⭐ to star messages!',
                    },
                }],
            });

        } else if (subcommand === 'threshold') {
            const threshold = interaction.options.getInteger('count');

            if (!settings.starboard_channel_id) {
                return interaction.reply({
                    content: 'Starboard is not set up yet! Use `/starboard setup` first.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            updateGuildSettings(interaction.guildId, {
                starboard_threshold: threshold,
            });

            await interaction.reply({
                embeds: [{
                    color: 0xFFAC33,
                    title: '⭐ Threshold Updated',
                    description: `Messages now need **${threshold}** stars to appear on the starboard.`,
                }],
            });

        } else if (subcommand === 'toggle') {
            const enabled = interaction.options.getBoolean('enabled');

            if (!settings.starboard_channel_id) {
                return interaction.reply({
                    content: 'Starboard is not set up yet! Use `/starboard setup` first.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            updateGuildSettings(interaction.guildId, {
                starboard_enabled: enabled,
            });

            await interaction.reply({
                embeds: [{
                    color: enabled ? 0x57F287 : 0xED4245,
                    title: enabled ? '⭐ Starboard Enabled' : '⭐ Starboard Disabled',
                    description: enabled
                        ? 'The starboard is now active!'
                        : 'The starboard has been disabled.',
                }],
            });

        } else if (subcommand === 'status') {
            if (!settings.starboard_channel_id) {
                return interaction.reply({
                    embeds: [{
                        color: 0xFFAC33,
                        title: '⭐ Starboard Status',
                        description: 'Starboard is not set up. Use `/starboard setup` to configure it.',
                    }],
                });
            }

            const channel = interaction.guild.channels.cache.get(settings.starboard_channel_id);

            const embed = {
                color: 0xFFAC33,
                title: '⭐ Starboard Status',
                fields: [
                    {
                        name: 'Status',
                        value: settings.starboard_enabled ? '✅ Enabled' : '❌ Disabled',
                        inline: true,
                    },
                    {
                        name: 'Channel',
                        value: channel ? `${channel}` : 'Not found',
                        inline: true,
                    },
                    {
                        name: 'Threshold',
                        value: `${settings.starboard_threshold || 3} ⭐`,
                        inline: true,
                    },
                ],
                footer: {
                    text: 'React with ⭐ to star messages!',
                },
            };

            await interaction.reply({ embeds: [embed] });
        }
    },
};
