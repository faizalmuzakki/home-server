import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getQueue, getCurrentPlaybackTime, createProgressBar } from '../utils/musicPlayer.js';

export default {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Show the currently playing song and playback progress'),

    async execute(interaction) {
        const queue = getQueue(interaction.guildId);

        if (!queue || !queue.playing || queue.songs.length === 0) {
            return interaction.reply({
                content: 'There is no song currently playing!',
                flags: MessageFlags.Ephemeral,
            });
        }

        const song = queue.songs[0];
        const currentSeconds = getCurrentPlaybackTime(queue);
        const progressBar = createProgressBar(currentSeconds, song.durationInSec);

        const sourceLabel = song.source === 'spotify' ? '🟢 Spotify'
            : song.source === 'soundcloud' ? '🟠 SoundCloud'
            : song.source === 'bandcamp' ? '🔵 Bandcamp'
            : '🔴 YouTube';

        const nextSong = queue.songs[1];

        const fields = [
            { name: 'Progress', value: progressBar, inline: false },
            { name: 'Requested by', value: song.requestedBy || 'Unknown', inline: true },
            { name: 'Source', value: sourceLabel, inline: true },
            { name: 'Volume', value: `🔊 ${queue.volume}%`, inline: true },
            { name: 'Loop', value: queue.loop ? '🔁 Enabled' : '❌ Disabled', inline: true },
            { name: 'Queue', value: `${queue.songs.length} song(s)`, inline: true },
        ];

        if (nextSong) {
            fields.push({
                name: 'Next Up',
                value: `**[${nextSong.title}](${nextSong.url})** [${nextSong.duration}]`,
                inline: false,
            });
        }

        await interaction.reply({
            embeds: [{
                color: 0x00ff00,
                title: '🎵 Now Playing',
                description: `**[${song.title}](${song.url})**`,
                thumbnail: song.thumbnail ? { url: song.thumbnail } : undefined,
                fields,
            }],
        });
    },
};
