# Branch Review Report — Home Server Session 2026-08-06

> **Reviewed:** 15 branches (5 bug-fix commits on existing PRs + 10 new feature branches)

---

## Section A: Bug-Fix Branches (Existing PRs)

### 1. `feature/claude-api-rate-limiter`
**Fix:** Swapped `requireAuth` ↔ `apiLimiter` middleware order so brute-force attempts hit rate limits even without valid auth.

| Severity | Issue | Status |
|----------|-------|--------|
| ✅ Fixed | Rate limiter bypassed on unauthenticated requests | **Done** |
| ✅ Fixed | Orphaned root `prompt.js` removed | **Done** |

**Remaining gaps:** None critical.

---

### 2. `feature/bot-ai-summarize-enhancements`
**Fix:** Sanitized chat log prompt injection + chunked embed overflow.

| Severity | Issue | Status |
|----------|-------|--------|
| ✅ Fixed | Raw Discord messages injected into Claude prompt | **Done** |
| ✅ Fixed | Embed >4096 chars crashes `editReply()` | **Done** |
| ⚠️ Minor | `<system>` tag stripping is naive — also strip `</system>`, `<instruction>`, etc. | Deferred |

---

### 3. `feature/expense-whatsapp-budget-alerts`
**Fix:** Guarded income transactions, null `category_id`, and API errors.

| Severity | Issue | Status |
|----------|-------|--------|
| ✅ Fixed | Alerts fire on income transactions | **Done** |
| ✅ Fixed | Null `category_id` causes silent failures | **Done** |
| ✅ Fixed | API failure crashes handler (now non-blocking try/catch) | **Done** |
| ⚠️ Minor | Budget thresholds hardcoded (80%, 100%) | Deferred |
| ⚠️ Minor | Not wired into actual expense handler yet | **Needs plan** |

---

### 4. `feature/expense-tracker-tagging`
**Fix:** Tags in POST/PUT, comma-delimited normalization, substring false-positive fix, DB index.

| Severity | Issue | Status |
|----------|-------|--------|
| ✅ Fixed | POST/PUT don't handle tags | **Done** |
| ✅ Fixed | `LIKE '%car%'` matches `care`, `cardiac` | **Done** (delimiter-based) |
| ✅ Fixed | Missing index on tags column | **Done** |
| ⚠️ Medium | PUT with `tags: null` can't clear tags (COALESCE behavior) | **Needs fix** |
| ⚠️ Medium | SQL `%` and `_` wildcards not escaped in tag search | **Needs fix** |
| ⚠️ Minor | `validators.js` not updated for tags field | **Needs fix** |

---

### 5. `feature/non-infra-upgrades`
**Fix:** `--allowed-tools` flag, default model, process timeout, workdir validation, SSE disconnect leak.

| Severity | Issue | Status |
|----------|-------|--------|
| ✅ Fixed | `--allowedTools` → `--allowed-tools` | **Done** |
| ✅ Fixed | `duration_ms` NaN when session tracking races | **Done** |
| ✅ Fixed | No process timeout → 120s configurable timeout added | **Done** |
| ✅ Fixed | Workdir validation with `sanitizeWorkdir()` | **Done** |
| ✅ Fixed | SSE disconnect leak — `streamAborted` flag + early `activeSessions.delete` | **Done** |
| ⚠️ Medium | Default model in `runAnthropicFallback` still hardcoded separately | Mostly fixed (uses `DEFAULT_MODEL` const) |
| ⚠️ Minor | Raw stderr leakage to HTTP clients | Deferred |

---

## Section B: New Feature Branches

### 6. `feature/dashboard-trend-chart` ✅
SVG bar chart showing 6-month income vs expenses trend.

| Issue | Severity | Note |
|-------|----------|------|
| Component is imported and rendered in App.jsx | ✅ | Works |
| Guard against zero data (min bar height = 2px) | ✅ | Handled |
| No empty state message when no monthly data | ⚠️ Minor | Returns `null` (invisible), acceptable |

### 7. `feature/bot-budget-command` ✅
`/budget view` and `/budget set` Discord slash command.

| Issue | Severity | Note |
|-------|----------|------|
| Tests pass (3/3) | ✅ | |
| `deferReply()` called before API fetch | ✅ | Present |
| No permission gating (any user can set budgets) | ⚠️ Medium | **Needs plan** |
| Negative/zero limit not validated | ⚠️ Minor | |

### 8. `feature/receipt-ocr-queue` ⚠️
Background SQLite queue for async receipt OCR processing.

| Issue | Severity | Note |
|-------|----------|------|
| Queue table + worker created | ✅ | |
| Worker stuck in `processing` if restart occurs | 🔴 High | **Needs stale job recovery** |
| No max retry limit | ⚠️ Medium | **Needs plan** |
| No queue cleanup/retention policy | ⚠️ Minor | |
| WAL mode not enabled for concurrent access | ⚠️ Medium | **Needs plan** |

### 9. `feature/weekly-expense-digest` ✅
Monday morning automated expense summary to Discord channel.

| Issue | Severity | Note |
|-------|----------|------|
| Tests pass (2/2) | ✅ | |
| Graceful skip when `CHANNEL_ID` not set | ✅ | Guard present |
| Timezone drift in date boundaries (UTC vs WIB) | ⚠️ Medium | Uses JS `Date` which is local |
| Zero-expense week sends empty category list | ⚠️ Minor | Shows "No transactions recorded" |

### 10. `feature/multi-currency-support` ✅
Currency converter service + `currency` & `original_amount` DB migration.

| Issue | Severity | Note |
|-------|----------|------|
| Tests pass (3/3) with mock fetch | ✅ | |
| Fallback to 1:1 on API failure | ✅ | Graceful |
| Not wired into POST/PUT expense endpoints yet | ⚠️ Medium | **Needs plan** |
| 1-hour rate cache is reasonable | ✅ | |

### 11. `ci/test-pipeline` ✅
GitHub Actions matrix workflow across subsystems.

| Issue | Severity | Note |
|-------|----------|------|
| Matrix strategy with `fail-fast: false` | ✅ | Good |
| `cache-dependency-path` set correctly | ✅ | |
| Missing `claude-api/tests/` directory check | ⚠️ Minor | Glob will fail silently if no tests |

### 12. `chore/shared-eslint` ✅
Root ESLint flat config.

| Issue | Severity | Note |
|-------|----------|------|
| ESM `sourceType: 'module'` enforced | ✅ | |
| Reasonable rule set (no-var, prefer-const) | ✅ | |
| ESLint not installed at root level | ⚠️ Minor | Need `npm i -D eslint` at root |

### 13. `feature/healthcheck-standard` ✅
`/ping` endpoint on both APIs returning `{ status, uptime }`.

| Issue | Severity | Note |
|-------|----------|------|
| Both APIs get `/ping` | ✅ | |
| Clean, no auth required | ✅ | Correct for health checks |
| Not wired into Docker Compose healthcheck | ⚠️ Minor | **Needs plan** |

### 14. `chore/bot-command-audit` ✅
Audit script verified 81/81 commands valid.

| Issue | Severity | Note |
|-------|----------|------|
| All 81 commands pass validation | ✅ | |
| Audit report saved | ✅ | |
| Script doesn't check for duplicate command names | ⚠️ Minor | |

### 15. `feature/unified-error-format` ✅
`createApiError()` + `errorHandler` middleware for both APIs.

| Issue | Severity | Note |
|-------|----------|------|
| Tests pass (2/2) | ✅ | |
| Not wired into either API's `app.use()` yet | ⚠️ Medium | **Needs plan** |
| Identical file duplicated in both subsystems | ⚠️ Minor | Could be shared package |

---

## Section C: Cross-Cutting Issues

| Issue | Affected Branches | Priority |
|-------|-------------------|----------|
| `docs_old/` root-owned files accidentally committed | All 10 new branches | 🔴 High — needs `git filter-branch` or interactive rebase to remove before merge |
| No integration between new features and existing codebase wiring | budget alerts, multi-currency, error handler, healthcheck docker | ⚠️ Medium |
| Test coverage is pure-logic only; no HTTP endpoint integration tests | All feature branches | ⚠️ Medium |

---

## Verdict

| Category | Count |
|----------|-------|
| Branches ready to merge (clean or minor only) | 8 |
| Branches needing targeted fixes before merge | 5 |
| Branches needing significant additional work | 2 |
