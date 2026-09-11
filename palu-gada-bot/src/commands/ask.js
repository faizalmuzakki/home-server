import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';
import { askClaude } from '../utils/claudeApi.js';
import { getAiFooter, DISCORD_FORMAT_PROMPT } from '../config/ai.js';
import { sendAiReply } from '../utils/aiReply.js';

export default {
    data: new SlashCommandBuilder()
        .setName('ask')
        .setDescription('Ask Claude AI a question')
        .addStringOption(option =>
            option
                .setName('question')
                .setDescription('Your question for Claude')
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option
                .setName('private')
                .setDescription('Only show the response to you')
                .setRequired(false)
        ),

    async execute(interaction) {
        const question = interaction.options.getString('question');
        const isPrivate = interaction.options.getBoolean('private') || false;

        await interaction.deferReply({ ephemeral: isPrivate });

        try {
            const answer = await askClaude(question, {
                systemPrompt: `You are a helpful assistant in a Discord server. Keep your responses concise and friendly. If the question is inappropriate or harmful, politely decline to answer. ${DISCORD_FORMAT_PROMPT}`,
            });

            await sendAiReply(interaction, {
                header: {
                    author: {
                        name: `${interaction.user.tag} asked:`,
                        icon_url: interaction.user.displayAvatarURL({ dynamic: true }),
                    },
                    description: question.slice(0, 256) + (question.length > 256 ? '...' : ''),
                    timestamp: new Date().toISOString(),
                },
                body: answer,
                footer: getAiFooter('', { smart: true }),
                ephemeral: isPrivate,
                mode: 'message',
            });
        } catch (error) {
            await logCommandError(interaction, error, 'ask');

            let errorMessage = 'Failed to get a response from Claude AI.';
            if (error.status === 401) {
                errorMessage = 'API key is invalid or not configured.';
            } else if (error.status === 429) {
                errorMessage = 'Rate limited. Please try again later.';
            }

            await interaction.editReply({
                content: `❌ ${errorMessage}`,
            });
        }
    },
};
