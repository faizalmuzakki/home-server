import {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    getVoiceConnection,
} from '@discordjs/voice';
import play from 'play-dl';

// Store queues for each guild
const queues = new Map();

/**
 * Get or create a queue for a guild
 */
export function getQueue(guildId) {
    return queues.get(guildId);
}

/**
 * Create a new queue for a guild
 */
export function createQueue(guildId, voiceChannel, textChannel) {
    const queue = {
        guildId,
        voiceChannel,
        textChannel,
        connection: null,
        player: null,
        songs: [],
        volume: 100,
        playing: false,
        loop: false,
    };

    queues.set(guildId, queue);
    return queue;
}

/**
 * Delete the queue for a guild
 */
export function deleteQueue(guildId) {
    const queue = queues.get(guildId);
    if (queue) {
        if (queue.player) {
            queue.player.stop();
        }
        if (queue.connection) {
            queue.connection.destroy();
        }
        queues.delete(guildId);
    }
}

/**
 * Parse a URL and get song info
 */
export async function getSongInfo(query) {
    try {
        // Check if it's a Spotify URL
        if (play.is_expired()) {
            await play.refreshToken();
        }

        // Spotify URL
        if (query.includes('spotify.com')) {
            const spotifyType = play.sp_validate(query);

            if (spotifyType === 'track') {
                const spotifyData = await play.spotify(query);
                // Search for the song on YouTube
                const searched = await play.search(`${spotifyData.name} ${spotifyData.artists[0]?.name || ''}`, {
                    limit: 1,
                    source: { youtube: 'video' },
                });

                if (searched.length === 0) {
                    throw new Error('Could not find this Spotify track on YouTube');
                }

                return {
                    title: spotifyData.name,
                    url: searched[0].url,
                    duration: formatDuration(searched[0].durationInSec),
                    thumbnail: spotifyData.thumbnail?.url || searched[0].thumbnails[0]?.url,
                    requestedBy: null,
                    source: 'spotify',
                };
            } else if (spotifyType === 'playlist' || spotifyType === 'album') {
                const spotifyPlaylist = await play.spotify(query);
                const tracks = await spotifyPlaylist.all_tracks();

                const songs = [];
                for (const track of tracks.slice(0, 50)) { // Limit to 50 tracks
                    try {
                        const searched = await play.search(`${track.name} ${track.artists[0]?.name || ''}`, {
                            limit: 1,
                            source: { youtube: 'video' },
                        });

                        if (searched.length > 0) {
                            songs.push({
                                title: track.name,
                                url: searched[0].url,
                                duration: formatDuration(searched[0].durationInSec),
                                thumbnail: track.thumbnail?.url || searched[0].thumbnails[0]?.url,
                                requestedBy: null,
                                source: 'spotify',
                            });
                        }
                    } catch {
                        // Skip tracks that can't be found
                    }
                }

                return songs;
            }
        }

        // YouTube URL
        if (query.includes('youtube.com') || query.includes('youtu.be')) {
            const ytType = play.yt_validate(query);

            if (ytType === 'video') {
                const videoInfo = await play.video_info(query);
                const video = videoInfo.video_details;

                return {
                    title: video.title,
                    url: video.url,
                    duration: formatDuration(video.durationInSec),
                    thumbnail: video.thumbnails[0]?.url,
                    requestedBy: null,
                    source: 'youtube',
                };
            } else if (ytType === 'playlist') {
                const playlist = await play.playlist_info(query, { incomplete: true });
                const videos = await playlist.all_videos();

                return videos.slice(0, 50).map(video => ({
                    title: video.title,
                    url: video.url,
                    duration: formatDuration(video.durationInSec),
                    thumbnail: video.thumbnails[0]?.url,
                    requestedBy: null,
                    source: 'youtube',
                }));
            }
        }

        // Search query - search on YouTube
        const searched = await play.search(query, {
            limit: 1,
            source: { youtube: 'video' },
        });

        if (searched.length === 0) {
            throw new Error('No results found for your search');
        }

        const video = searched[0];
        return {
            title: video.title,
            url: video.url,
            duration: formatDuration(video.durationInSec),
            thumbnail: video.thumbnails[0]?.url,
            requestedBy: null,
            source: 'youtube',
        };
    } catch (error) {
        console.error('[ERROR] Error getting song info:', error);
        throw error;
    }
}

/**
 * Join voice channel and create connection
 */
export async function connectToChannel(voiceChannel) {
    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    });

    try {
        await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
        return connection;
    } catch (error) {
        connection.destroy();
        throw error;
    }
}

/**
 * Play a song in the queue
 */
export async function playSong(queue) {
    if (queue.songs.length === 0) {
        queue.playing = false;
        // Leave after 5 minutes of inactivity
        setTimeout(() => {
            const currentQueue = getQueue(queue.guildId);
            if (currentQueue && !currentQueue.playing && currentQueue.songs.length === 0) {
                deleteQueue(queue.guildId);
                queue.textChannel.send('Left the voice channel due to inactivity.');
            }
        }, 5 * 60 * 1000);
        return;
    }

    const song = queue.songs[0];
    queue.playing = true;

    try {
        // Get audio stream
        const stream = await play.stream(song.url);

        const resource = createAudioResource(stream.stream, {
            inputType: stream.type,
        });

        // Create player if it doesn't exist
        if (!queue.player) {
            queue.player = createAudioPlayer();

            // Handle player state changes
            queue.player.on(AudioPlayerStatus.Idle, () => {
                if (queue.loop) {
                    // Replay the same song
                    playSong(queue);
                } else {
                    // Move to next song
                    queue.songs.shift();
                    playSong(queue);
                }
            });

            queue.player.on('error', (error) => {
                console.error('[ERROR] Audio player error:', error);
                queue.songs.shift();
                playSong(queue);
            });
        }

        // Subscribe connection to player
        if (queue.connection) {
            queue.connection.subscribe(queue.player);
        }

        queue.player.play(resource);

        // Send now playing message
        await queue.textChannel.send({
            embeds: [{
                color: 0x00ff00,
                title: '🎵 Now Playing',
                description: `**[${song.title}](${song.url})**`,
                thumbnail: song.thumbnail ? { url: song.thumbnail } : undefined,
                fields: [
                    { name: 'Duration', value: song.duration || 'Unknown', inline: true },
                    { name: 'Requested by', value: song.requestedBy || 'Unknown', inline: true },
                ],
            }],
        });
    } catch (error) {
        console.error('[ERROR] Error playing song:', error);
        await queue.textChannel.send(`Error playing **${song.title}**: ${error.message}`);
        queue.songs.shift();
        playSong(queue);
    }
}

/**
 * Format duration from seconds to MM:SS or HH:MM:SS
 */
function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return 'Unknown';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Skip the current song
 */
export function skipSong(queue) {
    if (queue.player) {
        queue.loop = false; // Disable loop when skipping
        queue.player.stop();
    }
}

/**
 * Pause playback
 */
export function pauseSong(queue) {
    if (queue.player) {
        queue.player.pause();
    }
}

/**
 * Resume playback
 */
export function resumeSong(queue) {
    if (queue.player) {
        queue.player.unpause();
    }
}

/**
 * Clear the queue
 */
export function clearQueue(queue) {
    queue.songs = [];
    if (queue.player) {
        queue.player.stop();
    }
}

/**
 * Shuffle the queue
 */
export function shuffleQueue(queue) {
    const current = queue.songs.shift();
    for (let i = queue.songs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [queue.songs[i], queue.songs[j]] = [queue.songs[j], queue.songs[i]];
    }
    if (current) {
        queue.songs.unshift(current);
    }
}

/**
 * Toggle loop mode
 */
export function toggleLoop(queue) {
    queue.loop = !queue.loop;
    return queue.loop;
}
