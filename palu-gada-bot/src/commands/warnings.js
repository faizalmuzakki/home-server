import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { getUserWarnings, deleteWarning, clearUserWarnings } from '../database/models.js';

export default {
    data: new SlashCommandBuilder()
        .setName('warnings')
        .setDescription('View or manage warnings for a user')
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('View warnings for a user')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('The user to check warnings for')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a specific warning')
                .addIntegerOption(option =>
                    option
                        .setName('id')
                        .setDescription('The warning ID to remove')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Clear all warnings for a user')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('The user to clear warnings for')
                        .setRequired(true)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'list') {
            const user = interaction.options.getUser('user');
            const warnings = getUserWarnings(interaction.guild.id, user.id);

            if (warnings.length === 0) {
                return interaction.reply({
                    content: `${user.tag} has no warnings.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            const embed = {
                color: warnings.length >= 3 ? 0xED4245 : 0xFEE75C,
                title: `⚠️ Warnings for ${user.tag}`,
                thumbnail: {
                    url: user.displayAvatarURL({ dynamic: true }),
                },
                description: `Total warnings: **${warnings.length}**`,
                fields: warnings.slice(0, 10).map((w, i) => {
                    const date = new Date(w.created_at);
                    return {
                        name: `#${w.id} - ${date.toLocaleDateString()}`,
                        value: `**Reason:** ${w.reason.slice(0, 100)}\n**By:** <@${w.moderator_id}>`,
                        inline: false,
                    };
                }),
                footer: {
                    text: warnings.length > 10
                        ? `Showing 10 of ${warnings.length} warnings`
                        : `${warnings.length} warning${warnings.length !== 1 ? 's' : ''} total`,
                },
                timestamp: new Date().toISOString(),
            };

            await interaction.reply({ embeds: [embed] });

        } else if (subcommand === 'remove') {
            const warningId = interaction.options.getInteger('id');

            const result = deleteWarning(warningId, interaction.guild.id);

            if (result.changes === 0) {
                return interaction.reply({
                    content: 'Warning not found or it belongs to a different server.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            await interaction.reply({
                content: `✅ Warning #${warningId} has been removed.`,
            });

            console.log(`[WARNINGS] ${interaction.user.tag} removed warning #${warningId} in ${interaction.guild.name}`);

        } else if (subcommand === 'clear') {
            const user = interaction.options.getUser('user');

            const warnings = getUserWarnings(interaction.guild.id, user.id);

            if (warnings.length === 0) {
                return interaction.reply({
                    content: `${user.tag} has no warnings to clear.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            clearUserWarnings(interaction.guild.id, user.id);

            await interaction.reply({
                content: `✅ Cleared **${warnings.length}** warning${warnings.length !== 1 ? 's' : ''} for ${user.tag}.`,
            });

            console.log(`[WARNINGS] ${interaction.user.tag} cleared ${warnings.length} warnings for ${user.tag} in ${interaction.guild.name}`);
        }
    },
};
