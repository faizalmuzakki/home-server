import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';
import {
    getQueue,
    createQueue,
    getSongInfo,
    connectToChannel,
    playSong,
} from '../utils/musicPlayer.js';

export default {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song from YouTube or Spotify')
        .addStringOption(option =>
            option
                .setName('query')
                .setDescription('YouTube/Spotify URL or search query')
                .setRequired(true)
        ),

    async execute(interaction) {
        const query = interaction.options.getString('query');
        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        // Check if user is in a voice channel
        if (!voiceChannel) {
            return interaction.reply({
                content: 'You need to be in a voice channel to play music!',
                flags: MessageFlags.Ephemeral,
            });
        }

        // Check bot permissions
        const permissions = voiceChannel.permissionsFor(interaction.client.user);
        if (!permissions.has('Connect') || !permissions.has('Speak')) {
            return interaction.reply({
                content: 'I need permissions to join and speak in your voice channel!',
                flags: MessageFlags.Ephemeral,
            });
        }

        await interaction.deferReply();

        try {
            // Get song info
            const songInfo = await getSongInfo(query);

            // Get or create queue
            let queue = getQueue(interaction.guildId);

            if (!queue) {
                queue = createQueue(interaction.guildId, voiceChannel, interaction.channel);

                // Connect to voice channel
                queue.connection = await connectToChannel(voiceChannel);
            }

            // Handle playlist/album
            if (Array.isArray(songInfo)) {
                // Add all songs to queue
                for (const song of songInfo) {
                    song.requestedBy = interaction.user.tag;
                    queue.songs.push(song);
                }

                await interaction.editReply({
                    embeds: [{
                        color: 0x00ff00,
                        title: '🎶 Playlist Added',
                        description: `Added **${songInfo.length}** songs to the queue`,
                        fields: [
                            { name: 'Requested by', value: interaction.user.tag, inline: true },
                            { name: 'Queue length', value: `${queue.songs.length} songs`, inline: true },
                        ],
                    }],
                });

                // Start playing if not already
                if (!queue.playing) {
                    playSong(queue);
                }

                return;
            }

            // Single song
            songInfo.requestedBy = interaction.user.tag;
            queue.songs.push(songInfo);

            if (queue.songs.length === 1 && !queue.playing) {
                // Start playing immediately
                await interaction.editReply({
                    embeds: [{
                        color: 0x00ff00,
                        title: '🎵 Added to Queue',
                        description: `**[${songInfo.title}](${songInfo.url})**`,
                        thumbnail: songInfo.thumbnail ? { url: songInfo.thumbnail } : undefined,
                        fields: [
                            { name: 'Duration', value: songInfo.duration || 'Unknown', inline: true },
                            { name: 'Position', value: 'Now playing', inline: true },
                        ],
                    }],
                });
                playSong(queue);
            } else {
                // Added to queue
                await interaction.editReply({
                    embeds: [{
                        color: 0x00ff00,
                        title: '🎵 Added to Queue',
                        description: `**[${songInfo.title}](${songInfo.url})**`,
                        thumbnail: songInfo.thumbnail ? { url: songInfo.thumbnail } : undefined,
                        fields: [
                            { name: 'Duration', value: songInfo.duration || 'Unknown', inline: true },
                            { name: 'Position', value: `#${queue.songs.length}`, inline: true },
                        ],
                    }],
                });
            }
        } catch (error) {
            await logCommandError(interaction, error, 'play');
            await interaction.editReply({
                content: `Error: ${error.message}`,
            });
        }
    },
};
