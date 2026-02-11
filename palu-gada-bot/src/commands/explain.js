import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export default {
    data: new SlashCommandBuilder()
        .setName('explain')
        .setDescription('Get an explanation of a concept or topic')
        .addStringOption(option =>
            option
                .setName('topic')
                .setDescription('The topic or concept to explain')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('level')
                .setDescription('Explanation level')
                .setRequired(false)
                .addChoices(
                    { name: 'ELI5 (Explain Like I\'m 5)', value: 'eli5' },
                    { name: 'Beginner', value: 'beginner' },
                    { name: 'Intermediate', value: 'intermediate' },
                    { name: 'Advanced', value: 'advanced' },
                    { name: 'Expert', value: 'expert' }
                )
        )
        .addBooleanOption(option =>
            option
                .setName('private')
                .setDescription('Only show the response to you')
                .setRequired(false)
        ),

    async execute(interaction) {
        const topic = interaction.options.getString('topic');
        const level = interaction.options.getString('level') || 'beginner';
        const isPrivate = interaction.options.getBoolean('private') || false;

        await interaction.deferReply({ ephemeral: isPrivate });

        const levelInstructions = {
            eli5: 'Explain this like I\'m 5 years old. Use very simple words, analogies to everyday things a child would understand, and short sentences.',
            beginner: 'Explain this for someone completely new to the topic. Avoid jargon and use simple analogies.',
            intermediate: 'Explain this for someone with basic knowledge. You can use some technical terms but explain them.',
            advanced: 'Explain this for someone with good knowledge of the field. You can use technical terms freely.',
            expert: 'Explain this at an expert level with technical depth and nuance.',
        };

        try {
            const response = await anthropic.messages.create({
                model: 'claude-3-5-haiku-latest',
                max_tokens: 1500,
                messages: [
                    {
                        role: 'user',
                        content: `${levelInstructions[level]}\n\nTopic to explain: ${topic}`,
                    },
                ],
                system: 'You are an expert educator who excels at explaining complex topics. Use Discord markdown formatting for better readability (bold, italics, bullet points, code blocks where appropriate). Keep explanations focused and well-structured.',
            });

            const explanation = response.content[0].text;

            const levelLabels = {
                eli5: 'ELI5',
                beginner: 'Beginner',
                intermediate: 'Intermediate',
                advanced: 'Advanced',
                expert: 'Expert',
            };

            const embed = {
                color: 0x5865F2,
                title: `📚 ${topic}`,
                description: explanation.slice(0, 4096),
                fields: [],
                footer: {
                    text: `Level: ${levelLabels[level]} • Powered by Claude AI`,
                },
                timestamp: new Date().toISOString(),
            };

            await interaction.editReply({ embeds: [embed] });

            // If explanation is longer, send follow-up
            if (explanation.length > 4096) {
                await interaction.followUp({
                    content: explanation.slice(4096),
                    ephemeral: isPrivate,
                });
            }
        } catch (error) {
            await logCommandError(interaction, error, 'explain');

            let errorMessage = 'Failed to get an explanation from Claude AI.';
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
