import {
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    StreamType,
    entersState,
    joinVoiceChannel,
    VoiceConnectionStatus,
} from '@discordjs/voice';
import { Readable } from 'stream';

const IDLE_TIMEOUT_MS = 60 * 1000;
const TTS_USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// guildId -> session { guildId, voiceChannel, textChannel, connection, player, idleTimer }
const sessions = new Map();

const MAX_CHUNK_CHARS = 200;

/**
 * Split text into chunks of at most MAX_CHUNK_CHARS characters.
 * Splits on sentence boundaries (.!?) first; if a sentence is still too long,
 * greedily packs words up to the limit.
 */
export function chunkText(text) {
    const trimmed = text.trim();
    if (trimmed.length === 0) return [];
    if (trimmed.length <= MAX_CHUNK_CHARS) return [trimmed];

    // Split on sentence terminators, keeping the terminator with its sentence.
    const sentences = trimmed.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [trimmed];

    const chunks = [];
    for (const rawSentence of sentences) {
        const sentence = rawSentence.trim();
        if (sentence.length === 0) continue;

        if (sentence.length <= MAX_CHUNK_CHARS) {
            chunks.push(sentence);
            continue;
        }

        // Sentence too long — split on whitespace, greedy pack.
        const words = sentence.split(/\s+/);
        let current = '';
        for (const word of words) {
            if (word.length > MAX_CHUNK_CHARS) {
                // Single word longer than the limit: flush current, hard-slice the word.
                if (current) { chunks.push(current); current = ''; }
                for (let i = 0; i < word.length; i += MAX_CHUNK_CHARS) {
                    chunks.push(word.slice(i, i + MAX_CHUNK_CHARS));
                }
                continue;
            }
            const candidate = current ? `${current} ${word}` : word;
            if (candidate.length > MAX_CHUNK_CHARS) {
                chunks.push(current);
                current = word;
            } else {
                current = candidate;
            }
        }
        if (current) chunks.push(current);
    }
    return chunks;
}

/**
 * Fetch a single TTS chunk as a Node Readable MP3 stream.
 * Throws with a user-facing message on non-2xx.
 */
async function fetchTtsStream(chunk, lang) {
    const params = new URLSearchParams({
        ie: 'UTF-8',
        q: chunk,
        tl: lang,
        client: 'tw-ob',
    });
    const url = `https://translate.google.com/translate_tts?${params.toString()}`;

    const response = await fetch(url, {
        headers: { 'User-Agent': TTS_USER_AGENT },
    });

    if (!response.ok) {
        if (response.status === 404 || response.status === 400) {
            throw new Error(`Unsupported language: ${lang}`);
        }
        throw new Error(`TTS service unavailable (HTTP ${response.status})`);
    }

    // Google throttles with 200 + HTML instead of 429; reject anything non-audio.
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('audio')) {
        await response.body?.cancel();
        throw new Error('TTS service returned an unexpected response (possibly rate-limited).');
    }

    return Readable.fromWeb(response.body);
}

export function getSession(guildId) {
    return sessions.get(guildId);
}

export function deleteSession(guildId) {
    const session = sessions.get(guildId);
    if (!session) return;
    if (session.idleTimer) {
        clearTimeout(session.idleTimer);
        session.idleTimer = null;
    }
    if (session.player) {
        try { session.player.stop(true); } catch { /* ignore */ }
    }
    if (session.connection) {
        try { session.connection.destroy(); } catch { /* ignore */ }
    }
    sessions.delete(guildId);
}

function resetIdleTimer(session) {
    if (session.idleTimer) clearTimeout(session.idleTimer);
    session.idleTimer = setTimeout(() => {
        deleteSession(session.guildId);
    }, IDLE_TIMEOUT_MS);
}

/**
 * Connect to a voice channel and wait until the connection is Ready.
 * On timeout or error, destroys the connection and re-throws.
 */
async function connectToChannel(voiceChannel) {
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
 * Speak `text` in `voiceChannel`.
 * - Reuses any existing idle session for the guild; rejects if another speak is in progress.
 * - Resolves once the final chunk reaches Idle; then schedules a 60s cleanup.
 * - On any fetch/connection/player error: tears down the session and rejects.
 */
export async function speak(voiceChannel, textChannel, text, lang) {
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error('Text cannot be empty.');

    const guildId = voiceChannel.guild.id;
    let session = sessions.get(guildId);

    if (session?.speaking) {
        throw new Error('Already speaking in this server — please wait.');
    }

    if (session && session.idleTimer) {
        clearTimeout(session.idleTimer);
        session.idleTimer = null;
    }

    if (!session) {
        // Claim the slot synchronously so a concurrent /tts in the same guild
        // sees an in-progress session and aborts instead of creating a second connection.
        session = {
            guildId,
            voiceChannel,
            textChannel,
            connection: null,
            player: null,
            idleTimer: null,
            speaking: true,
        };
        sessions.set(guildId, session);

        try {
            console.log('[TTS] connecting to voice channel', voiceChannel.id);
            const connection = await connectToChannel(voiceChannel);
            console.log('[TTS] voice connection ready');
            const player = createAudioPlayer();
            player.on('error', (err) => {
                console.error('[ERROR] TTS player error:', err);
            });
            player.on('stateChange', (oldState, newState) => {
                console.log(`[TTS] player state: ${oldState.status} -> ${newState.status}`);
            });
            connection.on(VoiceConnectionStatus.Destroyed, () => {
                deleteSession(guildId);
            });
            connection.subscribe(player);

            session.connection = connection;
            session.player = player;
        } catch (error) {
            console.error('[ERROR] TTS connect failed:', error);
            deleteSession(guildId);
            throw error;
        }
    } else {
        session.speaking = true;
    }

    try {
        for (const chunk of chunks) {
            console.log(`[TTS] fetching chunk (${chunk.length} chars)`);
            const stream = await fetchTtsStream(chunk, lang);
            console.log('[TTS] fetched, creating resource');
            const resource = createAudioResource(stream, { inputType: StreamType.Arbitrary });
            session.player.play(resource);
            console.log('[TTS] play() called, waiting for Playing state');
            try {
                await entersState(session.player, AudioPlayerStatus.Playing, 15_000);
            } catch (err) {
                throw new Error(`Player did not reach Playing in 15s (last state: ${session.player.state.status})`);
            }
            console.log('[TTS] player is Playing, waiting for Idle');
            try {
                await entersState(session.player, AudioPlayerStatus.Idle, 30_000);
            } catch (err) {
                throw new Error(`Player did not reach Idle in 30s (last state: ${session.player.state.status})`);
            }
            console.log('[TTS] chunk finished');
        }
    } catch (error) {
        console.error('[ERROR] TTS playback failed:', error.message);
        deleteSession(guildId);
        throw error;
    }

    session.speaking = false;
    resetIdleTimer(session);
}
