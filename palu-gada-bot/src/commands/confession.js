import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';
import { getGuildSettings, updateGuildSettings, createConfession, getConfession } from '../database/models.js';

export default {
    data: new SlashCommandBuilder()
        .setName('confession')
        .setDescription('Anonymous confessions')
        .addSubcommand(subcommand =>
            subcommand
                .setName('send')
                .setDescription('Send an anonymous confession')
                .addStringOption(option =>
                    option
                        .setName('message')
                        .setDescription('Your confession')
                        .setRequired(true)
                        .setMaxLength(2000)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Set up the confession channel')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel for confessions')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Enable or disable confessions')
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
                .setDescription('View confession settings')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const settings = getGuildSettings(interaction.guildId);

        if (subcommand === 'send') {
            // Check if confessions are enabled
            if (!settings.confession_enabled || !settings.confession_channel_id) {
                return interaction.reply({
                    content: 'Confessions are not set up in this server!',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const message = interaction.options.getString('message');
            const channel = interaction.guild.channels.cache.get(settings.confession_channel_id);

            if (!channel) {
                return interaction.reply({
                    content: 'The confession channel no longer exists!',
                    flags: MessageFlags.Ephemeral,
                });
            }

            // Check bot permissions
            const permissions = channel.permissionsFor(interaction.guild.members.me);
            if (!permissions.has('SendMessages') || !permissions.has('EmbedLinks')) {
                return interaction.reply({
                    content: 'I don\'t have permission to send messages in the confession channel!',
                    flags: MessageFlags.Ephemeral,
                });
            }

            // Generate confession ID
            const confessionId = Math.random().toString(36).substring(2, 8).toUpperCase();

            // Store confession (for moderation purposes - only accessible by admins)
            createConfession(
                interaction.guildId,
                confessionId,
                interaction.user.id,
                message
            );

            // Send anonymous confession
            const embed = {
                color: 0x5865F2,
                title: '💭 Anonymous Confession',
                description: message,
                footer: {
                    text: `Confession #${confessionId}`,
                },
                timestamp: new Date().toISOString(),
            };

            try {
                await channel.send({ embeds: [embed] });

                await interaction.reply({
                    embeds: [{
                        color: 0x57F287,
                        title: '✅ Confession Sent!',
                        description: 'Your anonymous confession has been posted.',
                        fields: [
                            {
                                name: 'Confession ID',
                                value: `#${confessionId}`,
                                inline: true,
                            },
                            {
                                name: 'Channel',
                                value: `${channel}`,
                                inline: true,
                            },
                        ],
                        footer: {
                            text: 'Your identity is hidden, but admins can view it if needed for moderation.',
                        },
                    }],
                    flags: MessageFlags.Ephemeral,
                });
            } catch (error) {
                await logCommandError(interaction, error, 'confession');
                await interaction.reply({
                    content: 'Failed to send confession. Please try again later.',
                    flags: MessageFlags.Ephemeral,
                });
            }

        } else if (subcommand === 'setup') {
            // Check permissions
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({
                    content: 'You need the **Manage Server** permission to set up confessions.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const channel = interaction.options.getChannel('channel');

            // Check bot permissions
            const permissions = channel.permissionsFor(interaction.guild.members.me);
            if (!permissions.has('SendMessages') || !permissions.has('EmbedLinks')) {
                return interaction.reply({
                    content: `I don't have permission to send messages or embeds in ${channel}.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            updateGuildSettings(interaction.guildId, {
                confession_channel_id: channel.id,
                confession_enabled: true,
            });

            await interaction.reply({
                embeds: [{
                    color: 0x5865F2,
                    title: '💭 Confessions Set Up!',
                    description: `Anonymous confessions will be sent to ${channel}.`,
                    fields: [
                        {
                            name: 'How to use',
                            value: 'Members can use `/confession send` to submit anonymous messages.',
                            inline: false,
                        },
                    ],
                    footer: {
                        text: 'Confession authors are logged for moderation purposes.',
                    },
                }],
            });

        } else if (subcommand === 'toggle') {
            // Check permissions
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({
                    content: 'You need the **Manage Server** permission to toggle confessions.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const enabled = interaction.options.getBoolean('enabled');

            if (!settings.confession_channel_id) {
                return interaction.reply({
                    content: 'Confessions are not set up yet! Use `/confession setup` first.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            updateGuildSettings(interaction.guildId, {
                confession_enabled: enabled,
            });

            await interaction.reply({
                embeds: [{
                    color: enabled ? 0x57F287 : 0xED4245,
                    title: enabled ? '💭 Confessions Enabled' : '💭 Confessions Disabled',
                    description: enabled
                        ? 'Anonymous confessions are now enabled!'
                        : 'Anonymous confessions have been disabled.',
                }],
            });

        } else if (subcommand === 'status') {
            const channel = settings.confession_channel_id
                ? interaction.guild.channels.cache.get(settings.confession_channel_id)
                : null;

            const embed = {
                color: 0x5865F2,
                title: '💭 Confession Settings',
                fields: [
                    {
                        name: 'Status',
                        value: settings.confession_enabled ? '✅ Enabled' : '❌ Disabled',
                        inline: true,
                    },
                    {
                        name: 'Channel',
                        value: channel ? `${channel}` : 'Not set',
                        inline: true,
                    },
                ],
            };

            // Only show reveal option to admins
            if (interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                embed.footer = {
                    text: 'Admins can view confession authors for moderation.',
                };
            }

            await interaction.reply({ embeds: [embed] });
        }
    },
};
