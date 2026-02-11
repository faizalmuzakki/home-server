import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getQueue } from '../utils/musicPlayer.js';

export default {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Show the currently playing song'),

    async execute(interaction) {
        const queue = getQueue(interaction.guildId);

        if (!queue || !queue.playing || queue.songs.length === 0) {
            return interaction.reply({
                content: 'There is no song currently playing!',
                flags: MessageFlags.Ephemeral,
            });
        }

        const song = queue.songs[0];

        await interaction.reply({
            embeds: [{
                color: 0x00ff00,
                title: '🎵 Now Playing',
                description: `**[${song.title}](${song.url})**`,
                thumbnail: song.thumbnail ? { url: song.thumbnail } : undefined,
                fields: [
                    { name: 'Duration', value: song.duration || 'Unknown', inline: true },
                    { name: 'Requested by', value: song.requestedBy || 'Unknown', inline: true },
                    { name: 'Source', value: song.source === 'spotify' ? '🟢 Spotify' : '🔴 YouTube', inline: true },
                    { name: 'Loop', value: queue.loop ? '🔁 Enabled' : '❌ Disabled', inline: true },
                    { name: 'Queue', value: `${queue.songs.length} song(s)`, inline: true },
                ],
            }],
        });
    },
};
