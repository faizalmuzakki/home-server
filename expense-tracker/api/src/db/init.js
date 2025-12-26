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
      type TEXT DEFAULT 'expense',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      description TEXT,
      vendor TEXT,
      category_id INTEGER,
      date DATE NOT NULL,
      type TEXT DEFAULT 'expense',
      source TEXT DEFAULT 'manual',
      image_url TEXT,
      raw_text TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
    CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_type ON expenses(type);
  `);

  // Migration: Add type column if it doesn't exist (for existing databases)
  try {
    const tableInfo = db.prepare("PRAGMA table_info(expenses)").all();
    const hasTypeColumn = tableInfo.some(col => col.name === 'type');
    if (!hasTypeColumn) {
      db.exec("ALTER TABLE expenses ADD COLUMN type TEXT DEFAULT 'expense'");
      console.log('Migration: Added type column to expenses table');
    }
    
    const catTableInfo = db.prepare("PRAGMA table_info(categories)").all();
    const catHasTypeColumn = catTableInfo.some(col => col.name === 'type');
    if (!catHasTypeColumn) {
      db.exec("ALTER TABLE categories ADD COLUMN type TEXT DEFAULT 'expense'");
      console.log('Migration: Added type column to categories table');
    }
  } catch (e) {
    // Column might already exist, ignore
  }

  // Insert default expense categories if none exist
  const categoryCount = db.prepare('SELECT COUNT(*) as count FROM categories').get();
  if (categoryCount.count === 0) {
    const defaultCategories = [
      // Expense categories
      { name: 'Food & Dining', icon: '🍔', color: '#FF6B6B', type: 'expense' },
      { name: 'Transportation', icon: '🚗', color: '#4ECDC4', type: 'expense' },
      { name: 'Shopping', icon: '🛒', color: '#45B7D1', type: 'expense' },
      { name: 'Entertainment', icon: '🎬', color: '#96CEB4', type: 'expense' },
      { name: 'Bills & Utilities', icon: '💡', color: '#FFEAA7', type: 'expense' },
      { name: 'Healthcare', icon: '🏥', color: '#DDA0DD', type: 'expense' },
      { name: 'Education', icon: '📚', color: '#98D8C8', type: 'expense' },
      { name: 'Travel', icon: '✈️', color: '#F7DC6F', type: 'expense' },
      { name: 'Groceries', icon: '🥬', color: '#82E0AA', type: 'expense' },
      { name: 'Other Expense', icon: '📦', color: '#AEB6BF', type: 'expense' },
      // Income categories
      { name: 'Salary', icon: '💰', color: '#27AE60', type: 'income' },
      { name: 'Freelance', icon: '💻', color: '#2ECC71', type: 'income' },
      { name: 'Investment', icon: '📈', color: '#1ABC9C', type: 'income' },
      { name: 'Gift', icon: '🎁', color: '#E74C3C', type: 'income' },
      { name: 'Refund', icon: '↩️', color: '#9B59B6', type: 'income' },
      { name: 'Business', icon: '🏢', color: '#3498DB', type: 'income' },
      { name: 'Other Income', icon: '💵', color: '#16A085', type: 'income' }
    ];

    const insert = db.prepare('INSERT INTO categories (name, icon, color, type) VALUES (?, ?, ?, ?)');
    for (const cat of defaultCategories) {
      insert.run(cat.name, cat.icon, cat.color, cat.type);
    }
  } else {
    // Add income categories if they don't exist (migration for existing databases)
    const incomeCategories = [
      { name: 'Salary', icon: '💰', color: '#27AE60', type: 'income' },
      { name: 'Freelance', icon: '💻', color: '#2ECC71', type: 'income' },
      { name: 'Investment', icon: '📈', color: '#1ABC9C', type: 'income' },
      { name: 'Gift', icon: '🎁', color: '#E74C3C', type: 'income' },
      { name: 'Refund', icon: '↩️', color: '#9B59B6', type: 'income' },
      { name: 'Business', icon: '🏢', color: '#3498DB', type: 'income' },
      { name: 'Other Income', icon: '💵', color: '#16A085', type: 'income' }
    ];

    const insertOrIgnore = db.prepare('INSERT OR IGNORE INTO categories (name, icon, color, type) VALUES (?, ?, ?, ?)');
    for (const cat of incomeCategories) {
      insertOrIgnore.run(cat.name, cat.icon, cat.color, cat.type);
    }
  }

  console.log('Database initialized');
}
