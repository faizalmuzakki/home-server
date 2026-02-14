import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let _db: Database.Database;

export function initDatabase() {
  console.log(`[PID: ${process.pid}] Current working directory:`, process.cwd());
  const DATA_DIR = path.join(process.cwd(), 'data');
  console.log(`[PID: ${process.pid}] Target data directory:`, DATA_DIR);

  if (!fs.existsSync(DATA_DIR)) {
    console.log(`[PID: ${process.pid}] Creating data directory...`);
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  try {
    const dbPath = path.join(DATA_DIR, 'bot.db');
    console.log(`[PID: ${process.pid}] Attempting to open database at:`, dbPath);
    _db = new Database(dbPath, { 
      verbose: (msg: string) => console.log(`[PID: ${process.pid}] SQL: ${msg}`)
    });
  } catch (error) {

    console.error(`[PID: ${process.pid}] Failed to open database:`, error);
    throw error;
  }

  // Guild Settings
  _db.exec(`
    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (guild_id, key)
    )
  `);

  // User Preferences
  _db.exec(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (user_id, key)
    )
  `);

  // Warnings
  _db.exec(`
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
  _db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      task TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `);

  // Notes
  _db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Economy
  _db.exec(`
    CREATE TABLE IF NOT EXISTS economy (
      user_id TEXT PRIMARY KEY,
      balance INTEGER DEFAULT 0,
      last_daily INTEGER DEFAULT 0
    )
  `);

  // Levels
  _db.exec(`
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
  _db.exec(`
    CREATE TABLE IF NOT EXISTS birthdays (
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      day INTEGER NOT NULL,
      month INTEGER NOT NULL,
      PRIMARY KEY (user_id, guild_id)
    )
  `);

  // Starboard
  _db.exec(`
    CREATE TABLE IF NOT EXISTS starboard (
        message_id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        star_count INTEGER DEFAULT 0
    )
  `);

  // Giveaways
  _db.exec(`
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
  _db.exec(`
    CREATE TABLE IF NOT EXISTS giveaway_entries (
        giveaway_message_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        PRIMARY KEY (giveaway_message_id, user_id)
    )
  `);

  console.log('Database initialized successfully.');
}

const db: any = new Proxy({} as any, {
  get(target, prop, receiver) {
    if (!_db) {
      throw new Error("Database not initialized! Call initDatabase() first.");
    }
    const value = Reflect.get(_db, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(_db);
    }
    return value;
  }
});

export default db;
