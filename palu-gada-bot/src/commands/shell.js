import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';
import { executeCommand, formatOutput, isShellAllowed } from '../utils/shellExecutor.js';

export default {
    data: new SlashCommandBuilder()
        .setName('shell')
        .setDescription('Execute a shell command on the server (owner only)')
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
        // Owner-only check
        if (!isShellAllowed(interaction.user.id)) {
            return interaction.reply({
                content: 'This command is restricted to the bot owner.',
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
