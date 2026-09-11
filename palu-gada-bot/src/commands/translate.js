import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';
import { askClaude } from '../utils/claudeApi.js';
import { getAiFooter, DISCORD_FORMAT_PROMPT } from '../config/ai.js';
import { chunkForDiscord } from '../utils/discordChunker.js';
import { toDiscordMarkdown } from '../utils/discordMarkdown.js';

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

            const result = await askClaude(prompt, {
                systemPrompt: `You are a professional translator. Provide accurate, natural-sounding translations. Preserve the tone and style of the original text. For idiomatic expressions, translate the meaning rather than word-for-word. ${DISCORD_FORMAT_PROMPT}`,
            });

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

            // The embed field is the primary rendering for any translation
            // that fits, so it has to be converted like everything else --
            // a heading or table in a short translation used to render as
            // literal syntax, the exact bug this converter exists to fix.
            // Embeds render no headings at all, hence 'bold'.
            const embedTranslation = toDiscordMarkdown(translation, { headings: 'bold' });

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
                        value: embedTranslation.slice(0, 1024),
                        inline: false,
                    },
                ],
                footer: getAiFooter(),
                timestamp: new Date().toISOString(),
            };

            await interaction.editReply({ embeds: [embed] });

            // Handle long translations
            if (translation.length > 1024) {
                // This one lands in message content, not an embed, and
                // Discord renders `#` headings there, so keep them.
                const full = toDiscordMarkdown(translation, { headings: 'keep' });
                const chunks = chunkForDiscord(`**Full translation:**\n${full}`, { limit: 2000 });
                for (const chunk of chunks.slice(0, 5)) {
                    await interaction.followUp({ content: chunk, ephemeral: isPrivate });
                }
                // Say so rather than dropping the tail silently, matching
                // how /fallacy reports omitted findings.
                if (chunks.length > 5) {
                    await interaction.followUp({
                        content: '*Translation truncated due to length…*',
                        ephemeral: isPrivate,
                    });
                }
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
