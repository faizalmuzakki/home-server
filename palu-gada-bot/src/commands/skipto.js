import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getQueue, skipToTrack } from '../utils/musicPlayer.js';

export default {
    data: new SlashCommandBuilder()
        .setName('skipto')
        .setDescription('Skip directly to a specific song in the queue')
        .addIntegerOption(option =>
            option
                .setName('position')
                .setDescription('The queue position to jump to (e.g. 2, 3...)')
                .setRequired(true)
                .setMinValue(1)
        ),

    async execute(interaction) {
        const queue = getQueue(interaction.guildId);

        if (!queue || !queue.playing || queue.songs.length === 0) {
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

        const position = interaction.options.getInteger('position');

        if (position >= queue.songs.length) {
            return interaction.reply({
                content: `Invalid position! The queue currently has ${queue.songs.length} song(s).`,
                flags: MessageFlags.Ephemeral,
            });
        }

        const targetSong = queue.songs[position];
        const success = skipToTrack(queue, position);

        if (!success) {
            return interaction.reply({
                content: 'Failed to skip to the specified position.',
                flags: MessageFlags.Ephemeral,
            });
        }

        await interaction.reply({
            embeds: [{
                color: 0xffff00,
                title: '⏭️ Skipped To',
                description: `Jumping to **#${position} [${targetSong.title}](${targetSong.url})**`,
            }],
        });
    },
};
