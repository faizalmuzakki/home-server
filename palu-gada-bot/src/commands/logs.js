import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { getGuildSettings, updateGuildSetting, setGuildSettings, getAuditLogs } from '../database/models.js';

export default {
    data: new SlashCommandBuilder()
        .setName('logs')
        .setDescription('Configure server logging')
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Set up the logging channel')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel to send log messages')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Enable logging')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable logging')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View current logging settings')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View recent log entries')
                .addIntegerOption(option =>
                    option
                        .setName('limit')
                        .setDescription('Number of entries to show (max 25)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(25)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('message-edits')
                .setDescription('Toggle message edit logging (like Dyno)')
                .addBooleanOption(option =>
                    option
                        .setName('enabled')
                        .setDescription('Enable or disable message edit logging')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('message-deletes')
                .setDescription('Toggle message delete logging (like Dyno)')
                .addBooleanOption(option =>
                    option
                        .setName('enabled')
                        .setDescription('Enable or disable message delete logging')
                        .setRequired(true)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'setup') {
            const channel = interaction.options.getChannel('channel');

            // Check bot permissions
            const permissions = channel.permissionsFor(interaction.guild.members.me);
            if (!permissions.has('SendMessages') || !permissions.has('EmbedLinks')) {
                return interaction.reply({
                    content: `I need Send Messages and Embed Links permissions in ${channel}.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            // Get or create settings
            const settings = getGuildSettings(interaction.guildId) || { guild_id: interaction.guildId };
            setGuildSettings({
                ...settings,
                log_channel_id: channel.id,
                log_enabled: 1,
            });

            await interaction.reply({
                embeds: [{
                    color: 0x57F287,
                    title: '✅ Logging Configured',
                    description: `Log messages will be sent to ${channel}.`,
                    footer: {
                        text: 'Logs: moderation actions, member joins/leaves, message deletes',
                    },
                }],
            });

        } else if (subcommand === 'enable') {
            const settings = getGuildSettings(interaction.guildId);

            if (!settings?.log_channel_id) {
                return interaction.reply({
                    content: 'Please run `/logs setup` first to configure the log channel.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            updateGuildSetting(interaction.guildId, 'log_enabled', 1);

            await interaction.reply({
                embeds: [{
                    color: 0x57F287,
                    description: '✅ Logging has been **enabled**.',
                }],
            });

        } else if (subcommand === 'disable') {
            updateGuildSetting(interaction.guildId, 'log_enabled', 0);

            await interaction.reply({
                embeds: [{
                    color: 0xFEE75C,
                    description: '⚠️ Logging has been **disabled**.',
                }],
            });

        } else if (subcommand === 'status') {
            const settings = getGuildSettings(interaction.guildId);

            if (!settings?.log_channel_id) {
                return interaction.reply({
                    embeds: [{
                        color: 0x5865F2,
                        title: '📋 Logging Status',
                        description: 'Logging is not configured. Use `/logs setup` to get started.',
                    }],
                    flags: MessageFlags.Ephemeral,
                });
            }

            const channel = interaction.guild.channels.cache.get(settings.log_channel_id);

            await interaction.reply({
                embeds: [{
                    color: 0x5865F2,
                    title: '📋 Logging Status',
                    fields: [
                        {
                            name: 'Status',
                            value: settings.log_enabled ? '✅ Enabled' : '❌ Disabled',
                            inline: true,
                        },
                        {
                            name: 'Channel',
                            value: channel ? channel.toString() : '⚠️ Channel deleted',
                            inline: true,
                        },
                        {
                            name: 'Message Edits',
                            value: settings.message_edit_log_enabled ? '✅ Enabled' : '❌ Disabled',
                            inline: true,
                        },
                        {
                            name: 'Message Deletes',
                            value: settings.message_delete_log_enabled ? '✅ Enabled' : '❌ Disabled',
                            inline: true,
                        },
                    ],
                }],
                flags: MessageFlags.Ephemeral,
            });

        } else if (subcommand === 'message-edits') {
            const enabled = interaction.options.getBoolean('enabled');
            const settings = getGuildSettings(interaction.guildId);

            if (!settings?.log_channel_id) {
                return interaction.reply({
                    content: 'Please run `/logs setup` first to configure the log channel.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            updateGuildSetting(interaction.guildId, 'message_edit_log_enabled', enabled ? 1 : 0);

            await interaction.reply({
                embeds: [{
                    color: enabled ? 0x57F287 : 0xFEE75C,
                    description: enabled 
                        ? '✅ Message edit logging has been **enabled**.\nEdited messages will now be logged to your log channel.'
                        : '⚠️ Message edit logging has been **disabled**.',
                }],
            });

        } else if (subcommand === 'message-deletes') {
            const enabled = interaction.options.getBoolean('enabled');
            const settings = getGuildSettings(interaction.guildId);

            if (!settings?.log_channel_id) {
                return interaction.reply({
                    content: 'Please run `/logs setup` first to configure the log channel.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            updateGuildSetting(interaction.guildId, 'message_delete_log_enabled', enabled ? 1 : 0);

            await interaction.reply({
                embeds: [{
                    color: enabled ? 0x57F287 : 0xFEE75C,
                    description: enabled 
                        ? '✅ Message delete logging has been **enabled**.\nDeleted messages will now be logged to your log channel.'
                        : '⚠️ Message delete logging has been **disabled**.',
                }],
            });

        } else if (subcommand === 'view') {
            const limit = interaction.options.getInteger('limit') || 10;
            const logs = getAuditLogs(interaction.guildId, limit);

            if (logs.length === 0) {
                return interaction.reply({
                    content: 'No log entries found.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const embed = {
                color: 0x5865F2,
                title: '📋 Recent Logs',
                description: logs.map(log => {
                    const time = new Date(log.created_at);
                    const timeStr = `<t:${Math.floor(time.getTime() / 1000)}:R>`;
                    let entry = `**${log.action}** ${timeStr}`;

                    if (log.user_id) {
                        entry += `\nBy: <@${log.user_id}>`;
                    }
                    if (log.target_id) {
                        entry += ` | Target: <@${log.target_id}>`;
                    }
                    if (log.details) {
                        entry += `\n*${log.details.slice(0, 100)}*`;
                    }

                    return entry;
                }).join('\n\n'),
                footer: {
                    text: `Showing ${logs.length} entries`,
                },
            };

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    },
};
