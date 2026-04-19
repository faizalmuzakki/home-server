# WhatsApp bot Discord error alerts

## Problem

When a user submits an expense (text or receipt image) to the WhatsApp bot, a server-side failure in the expense-tracker API (5xx, network error, timeout) surfaces only as a generic `Error: <message>` reply in WhatsApp. There is no passive signal that a submission was lost. The bot should post to Discord when any non-user error (anything that isn't a 4xx) hits any API call.

## Scope

- In scope: every call made through [whatsapp-bot/src/services/api.js](../../../expense-tracker/whatsapp-bot/src/services/api.js) (`parseText`, `parseImage`, `createExpense`, `getCategories`, `getExpenses`, `getStats`, `uploadImage`).
- Out of scope: 4xx responses (treated as user errors, already surfaced to the user), errors inside handlers that don't hit the API, other bots in the monorepo.

## Non-goals

- No retry logic. The user resubmits; Discord just notifies.
- No rate limiting / dedup. Volume is low (single-user bot); revisit if spam appears.
- No new dependency for HTTP (use Node 18+ builtin `fetch`).

## Design

### Components

**New: `whatsapp-bot/src/services/discord.js`**

Single export:

```js
export async function notifyError({ endpoint, status, errorMessage, sender, messagePreview })
```

- Reads `process.env.DISCORD_WEBHOOK_URL`. If unset, returns immediately.
- POSTs a Discord embed (see "Message format" below) via `fetch`.
- Catches and logs any webhook error with `console.error`. Never throws (notification must not break the request flow).

**Modified: `whatsapp-bot/src/services/api.js`**

- Add an axios response interceptor that:
  1. Reads `error.response?.status`.
  2. If `status` is present and `< 500` (i.e., 4xx), re-throws without notifying.
  3. Otherwise (5xx, no response → network error / timeout), calls `notifyError` fire-and-forget, then re-throws.
- Pulls sender/preview from `error.config.meta` (see "Context propagation").
- Pulls endpoint from `error.config.url`.
- For 5xx: `status = error.response.status`, `errorMessage = error.response.data?.error || error.message`.
- For network/timeout: `status = null`, `errorMessage = error.code || error.message` (e.g., `ECONNREFUSED`, `ETIMEDOUT`).

### Context propagation

Axios wrapper functions accept an optional `meta` argument and forward it to axios via a non-standard config key:

```js
export async function parseText(text, meta = {}) {
  const response = await api.post('/api/parse/text', { text }, { meta });
  return response.data;
}
```

Same pattern for `parseImage`, `createExpense`, `getCategories`, `getExpenses`, `getStats`, `uploadImage`. Axios preserves unknown config keys, so the interceptor can read `error.config.meta` on failure.

### Handler changes

In [whatsapp-bot/src/handlers/expense.js](../../../expense-tracker/whatsapp-bot/src/handlers/expense.js), build a `meta` object once per handler call and pass it to every API call:

```js
const meta = {
  sender: msg.key.remoteJid,        // full JID, e.g. 6281234567890@s.whatsapp.net
  messagePreview: text.slice(0, 100) // or caption for image handler
};
```

- `handleTextTransaction`: pass `meta` to `parseText` and `createExpense`.
- `handleImageTransaction`: pass `meta` to `parseImage`, `uploadImage`, `createExpense`. For image handler, `messagePreview` is `caption?.slice(0, 100) || '(image, no caption)'`.
- `sendCategories`: pass `meta` with `sender = jid` and `messagePreview = '(category list request)'`.

### Message format

Discord embed, matching the style used by [scripts/backup-encrypted.sh:46-53](../../../scripts/backup-encrypted.sh#L46-L53):

```json
{
  "embeds": [{
    "title": "❌ Expense bot: 500 on /api/expenses",
    "color": 15158332,
    "fields": [
      { "name": "Endpoint", "value": "POST /api/expenses", "inline": true },
      { "name": "Status", "value": "500", "inline": true },
      { "name": "Error", "value": "database is locked" },
      { "name": "Sender", "value": "6281234567890@s.whatsapp.net" },
      { "name": "Message", "value": "50k lunch at warung padang" }
    ],
    "timestamp": "2026-04-20T12:34:56.000Z"
  }]
}
```

Title format:
- 5xx: `❌ Expense bot: <status> on <path>`
- Network/timeout: `❌ Expense bot: <error code> on <path>` (e.g., `ECONNREFUSED on /api/parse/text`)

Field truncation:
- `Error` field: truncate to 1000 chars (Discord field limit 1024).
- `Message` field: already ≤100 chars by construction.

### Configuration

- New env var: `DISCORD_WEBHOOK_URL` on the `whatsapp-bot` service.
- Add to [expense-tracker/docker-compose.yml](../../../expense-tracker/docker-compose.yml) under `whatsapp-bot.environment`:
  ```yaml
  - DISCORD_WEBHOOK_URL=${DISCORD_WEBHOOK_URL}
  ```
- Unset → notifications silently disabled (important for local dev and CI).
- Reuse the same webhook URL as the deploy script, or use a dedicated channel — user's choice at deploy time.

### Error handling

- `notifyError` must never throw. Webhook failures are logged via `console.error` and swallowed.
- Interceptor calls `notifyError` without `await` (fire-and-forget) so a slow webhook doesn't delay the user-facing error reply.
- If `DISCORD_WEBHOOK_URL` is not set, `notifyError` exits at the first line — no fetch call, no log noise.

### Testing

Manual verification only (low-risk feature, no existing test harness):

1. With `DISCORD_WEBHOOK_URL` unset: submit a valid expense → works, no Discord call (verify via `docker logs`).
2. With webhook set + API up: submit a valid expense → works, no Discord call.
3. Stop the API container: submit an expense → user gets `Error: ...` reply, Discord receives network-error embed.
4. Temporarily make `/api/expenses` return 500 (e.g., break the DB path): submit → user gets error, Discord receives 5xx embed with sender + preview.
5. Send a 4xx-triggering message (e.g., garbled text that `parseText` rejects with validation error): verify Discord does **not** fire.

## File changes

- `whatsapp-bot/src/services/discord.js` — new
- `whatsapp-bot/src/services/api.js` — add interceptor, add `meta` param to all exports
- `whatsapp-bot/src/handlers/expense.js` — build and pass `meta` in all three handlers
- `expense-tracker/docker-compose.yml` — add `DISCORD_WEBHOOK_URL` env var

## Risks

- Axios preserves unknown config keys today, but this is not a documented guarantee. If a future upgrade strips `meta`, the interceptor degrades to no sender/preview (fields become blank) but still fires. Acceptable.
- If the Discord webhook is slow/unresponsive, fire-and-forget means the Node process holds a dangling promise. In practice this resolves or errors within seconds; with `restart: unless-stopped` any hang is survivable.
