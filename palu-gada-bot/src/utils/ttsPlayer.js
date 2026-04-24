import {
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
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

    // Convert the Web ReadableStream body into a Node Readable for @discordjs/voice.
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
 * - Reuses any existing session for the guild (cancelling its idle timer).
 * - Resolves once the final chunk reaches Idle; then schedules a 60s cleanup.
 * - On any fetch/connection/player error: tears down the session and rejects.
 */
export async function speak(voiceChannel, textChannel, text, lang) {
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error('Text cannot be empty.');

    const guildId = voiceChannel.guild.id;
    let session = sessions.get(guildId);

    if (session && session.idleTimer) {
        clearTimeout(session.idleTimer);
        session.idleTimer = null;
    }

    try {
        if (!session) {
            const connection = await connectToChannel(voiceChannel);
            const player = createAudioPlayer();
            player.on('error', (err) => {
                console.error('[ERROR] TTS player error:', err);
            });
            connection.subscribe(player);

            session = {
                guildId,
                voiceChannel,
                textChannel,
                connection,
                player,
                idleTimer: null,
            };
            sessions.set(guildId, session);
        }

        for (const chunk of chunks) {
            const stream = await fetchTtsStream(chunk, lang);
            const resource = createAudioResource(stream);
            session.player.play(resource);
            // Wait until the player leaves Playing/Buffering and returns to Idle.
            await entersState(session.player, AudioPlayerStatus.Playing, 15_000);
            await entersState(session.player, AudioPlayerStatus.Idle, 120_000);
        }
    } catch (error) {
        deleteSession(guildId);
        throw error;
    }

    resetIdleTimer(session);
}
