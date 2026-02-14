import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

let db: Database.Database;

try {
  db = new Database(path.join(DATA_DIR, 'bot.db'));
} catch (error) {
  console.error('Failed to open database:', error);
  throw error;
}

export function initDatabase() {
  // Guild Settings
  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (guild_id, key)
    )
  `);

  // User Preferences
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (user_id, key)
    )
  `);

  // Warnings
  db.exec(`
    CREATE TABLE IF NOT EXISTS warnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `);

  // Todos
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      task TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `);

  // Notes
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  // Economy
  db.exec(`
    CREATE TABLE IF NOT EXISTS economy (
      user_id TEXT PRIMARY KEY,
      balance INTEGER DEFAULT 0,
      last_daily INTEGER DEFAULT 0
    )
  `);

  // Levels
  db.exec(`
    CREATE TABLE IF NOT EXISTS levels (
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 0,
      last_message_time INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, guild_id)
    )
  `);

  // Birthdays
  db.exec(`
    CREATE TABLE IF NOT EXISTS birthdays (
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      day INTEGER NOT NULL,
      month INTEGER NOT NULL,
      PRIMARY KEY (user_id, guild_id)
    )
  `);

  // Starboard
  db.exec(`
    CREATE TABLE IF NOT EXISTS starboard (
        message_id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        star_count INTEGER DEFAULT 0
    )
  `);

  // Giveaways
  db.exec(`
    CREATE TABLE IF NOT EXISTS giveaways (
        message_id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        prize TEXT NOT NULL,
        end_time INTEGER NOT NULL,
        winner_count INTEGER DEFAULT 1,
        winners TEXT,
        ended INTEGER DEFAULT 0
    )
  `);

  // Giveaway Entries
  db.exec(`
    CREATE TABLE IF NOT EXISTS giveaway_entries (
        giveaway_message_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        PRIMARY KEY (giveaway_message_id, user_id)
    )
  `);

  console.log('Database initialized successfully.');
}

export default db;
