# Discord Markdown Renderer for AI Commands

Date: 2026-09-11
Status: Design approved, pending implementation
Component: `palu-gada-bot`

## Problem

Claude returns GitHub-flavoured Markdown. Discord renders a different,
smaller dialect, and renders even less of it inside embeds. Every one of
the bot's seven Claude-backed commands puts model prose into an embed, so
users see raw syntax instead of formatting.

Observed in `/ask`: `## 💻 Estimasi Biaya`, `---`, and a full pipe table
all printed literally. Bold and blockquote rendered, which confirms the
cause is dialect, not a broken embed.

What Discord actually supports:

| Construct | Message content | Embed description / field |
|---|---|---|
| `**bold**`, `*italic*`, `~~strike~~` | yes | yes |
| `` `code` ``, ```` ``` ```` fences | yes | yes |
| `>` blockquote | yes | yes |
| `-` / `1.` lists | yes | yes |
| `[text](url)` | yes | yes |
| `#` `##` `###` headings | yes | **no** |
| `-#` subtext | yes | **no** |
| `|` pipe tables | **no** | **no** |
| `---` horizontal rule | **no** | **no** |
| `![alt](url)` image | **no** | **no** |

Alongside the dialect problem, four commands can throw. `tldr`,
`summarize` and `answer` pass unbounded model output into an embed
description, which the Discord API rejects over 4096 characters.
`translate` sends an unbounded follow-up, which is rejected over 2000.
`ask` chops with `answer.match(/.{1,2000}/gs)`, splitting mid-word and
mid-code-fence.

## Goals

1. Model prose renders as formatting, not syntax, in all seven commands.
2. No command can throw on a long model response.
3. Splitting never lands inside a word or an open code fence.
4. No new npm dependency.

## Non-goals

- Rendering real tables. Discord has no table primitive; the best
  available output is monospace alignment.
- A general-purpose Markdown parser. Input is LLM prose shaped by our own
  system prompts, not arbitrary documents.
- Changing which model each command uses, or any prompt content beyond
  the formatting preamble in section 5.

## 1. Architecture

Three new modules under `src/utils/`, plus a constant in `src/config/ai.js`.

```
discordMarkdown.js   toDiscordMarkdown(text, { headings })
                     pure string -> string, no Discord types

discordChunker.js    chunkForDiscord(text, { limit })
                     pure string -> string[], fence-aware

aiReply.js           sendAiReply(interaction, options)
                     owns embed + conversion + chunking + follow-ups
```

The split matters: the first two are pure functions with no `discord.js`
import, so they are testable by running a file through them and reading
the output. `aiReply.js` is the only one that touches the interaction.

Commands import `sendAiReply` and stop owning any send logic.

## 2. `toDiscordMarkdown(text, opts)`

A single forward pass over `text.split('\n')`, holding two pieces of
state: whether we are inside a fenced code block, and a buffer of
consecutive table rows.

Lines inside a fence are emitted verbatim. Nothing below applies to them.
This is the property that makes a line scanner correct enough here, and
it is why a whole-string regex pass was rejected.

Outside a fence, per line:

**Table rows.** A line whose trimmed form starts and ends with `|`
accumulates into the buffer. The buffer flushes when a non-row line
arrives or input ends. On flush: drop the alignment row (cells matching
`^:?-{3,}:?$`), strip inline markup from every cell because none of it
renders inside a fence, measure each column at its widest cell, and emit
the padded grid wrapped in a bare ``` fence. A buffer that never saw an
alignment row is not a table; emit its lines unchanged.

**Horizontal rules.** A line matching `^\s*(-{3,}|\*{3,}|_{3,})\s*$` is
dropped, along with a blank line immediately following it, so removing
the rule does not leave a double gap.

**Headings.** Governed by `opts.headings`, default `'keep'`. Under
`'keep'`, `#`/`##`/`###` pass through, and `####`+ degrade to `###`
since Discord has only three levels. Under `'bold'`, every heading
becomes `**text**` for embed destinations.

**Images.** `![alt](url)` becomes `[alt](url)`, or the bare URL when
`alt` is empty. Discord renders nothing at all for image syntax in text.

**Task lists.** `- [ ]` becomes `☐ `, `- [x]` becomes `☑ `.

**List indentation.** Leading whitespace on a list item is normalised to
two spaces per level, which is the step Discord expects. Tabs count as
one level.

Everything else passes through untouched.

## 3. `chunkForDiscord(text, opts)`

Splits to a `limit` that defaults to 2000.

Prefers the last paragraph break (`\n\n`) before the limit. Failing that,
the last line break. Failing that, the last space. Only if a single token
exceeds the limit does it cut mid-token.

Fence awareness: the function tracks fence state as it walks. If a chunk
boundary would fall inside an open fence, it appends ``` to close the
current chunk and prepends ```<lang> to the next, reusing the opening
fence's language tag. Budget for those added characters comes out of the
limit so the chunk still fits.

Returns `[]` for empty or whitespace-only input, which callers treat as
"nothing to send".

## 4. `sendAiReply(interaction, options)`

```js
await sendAiReply(interaction, {
  header: { author, title, description, fields, color },
  body: answer,
  footer: getAiFooter('', { smart: true }),
  ephemeral: isPrivate,
  mode: 'message',   // or 'embed'
  maxChunks: 5,
});
```

`mode: 'message'` is the long-form path. It edits the deferred reply with
the header embed alone, converts `body` with `headings: 'keep'`, chunks
to 2000, and posts each chunk as a follow-up. The footer text is appended
to the final chunk as a `-#` subtext line rather than living on the
embed, so it stays adjacent to the prose it describes.

`mode: 'embed'` is the short path. It converts with `headings: 'bold'`,
chunks to 4000, puts the first chunk in the header embed's description
and any remainder in follow-up embeds carrying the same colour. The
footer stays on the last embed.

Both modes stop after `maxChunks` and append `*Response truncated due to
length…*`. Both propagate `ephemeral` to every follow-up so a private
`/ask` stays private.

## 5. Shared prompt preamble

`src/config/ai.js` gains `DISCORD_FORMAT_PROMPT`, appended by every AI
command to its existing system prompt:

> Format for Discord. Do not use Markdown tables, horizontal rules, or
> image syntax. Headings go no deeper than `###`. Prefer short bullet
> lists over long paragraphs. Bold, italics, inline code, fenced code
> blocks, blockquotes and links all work normally.

The converter stays regardless. The prompt reduces how often it has to
act; it is not a substitute for it.

## 6. Per-command changes

| Command | Mode | Notes |
|---|---|---|
| `ask` | message | Replaces the 1024-char field and the duplicated over/under-2000 branches with one call. Header embed keeps the asker's avatar and the question. |
| `explain` | message | Removes the `slice(0, 4096)` / `slice(4096)` pair, whose head and tail rendered under different rules. |
| `tldr` | message | Fixes the uncapped description. Source-text preview field moves onto the header embed. |
| `summarize` | message | Fixes the uncapped description. Channel, window and message-count fields stay on the header embed. |
| `answer` | message | Fixes the uncapped description. Keeps the impersonation author line and both context fields on the header. |
| `recap` | message | Drops its bespoke 4000-char splitter for the shared chunker. Per-channel digest headings now render. |
| `translate` | embed | Output is short and reads well framed. Gains chunking on the follow-up, which is currently uncapped. |
| `fallacy` | embed | Output is structured JSON we format ourselves, not model prose. Only change: run each finding's text through the converter so a stray table or rule from the model cannot leak into a field. Keeps its existing entry-dropping overflow logic. |

## 7. Error handling

The converter and chunker never throw. Every branch has a pass-through
fallback: an unparseable table emits its original lines, an unterminated
fence emits the rest of the input verbatim.

`sendAiReply` lets Discord API errors propagate to each command's
existing `catch`, which already calls `logCommandError` and replies with
a user-facing message. No new error surface.

## 8. Testing

The repo has no test runner and, per the standing preference against new
dependencies, is not getting one for this. Verification is a committed
script, `scripts/check-markdown.js`, run with plain `node`.

It holds a fixture set of input/expected pairs covering: the pipe table
from the original `/ask` screenshot, a wide table that must fall back to
bullets, a table inside a code fence that must be left alone, `---`
removal, `####` degradation, both heading modes, task lists, image
syntax, nested list indentation, a chunk boundary landing inside a
fence, a single token longer than the limit, and empty input.

It exits non-zero on any mismatch and prints a diff. It joins `npm run
check` in `package.json` so the existing import check and this run
together.

Manual verification before merge: the original homelab question through
`/ask` on the live bot, confirming headings render, the cost table
appears as an aligned monospace block, and no `---` remains.

## 9. Risks

**Monospace tables on mobile.** Discord's mobile code-block font is
narrow and does not wrap, so a wide table will scroll sideways. Accepted
for now: alignment was chosen over mobile reflow deliberately. If it
bites in practice, the escape hatch is a width threshold in the converter
above which a table degrades to one bullet per row, first column bolded.
That is a change inside `toDiscordMarkdown` with no caller impact.

**Fence language tags.** Reopening a split fence assumes the language tag
is on the opening line. A fence opened with no tag reopens with no tag,
which is correct. A malformed tag is copied verbatim, which is no worse
than the input.

**Seven commands changed at once.** Each carries its own header embed
fields, so the edits are mechanical but not identical. Mitigated by
`sendAiReply` owning everything that is genuinely shared, and by
verifying each command against the live bot before merge.
