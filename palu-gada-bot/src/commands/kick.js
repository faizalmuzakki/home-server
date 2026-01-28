import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a member from the server')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The member to kick')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for the kick')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

    async execute(interaction) {
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        // Get member
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);

        if (!member) {
            return interaction.reply({
                content: 'That user is not in this server.',
                flags: MessageFlags.Ephemeral,
            });
        }

        // Check if member is kickable
        if (!member.kickable) {
            return interaction.reply({
                content: 'I cannot kick this user. They may have a higher role than me.',
                flags: MessageFlags.Ephemeral,
            });
        }

        // Check role hierarchy
        if (interaction.member.roles.highest.position <= member.roles.highest.position) {
            return interaction.reply({
                content: 'You cannot kick this user as they have an equal or higher role than you.',
                flags: MessageFlags.Ephemeral,
            });
        }

        // Don't allow kicking yourself
        if (user.id === interaction.user.id) {
            return interaction.reply({
                content: 'You cannot kick yourself.',
                flags: MessageFlags.Ephemeral,
            });
        }

        await interaction.deferReply();

        try {
            // Try to DM the user before kicking
            try {
                await user.send({
                    embeds: [{
                        color: 0xFEE75C,
                        title: `👢 You have been kicked from ${interaction.guild.name}`,
                        fields: [
                            {
                                name: 'Reason',
                                value: reason,
                            },
                            {
                                name: 'Moderator',
                                value: interaction.user.tag,
                            },
                        ],
                        timestamp: new Date().toISOString(),
                    }],
                });
            } catch (e) {
                // User has DMs disabled
            }

            // Kick the member
            await member.kick(`${reason} | Kicked by ${interaction.user.tag}`);

            const embed = {
                color: 0xFEE75C,
                title: '👢 Member Kicked',
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
                        name: 'Reason',
                        value: reason,
                        inline: false,
                    },
                ],
                timestamp: new Date().toISOString(),
            };

            await interaction.editReply({ embeds: [embed] });

            console.log(`[KICK] ${interaction.user.tag} kicked ${user.tag} from ${interaction.guild.name}: ${reason}`);

        } catch (error) {
            await logCommandError(interaction, error, 'kick');
            await interaction.editReply({
                content: 'Failed to kick the user. Please check my permissions.',
            });
        }
    },
};
