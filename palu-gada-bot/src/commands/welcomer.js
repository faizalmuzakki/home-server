import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';
import { getGuildSettings, updateGuildSetting, setGuildSettings } from '../database/models.js';

export default {
    data: new SlashCommandBuilder()
        .setName('welcomer')
        .setDescription('Configure welcome messages for new members')
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Set up the welcome channel and message')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel to send welcome messages')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText)
                )
                .addStringOption(option =>
                    option
                        .setName('message')
                        .setDescription('Welcome message. Use {user}, {server}, {membercount}')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Enable welcome messages')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable welcome messages')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('test')
                .setDescription('Send a test welcome message')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View current welcomer settings')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'setup') {
            const channel = interaction.options.getChannel('channel');
            const message = interaction.options.getString('message') ||
                'Welcome to **{server}**, {user}! You are member #{membercount}. Enjoy your stay!';

            // Check bot permissions in channel
            const permissions = channel.permissionsFor(interaction.guild.members.me);
            if (!permissions.has('SendMessages')) {
                return interaction.reply({
                    content: `I don't have permission to send messages in ${channel}.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            // Get or create settings
            const settings = getGuildSettings(interaction.guildId) || { guild_id: interaction.guildId };
            setGuildSettings({
                ...settings,
                welcome_channel_id: channel.id,
                welcome_message: message,
                welcome_enabled: 1,
            });

            await interaction.reply({
                embeds: [{
                    color: 0x57F287,
                    title: '✅ Welcomer Configured',
                    fields: [
                        {
                            name: 'Channel',
                            value: channel.toString(),
                            inline: true,
                        },
                        {
                            name: 'Status',
                            value: 'Enabled',
                            inline: true,
                        },
                        {
                            name: 'Message',
                            value: message.slice(0, 1024),
                            inline: false,
                        },
                    ],
                    footer: {
                        text: 'Variables: {user}, {server}, {membercount}',
                    },
                }],
            });

        } else if (subcommand === 'enable') {
            const settings = getGuildSettings(interaction.guildId);

            if (!settings?.welcome_channel_id) {
                return interaction.reply({
                    content: 'Please run `/welcomer setup` first to configure the welcome channel.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            updateGuildSetting(interaction.guildId, 'welcome_enabled', 1);

            await interaction.reply({
                embeds: [{
                    color: 0x57F287,
                    description: '✅ Welcome messages have been **enabled**.',
                }],
            });

        } else if (subcommand === 'disable') {
            updateGuildSetting(interaction.guildId, 'welcome_enabled', 0);

            await interaction.reply({
                embeds: [{
                    color: 0xFEE75C,
                    description: '⚠️ Welcome messages have been **disabled**.',
                }],
            });

        } else if (subcommand === 'test') {
            const settings = getGuildSettings(interaction.guildId);

            if (!settings?.welcome_channel_id) {
                return interaction.reply({
                    content: 'Please run `/welcomer setup` first.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const channel = interaction.guild.channels.cache.get(settings.welcome_channel_id);
            if (!channel) {
                return interaction.reply({
                    content: 'The welcome channel no longer exists. Please run `/welcomer setup` again.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const message = formatWelcomeMessage(
                settings.welcome_message || 'Welcome {user}!',
                interaction.user,
                interaction.guild
            );

            try {
                await channel.send({
                    embeds: [{
                        color: 0x5865F2,
                        title: '👋 Welcome!',
                        description: message,
                        thumbnail: {
                            url: interaction.user.displayAvatarURL({ dynamic: true, size: 256 }),
                        },
                        footer: {
                            text: '(This is a test message)',
                        },
                        timestamp: new Date().toISOString(),
                    }],
                });

                await interaction.reply({
                    content: `Test welcome message sent to ${channel}!`,
                    flags: MessageFlags.Ephemeral,
                });
            } catch (error) {
                await logCommandError(interaction, error, 'welcomer');
                await interaction.reply({
                    content: 'Failed to send test message. Check bot permissions.',
                    flags: MessageFlags.Ephemeral,
                });
            }

        } else if (subcommand === 'status') {
            const settings = getGuildSettings(interaction.guildId);

            if (!settings?.welcome_channel_id) {
                return interaction.reply({
                    embeds: [{
                        color: 0x5865F2,
                        title: '📋 Welcomer Status',
                        description: 'Welcomer is not configured. Use `/welcomer setup` to get started.',
                    }],
                    flags: MessageFlags.Ephemeral,
                });
            }

            const channel = interaction.guild.channels.cache.get(settings.welcome_channel_id);

            await interaction.reply({
                embeds: [{
                    color: 0x5865F2,
                    title: '📋 Welcomer Status',
                    fields: [
                        {
                            name: 'Status',
                            value: settings.welcome_enabled ? '✅ Enabled' : '❌ Disabled',
                            inline: true,
                        },
                        {
                            name: 'Channel',
                            value: channel ? channel.toString() : '⚠️ Channel deleted',
                            inline: true,
                        },
                        {
                            name: 'Message',
                            value: (settings.welcome_message || 'Default message').slice(0, 1024),
                            inline: false,
                        },
                    ],
                }],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};

function formatWelcomeMessage(template, user, guild) {
    return template
        .replace(/{user}/gi, user.toString())
        .replace(/{username}/gi, user.username)
        .replace(/{server}/gi, guild.name)
        .replace(/{membercount}/gi, guild.memberCount.toString());
}

// Export for use in index.js event handler
export { formatWelcomeMessage };
