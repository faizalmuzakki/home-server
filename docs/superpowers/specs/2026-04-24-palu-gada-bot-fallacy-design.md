# `/fallacy` command — design

Date: 2026-04-24
Scope: `palu-gada-bot`

## Summary

Add a Discord slash command `/fallacy` that analyzes recent messages in the current channel and reports any logical fallacies it detects, with jump links to the offending messages.

## Goals

- Let anyone in a server run a one-shot "is there a logical fallacy happening here?" check on the current channel's recent chat.
- Surface findings in a format that makes it trivial to click through to the original message.
- Keep the command inexpensive and spam-resistant via a per-channel cooldown.

## Non-goals

- Proactive / passive detection (watching messages in real time). Out of scope.
- Cross-channel analysis. Always current channel only.
- User-configurable window sizes or options. The command takes no options; simpler is better for v1.
- Persistence. No DB schema changes, no history of past analyses.

## User experience

Invocation: `/fallacy` (no options).

Three possible replies:

1. **Cooldown:** ephemeral reply "This channel's fallacy check is cooling down. Try again in Xs." No Claude call.
2. **Not enough messages:** embed "Not enough recent messages to analyze" when <5 non-bot, non-empty messages are available in the fetched window.
3. **Analysis result:** either a "no fallacies detected" embed or a findings embed (see _Output_ below).

## Architecture

New file: `src/commands/fallacy.js`.

Modeled closely on `src/commands/summarize.js`. The command auto-loads via the existing reader in `src/index.js`; no changes required to `index.js`, no new dependencies, no database changes.

Reuses existing utilities:
- `askClaude` from `src/utils/claudeApi.js` for the LLM call.
- `getAiFooter` from `src/config/ai.js` for the embed footer (carries the AI disclaimer).
- `logCommandError` from `src/utils/errorLogger.js` for error reporting.

## Command interface

```
/fallacy
```

- No options.
- No Discord permission gate (everyone can invoke).
- Per-channel cooldown: 2 minutes. Stored in an in-memory `Map<channelId, cooldownEndTimestamp>` inside the module. Resets on bot restart; that's acceptable for a soft rate limit.
- If invoked in a non-text-based channel, reply ephemerally with an error and return.

## Message fetching

- Fetch the last 50 non-bot, non-empty messages from the invoking channel.
- Paginated `channel.messages.fetch({ limit: 100, before: lastId })` loop (same shape as `summarize.js`).
- Stop conditions: 50 kept messages collected, OR API returned an empty page, OR we walked more than 200 fetched messages (hard safety cap).
- Filter: skip `msg.author.bot` and messages whose trimmed `content` is empty.
- For each kept message, capture `{ id, author, content, url }` where `url` is `message.url` (Discord jump link).
- Reverse the kept list into chronological order before passing to Claude.
- If fewer than 5 messages survive filtering, return early with a "Not enough recent messages to analyze" embed. No Claude call.

## Claude prompt

System instruction:
> You are a logic and rhetoric analyst. Identify logical fallacies in Discord conversations. Be conservative — only flag clear, textbook fallacies that appear in the reasoning of a message. Casual chatter, jokes, unsupported opinions stated as opinions, and emotional expressions are not fallacies on their own; a fallacy requires flawed reasoning in support of a claim.

User content: chronological chat log, each line formatted as `[{id}] [{author}]: {content}`, preceded by a short instruction and followed by an output-format instruction.

The prompt instructs Claude to return strict JSON:

```json
{
  "findings": [
    {
      "message_id": "1234567890",
      "fallacy_name": "Ad Hominem",
      "explanation": "Short sentence explaining why this is a fallacy."
    }
  ]
}
```

Rules baked into the prompt:
- Return an empty `findings` array if no clear fallacies.
- Cap findings at 10.
- At most one finding per message.
- `message_id` must be one of the IDs present in the chat log.

## Response parsing

- Strip a surrounding ```json ... ``` code fence if present (simple regex).
- `JSON.parse` the result.
- Validate shape: object with `findings` array. Each finding must have `message_id`, `fallacy_name`, `explanation` — all strings.
- Build a `Map<messageId, messageObject>` from the fetched messages. For each finding, look up the message by ID; if missing, skip that finding (Claude hallucinated an ID).
- Truncate each quoted content to ~150 chars before rendering.
- If parsing throws or validation fails: log the raw Claude response to console, reply "Failed to analyze chat history for fallacies."

No retry loop. If the JSON is malformed, fail fast — the user can re-run after the cooldown.

## Output rendering

**No findings** (empty `findings` array after validation):

- Embed, color `0x5865F2` (blurple).
- Title: `🧐 No Logical Fallacies Detected`.
- Description: `Analyzed the last N messages in #channel — nothing stood out.`
- Footer: `getAiFooter('', { smart: true })`.

**With findings** (1–10 entries):

- Single embed, color `0xED4245` (red).
- Title: `🧐 Logical Fallacies Found`.
- Description: numbered list, one entry per finding, format:
  ```
  **1. <fallacy_name>** — by **<author>** · [jump](<message_url>)
  > "<quoted content, truncated to ~150 chars>"
  <explanation sentence>
  ```
  Entries separated by a blank line.
- Fields: one field `Analyzed` with value `N messages in #channel`.
- Footer: `getAiFooter('', { smart: true })`.
- Timestamp: now.

**Embed length safety:** if the rendered description would exceed Discord's 4096-char embed description limit, truncate the findings list and append `…and N more findings omitted.`

## Error handling

Matches `summarize.js`:

- Wrap the Claude call + rendering in try/catch.
- On error: `logCommandError(interaction, error, 'fallacy')`.
- Map `error.status`:
  - `401` → "Invalid Anthropic API key."
  - `429` → "Rate limited. Please try again later."
  - Other → generic "Failed to analyze chat history for fallacies."
- Reply via `interaction.editReply({ content: 'Error: ...' })`.

## Cooldown mechanics

- Module-scoped `const channelCooldowns = new Map()` outside the command's `execute`.
- At the start of `execute`: if `channelCooldowns.get(channelId)` is set and `> Date.now()`, reply ephemerally with the remaining seconds and return.
- Right after a successful Claude call (regardless of whether findings were produced), set `channelCooldowns.set(channelId, Date.now() + 2 * 60 * 1000)`.
- Don't set the cooldown on early returns (non-text channel, not enough messages) or on parse errors — those didn't consume a real analysis.

## Deploy

`/fallacy` is a new slash command and must be registered with Discord. The bot uses `src/deploy-commands.js` for this; running it after merge will register the command. No other deploy steps required.

## Testing

Manual verification:

1. Run `/fallacy` in a channel with a recent heated argument → expect findings embed with jump links that work.
2. Run `/fallacy` in a quiet channel with <5 recent messages → "Not enough recent messages" embed.
3. Run `/fallacy` in a channel where discussion is purely factual / cooperative → "No Logical Fallacies Detected" embed.
4. Run `/fallacy` twice in a row in the same channel → second call gets the cooldown message.
5. Run `/fallacy` in a voice/stage/thread-restricted channel → ephemeral "text channel only" error.

No automated tests — the bot currently has no test harness for commands; adding one is out of scope for this change.
