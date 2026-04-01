import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let db;

function migrate(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      task TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS afk_status (
      user_id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      message TEXT NOT NULL,
      since INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS birthdays (
      user_id TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      day INTEGER NOT NULL,
      month INTEGER NOT NULL,
      PRIMARY KEY (user_id, chat_id)
    );

    CREATE TABLE IF NOT EXISTS polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      question TEXT NOT NULL,
      options_json TEXT NOT NULL,
      votes_json TEXT NOT NULL,
      closes_at INTEGER,
      closed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      message_key_json TEXT
    );

    CREATE TABLE IF NOT EXISTS giveaways (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      prize TEXT NOT NULL,
      closes_at INTEGER NOT NULL,
      winner_count INTEGER NOT NULL DEFAULT 1,
      participants_json TEXT NOT NULL,
      winners_json TEXT,
      closed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trivia_games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      question TEXT NOT NULL,
      options_json TEXT NOT NULL,
      correct_answer TEXT NOT NULL,
      closes_at INTEGER NOT NULL,
      revealed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS group_settings (
      chat_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (chat_id, key)
    );

    CREATE TABLE IF NOT EXISTS autoresponders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      trigger_text TEXT NOT NULL,
      response_text TEXT NOT NULL,
      match_type TEXT NOT NULL DEFAULT 'contains',
      created_by TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS confessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_chat_id TEXT NOT NULL,
      target_chat_id TEXT NOT NULL,
      message TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS message_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      message_text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor_id TEXT,
      target_id TEXT,
      details TEXT,
      created_at INTEGER NOT NULL
    );
  `);
}

export function initDatabase() {
  if (db) return db;

  const dataDir = path.join(process.cwd(), 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  db = new Database(path.join(dataDir, 'bot.db'));
  migrate(db);
  return db;
}

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }

  return db;
}
