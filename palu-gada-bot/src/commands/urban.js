import { SlashCommandBuilder } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';

const URBAN_API_URL = 'https://api.urbandictionary.com/v0/define';

export default {
    data: new SlashCommandBuilder()
        .setName('urban')
        .setDescription('Look up a word on Urban Dictionary')
        .addStringOption(option =>
            option
                .setName('term')
                .setDescription('The word or phrase to look up')
                .setRequired(true)
        ),

    async execute(interaction) {
        const term = interaction.options.getString('term');

        await interaction.deferReply();

        try {
            const response = await fetch(`${URBAN_API_URL}?term=${encodeURIComponent(term)}`);

            if (!response.ok) {
                throw new Error('Failed to fetch from Urban Dictionary');
            }

            const data = await response.json();

            if (!data.list || data.list.length === 0) {
                return interaction.editReply({
                    embeds: [{
                        color: 0xff0000,
                        title: '📖 Urban Dictionary',
                        description: `No definitions found for **${term}**`,
                    }],
                });
            }

            // Get the top definition
            const definition = data.list[0];

            // Clean up the definition and example (Urban Dictionary uses [brackets] for links)
            const cleanDefinition = definition.definition
                .replace(/\[/g, '')
                .replace(/\]/g, '')
                .slice(0, 1024); // Discord embed field limit

            const cleanExample = definition.example
                ? definition.example
                    .replace(/\[/g, '')
                    .replace(/\]/g, '')
                    .slice(0, 1024)
                : 'No example provided';

            await interaction.editReply({
                embeds: [{
                    color: 0x1D2439, // Urban Dictionary's brand color
                    title: `📖 ${definition.word}`,
                    url: definition.permalink,
                    description: cleanDefinition,
                    fields: [
                        {
                            name: '📝 Example',
                            value: cleanExample,
                            inline: false,
                        },
                        {
                            name: '👍 Upvotes',
                            value: `${definition.thumbs_up.toLocaleString()}`,
                            inline: true,
                        },
                        {
                            name: '👎 Downvotes',
                            value: `${definition.thumbs_down.toLocaleString()}`,
                            inline: true,
                        },
                    ],
                    footer: {
                        text: `Written by ${definition.author} • ${new Date(definition.written_on).toLocaleDateString()}`,
                    },
                }],
            });
        } catch (error) {
            await logCommandError(interaction, error, 'urban');
            await interaction.editReply({
                content: `Error looking up definition: ${error.message}`,
            });
        }
    },
};
