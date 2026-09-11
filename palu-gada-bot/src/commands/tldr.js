import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';
import { askClaude } from '../utils/claudeApi.js';
import { getAiFooter, DISCORD_FORMAT_PROMPT } from '../config/ai.js';
import { sendAiReply } from '../utils/aiReply.js';

export default {
    data: new SlashCommandBuilder()
        .setName('tldr')
        .setDescription('Get a TL;DR summary of text or a URL')
        .addStringOption(option =>
            option
                .setName('text')
                .setDescription('The text or URL to summarize')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('style')
                .setDescription('Summary style')
                .setRequired(false)
                .addChoices(
                    { name: 'Bullet Points', value: 'bullets' },
                    { name: 'One Sentence', value: 'sentence' },
                    { name: 'Short Paragraph', value: 'paragraph' },
                    { name: 'Key Takeaways', value: 'takeaways' }
                )
        )
        .addBooleanOption(option =>
            option
                .setName('private')
                .setDescription('Only show the response to you')
                .setRequired(false)
        ),

    async execute(interaction) {
        const text = interaction.options.getString('text');
        const style = interaction.options.getString('style') || 'bullets';
        const isPrivate = interaction.options.getBoolean('private') || false;

        await interaction.deferReply({ ephemeral: isPrivate });

        const styleInstructions = {
            bullets: 'Summarize in 3-5 bullet points. Each bullet should capture a key point.',
            sentence: 'Summarize in exactly one clear, comprehensive sentence.',
            paragraph: 'Summarize in a short paragraph (2-3 sentences max).',
            takeaways: 'List the 3-5 most important takeaways or action items.',
        };

        // Check if it's a URL
        const urlRegex = /^https?:\/\/[^\s]+$/;
        const isUrl = urlRegex.test(text.trim());

        try {
            let contentToSummarize = text;

            if (isUrl) {
                // Note: For URLs, we'll just ask Claude to acknowledge it's a URL
                // In production, you might want to use a web scraping service
                contentToSummarize = `This is a URL that the user wants summarized: ${text}\n\nPlease note that I cannot directly access URLs. Please provide the actual text content you'd like me to summarize, or describe what you know about this page.`;
            }

            const summary = await askClaude(`${styleInstructions[style]}\n\nText to summarize:\n${contentToSummarize}`, {
                systemPrompt: `You are an expert at summarizing content. Be concise and capture the essential information. If the content is too short or unclear to summarize meaningfully, say so politely. ${DISCORD_FORMAT_PROMPT}`,
            });

            const styleLabels = {
                bullets: 'Bullet Points',
                sentence: 'One Sentence',
                paragraph: 'Short Paragraph',
                takeaways: 'Key Takeaways',
            };

            const header = {
                title: '📝 TL;DR',
                timestamp: new Date().toISOString(),
            };
            if (!isUrl && text.length > 100) {
                header.fields = [{
                    name: 'Original (preview)',
                    value: text.slice(0, 200) + (text.length > 200 ? '...' : ''),
                    inline: false,
                }];
            }

            await sendAiReply(interaction, {
                header,
                body: summary,
                footer: getAiFooter(`Style: ${styleLabels[style]}`),
                ephemeral: isPrivate,
                mode: 'message',
            });
        } catch (error) {
            await logCommandError(interaction, error, 'tldr');

            let errorMessage = 'Failed to generate summary.';
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
