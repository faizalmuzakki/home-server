import { SlashCommandBuilder } from 'discord.js';

const RESPONSES = [
    // Positive
    { text: 'It is certain.', type: 'positive' },
    { text: 'It is decidedly so.', type: 'positive' },
    { text: 'Without a doubt.', type: 'positive' },
    { text: 'Yes, definitely.', type: 'positive' },
    { text: 'You may rely on it.', type: 'positive' },
    { text: 'As I see it, yes.', type: 'positive' },
    { text: 'Most likely.', type: 'positive' },
    { text: 'Outlook good.', type: 'positive' },
    { text: 'Yes.', type: 'positive' },
    { text: 'Signs point to yes.', type: 'positive' },
    // Neutral
    { text: 'Reply hazy, try again.', type: 'neutral' },
    { text: 'Ask again later.', type: 'neutral' },
    { text: 'Better not tell you now.', type: 'neutral' },
    { text: 'Cannot predict now.', type: 'neutral' },
    { text: 'Concentrate and ask again.', type: 'neutral' },
    // Negative
    { text: "Don't count on it.", type: 'negative' },
    { text: 'My reply is no.', type: 'negative' },
    { text: 'My sources say no.', type: 'negative' },
    { text: 'Outlook not so good.', type: 'negative' },
    { text: 'Very doubtful.', type: 'negative' },
];

const COLORS = {
    positive: 0x57F287,
    neutral: 0xFEE75C,
    negative: 0xED4245,
};

export default {
    data: new SlashCommandBuilder()
        .setName('8ball')
        .setDescription('Ask the magic 8-ball a question')
        .addStringOption(option =>
            option
                .setName('question')
                .setDescription('Your yes/no question')
                .setRequired(true)
        ),

    async execute(interaction) {
        const question = interaction.options.getString('question');
        const response = RESPONSES[Math.floor(Math.random() * RESPONSES.length)];

        const embed = {
            color: COLORS[response.type],
            title: '🎱 Magic 8-Ball',
            fields: [
                {
                    name: 'Question',
                    value: question,
                    inline: false,
                },
                {
                    name: 'Answer',
                    value: `**${response.text}**`,
                    inline: false,
                },
            ],
            footer: {
                text: `Asked by ${interaction.user.tag}`,
            },
            timestamp: new Date().toISOString(),
        };

        await interaction.reply({ embeds: [embed] });
    },
};
