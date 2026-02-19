import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';
import Anthropic from '@anthropic-ai/sdk';
import { AI_MODEL, getAiFooter } from '../config/ai.js';

const anthropic = new Anthropic();

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
            const response = await anthropic.messages.create({
                model: AI_MODEL,
                max_tokens: 1024,
                messages: [
                    {
                        role: 'user',
                        content: question,
                    },
                ],
                system: 'You are a helpful assistant in a Discord server. Keep your responses concise and friendly. Use Discord markdown formatting when appropriate. If the question is inappropriate or harmful, politely decline to answer.',
            });

            const answer = response.content[0].text;

            // Split long responses - Discord has a 2000 character limit per message
            if (answer.length > 2000) {
                const chunks = answer.match(/.{1,2000}/gs) || [];

                await interaction.editReply({
                    embeds: [{
                        color: 0x5865F2,
                        author: {
                            name: `${interaction.user.tag} asked:`,
                            icon_url: interaction.user.displayAvatarURL({ dynamic: true }),
                        },
                        description: question.slice(0, 256) + (question.length > 256 ? '...' : ''),
                    }],
                });

                for (let i = 0; i < Math.min(chunks.length, 5); i++) {
                    await interaction.followUp({
                        content: chunks[i],
                        ephemeral: isPrivate,
                    });
                }

                if (chunks.length > 5) {
                    await interaction.followUp({
                        content: '*Response truncated due to length...*',
                        ephemeral: isPrivate,
                    });
                }
            } else {
                await interaction.editReply({
                    embeds: [{
                        color: 0x5865F2,
                        author: {
                            name: `${interaction.user.tag} asked:`,
                            icon_url: interaction.user.displayAvatarURL({ dynamic: true }),
                        },
                        description: question.slice(0, 256) + (question.length > 256 ? '...' : ''),
                        fields: [{
                            name: 'Answer',
                            value: answer.slice(0, 1024),
                        }],
                        footer: getAiFooter(),
                        timestamp: new Date().toISOString(),
                    }],
                });

                // If answer is longer than 1024 chars, send the rest as follow-up(s)
                // Discord's message limit is 2000 characters
                if (answer.length > 1024) {
                    const remaining = answer.slice(1024);
                    const chunks = remaining.match(/.{1,2000}/gs) || [];

                    for (const chunk of chunks) {
                        await interaction.followUp({
                            content: chunk,
                            ephemeral: isPrivate,
                        });
                    }
                }
            }
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
