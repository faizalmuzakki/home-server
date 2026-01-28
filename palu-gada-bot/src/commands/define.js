import { SlashCommandBuilder } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('define')
        .setDescription('Get the definition of a word')
        .addStringOption(option =>
            option
                .setName('word')
                .setDescription('The word to define')
                .setRequired(true)
        ),

    async execute(interaction) {
        const word = interaction.options.getString('word').toLowerCase().trim();

        await interaction.deferReply();

        try {
            // Use Free Dictionary API
            const response = await fetch(
                `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
            );

            if (!response.ok) {
                if (response.status === 404) {
                    return interaction.editReply({
                        content: `No definition found for **${word}**.`,
                    });
                }
                throw new Error('API error');
            }

            const data = await response.json();
            const entry = data[0];

            if (!entry) {
                return interaction.editReply({
                    content: `No definition found for **${word}**.`,
                });
            }

            // Get phonetics
            const phonetic = entry.phonetic ||
                entry.phonetics?.find(p => p.text)?.text ||
                '';

            // Get audio URL
            const audioUrl = entry.phonetics?.find(p => p.audio)?.audio || '';

            // Build definitions
            const meanings = entry.meanings.slice(0, 3); // Limit to 3 parts of speech

            const embed = {
                color: 0x5865F2,
                title: `📖 ${entry.word}`,
                description: phonetic ? `*${phonetic}*` : undefined,
                fields: [],
                footer: {
                    text: 'Source: Free Dictionary API',
                },
                timestamp: new Date().toISOString(),
            };

            for (const meaning of meanings) {
                const definitions = meaning.definitions.slice(0, 2); // Limit to 2 definitions per part of speech

                let definitionText = definitions.map((def, i) => {
                    let text = `${i + 1}. ${def.definition}`;
                    if (def.example) {
                        text += `\n   *"${def.example}"*`;
                    }
                    return text;
                }).join('\n\n');

                // Add synonyms if available
                if (meaning.synonyms && meaning.synonyms.length > 0) {
                    const syns = meaning.synonyms.slice(0, 5).join(', ');
                    definitionText += `\n\n**Synonyms:** ${syns}`;
                }

                embed.fields.push({
                    name: meaning.partOfSpeech.charAt(0).toUpperCase() + meaning.partOfSpeech.slice(1),
                    value: definitionText.slice(0, 1024),
                    inline: false,
                });
            }

            // Add origin if available
            if (entry.origin) {
                embed.fields.push({
                    name: '📜 Origin',
                    value: entry.origin.slice(0, 1024),
                    inline: false,
                });
            }

            // Add audio link if available
            if (audioUrl) {
                embed.description = (embed.description || '') + `\n🔊 [Listen to pronunciation](${audioUrl})`;
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            await logCommandError(interaction, error, 'define');
            await interaction.editReply({
                content: 'Failed to fetch definition. Please try again later.',
            });
        }
    },
};
