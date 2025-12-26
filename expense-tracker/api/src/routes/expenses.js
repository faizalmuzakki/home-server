import { Router } from 'express';
import { db } from '../db/init.js';

const router = Router();

// Get all transactions (expenses and income) with optional filters
router.get('/', (req, res) => {
  try {
    const { startDate, endDate, categoryId, type, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color, c.type as category_type
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
    if (type && (type === 'expense' || type === 'income')) {
      query += ' AND e.type = ?';
      params.push(type);
    }

    query += ' ORDER BY e.date DESC, e.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const transactions = db.prepare(query).all(...params);
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single transaction
router.get('/:id', (req, res) => {
  try {
    const transaction = db.prepare(`
      SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color, c.type as category_type
      FROM expenses e
      LEFT JOIN categories c ON e.category_id = c.id
      WHERE e.id = ?
    `).get(req.params.id);

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json(transaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create transaction (expense or income)
router.post('/', (req, res) => {
  try {
    const { amount, description, vendor, category_id, date, type = 'expense', source = 'manual', image_url, raw_text } = req.body;

    if (!amount || !date) {
      return res.status(400).json({ error: 'Amount and date are required' });
    }

    // Validate type
    const validType = type === 'income' ? 'income' : 'expense';

    const result = db.prepare(`
      INSERT INTO expenses (amount, description, vendor, category_id, date, type, source, image_url, raw_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(amount, description, vendor, category_id, date, validType, source, image_url, raw_text);

    const transaction = db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(transaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update transaction
router.put('/:id', (req, res) => {
  try {
    const { amount, description, vendor, category_id, date, type } = req.body;

    // Validate type if provided
    const validType = type ? (type === 'income' ? 'income' : 'expense') : null;

    const result = db.prepare(`
      UPDATE expenses 
      SET amount = COALESCE(?, amount),
          description = COALESCE(?, description),
          vendor = COALESCE(?, vendor),
          category_id = COALESCE(?, category_id),
          date = COALESCE(?, date),
          type = COALESCE(?, type),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(amount, description, vendor, category_id, date, validType, req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const transaction = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
    res.json(transaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete transaction
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
