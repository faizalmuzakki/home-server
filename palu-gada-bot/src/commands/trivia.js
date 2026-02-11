import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';

const CATEGORIES = {
    general: 9,
    books: 10,
    film: 11,
    music: 12,
    theatre: 13,
    television: 14,
    video_games: 15,
    board_games: 16,
    science_nature: 17,
    computers: 18,
    math: 19,
    mythology: 20,
    sports: 21,
    geography: 22,
    history: 23,
    politics: 24,
    art: 25,
    celebrities: 26,
    animals: 27,
    vehicles: 28,
    comics: 29,
    anime_manga: 31,
    cartoons: 32,
};

function decodeHTML(text) {
    const entities = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#039;': "'",
        '&apos;': "'",
        '&ldquo;': '"',
        '&rdquo;': '"',
        '&lsquo;': "'",
        '&rsquo;': "'",
        '&hellip;': '...',
        '&ndash;': '-',
        '&mdash;': '-',
        '&eacute;': 'é',
        '&Eacute;': 'É',
    };

    return text.replace(/&[#\w]+;/g, entity => entities[entity] || entity);
}

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

export default {
    data: new SlashCommandBuilder()
        .setName('trivia')
        .setDescription('Play a trivia game')
        .addStringOption(option =>
            option
                .setName('category')
                .setDescription('Trivia category')
                .setRequired(false)
                .addChoices(
                    { name: 'Any Category', value: 'any' },
                    { name: 'General Knowledge', value: 'general' },
                    { name: 'Science & Nature', value: 'science_nature' },
                    { name: 'Computers', value: 'computers' },
                    { name: 'Video Games', value: 'video_games' },
                    { name: 'Film', value: 'film' },
                    { name: 'Music', value: 'music' },
                    { name: 'Television', value: 'television' },
                    { name: 'History', value: 'history' },
                    { name: 'Geography', value: 'geography' },
                    { name: 'Sports', value: 'sports' },
                    { name: 'Anime & Manga', value: 'anime_manga' },
                    { name: 'Animals', value: 'animals' },
                    { name: 'Mythology', value: 'mythology' },
                    { name: 'Art', value: 'art' }
                )
        )
        .addStringOption(option =>
            option
                .setName('difficulty')
                .setDescription('Question difficulty')
                .setRequired(false)
                .addChoices(
                    { name: 'Any', value: 'any' },
                    { name: 'Easy', value: 'easy' },
                    { name: 'Medium', value: 'medium' },
                    { name: 'Hard', value: 'hard' }
                )
        ),

    async execute(interaction) {
        const category = interaction.options.getString('category') || 'any';
        const difficulty = interaction.options.getString('difficulty') || 'any';

        await interaction.deferReply();

        try {
            // Build API URL
            let url = 'https://opentdb.com/api.php?amount=1&type=multiple';
            if (category !== 'any') {
                url += `&category=${CATEGORIES[category]}`;
            }
            if (difficulty !== 'any') {
                url += `&difficulty=${difficulty}`;
            }

            const response = await fetch(url);
            const data = await response.json();

            if (data.response_code !== 0 || !data.results || data.results.length === 0) {
                throw new Error('No trivia questions available');
            }

            const question = data.results[0];
            const correctAnswer = decodeHTML(question.correct_answer);
            const incorrectAnswers = question.incorrect_answers.map(a => decodeHTML(a));
            const allAnswers = shuffleArray([correctAnswer, ...incorrectAnswers]);

            const correctIndex = allAnswers.indexOf(correctAnswer);
            const answerLabels = ['A', 'B', 'C', 'D'];

            const difficultyColors = {
                easy: 0x57F287,
                medium: 0xFEE75C,
                hard: 0xED4245,
            };

            const difficultyPoints = {
                easy: 10,
                medium: 20,
                hard: 30,
            };

            const embed = {
                color: difficultyColors[question.difficulty],
                title: '🎯 Trivia Time!',
                description: decodeHTML(question.question),
                fields: [
                    {
                        name: 'Category',
                        value: decodeHTML(question.category),
                        inline: true,
                    },
                    {
                        name: 'Difficulty',
                        value: question.difficulty.charAt(0).toUpperCase() + question.difficulty.slice(1),
                        inline: true,
                    },
                    {
                        name: 'Points',
                        value: `${difficultyPoints[question.difficulty]}`,
                        inline: true,
                    },
                    {
                        name: 'Answers',
                        value: allAnswers.map((a, i) => `**${answerLabels[i]}.** ${a}`).join('\n'),
                        inline: false,
                    },
                ],
                footer: {
                    text: 'You have 30 seconds to answer!',
                },
            };

            // Create answer buttons
            const row = new ActionRowBuilder()
                .addComponents(
                    answerLabels.map((label, i) =>
                        new ButtonBuilder()
                            .setCustomId(`trivia_${interaction.id}_${i}`)
                            .setLabel(label)
                            .setStyle(ButtonStyle.Primary)
                    )
                );

            const message = await interaction.editReply({
                embeds: [embed],
                components: [row],
            });

            // Track who has answered
            const answered = new Set();

            // Create collector
            const collector = message.createMessageComponentCollector({
                filter: i => i.customId.startsWith(`trivia_${interaction.id}_`),
                time: 30000,
            });

            collector.on('collect', async i => {
                if (answered.has(i.user.id)) {
                    await i.reply({
                        content: 'You already answered!',
                        flags: MessageFlags.Ephemeral,
                    });
                    return;
                }

                answered.add(i.user.id);
                const selectedIndex = parseInt(i.customId.split('_').pop());
                const isCorrect = selectedIndex === correctIndex;

                if (isCorrect) {
                    await i.reply({
                        content: `✅ **${i.user.tag}** got it right! (+${difficultyPoints[question.difficulty]} points)`,
                    });
                } else {
                    await i.reply({
                        content: `❌ **${i.user.tag}** answered **${answerLabels[selectedIndex]}** - Wrong!`,
                    });
                }
            });

            collector.on('end', async () => {
                // Show correct answer
                embed.fields.push({
                    name: '✅ Correct Answer',
                    value: `**${answerLabels[correctIndex]}.** ${correctAnswer}`,
                    inline: false,
                });

                // Disable all buttons and highlight correct answer
                const disabledRow = new ActionRowBuilder()
                    .addComponents(
                        answerLabels.map((label, i) =>
                            new ButtonBuilder()
                                .setCustomId(`trivia_${interaction.id}_${i}`)
                                .setLabel(label)
                                .setStyle(i === correctIndex ? ButtonStyle.Success : ButtonStyle.Secondary)
                                .setDisabled(true)
                        )
                    );

                embed.footer = {
                    text: `Time's up! ${answered.size} player(s) answered.`,
                };

                try {
                    await message.edit({
                        embeds: [embed],
                        components: [disabledRow],
                    });
                } catch (e) {
                    // Message might have been deleted
                }
            });
        } catch (error) {
            await logCommandError(interaction, error, 'trivia');
            await interaction.editReply({
                content: 'Failed to fetch trivia question. Please try again later.',
            });
        }
    },
};
