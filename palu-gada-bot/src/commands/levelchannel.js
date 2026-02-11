import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { getGuildSettings, updateGuildSetting, setGuildSettings } from '../database/models.js';

export default {
    data: new SlashCommandBuilder()
        .setName('levelchannel')
        .setDescription('Configure level-up notification channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set the channel for level-up notifications')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('The channel to send level-up notifications')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable level-up notifications')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Enable level-up notifications')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('current')
                .setDescription('Show current level-up notification settings (same channel)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Show current level-up notification settings')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'set') {
            const channel = interaction.options.getChannel('channel');

            // Check bot permissions in the channel
            const permissions = channel.permissionsFor(interaction.guild.members.me);
            if (!permissions.has('SendMessages')) {
                return interaction.reply({
                    content: `I don't have permission to send messages in ${channel}!`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            // Get or create settings
            const settings = getGuildSettings(interaction.guildId) || { guild_id: interaction.guildId };
            setGuildSettings({
                ...settings,
                level_channel_id: channel.id,
                level_enabled: 1,
            });

            await interaction.reply({
                embeds: [{
                    color: 0x57F287,
                    title: '✅ Level Channel Set',
                    description: `Level-up notifications will now be sent to ${channel}`,
                    fields: [
                        { name: 'Channel', value: `${channel}`, inline: true },
                        { name: 'Status', value: 'Enabled', inline: true },
                    ],
                }],
            });

        } else if (subcommand === 'disable') {
            const settings = getGuildSettings(interaction.guildId);

            if (!settings?.level_enabled) {
                return interaction.reply({
                    content: 'Level-up notifications are already disabled!',
                    flags: MessageFlags.Ephemeral,
                });
            }

            updateGuildSetting(interaction.guildId, 'level_enabled', 0);

            await interaction.reply({
                embeds: [{
                    color: 0x747F8D,
                    title: '🔕 Level Notifications Disabled',
                    description: 'Level-up notifications have been disabled.',
                    footer: { text: 'Use /levelchannel enable to re-enable' },
                }],
            });

        } else if (subcommand === 'enable') {
            const settings = getGuildSettings(interaction.guildId);

            if (!settings?.level_channel_id) {
                return interaction.reply({
                    content: 'Please set a level channel first using `/levelchannel set`!',
                    flags: MessageFlags.Ephemeral,
                });
            }

            if (settings.level_enabled) {
                return interaction.reply({
                    content: 'Level-up notifications are already enabled!',
                    flags: MessageFlags.Ephemeral,
                });
            }

            updateGuildSetting(interaction.guildId, 'level_enabled', 1);

            const channel = interaction.guild.channels.cache.get(settings.level_channel_id);

            await interaction.reply({
                embeds: [{
                    color: 0x57F287,
                    title: '🔔 Level Notifications Enabled',
                    description: `Level-up notifications have been enabled in ${channel || 'the configured channel'}.`,
                }],
            });

        } else if (subcommand === 'current') {
            const settings = getGuildSettings(interaction.guildId);

            if (!settings?.level_channel_id) {
                return interaction.reply({
                    content: '⚠️ No level channel configured. Level-ups will be announced in the same channel where users are chatting.\n\nUse `/levelchannel set` to configure a dedicated channel.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const channel = interaction.guild.channels.cache.get(settings.level_channel_id);
            const enabled = settings.level_enabled !== 0;

            await interaction.reply({
                embeds: [{
                    color: enabled ? 0x57F287 : 0x747F8D,
                    title: '📊 Level Channel Settings',
                    fields: [
                        { name: 'Channel', value: channel ? `${channel}` : '❌ Channel not found', inline: true },
                        { name: 'Status', value: enabled ? '✅ Enabled' : '🔕 Disabled', inline: true },
                        { name: 'Behavior', value: enabled ? 'Level-ups announced in configured channel' : 'Level-up notifications disabled', inline: false },
                    ],
                    footer: { text: enabled ? 'Use /levelchannel disable to turn off' : 'Use /levelchannel enable to turn on' },
                }],
                flags: MessageFlags.Ephemeral,
            });

        } else if (subcommand === 'status') {
            const settings = getGuildSettings(interaction.guildId);

            if (!settings?.level_channel_id) {
                return interaction.reply({
                    content: '⚠️ No level channel configured. Level-ups will be announced in the same channel where users are chatting.\n\nUse `/levelchannel set` to configure a dedicated channel.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const channel = interaction.guild.channels.cache.get(settings.level_channel_id);
            const enabled = settings.level_enabled !== 0;

            await interaction.reply({
                embeds: [{
                    color: enabled ? 0x57F287 : 0x747F8D,
                    title: '📊 Level Channel Settings',
                    fields: [
                        { name: 'Channel', value: channel ? `${channel}` : '❌ Channel not found', inline: true },
                        { name: 'Status', value: enabled ? '✅ Enabled' : '🔕 Disabled', inline: true },
                        { name: 'Behavior', value: enabled ? 'Level-ups announced in configured channel' : 'Level-up notifications disabled', inline: false },
                    ],
                    footer: { text: enabled ? 'Use /levelchannel disable to turn off' : 'Use /levelchannel enable to turn on' },
                }],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
