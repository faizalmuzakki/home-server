import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { getGuildSettings, updateGuildSetting, setGuildSettings } from '../database/models.js';

export default {
    data: new SlashCommandBuilder()
        .setName('autorole')
        .setDescription('Automatically assign a role to new members')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set the auto-assign role')
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('Role to assign to new members')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Enable auto-role')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable auto-role')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View current auto-role settings')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'set') {
            const role = interaction.options.getRole('role');

            // Check if bot can assign this role
            const botMember = interaction.guild.members.me;
            if (role.position >= botMember.roles.highest.position) {
                return interaction.reply({
                    content: 'I cannot assign this role because it\'s higher than or equal to my highest role.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            // Check if role is managed (integration role)
            if (role.managed) {
                return interaction.reply({
                    content: 'This role is managed by an integration and cannot be assigned.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            // Check if it's @everyone
            if (role.id === interaction.guildId) {
                return interaction.reply({
                    content: 'You cannot use the @everyone role.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            // Get or create settings
            const settings = getGuildSettings(interaction.guildId) || { guild_id: interaction.guildId };
            setGuildSettings({
                ...settings,
                autorole_id: role.id,
                autorole_enabled: 1,
            });

            await interaction.reply({
                embeds: [{
                    color: 0x57F287,
                    title: '✅ Auto-Role Configured',
                    description: `New members will automatically receive the ${role} role.`,
                }],
            });

        } else if (subcommand === 'enable') {
            const settings = getGuildSettings(interaction.guildId);

            if (!settings?.autorole_id) {
                return interaction.reply({
                    content: 'Please run `/autorole set` first to configure the role.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            // Verify role still exists
            const role = interaction.guild.roles.cache.get(settings.autorole_id);
            if (!role) {
                return interaction.reply({
                    content: 'The configured role no longer exists. Please run `/autorole set` again.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            updateGuildSetting(interaction.guildId, 'autorole_enabled', 1);

            await interaction.reply({
                embeds: [{
                    color: 0x57F287,
                    description: `✅ Auto-role has been **enabled**. New members will receive ${role}.`,
                }],
            });

        } else if (subcommand === 'disable') {
            updateGuildSetting(interaction.guildId, 'autorole_enabled', 0);

            await interaction.reply({
                embeds: [{
                    color: 0xFEE75C,
                    description: '⚠️ Auto-role has been **disabled**.',
                }],
            });

        } else if (subcommand === 'status') {
            const settings = getGuildSettings(interaction.guildId);

            if (!settings?.autorole_id) {
                return interaction.reply({
                    embeds: [{
                        color: 0x5865F2,
                        title: '📋 Auto-Role Status',
                        description: 'Auto-role is not configured. Use `/autorole set` to get started.',
                    }],
                    flags: MessageFlags.Ephemeral,
                });
            }

            const role = interaction.guild.roles.cache.get(settings.autorole_id);

            await interaction.reply({
                embeds: [{
                    color: 0x5865F2,
                    title: '📋 Auto-Role Status',
                    fields: [
                        {
                            name: 'Status',
                            value: settings.autorole_enabled ? '✅ Enabled' : '❌ Disabled',
                            inline: true,
                        },
                        {
                            name: 'Role',
                            value: role ? role.toString() : '⚠️ Role deleted',
                            inline: true,
                        },
                    ],
                }],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
