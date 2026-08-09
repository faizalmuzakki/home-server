# Next Improvement Plans — For Gemini 3.6 Execution

> **Generated:** 2026-08-06 | **Repo:** `/home/solork/Projects/home-server`
> **Instructions:** Each plan is a self-contained task. Work on one branch at a time, run tests, commit, move to next.

---

## Tier 1: Critical Fixes (Do First)

### Plan 1: Remove `docs_old/` from all feature branches
**Why:** Root-owned `docs_old/` files were accidentally committed to 10 feature branches. Must be removed before any PR merge.

**Branch:** Each of the 10 new branches (list below)
**Steps:**
1. For each branch: `git checkout <branch>`
2. `git rm -r --cached docs_old/ 2>/dev/null || true`
3. Add `docs_old/` to `.gitignore` if not already there
4. `git commit --amend --no-edit`
5. Branches: `feature/dashboard-trend-chart`, `feature/bot-budget-command`, `feature/receipt-ocr-queue`, `feature/weekly-expense-digest`, `feature/multi-currency-support`, `ci/test-pipeline`, `chore/shared-eslint`, `feature/healthcheck-standard`, `chore/bot-command-audit`, `feature/unified-error-format`

---

### Plan 2: Fix tagging branch remaining gaps
**Branch:** `feature/expense-tracker-tagging`
**Files:**
- Modify: `expense-tracker/api/src/routes/expenses.js`
- Modify: `expense-tracker/api/src/middleware/validators.js`
- Modify: `expense-tracker/api/tests/tagging.test.js`

**Steps:**
1. In PUT handler, differentiate `tags: undefined` (skip) vs `tags: null` (clear):
   ```js
   // Instead of COALESCE for tags, handle explicitly:
   if (formattedTags !== undefined) {
     // formattedTags is either normalized string or null (to clear)
     // Set tags = ? directly, not via COALESCE
   }
   ```
2. Escape SQL wildcards in tag search param:
   ```js
   const escapedTag = tag.trim().replace(/%/g, '\\%').replace(/_/g, '\\_');
   query += " AND e.tags LIKE ? ESCAPE '\\'";
   params.push(`%,${escapedTag},%`);
   ```
3. Add to `validators.js`:
   ```js
   body('tags').optional().isString().isLength({ max: 500 })
   ```
4. Add test cases for clearing tags and wildcard escaping
5. `git commit -am "fix(expense-tracker): handle tag clearing, SQL wildcard escaping, and validation"`

---

### Plan 3: Fix OCR queue stale job recovery and retry limits
**Branch:** `feature/receipt-ocr-queue`
**Files:**
- Modify: `expense-tracker/api/src/db/ocrQueue.js` — add `attempts` column, recovery query
- Modify: `expense-tracker/api/src/services/ocrWorker.js` — stale recovery on start, retry cap
- Modify: `expense-tracker/api/src/db/init.js` — ensure WAL mode

**Steps:**
1. Add `attempts INTEGER DEFAULT 0` to `ocr_queue` table
2. In worker startup, run: `UPDATE ocr_queue SET status = 'pending' WHERE status = 'processing' AND processed_at < datetime('now', '-10 minutes')`
3. In worker loop, skip items where `attempts >= 3`, marking them `failed`
4. In `init.js`, add: `db.pragma('journal_mode = WAL')` and `db.pragma('busy_timeout = 5000')`
5. Add cleanup query: `DELETE FROM ocr_queue WHERE status IN ('done','failed') AND created_at < datetime('now', '-30 days')`
6. `git commit -am "fix(expense-tracker): add OCR queue retry limits, stale recovery, and WAL mode"`

---

## Tier 2: Wire New Features Into Codebase

### Plan 4: Wire unified error handler into both APIs
**Branch:** `feature/unified-error-format`
**Files:**
- Modify: `expense-tracker/api/src/index.js`
- Modify: `claude-api/src/index.js`

**Steps:**
1. In expense-tracker `index.js`, replace the inline error handler:
   ```js
   import { errorHandler } from './middleware/errorHandler.js';
   // ... at end of middleware chain:
   app.use(errorHandler);
   ```
2. Same for `claude-api/src/index.js`
3. Update route handlers to use `next(createApiError(...))` instead of `res.status().json()`
4. `git commit -am "feat: wire unified error handler middleware into both API services"`

---

### Plan 5: Wire multi-currency into expense POST/PUT
**Branch:** `feature/multi-currency-support`
**Files:**
- Modify: `expense-tracker/api/src/routes/expenses.js`
- Modify: `expense-tracker/api/src/middleware/validators.js`

**Steps:**
1. Accept `currency` in POST body (default `'IDR'`)
2. If `currency !== 'IDR'`, call `convertToIDR(amount, currency)` before insert, store `original_amount = amount`, `amount = converted`, `currency = currency`
3. Add `body('currency').optional().isString().isLength({ max: 3 })` to validators
4. Return `currency` and `original_amount` in response
5. `git commit -am "feat(expense-tracker): wire currency conversion into expense creation"`

---

### Plan 6: Wire budget alerts into WhatsApp expense handler
**Branch:** `feature/expense-whatsapp-budget-alerts`
**Files:**
- Modify: `expense-tracker/whatsapp-bot/src/handlers/expense.js`

**Steps:**
1. Import `processBudgetAlert` from `../services/budgetAlerts.js`
2. After `createExpense()` succeeds in `handleTextTransaction` and `handleImageTransaction`:
   ```js
   const alert = await processBudgetAlert(transaction, async () => {
     const res = await fetch(`${API_URL}/api/stats/budgets`);
     return res.ok ? res.json() : [];
   });
   if (alert) {
     await reply(sock, jid, alert.message, msg);
   }
   ```
3. `git commit -am "feat(whatsapp-bot): wire budget alerts into expense transaction handlers"`

---

### Plan 7: Wire healthcheck into Docker Compose
**Branch:** `feature/healthcheck-standard`
**Files:**
- Modify: `expense-tracker/docker-compose.yml`

**Steps:**
1. Add healthcheck to expense-tracker API service:
   ```yaml
   healthcheck:
     test: ["CMD", "curl", "-f", "http://localhost:3000/ping"]
     interval: 30s
     timeout: 5s
     retries: 3
   ```
2. `git commit -am "feat: wire /ping healthcheck into Docker Compose services"`

---

### Plan 8: Wire weekly digest into bot startup
**Branch:** `feature/weekly-expense-digest`
**Files:**
- Modify: `palu-gada-bot/src/index.js`

**Steps:**
1. Import `startWeeklyDigest` from `./services/weeklyDigest.js`
2. In the `client.once(Events.ClientReady)` handler, call `startWeeklyDigest(client)`
3. `git commit -am "feat(bot): start weekly expense digest on bot ready"`

---

## Tier 3: Net-New Improvements

### Plan 9: Add `/budget` permission gating
**Branch:** `feature/bot-budget-command`
**Files:**
- Modify: `palu-gada-bot/src/commands/budget.js`

**Steps:**
1. Import `isOwner` from `../config.js`
2. In `set` subcommand, add guard: `if (!isOwner(interaction.user.id)) return interaction.editReply('❌ Only bot owners can set budgets')`
3. Add test case for permission check
4. `git commit -am "feat(bot): restrict /budget set to bot owners"`

---

### Plan 10: Add conversation memory to /ask command
**Branch:** Create `feature/ask-conversation-memory` from `main`
**Files:**
- Create: `palu-gada-bot/src/utils/conversationMemory.js`
- Modify: `palu-gada-bot/src/commands/ask.js`
- Create: `palu-gada-bot/tests/conversationMemory.test.js`

**Steps:**
- See full plan at [`docs/superpowers/plans/2026-08-06-ai-conversation-memory.md`](file:///home/solork/Projects/home-server/docs/superpowers/plans/2026-08-06-ai-conversation-memory.md)

---

### Plan 11: Add pagination metadata to expense list endpoint
**Branch:** Create `feature/expense-pagination` from `main`
**Files:**
- Modify: `expense-tracker/api/src/routes/expenses.js`
- Modify: `expense-tracker/dashboard/src/App.jsx`

**Steps:**
- See full plan at [`docs/superpowers/plans/2026-08-06-pagination-metadata.md`](file:///home/solork/Projects/home-server/docs/superpowers/plans/2026-08-06-pagination-metadata.md)

---

### Plan 12: Add backup/restore API endpoints
**Branch:** Create `feature/backup-restore` from `main`
**Files:**
- Create: `expense-tracker/api/src/routes/backup.js`
- Modify: `expense-tracker/api/src/index.js`

**Steps:**
- See full plan at [`docs/superpowers/plans/2026-08-06-backup-restore-api.md`](file:///home/solork/Projects/home-server/docs/superpowers/plans/2026-08-06-backup-restore-api.md)

---

### Plan 13: Add /portfolio Discord command
**Branch:** Create `feature/portfolio-command` from `main`
**Files:**
- Create: `palu-gada-bot/src/commands/portfolio.js`
- Create: `palu-gada-bot/tests/portfolio.test.js`

**Steps:**
- See full plan at [`docs/superpowers/plans/2026-08-06-portfolio-command.md`](file:///home/solork/Projects/home-server/docs/superpowers/plans/2026-08-06-portfolio-command.md)

---

### Plan 14: Install ESLint at repo root and lint-fix existing code
**Branch:** `chore/shared-eslint`
**Steps:**
1. `npm init -y` at repo root (if no `package.json`)
2. `npm i -D eslint`
3. `npx eslint expense-tracker/api/src/ --fix` (dry run first)
4. `npx eslint palu-gada-bot/src/ --fix`
5. `npx eslint claude-api/src/ --fix`
6. Fix any remaining lint errors manually
7. `git commit -am "chore: install ESLint and lint-fix existing code"`

---

### Plan 15: Add bot command duplicate name detection to audit script
**Branch:** `chore/bot-command-audit`
**Steps:**
1. In `audit-commands.js`, after collecting results, check for duplicate `cmd.data.name` values
2. Log warnings for any duplicates found
3. `git commit -am "chore(bot): add duplicate command name detection to audit script"`

---

### Plan 16: Add /expense slash command for quick Discord expense logging
**Branch:** Create `feature/bot-expense-command` from `main`
**Files:**
- Create: `palu-gada-bot/src/commands/expense.js`
- Create: `palu-gada-bot/tests/expense.test.js`

**Steps:**
1. `/expense add <amount> <description> [category]` — calls expense-tracker API
2. `/expense recent` — shows last 5 expenses
3. Export `formatExpenseLine()` for testing
4. Tests verify command schema and formatter
5. `git commit -am "feat(bot): add /expense slash command for quick expense logging"`

---

### Plan 17: Add dashboard dark mode toggle
**Branch:** Create `feature/dashboard-dark-mode` from `main`
**Files:**
- Modify: `expense-tracker/dashboard/src/App.jsx`
- Modify: `expense-tracker/dashboard/src/index.css`

**Steps:**
1. Add CSS variables for light/dark themes at `:root` and `[data-theme="dark"]`
2. Add toggle button in header
3. Persist preference in `localStorage`
4. `git commit -am "feat(dashboard): add dark mode toggle with localStorage persistence"`

---

### Plan 18: Add expense search autocomplete for categories
**Branch:** Create `feature/category-autocomplete` from `main`
**Files:**
- Modify: `expense-tracker/dashboard/src/App.jsx`

**Steps:**
1. In the filter bar category `<select>`, add search filtering
2. Show category icon + name in dropdown
3. `git commit -am "feat(dashboard): add category search filter with icons"`

---

### Plan 19: Add Claude API request logging with token usage tracking
**Branch:** Create `feature/claude-api-request-logging` from `main`
**Files:**
- Create: `claude-api/src/middleware/requestLogger.js`
- Create: `claude-api/src/db/requestLog.js`

**Steps:**
1. Create SQLite table `request_logs (id, timestamp, model, input_tokens, output_tokens, duration_ms, status, error)`
2. Log every `/api/prompt` request with token usage
3. Add `GET /api/prompt/usage` endpoint returning daily/monthly token usage stats
4. `git commit -am "feat(claude-api): add request logging with token usage tracking"`

---

### Plan 20: Add expense-tracker API rate limiting per IP
**Branch:** Create `feature/expense-api-rate-limit` from `main`
**Files:**
- Modify: `expense-tracker/api/src/index.js`

**Steps:**
1. Add `express-rate-limit` to expense-tracker API (already installed as dev dep)
2. Apply general limiter (100 req/15min) to all routes
3. Apply stricter limiter (10 req/15min) to parse/upload routes (already has `parseLimiter`)
4. `git commit -am "feat(expense-tracker): add general API rate limiting"`

---

## Execution Order

> [!IMPORTANT]
> Execute Tier 1 first (Plans 1-3), then Tier 2 (Plans 4-8), then Tier 3 (Plans 9-20) in any order.

| Priority | Plans | Est. Effort |
|----------|-------|-------------|
| 🔴 **Tier 1** | 1, 2, 3 | ~30 min each |
| 🟡 **Tier 2** | 4, 5, 6, 7, 8 | ~15 min each |
| 🟢 **Tier 3** | 9–20 | ~20 min each |
