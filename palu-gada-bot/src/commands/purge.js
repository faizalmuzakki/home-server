import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Delete multiple messages at once')
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Number of messages to delete (1-100)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)
        )
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('Only delete messages from this user')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('contains')
                .setDescription('Only delete messages containing this text')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction) {
        const amount = interaction.options.getInteger('amount');
        const targetUser = interaction.options.getUser('user');
        const containsText = interaction.options.getString('contains');

        // Check bot permissions
        if (!interaction.channel.permissionsFor(interaction.guild.members.me).has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({
                content: 'I don\'t have permission to manage messages in this channel.',
                flags: MessageFlags.Ephemeral,
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            // Fetch messages
            let messages = await interaction.channel.messages.fetch({ limit: 100 });

            // Filter messages
            messages = messages.filter(msg => {
                // Can't delete messages older than 14 days
                if (Date.now() - msg.createdTimestamp > 14 * 24 * 60 * 60 * 1000) {
                    return false;
                }

                // Filter by user if specified
                if (targetUser && msg.author.id !== targetUser.id) {
                    return false;
                }

                // Filter by content if specified
                if (containsText && !msg.content.toLowerCase().includes(containsText.toLowerCase())) {
                    return false;
                }

                return true;
            });

            // Limit to requested amount
            const toDelete = messages.first(amount);

            if (toDelete.length === 0) {
                return interaction.editReply({
                    content: 'No messages found matching the criteria (messages must be less than 14 days old).',
                });
            }

            // Bulk delete
            const deleted = await interaction.channel.bulkDelete(toDelete, true);

            let response = `🗑️ Successfully deleted **${deleted.size}** message${deleted.size !== 1 ? 's' : ''}`;

            if (targetUser) {
                response += ` from ${targetUser.tag}`;
            }

            if (containsText) {
                response += ` containing "${containsText}"`;
            }

            await interaction.editReply({ content: response });

            // Log the action
            console.log(`[PURGE] ${interaction.user.tag} deleted ${deleted.size} messages in #${interaction.channel.name} (${interaction.guild.name})`);

        } catch (error) {
            await logCommandError(interaction, error, 'purge');
            await interaction.editReply({
                content: 'Failed to delete messages. Make sure the messages are not older than 14 days.',
            });
        }
    },
};
