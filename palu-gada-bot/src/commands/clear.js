import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getQueue, clearQueue } from '../utils/musicPlayer.js';

export default {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Clear the music queue'),

    async execute(interaction) {
        const queue = getQueue(interaction.guildId);

        if (!queue || queue.songs.length === 0) {
            return interaction.reply({
                content: 'The queue is already empty!',
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

        const songCount = queue.songs.length;
        clearQueue(queue);

        await interaction.reply({
            embeds: [{
                color: 0xff0000,
                title: '🗑️ Queue Cleared',
                description: `Cleared **${songCount}** song(s) from the queue!`,
            }],
        });
    },
};
