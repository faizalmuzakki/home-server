import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { getGuildSettings, setGuildSettings } from '../database/models.js';

export default {
    data: new SlashCommandBuilder()
        .setName('toproles')
        .setDescription('Configure special roles for the top 3 users with the most XP')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set the roles for the top 3 spots')
                .addRoleOption(option =>
                    option
                        .setName('top1')
                        .setDescription('The role given to the #1 user on the leaderboard')
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option
                        .setName('top2')
                        .setDescription('The role given to the #2 user on the leaderboard')
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option
                        .setName('top3')
                        .setDescription('The role given to the #3 user on the leaderboard')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Clear the top 3 roles configuration')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Show current top roles configuration')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'set') {
            const top1Role = interaction.options.getRole('top1');
            const top2Role = interaction.options.getRole('top2');
            const top3Role = interaction.options.getRole('top3');

            const settings = getGuildSettings(interaction.guildId) || { guild_id: interaction.guildId };
            setGuildSettings({
                ...settings,
                top1_role_id: top1Role.id,
                top2_role_id: top2Role.id,
                top3_role_id: top3Role.id,
            });

            await interaction.reply({
                embeds: [{
                    color: 0x57F287,
                    title: '✅ Top Roles Configured',
                    description: 'The top 3 leveling roles have been successfully set.',
                    fields: [
                        { name: '🥇 Rank 1 Role', value: `${top1Role}`, inline: true },
                        { name: '🥈 Rank 2 Role', value: `${top2Role}`, inline: true },
                        { name: '🥉 Rank 3 Role', value: `${top3Role}`, inline: true },
                    ],
                }],
            });

        } else if (subcommand === 'clear') {
            const settings = getGuildSettings(interaction.guildId);

            if (!settings?.top1_role_id && !settings?.top2_role_id && !settings?.top3_role_id) {
                return interaction.reply({
                    content: 'Top roles are not currently configured!',
                    flags: MessageFlags.Ephemeral,
                });
            }

            setGuildSettings({
                ...settings,
                top1_role_id: null,
                top2_role_id: null,
                top3_role_id: null,
            });

            await interaction.reply({
                embeds: [{
                    color: 0x747F8D,
                    title: '🗑️ Top Roles Cleared',
                    description: 'The top 3 leveling roles configuration has been removed.',
                }],
            });

        } else if (subcommand === 'status') {
            const settings = getGuildSettings(interaction.guildId);

            const hasRoles = settings?.top1_role_id || settings?.top2_role_id || settings?.top3_role_id;

            if (!hasRoles) {
                return interaction.reply({
                    content: '⚠️ Top roles are not currently configured.\n\nUse `/toproles set` to configure them.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const top1Role = settings.top1_role_id ? `<@&${settings.top1_role_id}>` : '*Not Set*';
            const top2Role = settings.top2_role_id ? `<@&${settings.top2_role_id}>` : '*Not Set*';
            const top3Role = settings.top3_role_id ? `<@&${settings.top3_role_id}>` : '*Not Set*';

            await interaction.reply({
                embeds: [{
                    color: 0x5865F2,
                    title: '🏆 Top Roles Settings',
                    fields: [
                        { name: '🥇 Rank 1 Role', value: top1Role, inline: true },
                        { name: '🥈 Rank 2 Role', value: top2Role, inline: true },
                        { name: '🥉 Rank 3 Role', value: top3Role, inline: true },
                    ],
                }],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
