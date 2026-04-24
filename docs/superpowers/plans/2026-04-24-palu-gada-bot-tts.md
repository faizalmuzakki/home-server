# palu-gada-bot /tts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/tts` slash command to `palu-gada-bot` that joins the caller's voice channel, speaks text via Google Translate TTS, and disconnects after 60 seconds of idle.

**Architecture:** A new `src/utils/ttsPlayer.js` module owns the per-guild TTS session state (`Map<guildId, session>`), chunks text to ≤200 chars, fetches MP3 streams from `translate.google.com/translate_tts`, and plays them sequentially through `@discordjs/voice`. The `src/commands/tts.js` handler validates input, checks the music queue (rejects if active), calls `ttsPlayer.speak`, and replies. The existing `/leave` command is taught to also tear down TTS sessions.

**Tech Stack:** Node 18+, `discord.js`, `@discordjs/voice`, `node-fetch` (already a dependency), Google Translate TTS public endpoint.

**Spec:** [docs/superpowers/specs/2026-04-24-palu-gada-bot-tts-design.md](../specs/2026-04-24-palu-gada-bot-tts-design.md)

---

## File Structure

**Create:**
- `palu-gada-bot/src/utils/ttsPlayer.js` — session map, chunking (pure `chunkText`), fetch, playback, idle cleanup.
- `palu-gada-bot/src/commands/tts.js` — slash command handler.

**Modify:**
- `palu-gada-bot/src/commands/leave.js` — also tear down TTS sessions when present.

**No test files** — repo has no test suite. `chunkText` is pure and could be unit-tested, but adding a test runner for one function is over-scoped. Verification is by running the bot and invoking the command in Discord (see Task 6).

---

## Task 1: Add `chunkText` pure function

**Files:**
- Create: `palu-gada-bot/src/utils/ttsPlayer.js`

- [ ] **Step 1: Create the file with `chunkText` and a small self-check**

File: `palu-gada-bot/src/utils/ttsPlayer.js`

```js
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
```

- [ ] **Step 2: Manually verify chunkText via a one-off node invocation**

Run:
```bash
cd palu-gada-bot && node --input-type=module -e "
import('./src/utils/ttsPlayer.js').then(m => {
  console.log(JSON.stringify(m.chunkText('hello world')));
  console.log(JSON.stringify(m.chunkText('')));
  console.log(JSON.stringify(m.chunkText('a'.repeat(250))));
  const long = 'This is sentence one. This is sentence two which is considerably longer and may need further splitting because it exceeds the character budget on its own when combined with other content. Short three.';
  console.log(JSON.stringify(m.chunkText(long)));
});
"
```

Expected:
- First line: `["hello world"]`
- Second line: `[]`
- Third line: two entries, each ≤200 chars, concatenating to the original 250 `a`s.
- Fourth line: 2-3 entries, each ≤200 chars, sentences intact where possible.

- [ ] **Step 3: Commit**

```bash
cd palu-gada-bot && git add src/utils/ttsPlayer.js
git commit -m "feat(palu-gada-bot): add chunkText helper for /tts

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add `fetchTtsStream` and session helpers

**Files:**
- Modify: `palu-gada-bot/src/utils/ttsPlayer.js`

- [ ] **Step 1: Add imports and session map at the top of the file**

Prepend to `palu-gada-bot/src/utils/ttsPlayer.js` (above the existing `MAX_CHUNK_CHARS`):

```js
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
```

- [ ] **Step 2: Add `getSession`, `deleteSession`, and `resetIdleTimer` at the bottom of the file**

Append to `palu-gada-bot/src/utils/ttsPlayer.js`:

```js
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
```

- [ ] **Step 3: Add `fetchTtsStream` below the `chunkText` function**

Append to `palu-gada-bot/src/utils/ttsPlayer.js`:

```js
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
```

Note: Node 18+ has global `fetch`; the repo already requires `>=18.0.0` in `package.json`.

- [ ] **Step 4: Syntax check the module via import**

Run:
```bash
cd palu-gada-bot && node --input-type=module -e "
import('./src/utils/ttsPlayer.js').then(m => {
  console.log('exports:', Object.keys(m).sort());
});
"
```

Expected stdout contains:
```
exports: [ 'chunkText', 'deleteSession', 'getSession' ]
```

(`speak` is added in Task 3; `fetchTtsStream` and `resetIdleTimer` are internal and not exported.)

- [ ] **Step 5: Commit**

```bash
cd palu-gada-bot && git add src/utils/ttsPlayer.js
git commit -m "feat(palu-gada-bot): add TTS session map and Google TTS fetch

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Add `speak` (connect + play chunks sequentially)

**Files:**
- Modify: `palu-gada-bot/src/utils/ttsPlayer.js`

- [ ] **Step 1: Add `connectToChannel` helper (local, do not import from musicPlayer.js)**

Rationale: keeping TTS's voice-connection logic local avoids coupling TTS lifetime to music-player internals and makes the module self-contained.

Append to `palu-gada-bot/src/utils/ttsPlayer.js`:

```js
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
```

- [ ] **Step 2: Add `speak` as the exported entry point**

Append to `palu-gada-bot/src/utils/ttsPlayer.js`:

```js
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
```

- [ ] **Step 3: Syntax check via import**

Run:
```bash
cd palu-gada-bot && node --input-type=module -e "
import('./src/utils/ttsPlayer.js').then(m => {
  console.log('exports:', Object.keys(m).sort());
});
"
```

Expected stdout contains:
```
exports: [ 'chunkText', 'deleteSession', 'getSession', 'speak' ]
```

- [ ] **Step 4: Commit**

```bash
cd palu-gada-bot && git add src/utils/ttsPlayer.js
git commit -m "feat(palu-gada-bot): add ttsPlayer.speak with sequential chunk playback

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Add `/tts` slash command

**Files:**
- Create: `palu-gada-bot/src/commands/tts.js`

- [ ] **Step 1: Create the command file**

File: `palu-gada-bot/src/commands/tts.js`

```js
import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';
import { getQueue } from '../utils/musicPlayer.js';
import { speak } from '../utils/ttsPlayer.js';

const MAX_TEXT_CHARS = 500;

export default {
    data: new SlashCommandBuilder()
        .setName('tts')
        .setDescription('Speak text in your voice channel via Google Translate TTS')
        .addStringOption(option =>
            option
                .setName('text')
                .setDescription(`Text to speak (max ${MAX_TEXT_CHARS} characters)`)
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('language')
                .setDescription('Language code (e.g. en, id, ja, es). Default: en')
                .setRequired(false)
        ),

    async execute(interaction) {
        const rawText = interaction.options.getString('text') ?? '';
        const text = rawText.trim();
        const lang = (interaction.options.getString('language') ?? 'en').trim();
        const voiceChannel = interaction.member?.voice?.channel;

        if (!voiceChannel) {
            return interaction.reply({
                content: 'You need to be in a voice channel to use TTS!',
                flags: MessageFlags.Ephemeral,
            });
        }

        const permissions = voiceChannel.permissionsFor(interaction.client.user);
        if (!permissions.has('Connect') || !permissions.has('Speak')) {
            return interaction.reply({
                content: 'I need permissions to join and speak in your voice channel!',
                flags: MessageFlags.Ephemeral,
            });
        }

        if (text.length === 0) {
            return interaction.reply({
                content: 'Text cannot be empty.',
                flags: MessageFlags.Ephemeral,
            });
        }

        if (text.length > MAX_TEXT_CHARS) {
            return interaction.reply({
                content: `Text must be ${MAX_TEXT_CHARS} characters or fewer (you sent ${text.length}).`,
                flags: MessageFlags.Ephemeral,
            });
        }

        const musicQueue = getQueue(interaction.guildId);
        if (musicQueue && (musicQueue.playing || musicQueue.songs.length > 0)) {
            return interaction.reply({
                content: "Can't use TTS while music is playing. Run `/stop` first.",
                flags: MessageFlags.Ephemeral,
            });
        }

        await interaction.deferReply();

        try {
            await speak(voiceChannel, interaction.channel, text, lang);
            const preview = text.length > 80 ? `${text.slice(0, 77)}...` : text;
            await interaction.editReply({
                content: `🔊 Spoke: "${preview}"`,
            });
        } catch (error) {
            await logCommandError(interaction, error, 'tts');
            await interaction.editReply({
                content: `Error: ${error.message}`,
            });
        }
    },
};
```

- [ ] **Step 2: Verify the command loads via deploy-commands dry-run**

`deploy-commands.js` loads every file in `src/commands/` and requires `DISCORD_TOKEN` + `CLIENT_ID` to actually deploy. Test just the loading phase by running it without tokens and confirming `tts` appears in the "Loaded command:" output before it exits:

Run:
```bash
cd palu-gada-bot && DISCORD_TOKEN= CLIENT_ID= node src/deploy-commands.js 2>&1 | grep -E "Loaded command: tts|ERROR"
```

Expected stdout:
```
[INFO] Loaded command: tts
[ERROR] DISCORD_TOKEN and CLIENT_ID must be set in environment variables!
```

Both lines present confirms the file parses and registers correctly. The ERROR line is expected (we didn't set tokens).

- [ ] **Step 3: Commit**

```bash
cd palu-gada-bot && git add src/commands/tts.js
git commit -m "feat(palu-gada-bot): add /tts slash command

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Teach `/leave` about TTS sessions

**Files:**
- Modify: `palu-gada-bot/src/commands/leave.js`

- [ ] **Step 1: Rewrite `leave.js` to handle either a music queue or a TTS session**

Replace the full contents of `palu-gada-bot/src/commands/leave.js` with:

```js
import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getQueue, deleteQueue } from '../utils/musicPlayer.js';
import { getSession as getTtsSession, deleteSession as deleteTtsSession } from '../utils/ttsPlayer.js';

export default {
    data: new SlashCommandBuilder()
        .setName('leave')
        .setDescription('Make the bot leave the voice channel'),

    async execute(interaction) {
        const queue = getQueue(interaction.guildId);
        const ttsSession = getTtsSession(interaction.guildId);

        if (!queue && !ttsSession) {
            return interaction.reply({
                content: 'I am not in a voice channel!',
                flags: MessageFlags.Ephemeral,
            });
        }

        const botVoiceChannel = queue?.voiceChannel ?? ttsSession?.voiceChannel;
        const member = interaction.member;
        if (!member.voice.channel || member.voice.channel.id !== botVoiceChannel.id) {
            return interaction.reply({
                content: 'You need to be in the same voice channel as the bot!',
                flags: MessageFlags.Ephemeral,
            });
        }

        if (queue) deleteQueue(interaction.guildId);
        if (ttsSession) deleteTtsSession(interaction.guildId);

        await interaction.reply({
            embeds: [{
                color: 0xff0000,
                title: '👋 Goodbye',
                description: 'Left the voice channel. See you later!',
            }],
        });
    },
};
```

- [ ] **Step 2: Verify it loads**

Run:
```bash
cd palu-gada-bot && DISCORD_TOKEN= CLIENT_ID= node src/deploy-commands.js 2>&1 | grep -E "Loaded command: leave|ERROR"
```

Expected stdout:
```
[INFO] Loaded command: leave
[ERROR] DISCORD_TOKEN and CLIENT_ID must be set in environment variables!
```

- [ ] **Step 3: Commit**

```bash
cd palu-gada-bot && git add src/commands/leave.js
git commit -m "feat(palu-gada-bot): teach /leave about TTS sessions

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Deploy and manually verify in Discord

This task produces no code changes; it's the acceptance gate.

- [ ] **Step 1: Deploy commands to Discord**

Requires `DISCORD_TOKEN`, `CLIENT_ID`, and optionally `GUILD_ID` in `palu-gada-bot/.env` (already present — see `docker-compose.yml` `env_file`).

Run:
```bash
cd palu-gada-bot && npm run deploy
```

Expected: log line `[INFO] Loaded command: tts`, then `Successfully deployed N commands`.

- [ ] **Step 2: Rebuild + restart the bot container**

Run:
```bash
cd palu-gada-bot && docker compose up -d --build palu-gada-bot
```

Expected: container rebuilds (`@discordjs/voice` already present, no new deps) and starts. Tail logs to confirm startup:
```bash
docker logs -f palu-gada-bot --tail 50
```

Watch for: `Ready! Logged in as ...` and no unhandled exceptions.

- [ ] **Step 3: Walk through the manual test checklist in Discord**

From the spec's testing section:

1. Join a voice channel. Run `/tts text:"hello world"`. ✓ bot joins, speaks, stays connected, disconnects ~60s later.
2. `/tts text:"halo apa kabar" language:"id"`. ✓ Indonesian voice.
3. Leave voice channel. Run `/tts text:"x"`. ✓ ephemeral error "You need to be in a voice channel…", bot does not join.
4. Run `/play <song>` first. While playing, run `/tts text:"x"`. ✓ ephemeral error "Can't use TTS while music is playing…".
5. `/tts text:""` → "Text cannot be empty." `/tts text:"<501 chars>"` → "Text must be 500 characters or fewer…".
6. `/tts text:"<400-char multi-sentence string>"`. ✓ plays seamlessly without audible gaps between chunks.
7. Back-to-back `/tts` calls within 60s. ✓ bot stays connected across both, no rejoin delay on the second.
8. `/tts` then immediately `/leave`. ✓ bot disconnects right away.
9. `/tts text:"hi" language:"zz"`. ✓ reply "Error: Unsupported language: zz".

If any case fails, diagnose and fix before marking Task 6 complete. Common failure modes:
- **403 from Google** → User-Agent missing/wrong; verify `TTS_USER_AGENT` header in `fetchTtsStream`.
- **Bot joins but no audio** → check `libopus`/`@discordjs/opus` is present in the built image; look for `prism-media` errors in logs.
- **Command missing in Discord** → re-run `npm run deploy`, wait up to a minute for propagation (or use a guild-scoped `GUILD_ID` for instant updates).

- [ ] **Step 4: Commit any fixes discovered during Step 3**

If none, skip. Otherwise:
```bash
cd palu-gada-bot && git add -A
git commit -m "fix(palu-gada-bot): <describe the fix>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- `/tts text language` command surface → Task 4. ✓
- Google Translate TTS endpoint with User-Agent → Task 2 (`fetchTtsStream`). ✓
- Music-conflict rejection using `getQueue` → Task 4. ✓
- 500-char input cap, chunk to ≤200 chars on sentences then words → Task 1 (`chunkText`) + Task 4 (handler cap). ✓
- Per-guild session map, 60s idle timer, timer reset on re-entry → Task 2 + Task 3. ✓
- `/leave` tears down TTS sessions → Task 5. ✓
- Error handling table (voice channel, perms, empty/oversize, invalid lang, music active, network) → Task 4 (handler-level) + Task 2 (`fetchTtsStream` 4xx/5xx) + Task 3 (cleanup on throw). ✓
- Cleanup invariant (every session creation reaches `deleteSession`) → Task 3 `try/catch` + idle timer. ✓
- No test infra, manual verification → Task 6. ✓

**Placeholder scan:** No TBDs, no "add error handling", no "similar to Task N", every code step has full code. ✓

**Type / signature consistency:**
- `chunkText(text)` → used in Task 3 `speak` with the same signature. ✓
- `speak(voiceChannel, textChannel, text, lang)` → called in Task 4 as `speak(voiceChannel, interaction.channel, text, lang)`. ✓
- `getSession(guildId)` / `deleteSession(guildId)` → imported aliased in Task 5 (`getTtsSession`, `deleteTtsSession`) — renamed via `as`, still correct. ✓
- Session shape (`{guildId, voiceChannel, textChannel, connection, player, idleTimer}`) → read in `/leave` as `ttsSession.voiceChannel` (Task 5), matches Task 3 creation. ✓
- `IDLE_TIMEOUT_MS` defined Task 2, used Task 2 (`resetIdleTimer`). No drift. ✓
