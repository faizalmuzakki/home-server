import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong! (and latency)'),
    async execute(interaction) {
        const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
        interaction.editReply(`Pong! 🏓\nLatency is ${sent.createdTimestamp - interaction.createdTimestamp}ms.\nAPI Latency is ${Math.round(interaction.client.ws.ping)}ms`);
    },
};
