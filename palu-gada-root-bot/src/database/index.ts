import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let _db: Database.Database;

export function initDatabase() {
  const DATA_DIR = path.join(process.cwd(), 'data');

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  try {
    const dbPath = path.join(DATA_DIR, 'bot.db');
    _db = new Database(dbPath);
  } catch (error) {
    console.error('Failed to open database:', error);
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

  // Warnings (also stores kick/ban/timeout mod actions)
  _db.exec(`
    CREATE TABLE IF NOT EXISTS warnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      action_type TEXT NOT NULL DEFAULT 'warn'
    )
  `);

  // Migration: add action_type column if it was created without it
  try {
    const warningsInfo = _db.prepare("PRAGMA table_info(warnings)").all() as any[];
    const hasActionType = warningsInfo.some((col: any) => col.name === 'action_type');
    if (!hasActionType) {
      _db.exec("ALTER TABLE warnings ADD COLUMN action_type TEXT NOT NULL DEFAULT 'warn'");
    }
  } catch (error) {
    console.error('Migration error for warnings table:', error);
  }

  // Timeouts (soft-mute via role)
  _db.exec(`
    CREATE TABLE IF NOT EXISTS timeouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      reason TEXT,
      expires_at INTEGER NOT NULL,
      active INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL
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

  // Migration for notes: add updated_at if missing
  try {
    const tableInfo = _db.prepare("PRAGMA table_info(notes)").all() as any[];
    const hasUpdatedAt = tableInfo.some(col => col.name === 'updated_at');
    if (!hasUpdatedAt) {
      console.log('Migrating notes table: adding updated_at column...');
      _db.exec("ALTER TABLE notes ADD COLUMN updated_at INTEGER DEFAULT 0");
    }
  } catch (error) {
    console.error('Migration error for notes table:', error);
  }
  _db.exec(`
    CREATE TABLE IF NOT EXISTS economy (
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL DEFAULT 'default',
      balance INTEGER DEFAULT 0,
      last_daily INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, guild_id)
    )
  `);

  // Migration: rebuild economy table with guild_id primary key if it was created without it
  try {
    const economyInfo = _db.prepare("PRAGMA table_info(economy)").all() as any[];
    const hasGuildId = economyInfo.some((col: any) => col.name === 'guild_id');
    if (!hasGuildId) {
      _db.exec("ALTER TABLE economy RENAME TO economy_old");
      _db.exec(`
        CREATE TABLE economy (
          user_id TEXT NOT NULL,
          guild_id TEXT NOT NULL DEFAULT 'default',
          balance INTEGER DEFAULT 0,
          last_daily INTEGER DEFAULT 0,
          PRIMARY KEY (user_id, guild_id)
        )
      `);
      _db.exec("INSERT INTO economy (user_id, guild_id, balance, last_daily) SELECT user_id, 'default', balance, last_daily FROM economy_old");
      _db.exec("DROP TABLE economy_old");
    }
  } catch (error) {
    console.error('Migration error for economy table:', error);
  }

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
        star_count INTEGER DEFAULT 0,
        starboard_message_id TEXT,
        posted INTEGER DEFAULT 0
    )
  `);

  // Migration: add starboard_message_id and posted columns if missing
  try {
    const starboardInfo = _db.prepare("PRAGMA table_info(starboard)").all() as any[];
    const cols = starboardInfo.map((c: any) => c.name);
    if (!cols.includes('starboard_message_id')) {
      _db.exec("ALTER TABLE starboard ADD COLUMN starboard_message_id TEXT");
    }
    if (!cols.includes('posted')) {
      _db.exec("ALTER TABLE starboard ADD COLUMN posted INTEGER DEFAULT 0");
    }
  } catch (error) {
    console.error('Migration error for starboard table:', error);
  }

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
