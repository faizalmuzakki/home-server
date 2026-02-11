import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';

const JOKE_APIS = {
    programming: 'https://v2.jokeapi.dev/joke/Programming?safe-mode',
    misc: 'https://v2.jokeapi.dev/joke/Miscellaneous?safe-mode',
    pun: 'https://v2.jokeapi.dev/joke/Pun?safe-mode',
    dark: 'https://v2.jokeapi.dev/joke/Dark?safe-mode',
    any: 'https://v2.jokeapi.dev/joke/Any?safe-mode',
};

export default {
    data: new SlashCommandBuilder()
        .setName('joke')
        .setDescription('Get a random joke')
        .addStringOption(option =>
            option
                .setName('category')
                .setDescription('Joke category')
                .setRequired(false)
                .addChoices(
                    { name: 'Any', value: 'any' },
                    { name: 'Programming', value: 'programming' },
                    { name: 'Miscellaneous', value: 'misc' },
                    { name: 'Pun', value: 'pun' },
                    { name: 'Dark (be warned)', value: 'dark' }
                )
        ),

    async execute(interaction) {
        const category = interaction.options.getString('category') || 'any';

        await interaction.deferReply();

        try {
            const response = await fetch(JOKE_APIS[category]);

            if (!response.ok) {
                throw new Error('Failed to fetch joke');
            }

            const joke = await response.json();

            if (joke.error) {
                throw new Error(joke.message || 'Joke API error');
            }

            const embed = {
                color: 0xFEE75C,
                title: '😂 Joke',
                footer: {
                    text: `Category: ${joke.category} | ID: ${joke.id}`,
                },
                timestamp: new Date().toISOString(),
            };

            if (joke.type === 'single') {
                // Single-line joke
                embed.description = joke.joke;
                await interaction.editReply({ embeds: [embed] });
            } else {
                // Two-part joke (setup + delivery)
                embed.description = joke.setup;

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`joke_reveal_${interaction.id}`)
                            .setLabel('Reveal Punchline')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('🥁')
                    );

                const message = await interaction.editReply({
                    embeds: [embed],
                    components: [row],
                });

                // Set up collector for the button
                const collector = message.createMessageComponentCollector({
                    filter: i => i.customId === `joke_reveal_${interaction.id}`,
                    time: 60000,
                    max: 1,
                });

                collector.on('collect', async i => {
                    embed.fields = [{
                        name: '🥁 Punchline',
                        value: joke.delivery,
                    }];

                    const disabledRow = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`joke_reveal_${interaction.id}`)
                                .setLabel('Punchline Revealed!')
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(true)
                        );

                    await i.update({
                        embeds: [embed],
                        components: [disabledRow],
                    });
                });

                collector.on('end', async (collected, reason) => {
                    if (reason === 'time' && collected.size === 0) {
                        // Auto-reveal after timeout
                        embed.fields = [{
                            name: '🥁 Punchline',
                            value: joke.delivery,
                        }];

                        try {
                            await message.edit({
                                embeds: [embed],
                                components: [],
                            });
                        } catch (e) {
                            // Message might have been deleted
                        }
                    }
                });
            }
        } catch (error) {
            await logCommandError(interaction, error, 'joke');
            await interaction.editReply({
                content: 'Failed to fetch a joke. Please try again later.',
            });
        }
    },
};
