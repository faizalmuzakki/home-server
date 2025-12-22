import { Router } from 'express';
import { db } from '../db/init.js';

const router = Router();

// Get all expenses with optional filters
router.get('/', (req, res) => {
  try {
    const { startDate, endDate, categoryId, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color
      FROM expenses e
      LEFT JOIN categories c ON e.category_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (startDate) {
      query += ' AND e.date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND e.date <= ?';
      params.push(endDate);
    }
    if (categoryId) {
      query += ' AND e.category_id = ?';
      params.push(categoryId);
    }

    query += ' ORDER BY e.date DESC, e.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const expenses = db.prepare(query).all(...params);
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single expense
router.get('/:id', (req, res) => {
  try {
    const expense = db.prepare(`
      SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color
      FROM expenses e
      LEFT JOIN categories c ON e.category_id = c.id
      WHERE e.id = ?
    `).get(req.params.id);
    
    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    res.json(expense);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create expense
router.post('/', (req, res) => {
  try {
    const { amount, description, vendor, category_id, date, source = 'manual', image_url, raw_text } = req.body;
    
    if (!amount || !date) {
      return res.status(400).json({ error: 'Amount and date are required' });
    }

    const result = db.prepare(`
      INSERT INTO expenses (amount, description, vendor, category_id, date, source, image_url, raw_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(amount, description, vendor, category_id, date, source, image_url, raw_text);

    const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(expense);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update expense
router.put('/:id', (req, res) => {
  try {
    const { amount, description, vendor, category_id, date } = req.body;
    
    const result = db.prepare(`
      UPDATE expenses 
      SET amount = COALESCE(?, amount),
          description = COALESCE(?, description),
          vendor = COALESCE(?, vendor),
          category_id = COALESCE(?, category_id),
          date = COALESCE(?, date),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(amount, description, vendor, category_id, date, req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
    res.json(expense);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete expense
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
