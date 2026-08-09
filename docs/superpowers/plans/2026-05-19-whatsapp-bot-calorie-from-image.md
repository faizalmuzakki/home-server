# WhatsApp Bot — Calorie Estimation from Food Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the expense-tracker WhatsApp bot estimate calories + macros + per-item breakdown from a food photo sent in a DM, store it per sender, reply with a summary, and show it in a new dashboard tab.

**Architecture:** One Claude Vision call classifies each DM image as `expense | food | unknown` and returns the matching payload. Food entries are persisted to a new `calorie_entries` SQLite table via a pure data-access module, exposed through new `/api/calories` routes, and rendered in a new dashboard `Calories` tab. Group images stay ignored. Pure logic (data access, sender-name, reply formatting, kind-defaulting) is built TDD with Node's built-in test runner; Express/dashboard wiring is thin glue verified by running.

**Tech Stack:** Node 20 ESM, Express 4, better-sqlite3, express-validator, Baileys, Vite + React, `node --test` (built-in, no new deps).

**Spec:** `docs/superpowers/specs/2026-05-18-whatsapp-bot-calorie-from-image-design.md`

**Working directory for all paths:** `/home/solork/Projects/home-server/expense-tracker`

---

### Task 1: Add zero-dependency test runner

**Files:**
- Modify: `expense-tracker/api/package.json`
- Modify: `expense-tracker/whatsapp-bot/package.json`

- [ ] **Step 1: Add a `test` script to the api package**

In `expense-tracker/api/package.json`, change the `"scripts"` block to:

```json
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js",
    "test": "node --test",
    "audit": "npm audit --audit-level=moderate",
    "audit:fix": "npm audit fix"
  },
```

- [ ] **Step 2: Add a `test` script to the whatsapp-bot package**

In `expense-tracker/whatsapp-bot/package.json`, change the `"scripts"` block to:

```json
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js",
    "test": "node --test",
    "audit": "npm audit --audit-level=moderate"
  },
```

- [ ] **Step 3: Verify the runner works (no tests yet = exit 0)**

Run: `cd expense-tracker/api && npm test`
Expected: command exits 0 with "tests 0" / "pass 0" (Node prints a TAP summary with no test files).

- [ ] **Step 4: Commit**

```bash
cd /home/solork/Projects/home-server
git add expense-tracker/api/package.json expense-tracker/whatsapp-bot/package.json
git commit -m "chore(expense-tracker): add node --test runner to api and bot"
```

---

### Task 2: Calorie data-access module (TDD)

A pure module that owns the `calorie_entries` schema and all reads/writes. Every function takes a `better-sqlite3` `db` handle as its first argument so tests can pass an in-memory DB and routes pass the shared one.

**Files:**
- Create: `expense-tracker/api/src/db/calories.js`
- Test: `expense-tracker/api/src/db/calories.test.js`

- [ ] **Step 1: Write the failing test**

Create `expense-tracker/api/src/db/calories.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  initCalorieSchema,
  insertCalorieEntry,
  listCalorieEntries,
  calorieSummary
} from './calories.js';

function freshDb() {
  const db = new Database(':memory:');
  initCalorieSchema(db);
  return db;
}

test('insertCalorieEntry stores and returns the row with an id', () => {
  const db = freshDb();
  const row = insertCalorieEntry(db, {
    sender_id: '628111',
    sender_name: 'Faizal',
    description: 'Nasi goreng + telur',
    calories: 650,
    protein_g: 28,
    carbs_g: 72,
    fat_g: 24,
    items: [{ name: 'Nasi goreng', calories: 450, portion: '1 plate' }],
    confidence: 0.7,
    image_url: '/uploads/food_1.jpg',
    date: '2026-05-19'
  });
  assert.ok(row.id > 0);
  assert.equal(row.calories, 650);
  assert.equal(row.sender_name, 'Faizal');
  assert.deepEqual(JSON.parse(row.items), [
    { name: 'Nasi goreng', calories: 450, portion: '1 plate' }
  ]);
});

test('listCalorieEntries filters by sender and date range, newest first', () => {
  const db = freshDb();
  insertCalorieEntry(db, { sender_id: 'A', calories: 100, date: '2026-05-17' });
  insertCalorieEntry(db, { sender_id: 'A', calories: 200, date: '2026-05-19' });
  insertCalorieEntry(db, { sender_id: 'B', calories: 999, date: '2026-05-19' });

  const all = listCalorieEntries(db, {});
  assert.equal(all.length, 3);

  const aOnly = listCalorieEntries(db, { sender_id: 'A' });
  assert.equal(aOnly.length, 2);
  assert.equal(aOnly[0].calories, 200); // newest date first

  const ranged = listCalorieEntries(db, { startDate: '2026-05-18', endDate: '2026-05-19' });
  assert.equal(ranged.length, 2);
});

test('calorieSummary aggregates kcal and macros per sender', () => {
  const db = freshDb();
  insertCalorieEntry(db, { sender_id: 'A', sender_name: 'Al', calories: 100, protein_g: 10, carbs_g: 5, fat_g: 2, date: '2026-05-19' });
  insertCalorieEntry(db, { sender_id: 'A', sender_name: 'Al', calories: 250, protein_g: 20, carbs_g: 15, fat_g: 8, date: '2026-05-19' });
  insertCalorieEntry(db, { sender_id: 'B', sender_name: 'Bo', calories: 400, protein_g: 30, carbs_g: 40, fat_g: 12, date: '2026-05-19' });

  const summary = calorieSummary(db, {});
  const a = summary.find(s => s.sender_id === 'A');
  const b = summary.find(s => s.sender_id === 'B');
  assert.equal(a.sender_name, 'Al');
  assert.equal(a.total_calories, 350);
  assert.equal(a.total_protein_g, 30);
  assert.equal(a.entry_count, 2);
  assert.equal(b.total_calories, 400);
});

test('calorieSummary today() filter returns only today rows', () => {
  const db = freshDb();
  const today = new Date().toISOString().split('T')[0];
  insertCalorieEntry(db, { sender_id: 'A', calories: 500, date: today });
  insertCalorieEntry(db, { sender_id: 'A', calories: 999, date: '2000-01-01' });
  const summary = calorieSummary(db, { startDate: today, endDate: today });
  assert.equal(summary.length, 1);
  assert.equal(summary[0].total_calories, 500);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd expense-tracker/api && node --test src/db/calories.test.js`
Expected: FAIL — `Cannot find module './calories.js'`.

- [ ] **Step 3: Write the minimal implementation**

Create `expense-tracker/api/src/db/calories.js`:

```js
// Data-access module for calorie entries. Every function takes a better-sqlite3
// `db` handle so the same code serves the live DB and in-memory test DBs.

export function initCalorieSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS calorie_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id   TEXT NOT NULL,
      sender_name TEXT,
      description TEXT,
      calories    INTEGER NOT NULL,
      protein_g   REAL,
      carbs_g     REAL,
      fat_g       REAL,
      items       TEXT,
      confidence  REAL,
      image_url   TEXT,
      date        DATE NOT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_calorie_sender ON calorie_entries(sender_id);
    CREATE INDEX IF NOT EXISTS idx_calorie_date   ON calorie_entries(date);
  `);
}

export function insertCalorieEntry(db, entry) {
  const itemsJson = entry.items == null ? null : JSON.stringify(entry.items);
  const info = db.prepare(`
    INSERT INTO calorie_entries
      (sender_id, sender_name, description, calories, protein_g, carbs_g,
       fat_g, items, confidence, image_url, date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.sender_id,
    entry.sender_name ?? null,
    entry.description ?? null,
    Math.round(entry.calories),
    entry.protein_g ?? null,
    entry.carbs_g ?? null,
    entry.fat_g ?? null,
    itemsJson,
    entry.confidence ?? null,
    entry.image_url ?? null,
    entry.date
  );
  return db.prepare('SELECT * FROM calorie_entries WHERE id = ?').get(info.lastInsertRowid);
}

function dateRangeClause({ sender_id, startDate, endDate }) {
  let where = ' WHERE 1=1';
  const params = [];
  if (sender_id) { where += ' AND sender_id = ?'; params.push(sender_id); }
  if (startDate) { where += ' AND DATE(date) >= DATE(?)'; params.push(startDate); }
  if (endDate)   { where += ' AND DATE(date) <= DATE(?)'; params.push(endDate); }
  return { where, params };
}

export function listCalorieEntries(db, filters = {}) {
  const { where, params } = dateRangeClause(filters);
  const limit = Number.isFinite(+filters.limit) ? +filters.limit : 100;
  return db.prepare(
    `SELECT * FROM calorie_entries${where} ORDER BY DATE(date) DESC, created_at DESC LIMIT ?`
  ).all(...params, limit);
}

export function calorieSummary(db, filters = {}) {
  const { where, params } = dateRangeClause(filters);
  return db.prepare(`
    SELECT
      sender_id,
      MAX(sender_name) AS sender_name,
      COALESCE(SUM(calories), 0)  AS total_calories,
      COALESCE(SUM(protein_g), 0) AS total_protein_g,
      COALESCE(SUM(carbs_g), 0)   AS total_carbs_g,
      COALESCE(SUM(fat_g), 0)     AS total_fat_g,
      COUNT(*) AS entry_count
    FROM calorie_entries${where}
    GROUP BY sender_id
    ORDER BY total_calories DESC
  `).all(...params);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd expense-tracker/api && node --test src/db/calories.test.js`
Expected: PASS — 4 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
cd /home/solork/Projects/home-server
git add expense-tracker/api/src/db/calories.js expense-tracker/api/src/db/calories.test.js
git commit -m "feat(expense-tracker): calorie_entries data-access module with tests"
```

---

### Task 3: Wire the calorie schema into DB init

**Files:**
- Modify: `expense-tracker/api/src/db/init.js`

- [ ] **Step 1: Import the schema initializer**

In `expense-tracker/api/src/db/init.js`, add this import directly below the existing `import Database from 'better-sqlite3';` line group (after the `fileURLToPath` import line):

```js
import { initCalorieSchema } from './calories.js';
```

- [ ] **Step 2: Call it inside initDatabase()**

In `expense-tracker/api/src/db/init.js`, find the end of the `export function initDatabase() {` body — the last statement before its closing `}`. Immediately before that closing brace add:

```js
  // Calorie tracking (food-image estimation). Additive — no migration needed.
  initCalorieSchema(db);
```

- [ ] **Step 3: Verify the API still boots and creates the table**

Run:
```bash
cd expense-tracker/api && DB_PATH=/tmp/cal_init_check.db node -e "import('./src/db/init.js').then(m=>{m.initDatabase();const D=require('better-sqlite3');const d=new D('/tmp/cal_init_check.db');console.log(d.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name='calorie_entries'\").get());})"
```
Expected: prints `{ name: 'calorie_entries' }`. Then `rm -f /tmp/cal_init_check.db`.

- [ ] **Step 4: Commit**

```bash
cd /home/solork/Projects/home-server
git add expense-tracker/api/src/db/init.js
git commit -m "feat(expense-tracker): create calorie_entries table on db init"
```

---

### Task 4: Calorie API validators

**Files:**
- Modify: `expense-tracker/api/src/middleware/validators.js`

- [ ] **Step 1: Append calorie validators**

At the end of `expense-tracker/api/src/middleware/validators.js`, append:

```js
// Calorie entry validators
export const createCalorieValidators = [
    body('sender_id')
        .notEmpty().withMessage('sender_id is required')
        .isString().withMessage('sender_id must be a string')
        .isLength({ max: 64 }).withMessage('sender_id too long (max 64 chars)'),
    body('sender_name')
        .optional({ nullable: true })
        .isString().withMessage('sender_name must be a string')
        .isLength({ max: 128 }).withMessage('sender_name too long (max 128 chars)'),
    body('description')
        .optional({ nullable: true })
        .isString().withMessage('description must be a string')
        .isLength({ max: 500 }).withMessage('description too long (max 500 chars)'),
    body('calories')
        .notEmpty().withMessage('calories is required')
        .isNumeric().withMessage('calories must be a number')
        .custom(v => parseFloat(v) > 0 && parseFloat(v) <= 20000)
        .withMessage('calories must be between 1 and 20000'),
    body('protein_g').optional({ nullable: true }).isNumeric().withMessage('protein_g must be a number'),
    body('carbs_g').optional({ nullable: true }).isNumeric().withMessage('carbs_g must be a number'),
    body('fat_g').optional({ nullable: true }).isNumeric().withMessage('fat_g must be a number'),
    body('confidence').optional({ nullable: true }).isFloat({ min: 0, max: 1 }).withMessage('confidence must be 0-1'),
    body('items')
        .optional({ nullable: true })
        .isArray({ max: 30 }).withMessage('items must be an array (max 30)'),
    body('image_url').optional({ nullable: true }).isString().isLength({ max: 300 }),
    body('date')
        .notEmpty().withMessage('date is required')
        .isString().withMessage('date must be a string')
        .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('date must be YYYY-MM-DD'),
    handleValidationErrors,
];

export const listCalorieValidators = [
    handleValidationErrors,
];
```

- [ ] **Step 2: Syntax-check the file**

Run: `cd expense-tracker/api && node --check src/middleware/validators.js`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
cd /home/solork/Projects/home-server
git add expense-tracker/api/src/middleware/validators.js
git commit -m "feat(expense-tracker): add calorie entry validators"
```

---

### Task 5: Calorie API routes

**Files:**
- Create: `expense-tracker/api/src/routes/calories.js`
- Modify: `expense-tracker/api/src/index.js`

- [ ] **Step 1: Create the route module**

Create `expense-tracker/api/src/routes/calories.js`:

```js
import { Router } from 'express';
import { db } from '../db/init.js';
import { insertCalorieEntry, listCalorieEntries, calorieSummary } from '../db/calories.js';
import { createCalorieValidators, listCalorieValidators } from '../middleware/validators.js';

const router = Router();

// Create a calorie entry (called by the WhatsApp bot)
router.post('/', createCalorieValidators, (req, res) => {
  try {
    const row = insertCalorieEntry(db, req.body);
    res.status(201).json(row);
  } catch (error) {
    console.error('Create calorie entry error:', error);
    res.status(500).json({ error: error.message });
  }
});

// List entries: ?sender_id=&startDate=&endDate=&limit=
router.get('/', listCalorieValidators, (req, res) => {
  try {
    const rows = listCalorieEntries(db, req.query);
    res.json(rows);
  } catch (error) {
    console.error('List calorie entries error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Per-sender aggregated totals: ?startDate=&endDate=
router.get('/summary', listCalorieValidators, (req, res) => {
  try {
    const rows = calorieSummary(db, req.query);
    res.json(rows);
  } catch (error) {
    console.error('Calorie summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

- [ ] **Step 2: Import and mount the router in index.js**

In `expense-tracker/api/src/index.js`, add this import immediately after the existing `import travelExpenseRoutes from './routes/travel-expenses.js';` line:

```js
import calorieRoutes from './routes/calories.js';
```

Then, immediately after the existing `app.use('/api/travel-expenses', travelExpenseRoutes);` line, add:

```js
app.use('/api/calories', calorieRoutes);
```

- [ ] **Step 3: Integration-verify the endpoints against a live server**

Run (single block — boots the API on a temp DB, exercises all three endpoints, then stops it):

```bash
cd expense-tracker/api && DB_PATH=/tmp/cal_api_check.db PORT=3999 node src/index.js & SRV=$!; sleep 2; \
curl -s -X POST localhost:3999/api/calories -H 'Content-Type: application/json' \
  -d '{"sender_id":"628111","sender_name":"Faizal","description":"Nasi goreng","calories":650,"protein_g":28,"carbs_g":72,"fat_g":24,"items":[{"name":"Nasi goreng","calories":450,"portion":"1 plate"}],"confidence":0.7,"date":"2026-05-19"}'; echo; \
curl -s "localhost:3999/api/calories?sender_id=628111"; echo; \
curl -s "localhost:3999/api/calories/summary"; echo; \
curl -s -X POST localhost:3999/api/calories -H 'Content-Type: application/json' -d '{"sender_id":"x","calories":-5,"date":"2026-05-19"}'; echo; \
kill $SRV; rm -f /tmp/cal_api_check.db
```

Expected:
- POST → JSON object with `"id": 1`, `"calories": 650`.
- GET list → array containing that entry.
- GET summary → `[{"sender_id":"628111","sender_name":"Faizal","total_calories":650,...,"entry_count":1}]`.
- POST with `calories:-5` → HTTP body `{"error":"Validation failed",...}` (rejected).

- [ ] **Step 4: Commit**

```bash
cd /home/solork/Projects/home-server
git add expense-tracker/api/src/routes/calories.js expense-tracker/api/src/index.js
git commit -m "feat(expense-tracker): /api/calories create, list, and summary routes"
```

---

### Task 6: Extend image parsing to classify food vs receipt

The vision call must return a `kind` discriminator. The expense path stays backward compatible (missing/`"expense"` `kind` → expense behavior unchanged).

**Files:**
- Modify: `expense-tracker/api/src/routes/parse.js`

- [ ] **Step 1: Replace the image prompt and add kind defaulting**

In `expense-tracker/api/src/routes/parse.js`, inside the `router.post('/image', ...)` handler, replace the single `{ type: 'text', text: \`Analyze this image ...\` }` object's `text` value (the entire template string that currently starts with `Analyze this image and determine if it shows an EXPENSE`) with this template string:

```
`First classify this image, then extract data.

Set "kind" to:
- "expense" if it is a receipt, invoice, bill, purchase, or payment/transfer proof (money spent or received)
- "food" if it is a photo of food or a meal/drink to estimate nutrition for
- "unknown" if it is neither (e.g. screenshot, person, scenery, order tracking)

EXPENSE categories:
${expenseCategoryList}

INCOME categories:
${incomeCategoryList}

If kind is "expense", return ONLY this JSON:
{
  "kind": "expense",
  "type": "expense" or "income",
  "amount": <number - total amount>,
  "description": "<brief description>",
  "vendor": "<store/sender name>",
  "category_id": <number from the appropriate category list above>,
  "date": "<YYYY-MM-DD from image, or today: ${new Date().toISOString().split('T')[0]}>",
  "items": ["<item1>", "<item2>"],
  "confidence": <0-1>
}

If kind is "food", estimate nutrition and return ONLY this JSON:
{
  "kind": "food",
  "description": "<short description of the meal, e.g. 'Nasi goreng + telur + es teh'>",
  "calories": <integer total kcal estimate>,
  "protein_g": <number grams>,
  "carbs_g": <number grams>,
  "fat_g": <number grams>,
  "items": [{"name": "<food>", "calories": <integer>, "portion": "<e.g. 1 plate>"}],
  "date": "${new Date().toISOString().split('T')[0]}",
  "confidence": <0-1>
}

If kind is "unknown", return ONLY: {"kind": "unknown", "reason": "<short reason>"}`
```

- [ ] **Step 2: Default kind for backward compatibility**

In `expense-tracker/api/src/routes/parse.js`, in the `/image` handler, find:

```js
    const content = response.content[0].text;
    const parsed = JSON.parse(extractJsonObject(content));
```

Immediately after those two lines add:

```js
    // Backward compat: older prompt versions / receipts without an explicit
    // discriminator are treated as expenses.
    if (!parsed.kind && !parsed.error) parsed.kind = 'expense';
```

- [ ] **Step 3: Syntax-check**

Run: `cd expense-tracker/api && node --check src/routes/parse.js`
Expected: no output, exit 0.

- [ ] **Step 4: Commit**

```bash
cd /home/solork/Projects/home-server
git add expense-tracker/api/src/routes/parse.js
git commit -m "feat(expense-tracker): classify image as expense/food/unknown in one vision call"
```

---

### Task 7: Bot `getSenderName` helper (TDD)

**Files:**
- Modify: `expense-tracker/whatsapp-bot/src/utils/message.js`
- Test: `expense-tracker/whatsapp-bot/src/utils/message.test.js`

- [ ] **Step 1: Write the failing test**

Create `expense-tracker/whatsapp-bot/src/utils/message.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSenderName } from './message.js';

test('getSenderName returns pushName when present', () => {
  assert.equal(getSenderName({ pushName: 'Faizal' }), 'Faizal');
});

test('getSenderName falls back to empty string', () => {
  assert.equal(getSenderName({}), '');
  assert.equal(getSenderName({ pushName: null }), '');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd expense-tracker/whatsapp-bot && node --test src/utils/message.test.js`
Expected: FAIL — `getSenderName` is not a function / not exported.

- [ ] **Step 3: Add the helper**

In `expense-tracker/whatsapp-bot/src/utils/message.js`, immediately after the existing `getSenderId` function, add:

```js
export function getSenderName(msg) {
  return msg.pushName || '';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd expense-tracker/whatsapp-bot && node --test src/utils/message.test.js`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
cd /home/solork/Projects/home-server
git add expense-tracker/whatsapp-bot/src/utils/message.js expense-tracker/whatsapp-bot/src/utils/message.test.js
git commit -m "feat(expense-tracker): add getSenderName bot helper with tests"
```

---

### Task 8: Bot API client methods for calories

**Files:**
- Modify: `expense-tracker/whatsapp-bot/src/services/api.js`

- [ ] **Step 1: Add createCalorieEntry and getCalorieSummary**

At the end of `expense-tracker/whatsapp-bot/src/services/api.js`, append:

```js
export async function createCalorieEntry(entry, meta = {}) {
  const response = await api.post('/api/calories', entry, { meta });
  return response.data;
}

export async function getCalorieSummary(params = {}, meta = {}) {
  const response = await api.get('/api/calories/summary', { params, meta });
  return response.data;
}
```

- [ ] **Step 2: Syntax-check**

Run: `cd expense-tracker/whatsapp-bot && node --check src/services/api.js`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
cd /home/solork/Projects/home-server
git add expense-tracker/whatsapp-bot/src/services/api.js
git commit -m "feat(expense-tracker): bot API client methods for calorie entries"
```

---

### Task 9: Food reply formatter (TDD)

A pure function that formats the WhatsApp reply text, kept separate so it can be unit-tested without Baileys.

**Files:**
- Create: `expense-tracker/whatsapp-bot/src/handlers/calorieFormat.js`
- Test: `expense-tracker/whatsapp-bot/src/handlers/calorieFormat.test.js`

- [ ] **Step 1: Write the failing test**

Create `expense-tracker/whatsapp-bot/src/handlers/calorieFormat.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatFoodReply, formatTodaySummary } from './calorieFormat.js';

test('formatFoodReply renders name, kcal, macros, items, cost', () => {
  const text = formatFoodReply({
    name: 'Faizal',
    parsed: {
      calories: 650, protein_g: 28, carbs_g: 72, fat_g: 24,
      items: [
        { name: 'Nasi goreng', calories: 450 },
        { name: 'Fried egg', calories: 90 }
      ],
      confidence: 0.7,
      usage: { input_tokens: 1450, output_tokens: 180 }
    }
  });
  assert.match(text, /Logged for Faizal/);
  assert.match(text, /650 kcal/);
  assert.match(text, /P 28g · C 72g · F 24g/);
  assert.match(text, /Nasi goreng \(~450\)/);
  assert.match(text, /Confidence 70%/);
  assert.match(text, /Tokens 1450\/180/);
});

test('formatFoodReply tolerates missing macros and items', () => {
  const text = formatFoodReply({ name: '', parsed: { calories: 300 } });
  assert.match(text, /Logged/);
  assert.match(text, /300 kcal/);
});

test('formatTodaySummary renders per-sender total or empty message', () => {
  assert.match(formatTodaySummary(null), /No food logged today/);
  const text = formatTodaySummary({
    sender_name: 'Faizal',
    total_calories: 1450, total_protein_g: 60, total_carbs_g: 150, total_fat_g: 48,
    entry_count: 3
  });
  assert.match(text, /Faizal/);
  assert.match(text, /1450 kcal/);
  assert.match(text, /3 meal/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd expense-tracker/whatsapp-bot && node --test src/handlers/calorieFormat.test.js`
Expected: FAIL — `Cannot find module './calorieFormat.js'`.

- [ ] **Step 3: Write the implementation**

Create `expense-tracker/whatsapp-bot/src/handlers/calorieFormat.js`:

```js
function round(n) {
  return n == null ? null : Math.round(n);
}

export function formatFoodReply({ name, parsed, imageSaved }) {
  const who = name ? ` for ${name}` : '';
  const lines = [`🍽️ Logged${who}`, `~${round(parsed.calories)} kcal`];

  if (parsed.protein_g != null || parsed.carbs_g != null || parsed.fat_g != null) {
    lines.push(`P ${round(parsed.protein_g) ?? 0}g · C ${round(parsed.carbs_g) ?? 0}g · F ${round(parsed.fat_g) ?? 0}g`);
  }

  for (const item of (parsed.items || []).slice(0, 8)) {
    const kcal = item.calories != null ? ` (~${round(item.calories)})` : '';
    lines.push(`• ${item.name}${kcal}`);
  }

  if (imageSaved) lines.push('Image: saved');

  const inTok = parsed.usage?.input_tokens || 0;
  const outTok = parsed.usage?.output_tokens || 0;
  const cost = (inTok * 0.000003 + outTok * 0.000015).toFixed(6);
  lines.push(`Confidence ${Math.round((parsed.confidence || 0) * 100)}% | Tokens ${inTok}/${outTok} (~$${cost})`);

  return lines.join('\n');
}

export function formatTodaySummary(summaryRow) {
  if (!summaryRow || !summaryRow.total_calories) {
    return 'No food logged today. Send a photo of your meal to track it.';
  }
  const name = summaryRow.sender_name || 'You';
  return [
    `🍽️ ${name} — today`,
    `~${round(summaryRow.total_calories)} kcal`,
    `P ${round(summaryRow.total_protein_g) ?? 0}g · C ${round(summaryRow.total_carbs_g) ?? 0}g · F ${round(summaryRow.total_fat_g) ?? 0}g`,
    `${summaryRow.entry_count} meal(s) logged`
  ].join('\n');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd expense-tracker/whatsapp-bot && node --test src/handlers/calorieFormat.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
cd /home/solork/Projects/home-server
git add expense-tracker/whatsapp-bot/src/handlers/calorieFormat.js expense-tracker/whatsapp-bot/src/handlers/calorieFormat.test.js
git commit -m "feat(expense-tracker): pure food/today reply formatters with tests"
```

---

### Task 10: Food image handler + kind routing

**Files:**
- Create: `expense-tracker/whatsapp-bot/src/handlers/calories.js`
- Modify: `expense-tracker/whatsapp-bot/src/handlers/expense.js`
- Modify: `expense-tracker/whatsapp-bot/src/handlers/message.js`

- [ ] **Step 1: Create the food handler**

Create `expense-tracker/whatsapp-bot/src/handlers/calories.js`:

```js
import { createCalorieEntry, uploadImage } from '../services/api.js';
import { reply } from '../utils/message.js';
import { formatFoodReply } from './calorieFormat.js';

const MAX_REASONABLE_KCAL = 20000;

export async function handleFoodImage(sock, msg, jid, parsed, base64, senderId, senderName) {
  if (!parsed.calories || parsed.calories <= 0 || parsed.calories > MAX_REASONABLE_KCAL) {
    return reply(sock, jid, "I see food but couldn't estimate calories reliably. Try a clearer, closer photo of the meal.", msg);
  }

  const meta = { sender: jid, messagePreview: '(food image)' };

  let imageUrl = null;
  try {
    const uploadResult = await uploadImage(base64, `food_${Date.now()}.jpg`, meta);
    imageUrl = uploadResult.image_url;
  } catch (error) {
    console.error('Failed to save food image:', error);
  }

  await createCalorieEntry({
    sender_id: senderId,
    sender_name: senderName || null,
    description: parsed.description || null,
    calories: parsed.calories,
    protein_g: parsed.protein_g ?? null,
    carbs_g: parsed.carbs_g ?? null,
    fat_g: parsed.fat_g ?? null,
    items: Array.isArray(parsed.items) ? parsed.items : null,
    confidence: parsed.confidence ?? null,
    image_url: imageUrl,
    date: parsed.date || new Date().toISOString().split('T')[0]
  }, meta);

  await reply(sock, jid, formatFoodReply({ name: senderName, parsed, imageSaved: !!imageUrl }), msg);
}
```

- [ ] **Step 2: Route on `kind` in handleImageTransaction**

In `expense-tracker/whatsapp-bot/src/handlers/expense.js`:

(a) Replace the import line:

```js
import { createExpense, getCategories, parseImage, parseText, uploadImage } from '../services/api.js';
```

with:

```js
import { createExpense, getCategories, parseImage, parseText, uploadImage } from '../services/api.js';
import { handleFoodImage } from './calories.js';
import { getSenderId, getSenderName } from '../utils/message.js';
```

(b) Change the signature of `handleImageTransaction` from:

```js
export async function handleImageTransaction(sock, msg, jid, caption = '') {
```

to:

```js
export async function handleImageTransaction(sock, msg, jid, caption = '') {
```

(unchanged signature — caller passes `msg`, sender derived inside). Then find these lines in `handleImageTransaction`:

```js
    const buffer = await downloadMediaMessage(msg, 'buffer', {});
    const base64 = buffer.toString('base64');
    const parsed = await parseImage(base64, meta);

    if (parsed.error) {
      return reply(sock, jid, `Couldn't parse: ${parsed.error}`, msg);
    }
```

and replace them with:

```js
    const buffer = await downloadMediaMessage(msg, 'buffer', {});
    const base64 = buffer.toString('base64');
    const parsed = await parseImage(base64, meta);

    if (parsed.error) {
      return reply(sock, jid, `Couldn't parse: ${parsed.error}`, msg);
    }

    if (parsed.kind === 'unknown') {
      return reply(sock, jid, "I couldn't tell if this is a receipt or food. Send a clear photo of a receipt to log an expense, or a meal to track calories.", msg);
    }

    if (parsed.kind === 'food') {
      return handleFoodImage(sock, msg, jid, parsed, base64, getSenderId(msg), getSenderName(msg));
    }
```

- [ ] **Step 3: Confirm message.js already passes through (no change expected)**

Open `expense-tracker/whatsapp-bot/src/handlers/message.js` and confirm the existing DM branch is:

```js
  if (hasImage(msg)) {
    if (!isGroup) await handleImageTransaction(sock, msg, jid, text);
    return;
  }
```

No edit needed — routing now happens inside `handleImageTransaction`. (If this block differs, stop and report.)

- [ ] **Step 4: Syntax-check all three files**

Run:
```bash
cd expense-tracker/whatsapp-bot && node --check src/handlers/calories.js && node --check src/handlers/expense.js && node --check src/handlers/message.js
```
Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
cd /home/solork/Projects/home-server
git add expense-tracker/whatsapp-bot/src/handlers/calories.js expense-tracker/whatsapp-bot/src/handlers/expense.js expense-tracker/whatsapp-bot/src/handlers/message.js
git commit -m "feat(expense-tracker): route food images to calorie tracking"
```

---

### Task 11: `/calories` command (today's total for sender)

**Files:**
- Modify: `expense-tracker/whatsapp-bot/src/commands/index.js`

- [ ] **Step 1: Add imports**

In `expense-tracker/whatsapp-bot/src/commands/index.js`, find:

```js
import { sendCategories, sendPin } from '../handlers/expense.js';
```

Immediately after it add:

```js
import { getCalorieSummary } from '../services/api.js';
import { formatTodaySummary } from '../handlers/calorieFormat.js';
import { getSenderId } from '../utils/message.js';
```

- [ ] **Step 2: Register the command**

In `expense-tracker/whatsapp-bot/src/commands/index.js`, locate the exported `commands` array (it contains entries with `name`, `description`, `execute`). Add this entry as a new element of that array (place it next to the `pin`/`categories` entries, matching their object shape):

```js
  {
    name: 'calories',
    description: "Show today's calorie total from your food photos",
    execute: async ({ sock, jid, msg }) => {
      const today = new Date().toISOString().split('T')[0];
      const senderId = getSenderId(msg);
      const meta = { sender: jid, messagePreview: '(/calories)' };
      const summary = await getCalorieSummary(
        { sender_id: senderId, startDate: today, endDate: today },
        meta
      );
      const row = Array.isArray(summary) ? summary[0] : null;
      await reply(sock, jid, formatTodaySummary(row), msg);
    }
  },
```

> Note: `reply` is already imported at the top of `commands/index.js`. If your located `commands` array uses a different handler key than `execute`/different destructured context than `{ sock, jid, msg }`, match the existing entries' exact shape instead and stop to report the discrepancy.

- [ ] **Step 3: Syntax-check**

Run: `cd expense-tracker/whatsapp-bot && node --check src/commands/index.js`
Expected: no output, exit 0.

- [ ] **Step 4: Commit**

```bash
cd /home/solork/Projects/home-server
git add expense-tracker/whatsapp-bot/src/commands/index.js
git commit -m "feat(expense-tracker): /calories command for today's total"
```

---

### Task 12: Dashboard Calories tab

**Files:**
- Create: `expense-tracker/dashboard/src/Calories.jsx`
- Modify: `expense-tracker/dashboard/src/App.jsx`

- [ ] **Step 1: Create the Calories component**

Create `expense-tracker/dashboard/src/Calories.jsx`:

```jsx
import { useState, useEffect, useCallback } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

export default function Calories() {
  const [startDate, setStartDate] = useState(todayStr())
  const [endDate, setEndDate] = useState(todayStr())
  const [summary, setSummary] = useState([])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs = `startDate=${startDate}&endDate=${endDate}`
      const [s, e] = await Promise.all([
        fetch(`${API_URL}/api/calories/summary?${qs}`).then(r => r.json()),
        fetch(`${API_URL}/api/calories?${qs}&limit=100`).then(r => r.json())
      ])
      setSummary(Array.isArray(s) ? s : [])
      setEntries(Array.isArray(e) ? e : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => { load() }, [load])

  return (
    <div className="calories-view">
      <div className="filter-bar">
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
        <button onClick={load}>Refresh</button>
      </div>

      {error && <p className="error">Failed to load: {error}</p>}
      {loading && <p>Loading…</p>}

      <div className="stat-cards">
        {summary.map(s => (
          <div key={s.sender_id} className="stat-card">
            <span className="stat-label">{s.sender_name || s.sender_id}</span>
            <span className="stat-value">{Math.round(s.total_calories)} kcal</span>
            <span className="stat-sub">
              P {Math.round(s.total_protein_g)}g · C {Math.round(s.total_carbs_g)}g · F {Math.round(s.total_fat_g)}g · {s.entry_count} meal(s)
            </span>
          </div>
        ))}
        {!loading && summary.length === 0 && <p>No food logged for this range.</p>}
      </div>

      <ul className="calorie-entries">
        {entries.map(en => (
          <li key={en.id} className="calorie-entry">
            {en.image_url && (
              <img src={`${API_URL}${en.image_url}`} alt="" className="calorie-thumb" width="56" height="56" />
            )}
            <div>
              <strong>{en.sender_name || en.sender_id}</strong> — {en.description || 'Meal'}<br />
              {Math.round(en.calories)} kcal · {en.date}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Import the component in App.jsx**

In `expense-tracker/dashboard/src/App.jsx`, add at the top of the file, immediately after the existing `import { useState, useEffect, useCallback } from 'react'` line:

```jsx
import Calories from './Calories.jsx'
```

- [ ] **Step 3: Add the desktop nav tab**

In `expense-tracker/dashboard/src/App.jsx`, find the desktop header-nav block containing the `stats` tab button (around the `className={`tab ${activeTab === 'stats' ? 'active' : ''}`}` button). Immediately after that `stats` `<button>...</button>` element, add:

```jsx
            <button
              className={`tab ${activeTab === 'calories' ? 'active' : ''}`}
              onClick={() => setActiveTab('calories')}
            >
              Calories
            </button>
```

- [ ] **Step 4: Add the mobile bottom-nav item**

In `expense-tracker/dashboard/src/App.jsx`, find the `<nav className="bottom-nav mobile-only">` block and the `stats` `nav-item` button inside it. Immediately after that `stats` nav-item `<button>...</button>`, add:

```jsx
        <button
          className={`nav-item ${activeTab === 'calories' ? 'active' : ''}`}
          onClick={() => setActiveTab('calories')}
        >
          <span className="nav-icon">{Icons.chart}</span>
          <span>Calories</span>
        </button>
```

- [ ] **Step 5: Render the view when the tab is active**

In `expense-tracker/dashboard/src/App.jsx`, find the existing conditional render for the stats/home views (e.g. a block like `{activeTab === 'stats' && ( ... )}` or the `{activeTab === 'home' && ...}` region). Immediately after the closing of the stats view's conditional block, add:

```jsx
        {activeTab === 'calories' && <Calories />}
```

- [ ] **Step 6: Build the dashboard to verify it compiles**

Run: `cd expense-tracker/dashboard && npm install && npm run build`
Expected: Vite build completes with no errors and emits `dist/`.

- [ ] **Step 7: Commit**

```bash
cd /home/solork/Projects/home-server
git add expense-tracker/dashboard/src/Calories.jsx expense-tracker/dashboard/src/App.jsx
git commit -m "feat(expense-tracker): dashboard Calories tab"
```

---

### Task 13: Documentation update

**Files:**
- Modify: `expense-tracker/README.md`

- [ ] **Step 1: Document the feature**

In `expense-tracker/README.md`, add a new section immediately before the `## Security` line:

```markdown
## Calorie Tracking

Send a photo of a meal to the bot in a DM. The same Claude Vision call that
reads receipts now also classifies the image: receipts become expenses, food
photos are estimated for calories + protein/carbs/fat + a per-item breakdown,
stored per sender (by phone number, labelled with the WhatsApp display name),
and shown in the dashboard's **Calories** tab. Use `/calories` to get your
total for today. Group-chat images are ignored, as before.
```

- [ ] **Step 2: Commit**

```bash
cd /home/solork/Projects/home-server
git add expense-tracker/README.md
git commit -m "docs(expense-tracker): document calorie tracking feature"
```

---

### Task 14: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run all bot tests**

Run: `cd expense-tracker/whatsapp-bot && npm test`
Expected: all test files pass (message, calorieFormat), 0 failures.

- [ ] **Step 2: Run all api tests**

Run: `cd expense-tracker/api && npm test`
Expected: `calories.test.js` passes, 0 failures.

- [ ] **Step 3: End-to-end API + DB smoke test**

Run the Task 5 Step 3 verification block again against a fresh temp DB. Expected: identical results (create → list → summary → validation rejection).

- [ ] **Step 4: Dashboard build**

Run: `cd expense-tracker/dashboard && npm run build`
Expected: clean build.

- [ ] **Step 5: Final commit if anything was adjusted**

```bash
cd /home/solork/Projects/home-server
git status --porcelain
# If clean, nothing to do. If fixes were needed, commit them:
# git add -A && git commit -m "fix(expense-tracker): verification follow-ups"
```

---

## Self-Review

**Spec coverage:**
- Auto-detect food vs receipt → Task 6 (single vision call, `kind`).
- Persist to calorie table + dashboard → Tasks 2, 3, 5 (DB/API), Task 12 (dashboard).
- DM only, grouped per sender → Task 10 routes only the existing `!isGroup` DM branch; `sender_id`/`sender_name` on every entry; Tasks 2/5 group by `sender_id`.
- Calories + macros + items → schema (Task 2), prompt (Task 6), formatter (Task 9).
- Identity = pushName + number → Task 7 (`getSenderName`), stored in Task 10.
- New dedicated Calories dashboard page → Task 12.
- `/calories` command → Task 11.
- Error/edge handling (unknown, implausible kcal, upload failure) → Task 10 (handler guards), Task 6 (kind defaulting).
- Testing → Tasks 2, 7, 9 (TDD units), Task 5/14 (integration smoke).

No spec requirement is left without a task.

**Placeholder scan:** No TBD/TODO/"handle edge cases" — every code step contains complete code. Verification steps give exact commands and expected output.

**Type/name consistency:** `kind` discriminator (`expense`/`food`/`unknown`) consistent across Tasks 6 and 10. `insertCalorieEntry`/`listCalorieEntries`/`calorieSummary`/`initCalorieSchema` names consistent across Tasks 2, 3, 5. `formatFoodReply`/`formatTodaySummary` consistent across Tasks 9, 10, 11. `getSenderName` consistent across Tasks 7, 10. API field names (`sender_id`, `sender_name`, `protein_g`, `carbs_g`, `fat_g`, `items`, `confidence`, `image_url`, `date`) consistent across schema, validators, routes, bot client, and dashboard.

**Note for executor:** Tasks 3, 6, 10, 11, 12 modify existing files by locating described anchors rather than fixed line numbers (the codebase evolves). Each such step states what to find; if an anchor cannot be found or differs materially, stop and report rather than guessing.
