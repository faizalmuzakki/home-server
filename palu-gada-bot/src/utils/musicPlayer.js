import {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    entersState,
    demuxProbe,
    StreamType,
} from '@discordjs/voice';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import { once } from 'events';

const execFileAsync = promisify(execFile);
const YTDLP_BIN = process.env.YTDLP_PATH || 'yt-dlp';

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
export function createQueue(guildId, voiceChannel, textChannel, initialVolume = 100) {
    const queue = {
        guildId,
        voiceChannel,
        textChannel,
        connection: null,
        player: null,
        resource: null,
        process: null,
        idleTimer: null,
        playbackStartedAt: null,
        playbackSeekOffset: 0,
        pausedAt: null,
        songs: [],
        volume: initialVolume,
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
        if (queue.idleTimer) {
            clearTimeout(queue.idleTimer);
            queue.idleTimer = null;
        }
        if (queue.process) {
            try { queue.process.kill('SIGTERM'); } catch {}
            queue.process = null;
        }
        if (queue.player) {
            try { queue.player.stop(true); } catch {}
        }
        if (queue.connection) {
            try { queue.connection.destroy(); } catch {}
        }
        queues.delete(guildId);
    }
}

/**
 * Format duration from seconds to MM:SS or HH:MM:SS
 */
export function formatDuration(seconds) {
    if (seconds === null || seconds === undefined || isNaN(seconds)) return 'Unknown';

    const totalSecs = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Calculate current playback position in seconds
 */
export function getCurrentPlaybackTime(queue) {
    if (!queue || !queue.playing || !queue.playbackStartedAt) return 0;
    const now = queue.pausedAt || Date.now();
    const elapsed = Math.max(0, (now - queue.playbackStartedAt) / 1000);
    return Math.floor(elapsed + (queue.playbackSeekOffset || 0));
}

/**
 * Create a visual progress bar for playback status
 */
export function createProgressBar(currentSeconds, totalSeconds, length = 15) {
    if (!totalSeconds || isNaN(totalSeconds) || totalSeconds <= 0) {
        return `[🔘${'─'.repeat(length - 1)}] \`${formatDuration(currentSeconds)} / Live\``;
    }
    const progress = Math.min(Math.max(currentSeconds / totalSeconds, 0), 1);
    const progressIndex = Math.round(progress * (length - 1));
    const before = '─'.repeat(progressIndex);
    const after = '─'.repeat(length - 1 - progressIndex);
    return `[${before}🔘${after}] \`${formatDuration(currentSeconds)} / ${formatDuration(totalSeconds)}\``;
}

/**
 * Calculate total duration of all tracks in the queue
 */
export function getTotalQueueDuration(queue) {
    if (!queue || queue.songs.length === 0) return '0:00';
    const totalSecs = queue.songs.reduce((acc, song) => acc + (song.durationInSec || 0), 0);
    return formatDuration(totalSecs);
}

/**
 * Execute yt-dlp to extract metadata JSON
 */
async function runYtdlp(args) {
    const defaultArgs = ['--no-warnings'];
    const { stdout } = await execFileAsync(YTDLP_BIN, [...defaultArgs, ...args], {
        maxBuffer: 10 * 1024 * 1024,
    });
    return stdout;
}

function parseYtdlpItem(item) {
    let url = item.webpage_url || item.url;
    if (!url && item.id) {
        url = `https://www.youtube.com/watch?v=${item.id}`;
    }
    let thumbnail = item.thumbnail;
    if (!thumbnail && Array.isArray(item.thumbnails) && item.thumbnails.length > 0) {
        thumbnail = item.thumbnails[item.thumbnails.length - 1].url;
    }

    const durationInSec = typeof item.duration === 'number' ? Math.floor(item.duration) : 0;
    let source = String(item.extractor || 'youtube').toLowerCase();
    if (source.includes('youtube')) source = 'youtube';

    return {
        title: item.title || 'Unknown Title',
        url,
        duration: item.duration_string || (durationInSec ? formatDuration(durationInSec) : 'Unknown'),
        durationInSec,
        thumbnail,
        requestedBy: null,
        source,
    };
}

/**
 * Resolve single track using yt-dlp search
 */
async function searchSingleTrack(query, source = 'youtube') {
    const stdout = await runYtdlp(['--dump-json', '--no-playlist', `ytsearch1:${query}`]);
    const lines = stdout.trim().split('\n').filter(Boolean);
    if (lines.length === 0) {
        throw new Error(`No results found for "${query}"`);
    }
    const song = parseYtdlpItem(JSON.parse(lines[0]));
    if (source) song.source = source;
    return song;
}

/**
 * Batch resolve multiple track queries on YouTube concurrently
 */
async function resolveTracksBatch(tracks, source = 'spotify', batchSize = 6) {
    const results = [];
    for (let i = 0; i < tracks.length; i += batchSize) {
        const chunk = tracks.slice(i, i + batchSize);
        const resolved = await Promise.all(
            chunk.map(async (t) => {
                try {
                    const search = `${t.title} ${t.subtitle || ''}`.trim();
                    return await searchSingleTrack(search, source);
                } catch {
                    return null;
                }
            })
        );
        for (const s of resolved) {
            if (s) results.push(s);
        }
    }
    return results;
}

/**
 * Parse a URL or search query and get song info
 */
export async function getSongInfo(query) {
    let trimmed = query.trim();

    try {
        // Expand Spotify shortened links (e.g. spotify.link/...)
        if (/^https?:\/\/(spotify\.link|spotify\.app\.link)\//i.test(trimmed)) {
            try {
                const headRes = await fetch(trimmed, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } });
                if (headRes.url) trimmed = headRes.url;
            } catch (err) {
                console.warn('[WARN] Spotify link expansion failed:', err.message);
            }
        }

        // Spotify URL handling
        if (trimmed.includes('spotify.com')) {
            if (trimmed.includes('/track/')) {
                let title = '';
                let artist = '';
                let thumbnail = null;

                // 1. oEmbed lookup for track title & thumbnail
                try {
                    const oembedRes = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(trimmed)}`);
                    if (oembedRes.ok) {
                        const oembed = await oembedRes.json();
                        title = oembed.title || '';
                        thumbnail = oembed.thumbnail_url || null;
                    }
                } catch (err) {
                    console.warn('[WARN] Spotify oEmbed failed:', err.message);
                }

                // 2. Fetch track page for artist from og:description
                try {
                    const pageRes = await fetch(trimmed, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                    if (pageRes.ok) {
                        const html = await pageRes.text();
                        const ogDesc = html.match(/<meta property="og:description" content="([^"]+)"/);
                        if (ogDesc && ogDesc[1]) {
                            artist = ogDesc[1].split('·')[0].split('•')[0].trim();
                        }
                    }
                } catch (err) {
                    console.warn('[WARN] Spotify HTML scrape failed:', err.message);
                }

                const searchString = `${title} ${artist}`.trim() || trimmed;
                const song = await searchSingleTrack(searchString, 'spotify');
                if (thumbnail) song.thumbnail = thumbnail;
                return song;
            }

            if (trimmed.includes('/playlist/') || trimmed.includes('/album/') || trimmed.includes('/artist/')) {
                // Fetch embed page containing __NEXT_DATA__ tracklist
                const embedUrl = trimmed.replace('open.spotify.com/', 'open.spotify.com/embed/');
                const embedRes = await fetch(embedUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                if (!embedRes.ok) {
                    throw new Error(`Failed to load Spotify embed (HTTP ${embedRes.status})`);
                }
                const html = await embedRes.text();
                const match = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
                if (!match) {
                    throw new Error('Could not parse Spotify structure.');
                }
                const data = JSON.parse(match[1]);
                const trackList = data.props?.pageProps?.state?.data?.entity?.trackList;
                if (!trackList || trackList.length === 0) {
                    throw new Error('Spotify playlist, album, or artist track list is empty.');
                }

                const songs = await resolveTracksBatch(trackList.slice(0, 50), 'spotify');

                if (songs.length === 0) {
                    throw new Error('Could not find tracks from Spotify on YouTube.');
                }
                return songs;
            }
        }

        const isUrl = /^https?:\/\//i.test(trimmed);
        const isYtPlaylistOrMix = isUrl && (
            trimmed.includes('youtube.com/playlist') ||
            trimmed.includes('music.youtube.com/playlist') ||
            (/[?&]list=/i.test(trimmed) && (trimmed.includes('youtube.com') || trimmed.includes('youtu.be') || trimmed.includes('music.youtube.com')))
        );

        if (isYtPlaylistOrMix) {
            const stdout = await runYtdlp(['--dump-json', '--flat-playlist', trimmed]);
            const lines = stdout.trim().split('\n').filter(Boolean);
            if (lines.length === 0) {
                throw new Error('Playlist is empty or unavailable.');
            }
            return lines.slice(0, 50).map((l) => parseYtdlpItem(JSON.parse(l)));
        }

        if (isUrl) {
            // Single URL (pass --no-playlist in case of radio/mix lists or fallback)
            const stdout = await runYtdlp(['--dump-json', '--no-playlist', trimmed]);
            const lines = stdout.trim().split('\n').filter(Boolean);
            if (lines.length === 0) {
                throw new Error('Could not retrieve media info for this URL.');
            }
            return parseYtdlpItem(JSON.parse(lines[0]));
        }

        // Search query
        return await searchSingleTrack(trimmed, 'youtube');
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
 * Spawn yt-dlp and create Discord audio resource
 */
async function createStreamResource(url, seekSeconds = null) {
    const args = ['-o', '-', '-f', 'ba/b', '--quiet', '--no-warnings'];
    if (seekSeconds && seekSeconds > 0) {
        args.unshift('--download-sections', `*${seekSeconds}-inf`);
    }
    args.push(url);

    const proc = spawn(YTDLP_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
        if (stderr.length > 5000) stderr = stderr.slice(-5000);
    });

    proc.on('error', (err) => {
        console.error('[ERROR] yt-dlp process spawn error:', err);
    });

    const probePromise = demuxProbe(proc.stdout);
    const closePromise = once(proc, 'close');

    const result = await Promise.race([
        probePromise.then((probe) => ({ kind: 'probe', probe })),
        closePromise.then(([code]) => ({ kind: 'close', code })),
    ]);

    if (result.kind === 'close') {
        const code = result.code;
        if (code !== 0) {
            const errMsg = stderr.trim().split('\n').filter(Boolean).pop() || `yt-dlp exited with code ${code}`;
            throw new Error(errMsg.replace(/^ERROR:\s*/i, ''));
        }
        throw new Error('yt-dlp closed stream unexpectedly without audio data');
    }

    const { probe } = result;

    if (probe.type === StreamType.Arbitrary) {
        const closeOrTimeout = await Promise.race([
            closePromise.then(([code]) => ({ closed: true, code })),
            new Promise((r) => setTimeout(() => r({ closed: false }), 200)),
        ]);

        if (closeOrTimeout.closed && closeOrTimeout.code !== 0) {
            const errMsg = stderr.trim().split('\n').filter(Boolean).pop() || `yt-dlp exited with code ${closeOrTimeout.code}`;
            throw new Error(errMsg.replace(/^ERROR:\s*/i, ''));
        }
    }

    const resource = createAudioResource(probe.stream, {
        inputType: probe.type,
        inlineVolume: true,
    });

    return { resource, proc };
}

/**
 * Play a song in the queue
 */
export async function playSong(queue) {
    if (queue.songs.length === 0) {
        queue.playing = false;
        queue.resource = null;
        queue.playbackStartedAt = null;
        queue.playbackSeekOffset = 0;
        queue.pausedAt = null;
        if (queue.idleTimer) clearTimeout(queue.idleTimer);
        // Leave after 5 minutes of inactivity
        queue.idleTimer = setTimeout(() => {
            const currentQueue = getQueue(queue.guildId);
            if (currentQueue && !currentQueue.playing && currentQueue.songs.length === 0) {
                deleteQueue(queue.guildId);
                queue.textChannel.send('Left the voice channel due to inactivity.');
            }
        }, 5 * 60 * 1000);
        return;
    }

    if (queue.idleTimer) {
        clearTimeout(queue.idleTimer);
        queue.idleTimer = null;
    }

    const song = queue.songs[0];
    queue.playing = true;

    try {
        if (queue.process) {
            try { queue.process.kill('SIGTERM'); } catch {}
            queue.process = null;
        }

        const { resource, proc } = await createStreamResource(song.url);
        queue.process = proc;
        queue.resource = resource;
        queue.playbackStartedAt = Date.now();
        queue.playbackSeekOffset = 0;
        queue.pausedAt = null;

        if (resource.volume) {
            resource.volume.setVolume(queue.volume / 100);
        }

        // Create player if it doesn't exist
        if (!queue.player) {
            queue.player = createAudioPlayer();

            queue.player.on(AudioPlayerStatus.Idle, () => {
                if (queue.process) {
                    try { queue.process.kill('SIGTERM'); } catch {}
                    queue.process = null;
                }
                queue.resource = null;
                queue.playbackStartedAt = null;
                queue.playbackSeekOffset = 0;
                queue.pausedAt = null;

                if (queue.loop) {
                    playSong(queue);
                } else {
                    queue.songs.shift();
                    playSong(queue);
                }
            });

            queue.player.on('error', (error) => {
                console.error('[ERROR] Audio player error:', error);
                if (queue.process) {
                    try { queue.process.kill('SIGTERM'); } catch {}
                    queue.process = null;
                }
                queue.resource = null;
                queue.playbackStartedAt = null;
                queue.playbackSeekOffset = 0;
                queue.pausedAt = null;
                queue.songs.shift();
                playSong(queue);
            });
        }

        if (queue.connection) {
            queue.connection.subscribe(queue.player);
        }

        queue.player.play(resource);

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
        if (queue.process) {
            try { queue.process.kill('SIGTERM'); } catch {}
            queue.process = null;
        }
        queue.resource = null;
        queue.playbackStartedAt = null;
        queue.playbackSeekOffset = 0;
        queue.pausedAt = null;
        await queue.textChannel.send(`Error playing **${song.title}**: ${error.message}`);
        queue.songs.shift();
        playSong(queue);
    }
}

/**
 * Skip the current song
 */
export function skipSong(queue) {
    if (queue.player) {
        queue.loop = false;
        if (queue.process) {
            try { queue.process.kill('SIGTERM'); } catch {}
            queue.process = null;
        }
        queue.resource = null;
        queue.player.stop();
    }
}

/**
 * Skip to a specific track index in the queue
 */
export function skipToTrack(queue, index) {
    if (!queue || !queue.player || index < 1 || index >= queue.songs.length) return false;
    queue.loop = false;
    // Remove intermediate songs so target song becomes next (index 1 -> index 0 on stop)
    queue.songs.splice(1, index - 1);
    if (queue.process) {
        try { queue.process.kill('SIGTERM'); } catch {}
        queue.process = null;
    }
    queue.resource = null;
    queue.player.stop();
    return true;
}

/**
 * Pause playback
 */
export function pauseSong(queue) {
    if (queue.player) {
        if (!queue.pausedAt) queue.pausedAt = Date.now();
        queue.player.pause();
    }
}

/**
 * Resume playback
 */
export function resumeSong(queue) {
    if (queue.player) {
        if (queue.pausedAt) {
            if (queue.playbackStartedAt) {
                queue.playbackStartedAt += (Date.now() - queue.pausedAt);
            }
            queue.pausedAt = null;
        }
        queue.player.unpause();
    }
}

/**
 * Clear the queue
 */
export function clearQueue(queue) {
    queue.songs = [];
    if (queue.process) {
        try { queue.process.kill('SIGTERM'); } catch {}
        queue.process = null;
    }
    queue.resource = null;
    queue.playbackStartedAt = null;
    queue.playbackSeekOffset = 0;
    queue.pausedAt = null;
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

/**
 * Seek to a specific position in the current song
 */
export async function seekSong(queue, seconds) {
    const song = queue.songs[0];
    if (!song || !queue.player) return;

    if (queue.process) {
        try { queue.process.kill('SIGTERM'); } catch {}
        queue.process = null;
    }

    const { resource, proc } = await createStreamResource(song.url, seconds);
    queue.process = proc;
    queue.resource = resource;
    queue.playbackStartedAt = Date.now();
    queue.playbackSeekOffset = seconds;
    queue.pausedAt = null;

    if (resource.volume) {
        resource.volume.setVolume(queue.volume / 100);
    }

    queue.player.play(resource);
}
