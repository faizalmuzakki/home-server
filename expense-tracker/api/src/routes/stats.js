import { Router } from 'express';
import { db } from '../db/init.js';

const router = Router();

// Get summary stats
router.get('/summary', (req, res) => {
  try {
    const { startDate, endDate, type } = req.query;

    let dateFilter = '';
    const params = [];

    if (startDate) {
      dateFilter += ' AND DATE(date) >= DATE(?)';
      params.push(startDate);
    }
    if (endDate) {
      dateFilter += ' AND DATE(date) <= DATE(?)';
      params.push(endDate);
    }

    // Get totals by type
    const expenseTotal = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
      FROM expenses
      WHERE type = 'expense' ${dateFilter}
    `).get(...params);

    const incomeTotal = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
      FROM expenses
      WHERE type = 'income' ${dateFilter}
    `).get(...params);

    // Get category breakdown (filter by type if specified)
    let categoryQuery = `
      SELECT 
        c.id,
        c.name,
        c.icon,
        c.color,
        c.type as category_type,
        COALESCE(SUM(e.amount), 0) as total,
        COUNT(e.id) as count
      FROM categories c
      LEFT JOIN expenses e ON c.id = e.category_id ${dateFilter ? 'AND' + dateFilter.replace('AND', '') : ''}
    `;

    if (type && (type === 'expense' || type === 'income')) {
      categoryQuery += ` WHERE c.type = '${type}'`;
    }

    categoryQuery += ` GROUP BY c.id ORDER BY total DESC`;

    const byCategory = db.prepare(categoryQuery).all(...params);

    res.json({
      income: incomeTotal.total,
      incomeCount: incomeTotal.count,
      expenses: expenseTotal.total,
      expenseCount: expenseTotal.count,
      net: incomeTotal.total - expenseTotal.total,
      total: incomeTotal.total + expenseTotal.total,
      count: incomeTotal.count + expenseTotal.count,
      byCategory
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get daily totals for chart
router.get('/daily', (req, res) => {
  try {
    const { startDate, endDate, type } = req.query;

    let query = `
      SELECT 
        date, 
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expenses,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END) as net,
        COUNT(*) as count
      FROM expenses
      WHERE 1=1
    `;
    const params = [];

    if (startDate) {
      query += ' AND DATE(date) >= DATE(?)';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND DATE(date) <= DATE(?)';
      params.push(endDate);
    }
    if (type && (type === 'expense' || type === 'income')) {
      query += ' AND type = ?';
      params.push(type);
    }

    query += ' GROUP BY date ORDER BY date';

    const daily = db.prepare(query).all(...params);
    res.json(daily);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get monthly totals
router.get('/monthly', (req, res) => {
  try {
    const { year, type } = req.query;

    let query = `
      SELECT 
        strftime('%Y-%m', date) as month,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expenses,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END) as net,
        COUNT(*) as count
      FROM expenses
    `;
    const params = [];
    const conditions = [];

    if (year) {
      conditions.push('strftime("%Y", date) = ?');
      params.push(year);
    }
    if (type && (type === 'expense' || type === 'income')) {
      conditions.push('type = ?');
      params.push(type);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' GROUP BY month ORDER BY month';

    const monthly = db.prepare(query).all(...params);
    res.json(monthly);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
