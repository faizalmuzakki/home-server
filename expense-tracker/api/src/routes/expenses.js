import { Router } from 'express';
import { db } from '../db/init.js';
import {
  createExpenseValidators,
  updateExpenseValidators,
  getExpenseValidators,
  listExpenseValidators
} from '../middleware/validators.js';

const router = Router();

// Get all transactions (expenses and income) with optional filters
router.get('/', listExpenseValidators, (req, res) => {
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
      query += ' AND DATE(e.date) >= DATE(?)';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND DATE(e.date) <= DATE(?)';
      params.push(endDate);
    }
    if (categoryId) {
      query += ' AND e.category_id = ?';
      params.push(parseInt(categoryId));
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
    console.error('List expenses error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Get single transaction
router.get('/:id', getExpenseValidators, (req, res) => {
  try {
    const transaction = db.prepare(`
      SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color, c.type as category_type
      FROM expenses e
      LEFT JOIN categories c ON e.category_id = c.id
      WHERE e.id = ?
    `).get(parseInt(req.params.id));

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json(transaction);
  } catch (error) {
    console.error('Get expense error:', error);
    res.status(500).json({ error: 'Failed to fetch transaction' });
  }
});

// Create transaction (expense or income)
router.post('/', createExpenseValidators, (req, res) => {
  try {
    const { amount, description, vendor, category_id, date, type = 'expense', source = 'manual', image_url, raw_text } = req.body;

    // Validate type (already validated by middleware, but extra safety)
    const validType = type === 'income' ? 'income' : 'expense';

    const result = db.prepare(`
      INSERT INTO expenses (amount, description, vendor, category_id, date, type, source, image_url, raw_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      parseFloat(amount),
      description || null,
      vendor || null,
      category_id ? parseInt(category_id) : null,
      date,
      validType,
      source,
      image_url || null,
      raw_text || null
    );

    const transaction = db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(transaction);
  } catch (error) {
    console.error('Create expense error:', error);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

// Update transaction
router.put('/:id', updateExpenseValidators, (req, res) => {
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
    `).run(
      amount ? parseFloat(amount) : null,
      description,
      vendor,
      category_id ? parseInt(category_id) : null,
      date,
      validType,
      parseInt(req.params.id)
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const transaction = db.prepare('SELECT * FROM expenses WHERE id = ?').get(parseInt(req.params.id));
    res.json(transaction);
  } catch (error) {
    console.error('Update expense error:', error);
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

// Delete transaction
router.delete('/:id', getExpenseValidators, (req, res) => {
  try {
    const result = db.prepare('DELETE FROM expenses WHERE id = ?').run(parseInt(req.params.id));

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

export default router;

