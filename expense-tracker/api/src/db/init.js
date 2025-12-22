import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/expenses.db');

export const db = new Database(dbPath);

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT,
      color TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      description TEXT,
      vendor TEXT,
      category_id INTEGER,
      date DATE NOT NULL,
      source TEXT DEFAULT 'manual',
      image_url TEXT,
      raw_text TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
    CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
  `);

  // Insert default categories if none exist
  const categoryCount = db.prepare('SELECT COUNT(*) as count FROM categories').get();
  if (categoryCount.count === 0) {
    const defaultCategories = [
      { name: 'Food & Dining', icon: '🍔', color: '#FF6B6B' },
      { name: 'Transportation', icon: '🚗', color: '#4ECDC4' },
      { name: 'Shopping', icon: '🛒', color: '#45B7D1' },
      { name: 'Entertainment', icon: '🎬', color: '#96CEB4' },
      { name: 'Bills & Utilities', icon: '💡', color: '#FFEAA7' },
      { name: 'Healthcare', icon: '🏥', color: '#DDA0DD' },
      { name: 'Education', icon: '📚', color: '#98D8C8' },
      { name: 'Travel', icon: '✈️', color: '#F7DC6F' },
      { name: 'Groceries', icon: '🥬', color: '#82E0AA' },
      { name: 'Other', icon: '📦', color: '#AEB6BF' }
    ];

    const insert = db.prepare('INSERT INTO categories (name, icon, color) VALUES (?, ?, ?)');
    for (const cat of defaultCategories) {
      insert.run(cat.name, cat.icon, cat.color);
    }
  }

  console.log('Database initialized');
}
