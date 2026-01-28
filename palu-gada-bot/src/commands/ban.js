import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a user from the server')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to ban')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for the ban')
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option
                .setName('delete_days')
                .setDescription('Days of messages to delete (0-7)')
                .setRequired(false)
                .setMinValue(0)
                .setMaxValue(7)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    async execute(interaction) {
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const deleteDays = interaction.options.getInteger('delete_days') || 0;

        // Don't allow banning yourself
        if (user.id === interaction.user.id) {
            return interaction.reply({
                content: 'You cannot ban yourself.',
                flags: MessageFlags.Ephemeral,
            });
        }

        // Don't allow banning the bot
        if (user.id === interaction.client.user.id) {
            return interaction.reply({
                content: 'I cannot ban myself.',
                flags: MessageFlags.Ephemeral,
            });
        }

        // Check if user is in the guild
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);

        if (member) {
            // Check if member is bannable
            if (!member.bannable) {
                return interaction.reply({
                    content: 'I cannot ban this user. They may have a higher role than me.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            // Check role hierarchy
            if (interaction.member.roles.highest.position <= member.roles.highest.position) {
                return interaction.reply({
                    content: 'You cannot ban this user as they have an equal or higher role than you.',
                    flags: MessageFlags.Ephemeral,
                });
            }
        }

        await interaction.deferReply();

        try {
            // Try to DM the user before banning (if they're in the server)
            if (member) {
                try {
                    await user.send({
                        embeds: [{
                            color: 0xED4245,
                            title: `🔨 You have been banned from ${interaction.guild.name}`,
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
            }

            // Ban the user
            await interaction.guild.members.ban(user.id, {
                deleteMessageDays: deleteDays,
                reason: `${reason} | Banned by ${interaction.user.tag}`,
            });

            const embed = {
                color: 0xED4245,
                title: '🔨 User Banned',
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

            if (deleteDays > 0) {
                embed.fields.push({
                    name: 'Messages Deleted',
                    value: `${deleteDays} day${deleteDays !== 1 ? 's' : ''} worth`,
                    inline: true,
                });
            }

            await interaction.editReply({ embeds: [embed] });

            console.log(`[BAN] ${interaction.user.tag} banned ${user.tag} from ${interaction.guild.name}: ${reason}`);

        } catch (error) {
            await logCommandError(interaction, error, 'ban');
            await interaction.editReply({
                content: 'Failed to ban the user. Please check my permissions.',
            });
        }
    },
};
