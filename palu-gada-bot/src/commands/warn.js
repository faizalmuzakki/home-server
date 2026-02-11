import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';
import { addWarning, getUserWarnings } from '../database/models.js';

export default {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a member')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The member to warn')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for the warning')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async execute(interaction) {
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');

        // Get member
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);

        if (!member) {
            return interaction.reply({
                content: 'That user is not in this server.',
                flags: MessageFlags.Ephemeral,
            });
        }

        // Don't allow warning bots
        if (user.bot) {
            return interaction.reply({
                content: 'You cannot warn bots.',
                flags: MessageFlags.Ephemeral,
            });
        }

        // Don't allow warning yourself
        if (user.id === interaction.user.id) {
            return interaction.reply({
                content: 'You cannot warn yourself.',
                flags: MessageFlags.Ephemeral,
            });
        }

        // Check role hierarchy
        if (interaction.member.roles.highest.position <= member.roles.highest.position) {
            return interaction.reply({
                content: 'You cannot warn this user as they have an equal or higher role than you.',
                flags: MessageFlags.Ephemeral,
            });
        }

        await interaction.deferReply();

        try {
            // Add warning to database
            addWarning(interaction.guild.id, user.id, interaction.user.id, reason);

            // Get total warnings
            const warnings = getUserWarnings(interaction.guild.id, user.id);
            const warningCount = warnings.length;

            // Try to DM the user
            try {
                await user.send({
                    embeds: [{
                        color: 0xFEE75C,
                        title: `⚠️ You have been warned in ${interaction.guild.name}`,
                        fields: [
                            {
                                name: 'Reason',
                                value: reason,
                            },
                            {
                                name: 'Moderator',
                                value: interaction.user.tag,
                            },
                            {
                                name: 'Total Warnings',
                                value: `${warningCount}`,
                            },
                        ],
                        timestamp: new Date().toISOString(),
                    }],
                });
            } catch (e) {
                // User has DMs disabled
            }

            const embed = {
                color: 0xFEE75C,
                title: '⚠️ Member Warned',
                thumbnail: {
                    url: user.displayAvatarURL({ dynamic: true }),
                },
                fields: [
                    {
                        name: 'User',
                        value: `${user.tag} (${user.id})`,
                        inline: true,
                    },
                    {
                        name: 'Moderator',
                        value: interaction.user.tag,
                        inline: true,
                    },
                    {
                        name: 'Total Warnings',
                        value: `${warningCount}`,
                        inline: true,
                    },
                    {
                        name: 'Reason',
                        value: reason,
                        inline: false,
                    },
                ],
                timestamp: new Date().toISOString(),
            };

            // Add warning thresholds notice
            if (warningCount >= 5) {
                embed.footer = {
                    text: '⚠️ This user has 5+ warnings. Consider taking further action.',
                };
            } else if (warningCount >= 3) {
                embed.footer = {
                    text: '⚠️ This user has 3+ warnings.',
                };
            }

            await interaction.editReply({ embeds: [embed] });

            console.log(`[WARN] ${interaction.user.tag} warned ${user.tag} in ${interaction.guild.name}: ${reason}`);

        } catch (error) {
            await logCommandError(interaction, error, 'warn');
            await interaction.editReply({
                content: 'Failed to warn the user. Please try again.',
            });
        }
    },
};
