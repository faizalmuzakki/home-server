import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getQueue, deleteQueue } from '../utils/musicPlayer.js';

export default {
    data: new SlashCommandBuilder()
        .setName('leave')
        .setDescription('Make the bot leave the voice channel'),

    async execute(interaction) {
        const queue = getQueue(interaction.guildId);

        if (!queue) {
            return interaction.reply({
                content: 'I am not in a voice channel!',
                flags: MessageFlags.Ephemeral,
            });
        }

        const member = interaction.member;
        if (!member.voice.channel || member.voice.channel.id !== queue.voiceChannel.id) {
            return interaction.reply({
                content: 'You need to be in the same voice channel as the bot!',
                flags: MessageFlags.Ephemeral,
            });
        }

        deleteQueue(interaction.guildId);

        await interaction.reply({
            embeds: [{
                color: 0xff0000,
                title: '👋 Goodbye',
                description: 'Left the voice channel. See you later!',
            }],
        });
    },
};
