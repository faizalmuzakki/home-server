import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getQueue, shuffleQueue } from '../utils/musicPlayer.js';

export default {
    data: new SlashCommandBuilder()
        .setName('shuffle')
        .setDescription('Shuffle the queue'),

    async execute(interaction) {
        const queue = getQueue(interaction.guildId);

        if (!queue || queue.songs.length <= 1) {
            return interaction.reply({
                content: 'Not enough songs in the queue to shuffle!',
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

        shuffleQueue(queue);

        await interaction.reply({
            embeds: [{
                color: 0x00ff00,
                title: '🔀 Shuffled',
                description: `Shuffled **${queue.songs.length}** songs in the queue!`,
            }],
        });
    },
};
