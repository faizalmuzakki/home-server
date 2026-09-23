import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getQueue, getTotalQueueDuration, getCurrentPlaybackTime, formatDuration } from '../utils/musicPlayer.js';

export default {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show the current music queue and total duration')
        .addIntegerOption(option =>
            option
                .setName('page')
                .setDescription('Page number')
                .setMinValue(1)
        ),

    async execute(interaction) {
        const queue = getQueue(interaction.guildId);

        if (!queue || queue.songs.length === 0) {
            return interaction.reply({
                content: 'The queue is empty!',
                flags: MessageFlags.Ephemeral,
            });
        }

        const page = interaction.options.getInteger('page') || 1;
        const songsPerPage = 10;
        const totalPages = Math.max(1, Math.ceil(queue.songs.length / songsPerPage));
        const currentPage = Math.min(Math.max(1, page), totalPages);

        const startIndex = (currentPage - 1) * songsPerPage;
        const endIndex = Math.min(startIndex + songsPerPage, queue.songs.length);

        const currentSong = queue.songs[0];
        const currentElapsed = getCurrentPlaybackTime(queue);
        const totalDuration = getTotalQueueDuration(queue);

        const queueList = queue.songs
            .slice(startIndex, endIndex)
            .map((song, index) => {
                const position = startIndex + index;
                const prefix = position === 0 ? '▶️' : `${position}.`;
                return `${prefix} **[${song.title}](${song.url})** [${song.duration}]`;
            })
            .join('\n');

        await interaction.reply({
            embeds: [{
                color: 0x0099ff,
                title: '🎶 Music Queue',
                description: queueList,
                fields: [
                    {
                        name: 'Now Playing',
                        value: `**${currentSong.title}** [${formatDuration(currentElapsed)} / ${currentSong.duration}]`,
                        inline: false,
                    },
                    {
                        name: 'Total Songs',
                        value: `${queue.songs.length} song(s)`,
                        inline: true,
                    },
                    {
                        name: 'Total Duration',
                        value: `⏱️ ${totalDuration}`,
                        inline: true,
                    },
                    {
                        name: 'Loop',
                        value: queue.loop ? '🔁 Enabled' : '❌ Disabled',
                        inline: true,
                    },
                ],
                footer: {
                    text: `Page ${currentPage}/${totalPages} • Use /skipto <pos> to jump to a song`,
                },
            }],
        });
    },
};
