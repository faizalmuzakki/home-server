import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/expenses.db');

export const db = new Database(dbPath);

export function initDatabase() {
  // Step 1: Create tables (without type-dependent indexes for existing DBs)
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
  `);

  // Step 2: Migration - Add type column if it doesn't exist (for existing databases)
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

  // Step 3: Create type index AFTER migration ensures column exists
  db.exec(`CREATE INDEX IF NOT EXISTS idx_expenses_type ON expenses(type);`);

  // Step 3.5: Create investment-related tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS investment_holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      platform TEXT,
      current_value REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS investment_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL UNIQUE,
      target_percentage REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS investment_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monthly_budget REAL DEFAULT 5000000,
      catch_up_phase INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS investment_contributions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      date DATE NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_contributions_date ON investment_contributions(date);
    CREATE INDEX IF NOT EXISTS idx_contributions_type ON investment_contributions(type);
  `);

  // Initialize default investment holdings if none exist
  const holdingsCount = db.prepare('SELECT COUNT(*) as count FROM investment_holdings').get();
  if (holdingsCount.count === 0) {
    const defaultHoldings = [
      { type: 'emergency_fund', name: 'Emergency Fund', platform: 'Bibit Pasar Uang', current_value: 18500000 },
      { type: 'pension_fund', name: 'Pension Fund', platform: 'Robo-Advisor Agresif', current_value: 30100000 },
      { type: 'indonesian_equity', name: 'Indonesian Equity', platform: 'Bibit Reksa Dana Saham', current_value: 10500000 },
      { type: 'international_equity', name: 'International Equity', platform: 'Gotrade', current_value: 47000000 },
      { type: 'gold', name: 'Gold', platform: 'Bibit/Pluang', current_value: 0 }
    ];

    const insertHolding = db.prepare('INSERT INTO investment_holdings (type, name, platform, current_value) VALUES (?, ?, ?, ?)');
    for (const h of defaultHoldings) {
      insertHolding.run(h.type, h.name, h.platform, h.current_value);
    }
  }

  // Initialize default investment targets if none exist (final target allocation)
  const targetsCount = db.prepare('SELECT COUNT(*) as count FROM investment_targets').get();
  if (targetsCount.count === 0) {
    const defaultTargets = [
      { type: 'emergency_fund', target_percentage: 10 },
      { type: 'pension_fund', target_percentage: 25 },
      { type: 'indonesian_equity', target_percentage: 30 },
      { type: 'international_equity', target_percentage: 25 },
      { type: 'gold', target_percentage: 10 }
    ];

    const insertTarget = db.prepare('INSERT INTO investment_targets (type, target_percentage) VALUES (?, ?)');
    for (const t of defaultTargets) {
      insertTarget.run(t.type, t.target_percentage);
    }
  }

  // Initialize default investment config if none exists
  const configCount = db.prepare('SELECT COUNT(*) as count FROM investment_config').get();
  if (configCount.count === 0) {
    // start_month is when the user started the investment plan (for phase calculation)
    db.prepare(`
      INSERT INTO investment_config (monthly_budget, catch_up_phase) 
      VALUES (?, ?)
    `).run(5000000, 1);
  }

  // Add start_date column to config if it doesn't exist
  const configInfo = db.prepare("PRAGMA table_info(investment_config)").all();
  if (!configInfo.some(col => col.name === 'start_date')) {
    db.exec("ALTER TABLE investment_config ADD COLUMN start_date DATE DEFAULT CURRENT_DATE");
  }

  // Step 4: Insert default categories if none exist
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
