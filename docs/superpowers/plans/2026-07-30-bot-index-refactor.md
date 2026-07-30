# Bot Index.js Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break up the 1183-line monolithic `src/index.js` into focused modules — event handlers in `src/events/`, background services in `src/services/`, and utility functions in `src/utils/`. The resulting `index.js` should be ~60 lines: create client, load commands, register events, login.

**Architecture:** Pure code-move refactor. Every event handler becomes a module exporting a function that receives `client`. Every background service (cron/interval) becomes a module exporting a `start(client)` function. Shared state (`xpCooldowns`, `loginCompleted`) moves into the module that owns it. Zero behavior changes.

**Tech Stack:** Node.js ESM, discord.js v14

## Global Constraints

- **Zero behavior changes** — the bot must work identically before and after
- Follow existing ESM (`import`/`export`) conventions used throughout the codebase
- Each task ends with a working bot — verified by `docker compose restart` + `/ping` responding
- Do NOT rename existing files in `src/commands/` or `src/database/` — only touch `src/index.js` and create new files
- Repo root: `~/Projects/home-server`, bot dir: `~/Projects/home-server/palu-gada-bot`
- Reference line numbers are from the current `src/index.js` (1183 lines) — re-verify before cutting if any prior task modified the file

---

### Task 1: Extract utility functions

**Files:**
- Create: `palu-gada-bot/src/utils/timeFormat.js`
- Modify: `palu-gada-bot/src/index.js` — replace inline functions with import

**Interfaces:**
- Consumes: nothing
- Produces: `formatTimeAgo(date)` → string, `formatDuration(ms)` → string

- [ ] **Step 1: Create `src/utils/timeFormat.js`**

Move the two functions from `index.js` lines 220–247 into a new file:

```js
/**
 * Formats a Date into a relative time string like "2h ago", "3d ago".
 * @param {Date} date
 * @returns {string}
 */
export function formatTimeAgo(date) {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Formats milliseconds into a human-readable duration like "2d 5h 30m 10s".
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours % 24 > 0) parts.push(`${hours % 24}h`);
    if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
    if (seconds % 60 > 0 || parts.length === 0) parts.push(`${seconds % 60}s`);

    return parts.join(' ');
}
```

> **Note:** Copy the exact implementation from index.js lines 220–247. The code above matches the current implementation but always verify against the actual file.

- [ ] **Step 2: Update index.js — replace inline functions with import**

Add to the imports section of `index.js`:
```js
import { formatTimeAgo, formatDuration } from './utils/timeFormat.js';
```

Delete lines 219–247 (the `// Helper function to format time ago` comment through end of `formatDuration`).

Verify nothing else in `index.js` defines these — they should only appear as the import now and as call sites (which don't change).

- [ ] **Step 3: Verify bot starts**

```bash
cd ~/Projects/home-server/palu-gada-bot
docker compose up -d --build --force-recreate
sleep 15
docker compose logs --tail 10
```

Expected: `Bot is ready!` in logs, no import errors.

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/home-server
git add palu-gada-bot/src/utils/timeFormat.js palu-gada-bot/src/index.js
git commit -m "refactor: extract formatTimeAgo/formatDuration to utils/timeFormat.js"
```

---

### Task 2: Extract background services

**Files:**
- Create: `palu-gada-bot/src/services/reminderScheduler.js`
- Create: `palu-gada-bot/src/services/messageScheduler.js`
- Create: `palu-gada-bot/src/services/giveawayScheduler.js`
- Create: `palu-gada-bot/src/services/statsChannelUpdater.js`
- Create: `palu-gada-bot/src/services/birthdayScheduler.js`
- Create: `palu-gada-bot/src/services/voiceXpTracker.js`
- Modify: `palu-gada-bot/src/index.js` — replace inline intervals with `start(client)` calls

**Interfaces:**
- Consumes: `client` (Discord Client instance), database functions from `../database/models.js`, `formatTimeAgo` from `../utils/timeFormat.js`
- Produces: each module exports `start(client)` which registers its own `setInterval`/`setTimeout`

Each service file follows this pattern:
```js
import { /* needed db functions */ } from '../database/models.js';

export function start(client) {
    // setInterval / setTimeout logic moved from index.js
    console.log('[INFO] <ServiceName> started');
}
```

- [ ] **Step 1: Create `src/services/reminderScheduler.js`**

Move index.js lines 94–147 (the reminder `setInterval` block and its log line):

```js
import { getPendingReminders, markReminderCompleted } from '../database/models.js';
import { formatTimeAgo } from '../utils/timeFormat.js';

export function start(client) {
    setInterval(async () => {
        try {
            const reminders = getPendingReminders();

            for (const reminder of reminders) {
                try {
                    const user = await client.users.fetch(reminder.user_id).catch(() => null);

                    if (user) {
                        const embed = {
                            color: 0x5865F2,
                            title: '⏰ Reminder!',
                            description: reminder.message,
                            footer: {
                                text: `Set ${formatTimeAgo(new Date(reminder.created_at))}`,
                            },
                            timestamp: new Date().toISOString(),
                        };

                        let sent = false;
                        try {
                            await user.send({ embeds: [embed] });
                            sent = true;
                        } catch (e) {
                            // DMs disabled
                        }

                        if (!sent && reminder.channel_id) {
                            const channel = await client.channels.fetch(reminder.channel_id).catch(() => null);
                            if (channel) {
                                await channel.send({
                                    content: `<@${reminder.user_id}>`,
                                    embeds: [embed],
                                });
                            }
                        }
                    }

                    markReminderCompleted(reminder.id);
                } catch (e) {
                    console.error(`[ERROR] Failed to send reminder ${reminder.id}:`, e);
                }
            }
        } catch (e) {
            console.error('[ERROR] Reminder checker error:', e);
        }
    }, 30000);

    console.log('[INFO] Reminder checker started');
}
```

- [ ] **Step 2: Create `src/services/messageScheduler.js`**

Move index.js lines 149–168:

```js
import { getPendingScheduledMessages, markScheduledMessageSent } from '../database/models.js';

export function start(client) {
    setInterval(async () => {
        try {
            const pending = getPendingScheduledMessages();
            for (const msg of pending) {
                try {
                    const channel = await client.channels.fetch(msg.channel_id).catch(() => null);
                    if (channel?.isTextBased()) {
                        await channel.send(msg.message);
                    }
                    markScheduledMessageSent(msg.id);
                } catch (e) {
                    console.error(`[ERROR] Failed to deliver scheduled message ${msg.id}:`, e);
                }
            }
        } catch (e) {
            console.error('[ERROR] Scheduled message dispatcher error:', e);
        }
    }, 30000);

    console.log('[INFO] Scheduled message dispatcher started');
}
```

- [ ] **Step 3: Create `src/services/giveawayScheduler.js`**

Move index.js lines 170–172 (the `setInterval` trigger) and lines 282–343 (the `checkEndedGiveaways` function):

```js
import { getExpiredGiveaways, getGiveaway, getGiveawayEntries, endGiveaway } from '../database/models.js';

// ponytail: Fisher-Yates shuffle for winner selection — stdlib Math.random is fine for giveaways
function checkEndedGiveaways(client) {
    // Copy the EXACT body of the checkEndedGiveaways function from index.js lines 282–343
    // It uses: getExpiredGiveaways, getGiveaway, getGiveawayEntries, endGiveaway, client.channels.fetch
}

export function start(client) {
    setInterval(() => checkEndedGiveaways(client), 30000);
    console.log('[INFO] Giveaway checker started');
}
```

> **Important:** Copy the exact `checkEndedGiveaways` implementation from index.js lines 282–343. Don't paraphrase it.

- [ ] **Step 4: Create `src/services/statsChannelUpdater.js`**

Move index.js lines 174–199:

```js
import { getAllStatsChannels } from '../database/models.js';
import { getStatValue, formatStatName } from '../commands/statschannel.js';

export function start(client) {
    async function updateStatsChannels() {
        try {
            const rows = getAllStatsChannels();
            for (const row of rows) {
                const guild = client.guilds.cache.get(row.guild_id);
                if (!guild) continue;
                const channel = guild.channels.cache.get(row.channel_id);
                if (!channel) continue;
                try {
                    const count = await getStatValue(guild, row.stat_type);
                    const newName = formatStatName(row.stat_type, count);
                    if (channel.name !== newName) {
                        await channel.setName(newName);
                    }
                } catch {
                    // No ManageChannels permission or rate-limited — skip
                }
            }
        } catch (e) {
            console.error('[ERROR] Stats channel updater error:', e);
        }
    }

    setInterval(updateStatsChannels, 10 * 60 * 1000);
    updateStatsChannels();
    console.log('[INFO] Stats channel updater started');
}
```

- [ ] **Step 5: Create `src/services/birthdayScheduler.js`**

Move index.js lines 201–216 (`scheduleBirthdayCheck`) and lines 249–279 (`checkBirthdays`):

```js
import { getTodayBirthdays, getGuildSettings } from '../database/models.js';
import config from '../config.js';

// ponytail: Copy exact checkBirthdays implementation from index.js lines 249–279
function checkBirthdays(client) {
    // Uses: getTodayBirthdays, getGuildSettings, client.guilds.cache, client.channels.fetch, config
}

export function start(client) {
    const now = new Date();
    const nextMidnight = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1,
    ));
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();

    setTimeout(() => {
        checkBirthdays(client);
        setInterval(() => checkBirthdays(client), 24 * 60 * 60 * 1000);
    }, msUntilMidnight);

    console.log(`[INFO] Birthday checker scheduled — first run in ${Math.round(msUntilMidnight / 60000)} min`);
}
```

> **Important:** Copy the exact `checkBirthdays` implementation from index.js lines 249–279.

- [ ] **Step 6: Create `src/services/voiceXpTracker.js`**

Move index.js lines 1046–1109:

```js
import { addXp, getGuildSettings } from '../database/models.js';
import { updateTopRoles } from '../utils/levelRoles.js';
import config from '../config.js';

export function start(client) {
    // Copy the EXACT setInterval block from index.js lines 1046–1109
    // It tracks voice channel presence and awards XP every 5 minutes
    // Uses: client.guilds.cache, addXp, getGuildSettings, updateTopRoles, config

    console.log('[INFO] Voice XP tracker started');
}
```

> **Important:** Copy the exact implementation from index.js lines 1046–1109.

- [ ] **Step 7: Update index.js — replace inline services with start() calls**

In the `client.once(Events.ClientReady)` handler, replace all the `setInterval` blocks with:

```js
    // Start background services
    const { start: startReminders } = await import('./services/reminderScheduler.js');
    const { start: startMessages } = await import('./services/messageScheduler.js');
    const { start: startGiveaways } = await import('./services/giveawayScheduler.js');
    const { start: startStats } = await import('./services/statsChannelUpdater.js');
    const { start: startBirthdays } = await import('./services/birthdayScheduler.js');
    const { start: startVoiceXp } = await import('./services/voiceXpTracker.js');

    startReminders(client);
    startMessages(client);
    startGiveaways(client);
    startStats(client);
    startBirthdays(client);
    startVoiceXp(client);
```

Remove the corresponding inline code blocks:
- Lines 94–147 (reminder interval + `checkEndedGiveaways` reference)
- Lines 149–168 (scheduled messages interval)
- Lines 170–172 (giveaway interval)
- Lines 174–199 (stats channel updater)
- Lines 201–216 (birthday scheduler)
- Lines 249–279 (`checkBirthdays` function)
- Lines 282–343 (`checkEndedGiveaways` function)
- Lines 1046–1109 (voice XP interval)

Also remove now-unused imports from the top of `index.js`:
- `getPendingReminders`, `markReminderCompleted` (used only in reminderScheduler)
- `getPendingScheduledMessages`, `markScheduledMessageSent` (used only in messageScheduler)
- `getExpiredGiveaways`, `getGiveaway`, `getGiveawayEntries`, `endGiveaway` (used only in giveawayScheduler)
- `getAllStatsChannels` (used only in statsChannelUpdater)
- `getTodayBirthdays` (used only in birthdayScheduler)
- `getStatValue`, `formatStatName` import from `./commands/statschannel.js` (used only in statsChannelUpdater)
- `updateTopRoles` from `./utils/levelRoles.js` (if only used in voiceXpTracker — check if also used in messageCreate XP logic before removing)

> **Warning on `updateTopRoles`**: It's also used in the `MessageCreate` handler's XP logic. Don't remove this import yet — it'll be needed until Task 3 extracts that handler.

- [ ] **Step 8: Verify bot starts with all services**

```bash
cd ~/Projects/home-server/palu-gada-bot
docker compose up -d --build --force-recreate
sleep 15
docker compose logs --tail 30
```

Expected: all 6 `[INFO] ... started` log lines present, `Bot is ready!` at the top, no errors.

- [ ] **Step 9: Commit**

```bash
cd ~/Projects/home-server
git add palu-gada-bot/src/services/ palu-gada-bot/src/index.js
git commit -m "refactor: extract 6 background services from index.js to src/services/

- reminderScheduler (30s interval)
- messageScheduler (30s interval)
- giveawayScheduler (30s interval)
- statsChannelUpdater (10m interval)
- birthdayScheduler (daily at UTC midnight)
- voiceXpTracker (5m interval)"
```

---

### Task 3: Extract event handlers

**Files:**
- Create: `palu-gada-bot/src/events/interactionCreate.js`
- Create: `palu-gada-bot/src/events/guildMemberAdd.js`
- Create: `palu-gada-bot/src/events/messageCreate.js`
- Create: `palu-gada-bot/src/events/messageUpdate.js`
- Create: `palu-gada-bot/src/events/messageDelete.js`
- Create: `palu-gada-bot/src/events/messageReactionAdd.js`
- Create: `palu-gada-bot/src/events/messageReactionRemove.js`
- Create: `palu-gada-bot/src/events/guildCreate.js`
- Modify: `palu-gada-bot/src/index.js` — replace inline handlers with imported functions

**Interfaces:**
- Consumes: `client`, various database functions, `config`, `checkGuildAccess`, `isOwner`
- Produces: each module exports a function `(client) => (eventArgs) => { ... }` or `(eventArgs, { client, config }) => { ... }`

The pattern for each event handler file:

```js
import { /* needed db functions */ } from '../database/models.js';
import config, { checkGuildAccess } from '../config.js';

/**
 * @param {import('discord.js').Client} client
 */
export function register(client) {
    client.on(Events.EventName, async (...args) => {
        // handler body moved from index.js
    });
}
```

This keeps each handler self-contained and the registration explicit.

- [ ] **Step 1: Create `src/events/interactionCreate.js`**

Move index.js lines 346–458. This handler dispatches buttons (giveaway) and slash commands with guild access checks, command enable checks, and error logging.

```js
import { Events, MessageFlags } from 'discord.js';
import { isCommandEnabled, getGuildSettings, addAuditLog } from '../database/models.js';
import { checkGuildAccess } from '../config.js';

export function register(client) {
    client.on(Events.InteractionCreate, async (interaction) => {
        // Copy the EXACT handler body from index.js lines 347–457
    });
}
```

> **Important:** Copy the exact handler body. It references `client.commands` (the Collection), `checkGuildAccess`, `isCommandEnabled`, `getGuildSettings`, `addAuditLog`.

- [ ] **Step 2: Create `src/events/guildMemberAdd.js`**

Move index.js lines 461–527. Handles welcomer embeds/DMs and autorole assignment.

```js
import { Events } from 'discord.js';
import { getGuildSettings } from '../database/models.js';
import { checkGuildAccess } from '../config.js';

export function register(client) {
    client.on(Events.GuildMemberAdd, async (member) => {
        // Copy the EXACT handler body from index.js lines 462–526
    });
}
```

- [ ] **Step 3: Create `src/events/messageCreate.js`**

Move index.js lines 530–719. This is the largest handler — includes shell channel execution, AFK tracking, autoresponders, auto-thread creation, message XP and level-up.

```js
import { Events, ChannelType } from 'discord.js';
import {
    addXp, getGuildSettings, getAfk, removeAfk,
    isThreadChannel, getAutoresponders, addAuditLog,
} from '../database/models.js';
import config, { checkGuildAccess, isOwner } from '../config.js';
import { executeCommand, formatOutput, isShellAllowed } from '../utils/shellExecutor.js';
import { updateTopRoles } from '../utils/levelRoles.js';

// ponytail: xpCooldowns is local to this handler — no need to share it
const xpCooldowns = new Map();

export function register(client) {
    client.on(Events.MessageCreate, async (message) => {
        // Copy the EXACT handler body from index.js lines 532–718
        // Note: this references xpCooldowns (defined above), client.commands, updateTopRoles
    });
}
```

> **Important:** `xpCooldowns` is defined at line 530 in index.js and only used in this handler. Move it into this file.

- [ ] **Step 4: Create `src/events/messageUpdate.js`**

Move index.js lines 722–808. Logs edited messages to the guild's log channel + audit DB.

```js
import { Events } from 'discord.js';
import { getGuildSettings, addAuditLog } from '../database/models.js';

export function register(client) {
    client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
        // Copy the EXACT handler body from index.js lines 723–807
    });
}
```

- [ ] **Step 5: Create `src/events/messageDelete.js`**

Move index.js lines 811–883.

```js
import { Events } from 'discord.js';
import { getGuildSettings, addAuditLog } from '../database/models.js';

export function register(client) {
    client.on(Events.MessageDelete, async (message) => {
        // Copy the EXACT handler body from index.js lines 812–882
    });
}
```

- [ ] **Step 6: Create `src/events/messageReactionAdd.js`**

Move index.js lines 886–1000. Includes starboard handling and reaction role assignment.

```js
import { Events } from 'discord.js';
import {
    getGuildSettings, getStarboardMessage, addStarboardMessage,
    updateStarboardCount, getReactionRole,
} from '../database/models.js';

export function register(client) {
    client.on(Events.MessageReactionAdd, async (reaction, user) => {
        // Copy the EXACT handler body from index.js lines 887–969
        // Also include the handleReactionRoleAdd helper from lines 973–1000
        // as a local function within this file
    });
}
```

- [ ] **Step 7: Create `src/events/messageReactionRemove.js`**

Move index.js lines 1003–1042.

```js
import { Events } from 'discord.js';
import { getReactionRole } from '../database/models.js';

export function register(client) {
    client.on(Events.MessageReactionRemove, async (reaction, user) => {
        // Copy the EXACT handler body from index.js lines 1004–1041
    });
}
```

- [ ] **Step 8: Create `src/events/guildCreate.js`**

Move index.js lines 1114–1121.

```js
import { Events } from 'discord.js';
import { checkGuildAccess } from '../config.js';

export function register(client) {
    client.on(Events.GuildCreate, (guild) => {
        console.log(`[INFO] Joined new guild: ${guild.name} (${guild.id})`);
        if (!checkGuildAccess(guild.id)) {
            console.log(`[INFO] Guild ${guild.id} is not in allowlist, leaving...`);
            guild.leave().catch(console.error);
        }
    });
}
```

- [ ] **Step 9: Update index.js — wire up all event handlers**

Replace all inline `client.on(Events.*)` blocks in index.js with:

```js
// Register event handlers
import { register as registerInteractionCreate } from './events/interactionCreate.js';
import { register as registerGuildMemberAdd } from './events/guildMemberAdd.js';
import { register as registerMessageCreate } from './events/messageCreate.js';
import { register as registerMessageUpdate } from './events/messageUpdate.js';
import { register as registerMessageDelete } from './events/messageDelete.js';
import { register as registerMessageReactionAdd } from './events/messageReactionAdd.js';
import { register as registerMessageReactionRemove } from './events/messageReactionRemove.js';
import { register as registerGuildCreate } from './events/guildCreate.js';

registerInteractionCreate(client);
registerGuildMemberAdd(client);
registerMessageCreate(client);
registerMessageUpdate(client);
registerMessageDelete(client);
registerMessageReactionAdd(client);
registerMessageReactionRemove(client);
registerGuildCreate(client);
```

Keep in `index.js`:
- The `client.once(Events.ClientReady)` handler (it starts the API server and background services — it's the orchestrator)
- The `client.on(Events.Error)` one-liner (too small to extract)
- `loginCompleted` flag + `process.on('unhandledRejection'/'SIGINT'/'SIGTERM')` handlers
- `loginWithRetry` and the top-level login call

Remove now-unused imports from `index.js` top:
- All database model imports that are only used in extracted handlers/services
- `executeCommand`, `formatOutput`, `isShellAllowed` (moved to messageCreate)
- `checkGuildAccess` (if not used in ClientReady handler — check first)

Keep in imports:
- `Client, Collection, Events, GatewayIntentBits` (still needed for client creation + ClientReady)
- `config, validateConfig` (used in setup)
- `startApiServer, setDiscordClient` (used in ClientReady)
- `addAllowedGuild` (used in guild seeding at startup)

- [ ] **Step 10: Verify bot starts with all events**

```bash
cd ~/Projects/home-server/palu-gada-bot
docker compose up -d --build --force-recreate
sleep 15
docker compose logs --tail 30
```

Expected: `Bot is ready!`, all service `started` lines, no errors. Test in Discord:
- `/ping` — responds with latency
- Send a message in a channel — no errors in logs (messageCreate handler working)
- Check that starboard, AFK, leveling aren't broken by monitoring logs

- [ ] **Step 11: Commit**

```bash
cd ~/Projects/home-server
git add palu-gada-bot/src/events/ palu-gada-bot/src/index.js
git commit -m "refactor: extract 8 event handlers from index.js to src/events/

- interactionCreate (slash commands + buttons)
- guildMemberAdd (welcomer + autorole)
- messageCreate (shell, AFK, autoresponder, XP, threads)
- messageUpdate (edit logging)
- messageDelete (delete logging)
- messageReactionAdd (starboard + reaction roles)
- messageReactionRemove (reaction role removal)
- guildCreate (allowlist enforcement)

index.js is now ~60 lines: client setup, command loading,
event registration, service startup, login."
```

---

### Task 4: Final verification and cleanup

**Files:**
- Modify: `palu-gada-bot/src/index.js` (final trim)

**Interfaces:**
- Consumes: all previously extracted modules
- Produces: clean ~60-line entry point

- [ ] **Step 1: Review final index.js**

The file should now contain approximately:

```js
import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import config, { validateConfig } from './config.js';
import { addAllowedGuild } from './database/models.js';
import { startApiServer, setDiscordClient } from './api/server.js';

// Event handlers
import { register as registerInteractionCreate } from './events/interactionCreate.js';
import { register as registerGuildMemberAdd } from './events/guildMemberAdd.js';
import { register as registerMessageCreate } from './events/messageCreate.js';
import { register as registerMessageUpdate } from './events/messageUpdate.js';
import { register as registerMessageDelete } from './events/messageDelete.js';
import { register as registerMessageReactionAdd } from './events/messageReactionAdd.js';
import { register as registerMessageReactionRemove } from './events/messageReactionRemove.js';
import { register as registerGuildCreate } from './events/guildCreate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

validateConfig();

// Seed allowed guilds
if (config.allowedGuildsEnv.length > 0) {
    for (const guildId of config.allowedGuildsEnv) {
        addAllowedGuild(guildId.trim(), 'env', 'Seeded from ALLOWED_GUILDS env var');
    }
}

// Create client & load commands
const client = new Client({ intents: [/* keep existing intents */] });
client.commands = new Collection();
// ... existing dynamic command loader loop ...

// Register events
registerInteractionCreate(client);
registerGuildMemberAdd(client);
registerMessageCreate(client);
registerMessageUpdate(client);
registerMessageDelete(client);
registerMessageReactionAdd(client);
registerMessageReactionRemove(client);
registerGuildCreate(client);

client.on(Events.Error, (error) => console.error('[ERROR] Discord client error:', error));

// On ready: start API + background services
client.once(Events.ClientReady, async (readyClient) => {
    console.log(`[INFO] Bot is ready! Logged in as ${readyClient.user.tag}`);
    console.log(`[INFO] Serving ${readyClient.guilds.cache.size} guild(s)`);

    if (config.apiEnabled) {
        setDiscordClient(client);
        await startApiServer(config.apiPort);
    }

    const { start: startReminders } = await import('./services/reminderScheduler.js');
    const { start: startMessages } = await import('./services/messageScheduler.js');
    const { start: startGiveaways } = await import('./services/giveawayScheduler.js');
    const { start: startStats } = await import('./services/statsChannelUpdater.js');
    const { start: startBirthdays } = await import('./services/birthdayScheduler.js');
    const { start: startVoiceXp } = await import('./services/voiceXpTracker.js');

    startReminders(client);
    startMessages(client);
    startGiveaways(client);
    startStats(client);
    startBirthdays(client);
    startVoiceXp(client);
});

// Process handlers
let loginCompleted = false;
client.once(Events.ClientReady, () => { loginCompleted = true; });

process.on('unhandledRejection', (error) => {
    console.error('[ERROR] Unhandled promise rejection:', error);
    if (!loginCompleted) {
        console.error('[FATAL] Unhandled rejection before bot was ready — exiting for restart.');
        process.exit(1);
    }
});

process.on('SIGINT', () => { console.log('[INFO] Shutting down...'); client.destroy(); process.exit(0); });
process.on('SIGTERM', () => { console.log('[INFO] Shutting down...'); client.destroy(); process.exit(0); });

// Login
async function loginWithRetry({ maxAttempts = 5, baseDelayMs = 2000 } = {}) {
    // ... keep existing implementation ...
}

try {
    await loginWithRetry();
} catch (error) {
    console.error('[FATAL] Could not log in to Discord after retries — exiting for restart.', error);
    process.exit(1);
}
```

Verify the line count is roughly 60–90 lines (imports + setup + ready handler + login). If it's over 100, look for code that should have been extracted.

- [ ] **Step 2: Full functional verification**

Test these features in Discord (each exercises a different extracted module):

| Test | Exercises |
|------|-----------|
| `/ping` | interactionCreate |
| Send a message | messageCreate (XP, autoresponder) |
| React with ⭐ to a message | messageReactionAdd (starboard) |
| `/remind 1m test` then wait | reminderScheduler |
| Check logs for `[INFO] ... started` × 6 | all services |
| `/expense today` (if Task from expense plan is done) | interactionCreate + expense command |

- [ ] **Step 3: Remove any dead imports left in index.js**

Grep for any import that's no longer used:
```bash
cd ~/Projects/home-server/palu-gada-bot
# For each imported name, check if it's still referenced in index.js
node -e "
import { readFileSync } from 'fs';
const src = readFileSync('src/index.js', 'utf8');
const importLine = /^import .+ from/gm;
let m;
while ((m = importLine.exec(src))) console.log(m[0]);
"
```

Remove any imports that are only referenced in the import line itself.

- [ ] **Step 4: Final commit**

```bash
cd ~/Projects/home-server
git add palu-gada-bot/src/index.js
git commit -m "refactor: trim index.js to ~70-line entry point

All event handlers in src/events/, background services in src/services/,
utility functions in src/utils/. index.js is now purely orchestration:
client setup, command loading, event registration, login."
```
