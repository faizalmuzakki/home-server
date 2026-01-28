import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

const LANGUAGES = [
    { name: 'English', value: 'english' },
    { name: 'Spanish', value: 'spanish' },
    { name: 'French', value: 'french' },
    { name: 'German', value: 'german' },
    { name: 'Italian', value: 'italian' },
    { name: 'Portuguese', value: 'portuguese' },
    { name: 'Russian', value: 'russian' },
    { name: 'Japanese', value: 'japanese' },
    { name: 'Korean', value: 'korean' },
    { name: 'Chinese (Simplified)', value: 'chinese_simplified' },
    { name: 'Chinese (Traditional)', value: 'chinese_traditional' },
    { name: 'Arabic', value: 'arabic' },
    { name: 'Hindi', value: 'hindi' },
    { name: 'Indonesian', value: 'indonesian' },
    { name: 'Dutch', value: 'dutch' },
    { name: 'Polish', value: 'polish' },
    { name: 'Turkish', value: 'turkish' },
    { name: 'Vietnamese', value: 'vietnamese' },
    { name: 'Thai', value: 'thai' },
    { name: 'Swedish', value: 'swedish' },
];

export default {
    data: new SlashCommandBuilder()
        .setName('translate')
        .setDescription('Translate text to another language')
        .addStringOption(option =>
            option
                .setName('text')
                .setDescription('The text to translate')
                .setRequired(true)
        )
        .addStringOption(option => {
            const opt = option
                .setName('to')
                .setDescription('Target language')
                .setRequired(true);
            LANGUAGES.slice(0, 25).forEach(lang => opt.addChoices(lang));
            return opt;
        })
        .addStringOption(option =>
            option
                .setName('from')
                .setDescription('Source language (auto-detect if not specified)')
                .setRequired(false)
                .addChoices(
                    { name: 'Auto-detect', value: 'auto' },
                    ...LANGUAGES.slice(0, 24)
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
        const targetLang = interaction.options.getString('to');
        const sourceLang = interaction.options.getString('from') || 'auto';
        const isPrivate = interaction.options.getBoolean('private') || false;

        await interaction.deferReply({ ephemeral: isPrivate });

        // Format language names nicely
        const formatLang = (lang) => {
            return lang.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
        };

        try {
            const prompt = sourceLang === 'auto'
                ? `Translate the following text to ${formatLang(targetLang)}. First, detect the source language, then provide the translation.\n\nText: ${text}\n\nRespond in this exact format:\nDetected language: [language]\nTranslation: [translated text]`
                : `Translate the following text from ${formatLang(sourceLang)} to ${formatLang(targetLang)}.\n\nText: ${text}\n\nRespond with only the translation, nothing else.`;

            const response = await anthropic.messages.create({
                model: 'claude-3-5-haiku-latest',
                max_tokens: 1000,
                messages: [
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                system: 'You are a professional translator. Provide accurate, natural-sounding translations. Preserve the tone and style of the original text. For idiomatic expressions, translate the meaning rather than word-for-word.',
            });

            const result = response.content[0].text;

            let detectedLang = sourceLang === 'auto' ? null : formatLang(sourceLang);
            let translation = result;

            // Parse detected language if auto-detect was used
            if (sourceLang === 'auto') {
                const detectedMatch = result.match(/Detected language:\s*(.+)/i);
                const translationMatch = result.match(/Translation:\s*([\s\S]+)/i);

                if (detectedMatch) {
                    detectedLang = detectedMatch[1].trim();
                }
                if (translationMatch) {
                    translation = translationMatch[1].trim();
                }
            }

            const embed = {
                color: 0x5865F2,
                title: '🌐 Translation',
                fields: [
                    {
                        name: `Original${detectedLang ? ` (${detectedLang})` : ''}`,
                        value: text.slice(0, 1024),
                        inline: false,
                    },
                    {
                        name: `${formatLang(targetLang)}`,
                        value: translation.slice(0, 1024),
                        inline: false,
                    },
                ],
                footer: {
                    text: 'Powered by Claude AI',
                },
                timestamp: new Date().toISOString(),
            };

            await interaction.editReply({ embeds: [embed] });

            // Handle long translations
            if (translation.length > 1024) {
                await interaction.followUp({
                    content: `**Full translation:**\n${translation}`,
                    ephemeral: isPrivate,
                });
            }
        } catch (error) {
            await logCommandError(interaction, error, 'translate');

            let errorMessage = 'Failed to translate text.';
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
