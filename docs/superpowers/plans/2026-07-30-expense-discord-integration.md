# Expense–Discord Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/expense` slash commands to palu-gada-bot so you can check spending and log transactions from Discord, pulling data from the expense-tracker API.

**Architecture:** The bot makes HTTP calls to the expense-tracker API (`http://expense-tracker-api:3000`). Both containers are already on the `traefik-public` Docker network. The API requires no authentication. New files: one API client util, one slash command file.

**Tech Stack:** discord.js slash commands, node-fetch (already a dependency), Express REST API

## Global Constraints

- No changes to the expense-tracker codebase — it's a read/write consumer of its existing API
- Follow the flat `src/commands/*.js` pattern the bot already uses
- Use the existing `node-fetch` dependency — do not add axios or similar
- Amounts in IDR (Indonesian Rupiah) — format with `.toLocaleString('id-ID')`
- Repo root: `~/Projects/home-server/palu-gada-bot` (this is a subdirectory of `~/Projects/home-server`)

---

### Task 1: Verify network connectivity and add env var

**Files:**
- Modify: `palu-gada-bot/.env.example`
- Modify: `palu-gada-bot/.env`
- Modify: `palu-gada-bot/docker-compose.yml` (add environment var)

**Interfaces:**
- Consumes: existing `traefik-public` Docker network shared by both services
- Produces: `EXPENSE_API_URL` env var available to the bot process

- [ ] **Step 1: Verify both containers share a network**

```bash
# Check palu-gada-bot networks
docker inspect palu-gada-bot --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'

# Check expense-tracker-api networks
docker inspect expense-tracker-api --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'
```

Expected: both show `traefik-public` (or similar shared network). If they don't share a network, you'll need to add the expense-tracker's network to `palu-gada-bot/docker-compose.yml`.

- [ ] **Step 2: Test connectivity from bot container**

```bash
docker exec palu-gada-bot node -e "fetch('http://expense-tracker-api:3000/health').then(r=>r.json()).then(console.log).catch(console.error)"
```

Expected: `{ status: 'ok', timestamp: '...' }`. If this fails with ENOTFOUND, the containers aren't on the same network — check step 1.

- [ ] **Step 3: Add EXPENSE_API_URL to env files**

In `palu-gada-bot/.env.example`, add:
```env
# Expense tracker API (internal Docker network URL)
EXPENSE_API_URL=http://expense-tracker-api:3000
```

In `palu-gada-bot/.env`, add the same:
```env
EXPENSE_API_URL=http://expense-tracker-api:3000
```

- [ ] **Step 4: Expose the env var in docker-compose.yml**

In `palu-gada-bot/docker-compose.yml`, add to the `environment:` block of the `palu-gada-bot` service (after the `DOCKER_HOST` line):

```yaml
      - EXPENSE_API_URL=${EXPENSE_API_URL:-http://expense-tracker-api:3000}
```

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/home-server
git add palu-gada-bot/.env.example palu-gada-bot/docker-compose.yml
git commit -m "feat(expense): add EXPENSE_API_URL config for Discord integration"
```

---

### Task 2: Create expense API client utility

**Files:**
- Create: `palu-gada-bot/src/utils/expenseApi.js`

**Interfaces:**
- Consumes: `EXPENSE_API_URL` env var
- Produces: `getExpenseSummary({ startDate?, endDate? })`, `getDailyStats({ startDate?, endDate? })`, `getMonthlyStats({ year? })`, `getCategories()`, `createExpense({ amount, date, description, vendor?, category_id?, type? })` — all return parsed JSON or throw

- [ ] **Step 1: Create the API client**

Create `palu-gada-bot/src/utils/expenseApi.js`:

```js
const BASE_URL = process.env.EXPENSE_API_URL || 'http://expense-tracker-api:3000';

async function apiFetch(path, opts = {}) {
    const url = `${BASE_URL}${path}`;
    const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...opts,
    });
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Expense API ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
}

/**
 * @param {{ startDate?: string, endDate?: string }} opts - YYYY-MM-DD format
 * @returns {{ income, incomeCount, expenses, expenseCount, net, total, count, byCategory: Array }}
 */
export function getExpenseSummary({ startDate, endDate } = {}) {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    const qs = params.toString();
    return apiFetch(`/api/stats/summary${qs ? `?${qs}` : ''}`);
}

/**
 * @param {{ startDate?: string, endDate?: string }} opts
 * @returns {Array<{ date, expenses, income, net, count }>}
 */
export function getDailyStats({ startDate, endDate } = {}) {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    const qs = params.toString();
    return apiFetch(`/api/stats/daily${qs ? `?${qs}` : ''}`);
}

/**
 * @param {{ year?: number }} opts
 * @returns {Array<{ month, expenses, income, net, count }>}
 */
export function getMonthlyStats({ year } = {}) {
    const params = new URLSearchParams();
    if (year) params.set('year', String(year));
    const qs = params.toString();
    return apiFetch(`/api/stats/monthly${qs ? `?${qs}` : ''}`);
}

/**
 * @returns {Array<{ id, name, icon, color, type }>}
 */
export function getCategories() {
    return apiFetch('/api/categories');
}

/**
 * @param {{ amount: number, date: string, description: string, vendor?: string, category_id?: number, type?: 'expense'|'income' }} data
 */
export function createExpense(data) {
    return apiFetch('/api/expenses', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}
```

- [ ] **Step 2: Verify the module loads without errors**

```bash
cd ~/Projects/home-server/palu-gada-bot
node -e "import('./src/utils/expenseApi.js').then(m => console.log('OK:', Object.keys(m)))"
```

Expected: `OK: [ 'getExpenseSummary', 'getDailyStats', 'getMonthlyStats', 'getCategories', 'createExpense' ]`

- [ ] **Step 3: Commit**

```bash
cd ~/Projects/home-server
git add palu-gada-bot/src/utils/expenseApi.js
git commit -m "feat(expense): add expense-tracker API client utility"
```

---

### Task 3: Create `/expense` slash command

**Files:**
- Create: `palu-gada-bot/src/commands/expense.js`

**Interfaces:**
- Consumes: `getExpenseSummary`, `getDailyStats`, `getMonthlyStats`, `createExpense` from `../utils/expenseApi.js`
- Produces: Discord slash command `/expense` with subcommands `today`, `month`, `summary`, `log`

- [ ] **Step 1: Create the slash command file**

Create `palu-gada-bot/src/commands/expense.js`:

```js
import { SlashCommandBuilder } from 'discord.js';
import { getExpenseSummary, getDailyStats, getMonthlyStats, createExpense } from '../utils/expenseApi.js';

function idr(amount) {
    return `Rp ${Number(amount).toLocaleString('id-ID')}`;
}

function today() {
    return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

export const data = new SlashCommandBuilder()
    .setName('expense')
    .setDescription('Check your expenses from the expense tracker')
    .addSubcommand(sub =>
        sub.setName('today')
            .setDescription('Show today\'s spending'))
    .addSubcommand(sub =>
        sub.setName('month')
            .setDescription('Show this month\'s spending breakdown'))
    .addSubcommand(sub =>
        sub.setName('summary')
            .setDescription('Show overall spending summary')
            .addStringOption(opt =>
                opt.setName('period')
                    .setDescription('Time period')
                    .addChoices(
                        { name: 'This week', value: 'week' },
                        { name: 'This month', value: 'month' },
                        { name: 'This year', value: 'year' },
                    )))
    .addSubcommand(sub =>
        sub.setName('log')
            .setDescription('Quick-log an expense from Discord')
            .addNumberOption(opt =>
                opt.setName('amount')
                    .setDescription('Amount in IDR')
                    .setRequired(true))
            .addStringOption(opt =>
                opt.setName('description')
                    .setDescription('What was it for?')
                    .setRequired(true))
            .addStringOption(opt =>
                opt.setName('vendor')
                    .setDescription('Where? (optional)')));

export async function execute(interaction) {
    const sub = interaction.options.getSubcommand();

    await interaction.deferReply();

    try {
        switch (sub) {
            case 'today': return await handleToday(interaction);
            case 'month': return await handleMonth(interaction);
            case 'summary': return await handleSummary(interaction);
            case 'log': return await handleLog(interaction);
        }
    } catch (error) {
        console.error('[ERROR] Expense command error:', error);
        const msg = error.message?.includes('Expense API')
            ? '❌ Could not reach the expense tracker. Is it running?'
            : `❌ Something went wrong: ${error.message?.slice(0, 200)}`;
        await interaction.editReply({ content: msg });
    }
}

async function handleToday(interaction) {
    const date = today();
    const [daily, summary] = await Promise.all([
        getDailyStats({ startDate: date, endDate: date }),
        getExpenseSummary({ startDate: date, endDate: date }),
    ]);

    const dayData = daily[0] || { expenses: 0, income: 0, net: 0, count: 0 };

    const categoryLines = (summary.byCategory || [])
        .filter(c => Number(c.total) > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 10)
        .map(c => `${c.icon || '📦'} ${c.name}: ${idr(c.total)} (${c.count}x)`)
        .join('\n') || '_No expenses yet_';

    await interaction.editReply({
        embeds: [{
            color: 0xF59E0B,
            title: `💰 Today's Expenses — ${date}`,
            fields: [
                { name: '💸 Spent', value: idr(dayData.expenses), inline: true },
                { name: '💵 Income', value: idr(dayData.income), inline: true },
                { name: '📊 Net', value: idr(dayData.net), inline: true },
                { name: `📋 Breakdown (${dayData.count} transactions)`, value: categoryLines },
            ],
            footer: { text: 'Data from expense-tracker' },
            timestamp: new Date().toISOString(),
        }],
    });
}

async function handleMonth(interaction) {
    const year = new Date().getFullYear();
    const month = new Date().getMonth(); // 0-indexed
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    const startDate = `${monthStr}-01`;
    // Last day of month
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

    const [monthly, summary] = await Promise.all([
        getMonthlyStats({ year }),
        getExpenseSummary({ startDate, endDate }),
    ]);

    const monthData = monthly.find(m => m.month === monthStr) || { expenses: 0, income: 0, net: 0, count: 0 };

    const categoryLines = (summary.byCategory || [])
        .filter(c => Number(c.total) > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 15)
        .map(c => `${c.icon || '📦'} ${c.name}: ${idr(c.total)}`)
        .join('\n') || '_No data_';

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    await interaction.editReply({
        embeds: [{
            color: 0x3B82F6,
            title: `📅 ${monthNames[month]} ${year} Expenses`,
            fields: [
                { name: '💸 Total Spent', value: idr(monthData.expenses), inline: true },
                { name: '💵 Income', value: idr(monthData.income), inline: true },
                { name: '📊 Net', value: idr(monthData.net), inline: true },
                { name: `📋 By Category (${monthData.count} transactions)`, value: categoryLines },
            ],
            footer: { text: 'Data from expense-tracker' },
            timestamp: new Date().toISOString(),
        }],
    });
}

async function handleSummary(interaction) {
    const period = interaction.options.getString('period') || 'month';
    const now = new Date();
    let startDate, endDate, label;

    switch (period) {
        case 'week': {
            const d = new Date(now);
            d.setDate(d.getDate() - d.getDay()); // Start of week (Sunday)
            startDate = d.toISOString().split('T')[0];
            endDate = today();
            label = 'This Week';
            break;
        }
        case 'month': {
            startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
            endDate = today();
            label = 'This Month';
            break;
        }
        case 'year': {
            startDate = `${now.getFullYear()}-01-01`;
            endDate = today();
            label = `${now.getFullYear()}`;
            break;
        }
    }

    const summary = await getExpenseSummary({ startDate, endDate });

    const categoryLines = (summary.byCategory || [])
        .filter(c => Number(c.total) > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 15)
        .map(c => `${c.icon || '📦'} **${c.name}**: ${idr(c.total)} (${c.count}x)`)
        .join('\n') || '_No data_';

    await interaction.editReply({
        embeds: [{
            color: 0x10B981,
            title: `📊 Expense Summary — ${label}`,
            description: `${startDate} to ${endDate}`,
            fields: [
                { name: '💸 Expenses', value: idr(summary.expenses), inline: true },
                { name: '💵 Income', value: idr(summary.income), inline: true },
                { name: '📊 Net', value: idr(summary.net), inline: true },
                { name: '🔢 Transactions', value: `${summary.count}`, inline: true },
                { name: '📋 By Category', value: categoryLines },
            ],
            footer: { text: 'Data from expense-tracker' },
            timestamp: new Date().toISOString(),
        }],
    });
}

async function handleLog(interaction) {
    const amount = interaction.options.getNumber('amount');
    const description = interaction.options.getString('description');
    const vendor = interaction.options.getString('vendor') || undefined;

    const result = await createExpense({
        amount,
        date: today(),
        description,
        vendor,
        type: 'expense',
        source: 'discord',
    });

    await interaction.editReply({
        embeds: [{
            color: 0x22C55E,
            title: '✅ Expense Logged',
            fields: [
                { name: 'Amount', value: idr(amount), inline: true },
                { name: 'Description', value: description, inline: true },
                ...(vendor ? [{ name: 'Vendor', value: vendor, inline: true }] : []),
                { name: 'Date', value: today(), inline: true },
            ],
            footer: { text: `ID: ${result.id || 'saved'} • via Discord` },
            timestamp: new Date().toISOString(),
        }],
    });
}
```

- [ ] **Step 2: Verify the command file loads**

```bash
cd ~/Projects/home-server/palu-gada-bot
node -e "import('./src/commands/expense.js').then(m => console.log('OK:', m.data.name, '—', m.data.options.map(o => o.name).join(', ')))"
```

Expected: `OK: expense — today, month, summary, log`

- [ ] **Step 3: Deploy the new slash command to Discord**

```bash
cd ~/Projects/home-server/palu-gada-bot
docker compose run --rm palu-gada-bot node src/deploy-commands.js
```

Or if running outside Docker:
```bash
node src/deploy-commands.js
```

Expected: logs showing the commands registered, including the new `expense` command.

- [ ] **Step 4: Restart the bot to pick up the new command file**

```bash
cd ~/Projects/home-server/palu-gada-bot
docker compose up -d --build --force-recreate
```

Wait for healthcheck:
```bash
docker compose logs --tail 20
```

Expected: `Bot is ready!` log line, no errors about `expense.js`.

- [ ] **Step 5: Functional test in Discord**

Run these commands in a Discord channel where the bot is active:

1. `/expense today` — should show today's spending (may be zero)
2. `/expense month` — should show current month breakdown
3. `/expense summary period:This week` — should show weekly summary
4. `/expense log amount:25000 description:test from discord` — should confirm the expense was saved
5. `/expense today` — should now show the test expense

After testing, delete the test expense via the expense-tracker dashboard or API:
```bash
# Find the test expense ID from the dashboard, then:
curl -X DELETE http://localhost:3000/api/expenses/<ID>
```

- [ ] **Step 6: Commit**

```bash
cd ~/Projects/home-server
git add palu-gada-bot/src/commands/expense.js
git commit -m "feat(expense): add /expense slash command

Subcommands: today, month, summary, log
Pulls data from expense-tracker API via internal Docker network.
Supports quick-logging expenses from Discord."
```
