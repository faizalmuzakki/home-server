import { Client, GatewayIntentBits, Events } from 'discord.js';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env specific to where this is run (container vs host)
if (fs.existsSync(join(__dirname, '../.env'))) {
    dotenv.config({ path: join(__dirname, '../.env') });
}

// Ensure data dir exists (just in case)
const dataDir = join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
    console.error(`Data directory not found at ${dataDir}`);
    process.exit(1);
}

const dbPath = join(dataDir, 'bot.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const GUILD_ID = process.argv[2];
if (!GUILD_ID) {
    console.error('Please provide a Guild ID as the first argument.');
    // Guild ID from user context: 661722599654424576
    console.log('Usage: node scripts/backfill-xp.js 661722599654424576');
    process.exit(1);
}

// Database queries
const addXpStmt = db.prepare('UPDATE user_levels SET xp = xp + ?, messages = messages + 1, last_xp_gain = ? WHERE guild_id = ? AND user_id = ?');
const createUserLevelStmt = db.prepare('INSERT OR IGNORE INTO user_levels (guild_id, user_id) VALUES (?, ?)');
const setLevelStmt = db.prepare('UPDATE user_levels SET level = ? WHERE guild_id = ? AND user_id = ?');
const getUserLevelStmt = db.prepare('SELECT * FROM user_levels WHERE guild_id = ? AND user_id = ?');

function calculateLevel(xp) {
    return Math.floor(Math.sqrt(xp / 100));
}

function addXp(guildId, userId, amount, timestampStr) {
    createUserLevelStmt.run(guildId, userId);
    addXpStmt.run(amount, timestampStr, guildId, userId);
    const after = getUserLevelStmt.get(guildId, userId);
    const newLevel = calculateLevel(after.xp);
    setLevelStmt.run(newLevel, guildId, userId);
}

const xpCooldowns = new Map();
let totalXpAdded = 0;

client.once(Events.ClientReady, async (c) => {
    console.log(`Ready! Logged in as ${c.user.tag}`);
    const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
    if (!guild) {
         console.error('Guild not found. Is the bot in the guild?');
         process.exit(1);
    }

    console.log(`Wiping existing XP for guild ${GUILD_ID} to prevent duplicate gains...`);
    db.prepare('DELETE FROM user_levels WHERE guild_id = ?').run(GUILD_ID);

    const channels = guild.channels.cache.filter(c => c.isTextBased());
    console.log(`Found ${channels.size} text-based channels in ${guild.name}.`);

    for (const [channelId, channel] of channels) {
         console.log(`\nProcessing channel: #${channel.name}...`);
         let lastId = '1'; // Start from beginning of time 
         let messagesProcessedCount = 0;
         let channelXpAdded = 0;

         while (true) {
             const messages = await channel.messages.fetch({ limit: 100, after: lastId }).catch(err => {
                 console.error(`Error fetching channel ${channel.name}: ${err.message}`);
                 return null;
             });
             
             if (!messages || messages.size === 0) break;
             
             // Sort chronologically
             const sortedMessages = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
             
             for (const msg of sortedMessages) {
                 if (msg.author.bot) continue;
                 
                 const key = `${guild.id}-${msg.author.id}`;
                 const msgTime = msg.createdTimestamp;
                 const lastXpTime = xpCooldowns.get(key) || 0;
                 
                 // 1 minute cooldown
                 if (msgTime - lastXpTime >= 60000) {
                     // 15-25 XP
                     const xpGained = Math.floor(Math.random() * 11) + 15;
                     
                     // Format timestamp string for SQLite
                     const timestampStr = new Date(msgTime).toISOString();
                     addXp(guild.id, msg.author.id, xpGained, timestampStr);
                     
                     xpCooldowns.set(key, msgTime);
                     channelXpAdded += xpGained;
                     totalXpAdded += xpGained;
                 }
                 messagesProcessedCount++;
                 lastId = msg.id;
             }
             
             process.stdout.write(`\r  ... fetched ${messagesProcessedCount} messages (XP granted: ${channelXpAdded}) `);
             
             // Delay to prevent rate limiting
             await new Promise(r => setTimeout(r, 1000));
         }
         console.log(`\nDone with #${channel.name}.`);
    }

    console.log(`\nBackfill complete! Overall XP successfully reconstructed: ${totalXpAdded}`);
    // Checkpoint DB
    db.pragma('wal_checkpoint(TRUNCATE)');
    process.exit(0);
});

if (!process.env.DISCORD_TOKEN) {
    console.error("DISCORD_TOKEN not found in environment.");
    process.exit(1);
}

console.log("Starting backfill logic. This will take some time due to rate limiting...");
client.login(process.env.DISCORD_TOKEN);
