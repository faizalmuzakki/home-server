import { Router } from 'express';
import { db } from '../db/init.js';

const router = Router();

// Get summary stats
router.get('/summary', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let dateFilter = '';
    const params = [];
    
    if (startDate) {
      dateFilter += ' AND date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      dateFilter += ' AND date <= ?';
      params.push(endDate);
    }

    const total = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
      FROM expenses
      WHERE 1=1 ${dateFilter}
    `).get(...params);

    const byCategory = db.prepare(`
      SELECT 
        c.id,
        c.name,
        c.icon,
        c.color,
        COALESCE(SUM(e.amount), 0) as total,
        COUNT(e.id) as count
      FROM categories c
      LEFT JOIN expenses e ON c.id = e.category_id ${dateFilter ? 'AND' + dateFilter.replace('AND', '') : ''}
      GROUP BY c.id
      ORDER BY total DESC
    `).all(...params);

    res.json({
      total: total.total,
      count: total.count,
      byCategory
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get daily totals for chart
router.get('/daily', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let query = `
      SELECT date, SUM(amount) as total, COUNT(*) as count
      FROM expenses
      WHERE 1=1
    `;
    const params = [];

    if (startDate) {
      query += ' AND date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND date <= ?';
      params.push(endDate);
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
    const { year } = req.query;
    
    let query = `
      SELECT 
        strftime('%Y-%m', date) as month,
        SUM(amount) as total,
        COUNT(*) as count
      FROM expenses
    `;
    const params = [];

    if (year) {
      query += ' WHERE strftime("%Y", date) = ?';
      params.push(year);
    }

    query += ' GROUP BY month ORDER BY month';

    const monthly = db.prepare(query).all(...params);
    res.json(monthly);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
