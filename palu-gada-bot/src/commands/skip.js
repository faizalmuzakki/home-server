import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getQueue, skipSong } from '../utils/musicPlayer.js';

export default {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the current song'),

    async execute(interaction) {
        const queue = getQueue(interaction.guildId);

        if (!queue || !queue.playing) {
            return interaction.reply({
                content: 'There is no song currently playing!',
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

        const skippedSong = queue.songs[0];
        skipSong(queue);

        await interaction.reply({
            embeds: [{
                color: 0xffff00,
                title: '⏭️ Skipped',
                description: `Skipped **${skippedSong?.title || 'Unknown'}**`,
            }],
        });
    },
};
