# WhatsApp Bot — Calorie Estimation from Food Images

**Date:** 2026-05-18
**Component:** `expense-tracker/` (whatsapp-bot, api, dashboard)
**Status:** Approved design

## Summary

Add food-calorie estimation to the expense-tracker WhatsApp bot. When a user
sends a food photo in a DM, the bot estimates calories + macronutrients +
per-item breakdown, stores the entry per sender, replies with a summary, and
surfaces the data in a new dashboard tab. Food vs. receipt is auto-detected in
the **single** existing Claude Vision call (no extra AI cost, no caption
required). Group-chat images remain ignored, exactly as today.

## Requirements (confirmed)

- **Trigger:** auto-detect food vs. receipt — no caption/command required.
- **Persistence:** store every food entry in SQLite and show it in the dashboard.
- **Scope:** DM only. Data grouped per sender (the person who sent the image).
- **Nutrition detail:** total kcal + protein/carbs/fat + per-item breakdown.
- **Identity:** group by normalized phone number; store WhatsApp `pushName`
  alongside for display.
- **Dashboard:** new dedicated "Calories" tab/view.
- **Bot command:** include a `/calories` command showing the sender's total for today.

## Architecture & Data Flow

```
WhatsApp DM image
  → bot: handleImageTransaction downloads buffer → base64
  → API POST /api/parse/image            (ONE Claude Vision call)
      → { kind: "expense" | "food" | "unknown", ...payload, usage }
  → bot routes on kind:
      kind=expense  → existing expense flow (unchanged)
      kind=food     → handleFoodImage → POST /api/calories
      kind=unknown  → friendly "couldn't tell receipt vs food" reply
  → calorie entry stored in SQLite (sender_id + sender_name)
  → bot replies: kcal + macros + item breakdown + token cost
Dashboard "Calories" tab → GET /api/calories[/summary] grouped per sender
```

One vision call per image — same cost profile as the current receipt flow.
`sender_id` (normalized phone number) is the stable grouping key; `sender_name`
(`msg.pushName`) is display only and may change over time.

## Database

New table, added to `initDatabase()` in `api/src/db/init.js` following the
existing `CREATE TABLE IF NOT EXISTS` + index pattern. Purely additive — no
migration of existing tables.

```sql
CREATE TABLE IF NOT EXISTS calorie_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id   TEXT NOT NULL,        -- normalized phone number (grouping key)
  sender_name TEXT,                 -- WhatsApp pushName at time of entry
  description TEXT,                  -- e.g. "Nasi goreng + telur + es teh"
  calories    INTEGER NOT NULL,     -- estimated total kcal
  protein_g   REAL,
  carbs_g     REAL,
  fat_g       REAL,
  items       TEXT,                 -- JSON array: [{name, calories, portion}]
  confidence  REAL,
  image_url   TEXT,                 -- reuses existing /api/upload
  date        DATE NOT NULL,        -- meal date (today unless image implies)
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_calorie_sender ON calorie_entries(sender_id);
CREATE INDEX IF NOT EXISTS idx_calorie_date   ON calorie_entries(date);
```

## API Changes

### a) `POST /api/parse/image` (extend — `routes/parse.js`)

Extend the vision prompt so the model first classifies the image, then returns
the matching payload. Response is a discriminated object:

- `kind: "expense"` → existing fields: `amount, description, vendor,
  category_id, date, items, confidence` (unchanged shape).
- `kind: "food"` → `description, calories, protein_g, carbs_g, fat_g,
  items: [{name, calories, portion}], confidence, date`.
- `kind: "unknown"` → `{ kind: "unknown", reason }`.

`usage` (token counts) still attached for cost reporting. Backward compatible:
the expense path treats a missing `kind` as `"expense"`. `extractJsonObject`
is reused to tolerate prose/fences.

### b) New `routes/calories.js` (mounted in `api/src/index.js`)

Mounted at `/api/calories` under the existing rate limiters, alongside the
other route registrations.

- `POST /api/calories` — insert one entry. Validated with new validators in
  the `middleware/validators.js` style: numeric clamps (reject `calories <= 0`
  or implausibly large), string length caps, `items` JSON size cap.
- `GET /api/calories?sender_id=&startDate=&endDate=` — list entries (filters
  optional).
- `GET /api/calories/summary?startDate=&endDate=` — per-sender daily totals
  (kcal + macros), the dashboard's primary feed.

### c) Bot API service (`whatsapp-bot/src/services/api.js`)

- `parseImage` result now carries `kind` (no signature change).
- Add `createCalorieEntry(entry, meta)` and `getCalorieSummary(params, meta)`
  using the existing `api` axios instance + `meta` interceptor pattern.

## Bot Changes

- `getSenderName(msg)` helper in `whatsapp-bot/src/utils/message.js` →
  returns `msg.pushName`.
- `handlers/message.js`: the existing DM `hasImage` branch still calls
  `handleImageTransaction`, which now switches on `parsed.kind`:
  `food` → `handleFoodImage`, `unknown` → friendly reply, otherwise the
  existing expense path. Group images stay ignored (unchanged).
- New `handlers/calories.js` (separate file to keep `expense.js` focused on
  one purpose): `handleFoodImage` uploads the image (reuse `uploadImage`,
  best-effort), stores the entry via `createCalorieEntry`, and replies:

  ```
  🍽️ Logged for <name>
  ~650 kcal
  P 28g · C 72g · F 24g
  • Nasi goreng (~450)
  • Fried egg (~90)
  • Es teh manis (~110)
  Confidence 70% | Tokens 1450/180 (~$0.0048)
  ```

- New `/calories` command in `commands/index.js` (consistent with `/pin`,
  `/categories`): replies with the sender's total kcal + macros for today via
  `getCalorieSummary`.

## Dashboard Changes

- New `'calories'` tab in `dashboard/src/App.jsx` registered in both the
  desktop header nav and the mobile bottom nav, alongside `home`/`stats`.
- The calories view is extracted into a new `dashboard/src/Calories.jsx`
  component (App.jsx is already ~676 lines; avoid growing the single file).
- Content: per-person cards (today + selected date-range totals for
  kcal/macros) and a recent-entries list with image thumbnail. Reuses the
  existing fetch helper, date-range picker, and PIN auth patterns.

## Error Handling & Edge Cases

- AI returns non-JSON / no `kind` → treat as `unknown`, friendly reply.
- `kind=food` but `calories` missing/implausible (≤0 or absurdly high) →
  reply asking for a clearer photo; do **not** store.
- Image upload failure → still store the entry without `image_url` (matches
  existing receipt behavior).
- API/network failure → covered by the existing axios interceptor + Discord
  error-notify path; no new handling needed.

## Testing

- `api/` route tests for `/api/calories`: insert, list, summary aggregation,
  and validation rejections (non-positive/huge calories, oversized strings).
- A parse-classifier test with a mocked Claude response for each `kind`
  (`expense`, `food`, `unknown`), asserting correct routing payload.
- Follow the test setup/runner the `api/` package already uses.

## Out of Scope (YAGNI)

- Calorie analysis in group chats.
- Editing/deleting calorie entries from the dashboard.
- Daily calorie goals/targets and notifications.
- Caption-based or `/command`-based image triggers (auto-detect only).
