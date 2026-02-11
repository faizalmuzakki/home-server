import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database path - store in data/ directory
const dataDir = join(__dirname, '../../data');
if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
}

const dbPath = join(dataDir, 'bot.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Initialize tables
function initDatabase() {
    // Guild settings table
    db.exec(`
        CREATE TABLE IF NOT EXISTS guild_settings (
            guild_id TEXT PRIMARY KEY,
            prefix TEXT DEFAULT '!',
            dj_role_id TEXT,
            music_channel_id TEXT,
            log_channel_id TEXT,
            volume INTEGER DEFAULT 100,
            welcome_channel_id TEXT,
            welcome_message TEXT,
            welcome_enabled INTEGER DEFAULT 0,
            autorole_id TEXT,
            autorole_enabled INTEGER DEFAULT 0,
            log_enabled INTEGER DEFAULT 0,
            starboard_channel_id TEXT,
            starboard_threshold INTEGER DEFAULT 3,
            starboard_enabled INTEGER DEFAULT 0,
            confession_channel_id TEXT,
            confession_enabled INTEGER DEFAULT 0,
            message_edit_log_enabled INTEGER DEFAULT 0,
            message_delete_log_enabled INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Add message_edit_log_enabled column if it doesn't exist (migration)
    try {
        db.exec(`ALTER TABLE guild_settings ADD COLUMN message_edit_log_enabled INTEGER DEFAULT 0`);
        console.log('[INFO] Added message_edit_log_enabled column');
    } catch (e) {
        // Column already exists, ignore
    }

    // Add message_delete_log_enabled column if it doesn't exist (migration)
    try {
        db.exec(`ALTER TABLE guild_settings ADD COLUMN message_delete_log_enabled INTEGER DEFAULT 0`);
        console.log('[INFO] Added message_delete_log_enabled column');
    } catch (e) {
        // Column already exists, ignore
    }

    // Add level_channel_id column if it doesn't exist (migration)
    try {
        db.exec(`ALTER TABLE guild_settings ADD COLUMN level_channel_id TEXT`);
        console.log('[INFO] Added level_channel_id column');
    } catch (e) {
        // Column already exists, ignore
    }

    // Add level_enabled column if it doesn't exist (migration)
    try {
        db.exec(`ALTER TABLE guild_settings ADD COLUMN level_enabled INTEGER DEFAULT 1`);
        console.log('[INFO] Added level_enabled column');
    } catch (e) {
        // Column already exists, ignore
    }

    // Allowed guilds table (for whitelist mode)
    db.exec(`
        CREATE TABLE IF NOT EXISTS allowed_guilds (
            guild_id TEXT PRIMARY KEY,
            added_by TEXT,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            notes TEXT
        )
    `);

    // Bot config table (key-value store)
    db.exec(`
        CREATE TABLE IF NOT EXISTS bot_config (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // User preferences (for future features)
    db.exec(`
        CREATE TABLE IF NOT EXISTS user_preferences (
            user_id TEXT PRIMARY KEY,
            settings TEXT DEFAULT '{}',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Guild command toggles (enable/disable commands per guild)
    db.exec(`
        CREATE TABLE IF NOT EXISTS guild_commands (
            guild_id TEXT NOT NULL,
            command_name TEXT NOT NULL,
            enabled INTEGER DEFAULT 1,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (guild_id, command_name)
        )
    `);

    // Global command toggles (enable/disable commands globally)
    db.exec(`
        CREATE TABLE IF NOT EXISTS global_commands (
            command_name TEXT PRIMARY KEY,
            enabled INTEGER DEFAULT 1,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Reminders table
    db.exec(`
        CREATE TABLE IF NOT EXISTS reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            channel_id TEXT,
            guild_id TEXT,
            message TEXT NOT NULL,
            remind_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed INTEGER DEFAULT 0
        )
    `);

    // Warnings table (for moderation)
    db.exec(`
        CREATE TABLE IF NOT EXISTS warnings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            moderator_id TEXT NOT NULL,
            reason TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // User todos table
    db.exec(`
        CREATE TABLE IF NOT EXISTS user_todos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            task TEXT NOT NULL,
            completed INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // User notes table
    db.exec(`
        CREATE TABLE IF NOT EXISTS user_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // AFK status table
    db.exec(`
        CREATE TABLE IF NOT EXISTS afk_status (
            user_id TEXT PRIMARY KEY,
            message TEXT,
            since DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // User economy table
    db.exec(`
        CREATE TABLE IF NOT EXISTS user_economy (
            user_id TEXT PRIMARY KEY,
            balance INTEGER DEFAULT 0,
            bank INTEGER DEFAULT 0,
            last_daily DATETIME,
            total_earned INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // User levels table
    db.exec(`
        CREATE TABLE IF NOT EXISTS user_levels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            xp INTEGER DEFAULT 0,
            level INTEGER DEFAULT 0,
            messages INTEGER DEFAULT 0,
            last_xp_gain DATETIME,
            UNIQUE(guild_id, user_id)
        )
    `);

    // User playlists table
    db.exec(`
        CREATE TABLE IF NOT EXISTS user_playlists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            tracks TEXT DEFAULT '[]',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, name)
        )
    `);

    // Birthdays table
    db.exec(`
        CREATE TABLE IF NOT EXISTS birthdays (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            month INTEGER NOT NULL,
            day INTEGER NOT NULL,
            year INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(guild_id, user_id)
        )
    `);

    // Starboard messages table
    db.exec(`
        CREATE TABLE IF NOT EXISTS starboard_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            original_message_id TEXT NOT NULL,
            starboard_message_id TEXT,
            star_count INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(guild_id, original_message_id)
        )
    `);

    // Giveaways table
    db.exec(`
        CREATE TABLE IF NOT EXISTS giveaways (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            message_id TEXT UNIQUE,
            host_id TEXT NOT NULL,
            prize TEXT NOT NULL,
            winner_count INTEGER DEFAULT 1,
            ends_at DATETIME NOT NULL,
            active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Giveaway entries table
    db.exec(`
        CREATE TABLE IF NOT EXISTS giveaway_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            entered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(message_id, user_id)
        )
    `);

    // Confessions table
    db.exec(`
        CREATE TABLE IF NOT EXISTS confessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            confession_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Audit logs table
    db.exec(`
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            action TEXT NOT NULL,
            user_id TEXT,
            target_id TEXT,
            details TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // GitHub webhooks table
    db.exec(`
        CREATE TABLE IF NOT EXISTS github_webhooks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            organization TEXT,
            repository TEXT,
            events TEXT DEFAULT '["push","pull_request","issues","release"]',
            webhook_secret TEXT,
            enabled INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Reaction roles table
    db.exec(`
        CREATE TABLE IF NOT EXISTS reaction_roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            message_id TEXT NOT NULL,
            emoji TEXT NOT NULL,
            role_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(guild_id, message_id, emoji)
        )
    `);

    console.log('[INFO] Database initialized');
}

// Initialize on import
initDatabase();

export default db;
