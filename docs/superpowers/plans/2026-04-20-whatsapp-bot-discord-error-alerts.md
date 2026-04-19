# WhatsApp Bot Discord Error Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Post a Discord embed whenever any API call made by the expense-tracker WhatsApp bot fails with a non-4xx error (5xx, network, timeout), so lost submissions surface passively.

**Architecture:** Central axios response interceptor in `services/api.js` filters out 4xx and delegates to a new `services/discord.js` module. Handlers pass sender/message context via an optional `meta` argument forwarded through axios config, so the interceptor can include it in the embed without extra coupling. Fire-and-forget so a slow webhook doesn't delay the user-facing error reply.

**Tech Stack:** Node 18+ (ES modules), axios 1.13, Node builtin `fetch`. No new npm dependencies.

**Spec reference:** [docs/superpowers/specs/2026-04-20-whatsapp-bot-discord-error-alerts-design.md](../specs/2026-04-20-whatsapp-bot-discord-error-alerts-design.md)

**Testing note:** The whatsapp-bot package has no test framework configured. Verification is manual via `docker compose` + inspecting logs / the Discord channel. Each task includes a verification step you can run locally.

---

### Task 1: Create the Discord notification module

**Files:**
- Create: `expense-tracker/whatsapp-bot/src/services/discord.js`

- [ ] **Step 1: Create `discord.js` with `notifyError` export**

```js
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

const FIELD_MAX = 1000;

function truncate(value, max = FIELD_MAX) {
  if (!value) return '-';
  const str = String(value);
  return str.length <= max ? str : `${str.slice(0, max - 3)}...`;
}

export async function notifyError({ endpoint, method, status, errorMessage, sender, messagePreview }) {
  if (!WEBHOOK_URL) return;

  const isHttp = typeof status === 'number';
  const titleStatus = isHttp ? String(status) : (errorMessage || 'network error');
  const path = endpoint || '(unknown)';

  const payload = {
    embeds: [{
      title: `❌ Expense bot: ${titleStatus} on ${path}`,
      color: 15158332,
      fields: [
        { name: 'Endpoint', value: truncate(`${method || 'REQ'} ${path}`, 200), inline: true },
        { name: 'Status', value: isHttp ? String(status) : 'network', inline: true },
        { name: 'Error', value: truncate(errorMessage) },
        { name: 'Sender', value: truncate(sender || '-', 200) },
        { name: 'Message', value: truncate(messagePreview || '-', 200) }
      ],
      timestamp: new Date().toISOString()
    }]
  };

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      console.error(`Discord webhook failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('Discord webhook error:', error.message);
  }
}
```

- [ ] **Step 2: Verify the file parses**

Run: `node --check expense-tracker/whatsapp-bot/src/services/discord.js`
Expected: exits 0 with no output.

- [ ] **Step 3: Smoke-test the module in isolation**

Run (paste as one command, substitute a real webhook URL, or leave it unset for the no-op path):

```bash
cd expense-tracker/whatsapp-bot && DISCORD_WEBHOOK_URL="" node --input-type=module -e "
import { notifyError } from './src/services/discord.js';
await notifyError({ endpoint: '/api/test', method: 'POST', status: 500, errorMessage: 'smoke test', sender: 'test@s.whatsapp.net', messagePreview: 'hello' });
console.log('no-op path ok');
"
```

Expected output: `no-op path ok` (no Discord call because URL is empty).

If you have a test webhook URL, re-run with it set and verify an embed arrives in the Discord channel. Delete the test message afterwards.

- [ ] **Step 4: Commit**

```bash
git add expense-tracker/whatsapp-bot/src/services/discord.js
git commit -m "feat(whatsapp-bot): add discord.notifyError helper"
```

---

### Task 2: Add axios response interceptor to `api.js`

**Files:**
- Modify: `expense-tracker/whatsapp-bot/src/services/api.js`

- [ ] **Step 1: Add the interceptor and update exports to accept `meta`**

Replace the entire contents of `expense-tracker/whatsapp-bot/src/services/api.js` with:

```js
import axios from 'axios';
import { notifyError } from './discord.js';

const API_URL = process.env.API_URL || 'http://api:3000';

const api = axios.create({
  baseURL: API_URL,
  timeout: 60000, // 60s for Claude API calls
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;

    // Skip 4xx (user errors, already surfaced to the user)
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return Promise.reject(error);
    }

    const meta = error.config?.meta || {};
    const endpoint = error.config?.url || null;
    const method = error.config?.method?.toUpperCase() || null;
    const errorMessage = error.response?.data?.error
      || error.response?.data?.message
      || error.code
      || error.message
      || 'unknown error';

    // Fire-and-forget: never await, never let webhook failure affect the caller
    notifyError({
      endpoint,
      method,
      status: typeof status === 'number' ? status : null,
      errorMessage,
      sender: meta.sender,
      messagePreview: meta.messagePreview
    });

    return Promise.reject(error);
  }
);

export async function parseText(text, meta = {}) {
  const response = await api.post('/api/parse/text', { text }, { meta });
  return response.data;
}

export async function parseImage(base64Image, meta = {}) {
  const response = await api.post('/api/parse/image', { image: base64Image }, { meta });
  return response.data;
}

export async function createExpense(expense, meta = {}) {
  const response = await api.post('/api/expenses', expense, { meta });
  return response.data;
}

export async function getCategories(meta = {}) {
  const response = await api.get('/api/categories', { meta });
  return response.data;
}

export async function getExpenses(params = {}, meta = {}) {
  const response = await api.get('/api/expenses', { params, meta });
  return response.data;
}

export async function getStats(params = {}, meta = {}) {
  const response = await api.get('/api/stats/summary', { params, meta });
  return response.data;
}

export async function uploadImage(base64Image, filename, meta = {}) {
  const response = await api.post('/api/upload', { image: base64Image, filename }, { meta });
  return response.data;
}
```

- [ ] **Step 2: Verify the file parses**

Run: `node --check expense-tracker/whatsapp-bot/src/services/api.js`
Expected: exits 0 with no output.

- [ ] **Step 3: Commit**

```bash
git add expense-tracker/whatsapp-bot/src/services/api.js
git commit -m "feat(whatsapp-bot): intercept non-4xx api errors and notify discord"
```

---

### Task 3: Pass `meta` from expense handlers

**Files:**
- Modify: `expense-tracker/whatsapp-bot/src/handlers/expense.js`

- [ ] **Step 1: Update `sendCategories` to pass `meta`**

Find:

```js
export async function sendCategories(sock, jid, msg) {
  try {
    const categories = await getCategories();
```

Replace with:

```js
export async function sendCategories(sock, jid, msg) {
  const meta = { sender: jid, messagePreview: '(category list request)' };
  try {
    const categories = await getCategories(meta);
```

- [ ] **Step 2: Update `handleTextTransaction` to pass `meta`**

Find:

```js
export async function handleTextTransaction(sock, jid, text, msg) {
  await reply(sock, jid, 'Analyzing...', msg);

  try {
    const parsed = await parseText(text);
```

Replace with:

```js
export async function handleTextTransaction(sock, jid, text, msg) {
  await reply(sock, jid, 'Analyzing...', msg);

  const meta = { sender: jid, messagePreview: text.slice(0, 100) };

  try {
    const parsed = await parseText(text, meta);
```

Then find the `createExpense({ ... })` call inside the same function:

```js
    const transaction = await createExpense({
      amount: parsed.amount,
      description: parsed.description,
      vendor: parsed.vendor,
      category_id: parsed.category_id,
      date: parsed.date,
      type: parsed.type || 'expense',
      source: 'whatsapp',
      raw_text: text
    });
```

Replace with (add `, meta` as the second argument):

```js
    const transaction = await createExpense({
      amount: parsed.amount,
      description: parsed.description,
      vendor: parsed.vendor,
      category_id: parsed.category_id,
      date: parsed.date,
      type: parsed.type || 'expense',
      source: 'whatsapp',
      raw_text: text
    }, meta);
```

- [ ] **Step 3: Update `handleImageTransaction` to pass `meta`**

Find:

```js
export async function handleImageTransaction(sock, msg, jid, caption = '') {
  await reply(sock, jid, 'Analyzing image...', msg);

  try {
    const buffer = await downloadMediaMessage(msg, 'buffer', {});
    const base64 = buffer.toString('base64');
    const parsed = await parseImage(base64);
```

Replace with:

```js
export async function handleImageTransaction(sock, msg, jid, caption = '') {
  await reply(sock, jid, 'Analyzing image...', msg);

  const meta = {
    sender: jid,
    messagePreview: caption ? caption.slice(0, 100) : '(image, no caption)'
  };

  try {
    const buffer = await downloadMediaMessage(msg, 'buffer', {});
    const base64 = buffer.toString('base64');
    const parsed = await parseImage(base64, meta);
```

Then find the `uploadImage` call:

```js
      const uploadResult = await uploadImage(base64, filename);
```

Replace with:

```js
      const uploadResult = await uploadImage(base64, filename, meta);
```

Then find the `createExpense({ ... })` call inside `handleImageTransaction`:

```js
    const transaction = await createExpense({
      amount: parsed.amount,
      description: parsed.description,
      vendor: parsed.vendor,
      category_id: parsed.category_id,
      date: parsed.date,
      type: parsed.type || 'expense',
      source: 'whatsapp_image',
      image_url: imageUrl,
      raw_text: caption || null
    });
```

Replace with (add `, meta`):

```js
    const transaction = await createExpense({
      amount: parsed.amount,
      description: parsed.description,
      vendor: parsed.vendor,
      category_id: parsed.category_id,
      date: parsed.date,
      type: parsed.type || 'expense',
      source: 'whatsapp_image',
      image_url: imageUrl,
      raw_text: caption || null
    }, meta);
```

- [ ] **Step 4: Verify the file parses**

Run: `node --check expense-tracker/whatsapp-bot/src/handlers/expense.js`
Expected: exits 0 with no output.

- [ ] **Step 5: Commit**

```bash
git add expense-tracker/whatsapp-bot/src/handlers/expense.js
git commit -m "feat(whatsapp-bot): thread meta context through expense handlers"
```

---

### Task 4: Wire `DISCORD_WEBHOOK_URL` into docker-compose

**Files:**
- Modify: `expense-tracker/docker-compose.yml`

- [ ] **Step 1: Add the env var under the `whatsapp-bot` service**

Find:

```yaml
    environment:
      - API_URL=http://api:3000
      - ALLOWED_NUMBERS=${ALLOWED_NUMBERS}
      - DASHBOARD_PIN=${DASHBOARD_PIN}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - ALLOWED_GROUPS=${ALLOWED_GROUPS}
      - NODE_ENV=production
      - HEALTH_PORT=3004
```

Replace with:

```yaml
    environment:
      - API_URL=http://api:3000
      - ALLOWED_NUMBERS=${ALLOWED_NUMBERS}
      - DASHBOARD_PIN=${DASHBOARD_PIN}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - ALLOWED_GROUPS=${ALLOWED_GROUPS}
      - DISCORD_WEBHOOK_URL=${DISCORD_WEBHOOK_URL:-}
      - NODE_ENV=production
      - HEALTH_PORT=3004
```

The `:-` fallback means the var is passed as an empty string when not set in the host env, which `discord.js` treats as "disabled" (its first line returns early when `WEBHOOK_URL` is falsy).

- [ ] **Step 2: Verify the compose file is valid**

Run:

```bash
cd expense-tracker && docker compose config >/dev/null
```

Expected: exits 0 with no errors. (If `docker compose` is unavailable locally, skip this step — it'll be checked on deploy.)

- [ ] **Step 3: Commit**

```bash
git add expense-tracker/docker-compose.yml
git commit -m "feat(whatsapp-bot): expose DISCORD_WEBHOOK_URL to the container"
```

---

### Task 5: Manual end-to-end verification

This task has no code. It is the verification plan from the spec. Run as many scenarios as you can before handing off.

**Prereqs:**
- A test Discord webhook URL (create one in a sandbox channel, or reuse the deploy channel if you're comfortable with a few test pings).
- Local docker compose stack for expense-tracker, or a deploy target.

- [ ] **Scenario A — no webhook set (default path):**

  1. Ensure `DISCORD_WEBHOOK_URL` is NOT set in the shell env.
  2. `cd expense-tracker && docker compose up -d --build whatsapp-bot`
  3. Send a valid expense via WhatsApp (e.g. `50k lunch`).
  4. Expected: expense recorded normally, no Discord notifications anywhere.
  5. `docker logs expense-tracker-whatsapp | grep -i discord` → no lines.

- [ ] **Scenario B — webhook set, API healthy:**

  1. `export DISCORD_WEBHOOK_URL=<test webhook>`
  2. `cd expense-tracker && docker compose up -d --build whatsapp-bot`
  3. Send a valid expense.
  4. Expected: expense recorded, NO Discord embed (success path stays quiet).

- [ ] **Scenario C — network error (API down):**

  1. With webhook still set: `docker compose stop api`
  2. Send an expense from WhatsApp.
  3. Expected: user sees `Error: ...` reply in WhatsApp. Discord channel receives an embed titled `❌ Expense bot: ECONNREFUSED on /api/parse/text` (or similar) with Status `network`, correct sender JID, and the message text in the Message field.
  4. `docker compose start api` to restore.

- [ ] **Scenario D — 5xx response:**

  Easiest way to force a 500 without code changes: stop the api mid-submission, or temporarily break the DB by renaming the sqlite file inside the container. Alternatively, add a one-line `throw new Error('test')` at the top of `expense-tracker/api` `/api/parse/text` route, rebuild only the api container, test, then revert.

  1. With webhook set and 500 induced, send an expense.
  2. Expected: user gets `Error: ...`. Discord embed arrives with title `❌ Expense bot: 500 on /api/parse/text`, Status `500`, error message from the API body, sender, and preview.
  3. Revert any temporary API changes.

- [ ] **Scenario E — 4xx stays silent:**

  Send something the parser is expected to reject (exact trigger depends on how `/api/parse/text` validates input — the spec treats any 4xx identically). Or temporarily make the endpoint return 400.

  1. Submit.
  2. Expected: user gets the usual "Couldn't parse" reply. Discord channel receives NO embed.

- [ ] **If all scenarios pass, the feature is done.** Clean up any test artifacts in the Discord channel.

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| `discord.js` module with `notifyError` | Task 1 |
| Axios response interceptor, skip 4xx | Task 2 |
| `meta` param on every exported API function | Task 2 |
| Pull endpoint/method/status/message from axios error | Task 2 |
| `meta` built in each handler (text, image, categories) | Task 3 |
| Image handler caption fallback | Task 3 Step 3 |
| `DISCORD_WEBHOOK_URL` wired in docker-compose | Task 4 |
| Unset env → no-op | Task 1 Step 1 (early return) + Task 4 (`:-` fallback) |
| Embed format matches spec | Task 1 Step 1 |
| Field truncation | Task 1 Step 1 (`truncate` helper) |
| `notifyError` never throws | Task 1 Step 1 (try/catch around fetch) |
| Fire-and-forget from interceptor | Task 2 Step 1 (no `await` on `notifyError`) |
| All 5 test scenarios from spec | Task 5 |

No gaps.

**Placeholder scan:** No TBDs, no "handle appropriately", no missing code. All tasks have concrete commands and code.

**Type consistency:** `notifyError` signature `{ endpoint, method, status, errorMessage, sender, messagePreview }` — matches in Task 1 definition, Task 2 call site. `meta` shape `{ sender, messagePreview }` — matches in Task 2 interceptor read and Task 3 handler writes. Consistent.
