import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';
import { executeCommand, formatOutput } from '../utils/shellExecutor.js';
import { isCommandAllowed } from '../utils/validation.js';

export default {
    data: new SlashCommandBuilder()
        .setName('shell')
        .setDescription('Execute a shell command on the server (owner/admin only)')
        .addStringOption(option =>
            option
                .setName('command')
                .setDescription('The shell command to execute')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('timeout')
                .setDescription('Timeout in seconds (default: 30, max: 120)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(120)
        ),

    async execute(interaction) {
        // Shared validation: Check allowed users (default to ALLOWED_DEPLOY_USERS for now, or new env var)
        // Using ALLOWED_DEPLOY_USERS as the source of truth for admin commands
        const validation = isCommandAllowed(interaction, 'ALLOWED_DEPLOY_USERS', 'DEPLOY_CHANNEL_ID');
        
        if (!validation.allowed) {
            return interaction.reply({
                content: validation.reason,
                flags: MessageFlags.Ephemeral,
            });
        }

        const command = interaction.options.getString('command');
        const timeoutSec = interaction.options.getInteger('timeout') || 30;

        await interaction.deferReply();

        try {
            const result = await executeCommand(command, {
                timeout: timeoutSec * 1000,
            });

            const messages = formatOutput(result);

            // Send first chunk as edit reply
            await interaction.editReply({
                content: `\`$ ${command}\`\n${messages[0]}`,
            });

            // Send remaining chunks as follow-ups
            for (let i = 1; i < Math.min(messages.length, 10); i++) {
                await interaction.followUp({ content: messages[i] });
            }

            if (messages.length > 10) {
                await interaction.followUp({
                    content: `*Output truncated (${messages.length - 10} more chunks)*`,
                });
            }
        } catch (error) {
            await logCommandError(interaction, error, 'shell');
            await interaction.editReply({
                content: `Failed to execute command: ${error.message}`,
            });
        }
    },
};
