# palu-gada-bot — TTS feature design

**Date:** 2026-04-24
**Target project:** `palu-gada-bot`
**Scope:** Add a `/tts` slash command that makes the bot join the caller's voice channel and speak arbitrary text.

## Goal

Users run `/tts text:"..." language:"..."` and the bot joins their current voice channel, plays synthesized speech, and disconnects after a short idle window.

## Non-goals

- No integration with the existing music queue (rejected instead — see conflict rules).
- No persistent TTS history, no per-guild config, no admin gating.
- No support for multiple simultaneous TTS sessions in one guild.

## TTS provider

**Google Translate TTS** (unofficial endpoint):
`https://translate.google.com/translate_tts?ie=UTF-8&q=<text>&tl=<lang>&client=tw-ob`

- No API key, free.
- Hard per-request limit of ~200 characters (we chunk around this).
- Requires a browser-like `User-Agent` header; otherwise Google returns 403.
- Returns MP3.

Provider selected for zero-config fit with the home-server hobby deployment. Kept behind a small module so it can be swapped later without touching the command handler.

## Command surface

```
/tts text:<string, required, 1-500 chars> language:<string, optional, default "en">
```

- `text` — what to say.
- `language` — BCP-47-ish short code (`en`, `id`, `ja`, `es`, ...). Forwarded to Google's `tl=` parameter as-is.

## Behavior

### Happy path

1. User invokes `/tts` while in a voice channel.
2. Bot validates and joins the user's voice channel.
3. Bot fetches + plays one or more MP3 chunks sequentially.
4. After the last chunk finishes, a 60-second idle timer starts. If another `/tts` arrives before the timer fires, the timer resets. If it fires, the bot destroys the voice connection and clears the session.
5. `/leave` (existing command) disconnects immediately.

### Music conflict

- Before accepting the request, the command checks `getQueue(guildId)` from `src/utils/musicPlayer.js`.
- If a queue exists AND (it has songs OR `playing === true`), reject the request ephemerally: "Can't use TTS while music is playing. Run `/stop` first."
- Rationale: Discord allows only one audio stream per voice connection, and sharing state between the music player and TTS is out of scope for v1.

### Chunking

- Hard input cap: **500 characters** (validated in the command handler).
- `chunkText(text)`:
  - Split on sentence boundaries (`.`, `!`, `?`) first.
  - If any resulting sentence is still >200 chars, split that sentence on spaces, greedily packing words up to 200 chars per chunk.
  - Returns an ordered array of ≤200-char strings.
- Chunks are played back-to-back in a single voice connection through one `AudioPlayer`; perceived as a single utterance.

### Idle / cleanup

- Per-guild session object stored in an in-memory `Map` keyed by `guildId`:
  ```
  { guildId, voiceChannel, textChannel, connection, player, idleTimer }
  ```
- After the last chunk reaches `AudioPlayerStatus.Idle`, schedule a 60s timeout that destroys the connection and deletes the session.
- If a new `/tts` arrives for the same guild while the session still exists, reuse the existing connection and clear the pending idle timer.

## Components

### New files

- `src/commands/tts.js` — slash command handler.
- `src/utils/ttsPlayer.js` — session map, chunking, fetching, playback, idle cleanup.

### Reused

- `connectToChannel(voiceChannel)` from `src/utils/musicPlayer.js` — voice connect helper (already handles `entersState(Ready, 30s)` and destroy-on-failure).
- `getQueue(guildId)` from `src/utils/musicPlayer.js` — music-active check.
- `logCommandError(interaction, error, commandName)` from `src/utils/errorLogger.js`.
- `@discordjs/voice` primitives (`createAudioPlayer`, `createAudioResource`, `AudioPlayerStatus`, `entersState`).

### No changes

- `src/deploy-commands.js` — already auto-discovers every `.js` file in `src/commands/` (via `readdirSync`), so dropping `tts.js` in is enough. Running `npm run deploy` after adding the file registers the command with Discord.
- `docker-compose.yml`, `Dockerfile`, `.env` — no new env vars or volumes.

## `ttsPlayer.js` public API

```js
// Returns the active session for a guild (if any).
export function getSession(guildId)

// Tears down a session: stops player, destroys connection, clears idle timer, removes from map.
export function deleteSession(guildId)

// Main entry point.
// Resolves when the final chunk has finished playing (before idle timer starts).
// Rejects on fetch/connection/player errors.
export async function speak(voiceChannel, textChannel, text, lang)
```

Internal (not exported):

- `chunkText(text)` — pure string function; unit-testable.
- `fetchTtsStream(chunk, lang)` — `fetch()` to the Google endpoint with `User-Agent: Mozilla/5.0 ...`; returns the response body as a Node `Readable`. Throws on non-2xx.
- `playChunks(session, chunks)` — sequentially plays each chunk, awaiting `AudioPlayerStatus.Idle` between them. Resolves after the last chunk.
- `resetIdleTimer(session)` — clears any existing timer and schedules a new 60s cleanup.

## `tts.js` command flow

1. `voiceChannel = interaction.member.voice.channel`; if null → ephemeral "You need to be in a voice channel to use TTS."
2. Permission check: bot has `Connect` + `Speak` in `voiceChannel`; if not → ephemeral error.
3. `text = interaction.options.getString('text').trim()`:
   - Empty → ephemeral "Text cannot be empty."
   - Longer than 500 chars → ephemeral "Text must be 500 characters or fewer."
4. `lang = interaction.options.getString('language') ?? 'en'`.
5. `queue = getQueue(interaction.guildId)`; if `queue && (queue.playing || queue.songs.length > 0)` → ephemeral "Can't use TTS while music is playing. Run `/stop` first."
6. `await interaction.deferReply()`.
7. `try { await speak(voiceChannel, interaction.channel, text, lang); await interaction.editReply({ content: `🔊 Spoke: "${truncated(text)}"` }); }`
8. `catch (error) { await logCommandError(interaction, error, 'tts'); await interaction.editReply({ content: `Error: ${error.message}` }); }`

## Error handling

| Failure | Handling |
|---|---|
| User not in voice | Ephemeral reply before `deferReply`. |
| Missing Connect/Speak | Ephemeral reply before `deferReply`. |
| Empty / oversize text | Ephemeral reply before `deferReply`. |
| Invalid language (Google 4xx) | Caught in `fetchTtsStream`; surfaced as `Error("Unsupported language: <code>")`; reported via `editReply`. |
| Music queue active | Ephemeral reply before `deferReply`. |
| Google TTS network/5xx | Caught; `editReply` with "TTS service unavailable, try again later"; logged. |
| Voice connect timeout (`entersState` throws) | `connectToChannel` destroys the connection; error bubbles; `editReply` error; session cleared. |
| Player error mid-playback | Caught in `playChunks`; remaining chunks aborted; `editReply` error; session cleared. |
| User leaves channel mid-speech | Not handled specially; bot finishes speaking, idle timer fires, disconnects. Acceptable for v1. |

**Cleanup invariant:** every path that creates a session must eventually call `deleteSession(guildId)`, either via the 60s idle timer or via an error handler. This is the single state-leak risk.

## Testing

No test infrastructure exists in the repo. Testing is manual via Discord:

1. `/tts text:"hello world"` — bot joins, speaks, stays 60s, disconnects.
2. `/tts text:"halo apa kabar" language:"id"` — Indonesian voice.
3. `/tts` when not in a voice channel → ephemeral error, no join.
4. `/tts` while `/play` queue is active → ephemeral error, no join.
5. `/tts` with empty text / >500 chars → ephemeral error.
6. `/tts text:"<400-char sentence>"` — chunks correctly, plays seamlessly.
7. Two `/tts` calls within 60s → bot stays connected, no rejoin lag, idle timer resets.
8. `/tts` then `/leave` → immediate disconnect.
9. `/tts language:"zz"` → graceful error reply.

## Out of scope (deferred)

- Interrupting music for TTS announcements (requires music-pause/resume state machine).
- Rate-limiting per user (add only if abuse appears).
- Higher-quality voices (ElevenLabs/OpenAI) — design leaves room behind `fetchTtsStream` to swap providers without touching the command.
- Persistence or history.
