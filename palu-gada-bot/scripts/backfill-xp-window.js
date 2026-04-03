/**
 * backfill-xp-window.js
 *
 * Awards XP only for messages sent within a specific time window.
 * Use this to backfill a bot outage period without touching existing XP.
 *
 * Usage (inside container):
 *   node /app/scripts/backfill-xp-window.js <guild_id> <from_iso> <to_iso>
 *
 * Example (run via docker exec from host):
 *   docker exec palu-gada-bot node /app/scripts/backfill-xp-window.js \
 *     661722599654424576 \
 *     "2026-04-03T13:53:00Z" \
 *     "2026-04-03T18:39:00Z"
 *
 * Notes:
 * - Applies the same 1-minute XP cooldown per user as the live bot
 * - Applies the same 15–25 XP per eligible message
 * - Safe to run while the bot is running; uses a separate DB connection in WAL mode
 * - Does NOT wipe existing XP; adds on top
 */

import { Client, GatewayIntentBits, Events } from 'discord.js';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env
if (fs.existsSync(join(__dirname, '../.env'))) {
    dotenv.config({ path: join(__dirname, '../.env') });
}

// --- Args ---
const [, , GUILD_ID, FROM_ISO, TO_ISO] = process.argv;

if (!GUILD_ID || !FROM_ISO || !TO_ISO) {
    console.error('Usage: node backfill-xp-window.js <guild_id> <from_iso> <to_iso>');
    console.error('Example: node backfill-xp-window.js 661722599654424576 "2026-04-03T13:53:00Z" "2026-04-03T18:39:00Z"');
    process.exit(1);
}

const FROM_TS = new Date(FROM_ISO).getTime();
const TO_TS   = new Date(TO_ISO).getTime();

if (isNaN(FROM_TS) || isNaN(TO_TS) || FROM_TS >= TO_TS) {
    console.error('Invalid time window. Ensure both are valid ISO dates and from < to.');
    process.exit(1);
}

console.log(`\n=== XP Backfill for outage window ===`);
console.log(`Guild : ${GUILD_ID}`);
console.log(`From  : ${new Date(FROM_TS).toISOString()}`);
console.log(`To    : ${new Date(TO_TS).toISOString()}`);
console.log(`Window: ${((TO_TS - FROM_TS) / 3600000).toFixed(2)} hours\n`);

// --- DB ---
let dataDir = process.env.DATA_DIR || join(__dirname, '../../data');
if (!fs.existsSync(dataDir) && fs.existsSync('/app/data')) dataDir = '/app/data';
if (!fs.existsSync(dataDir)) {
    console.error(`Data directory not found: ${dataDir}`);
    process.exit(1);
}

const db = new Database(join(dataDir, 'bot.db'));
db.pragma('journal_mode = WAL');

const addXpStmt       = db.prepare('UPDATE user_levels SET xp = xp + ?, messages = messages + 1, last_xp_gain = ? WHERE guild_id = ? AND user_id = ?');
const createLevelStmt = db.prepare('INSERT OR IGNORE INTO user_levels (guild_id, user_id) VALUES (?, ?)');
const setLevelStmt    = db.prepare('UPDATE user_levels SET level = ? WHERE guild_id = ? AND user_id = ?');
const getLevelStmt    = db.prepare('SELECT * FROM user_levels WHERE guild_id = ? AND user_id = ?');

function calculateLevel(xp) {
    return Math.floor(Math.sqrt(xp / 100));
}

function awardXp(guildId, userId, amount, msgTimestamp) {
    createLevelStmt.run(guildId, userId);
    addXpStmt.run(amount, new Date(msgTimestamp).toISOString(), guildId, userId);
    const row = getLevelStmt.get(guildId, userId);
    setLevelStmt.run(calculateLevel(row.xp), guildId, userId);
}

// --- Discord client ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

if (!process.env.DISCORD_TOKEN) {
    console.error('DISCORD_TOKEN not set.');
    process.exit(1);
}

client.once(Events.ClientReady, async (c) => {
    console.log(`Logged in as ${c.user.tag}`);

    const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
    if (!guild) {
        console.error('Guild not found. Is the bot a member?');
        process.exit(1);
    }

    await guild.channels.fetch();
    const channels = guild.channels.cache.filter(ch => ch.isTextBased());
    console.log(`Found ${channels.size} text-based channels in "${guild.name}".\n`);

    // Track per-user cooldown ACROSS channels (same as live bot)
    const xpCooldowns = new Map(); // key → last timestamp messages awarded XP

    let totalXp = 0;
    let totalMessages = 0;
    let totalEligible = 0;

    for (const [channelId, channel] of channels) {
        process.stdout.write(`Processing #${channel.name}... `);

        // Use a Snowflake ID just before the from-timestamp to start the window
        // Discord snowflake = (timestamp - EPOCH) << 22
        const DISCORD_EPOCH = 1420070400000n;
        const fromSnowflake = String((BigInt(FROM_TS) - DISCORD_EPOCH) << 22n);
        // To-timestamp as snowflake (we filter by createdTimestamp below)
        let lastId = fromSnowflake;
        let channelXp = 0;
        let channelMsgs = 0;

        while (true) {
            const messages = await channel.messages.fetch({ limit: 100, after: lastId }).catch(err => {
                console.error(`\n  [WARN] Error fetching #${channel.name}: ${err.message}`);
                return null;
            });

            if (!messages || messages.size === 0) break;

            // Sort oldest-first
            const sorted = Array.from(messages.values())
                .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

            // If the oldest message is already past the window, stop
            if (sorted[0].createdTimestamp > TO_TS) break;

            for (const msg of sorted) {
                if (msg.createdTimestamp < FROM_TS) continue; // shouldn't happen given fromSnowflake
                if (msg.createdTimestamp > TO_TS) break;      // past the window
                if (msg.author.bot) continue;

                channelMsgs++;
                totalMessages++;

                const key = `${GUILD_ID}-${msg.author.id}`;
                const lastXpTime = xpCooldowns.get(key) || 0;

                if (msg.createdTimestamp - lastXpTime >= 60000) {
                    const xpGained = Math.floor(Math.random() * 11) + 15;
                    awardXp(GUILD_ID, msg.author.id, xpGained, msg.createdTimestamp);
                    xpCooldowns.set(key, msg.createdTimestamp);
                    channelXp += xpGained;
                    totalXp += xpGained;
                    totalEligible++;
                }
            }

            lastId = sorted[sorted.length - 1].id;

            // If last message is past the window, we're done with this channel
            if (sorted[sorted.length - 1].createdTimestamp >= TO_TS) break;

            // Rate-limit courtesy delay
            await new Promise(r => setTimeout(r, 750));
        }

        console.log(`${channelMsgs} messages → +${channelXp} XP`);
    }

    db.pragma('wal_checkpoint(TRUNCATE)');

    console.log(`\n=== Backfill complete ===`);
    console.log(`Messages scanned  : ${totalMessages}`);
    console.log(`XP-eligible msgs  : ${totalEligible}`);
    console.log(`Total XP awarded  : ${totalXp}`);
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
