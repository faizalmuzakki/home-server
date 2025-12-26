import { Router } from 'express';
import { db } from '../db/init.js';

const router = Router();

// Get all categories (optionally filter by type)
router.get('/', (req, res) => {
  try {
    const { type } = req.query;
    let query = 'SELECT * FROM categories';
    const params = [];

    if (type && (type === 'expense' || type === 'income')) {
      query += ' WHERE type = ?';
      params.push(type);
    }

    query += ' ORDER BY type, name';

    const categories = db.prepare(query).all(...params);
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single category
router.get('/:id', (req, res) => {
  try {
    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create category
router.post('/', (req, res) => {
  try {
    const { name, icon, color, type = 'expense' } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Validate type
    const validType = type === 'income' ? 'income' : 'expense';

    const result = db.prepare('INSERT INTO categories (name, icon, color, type) VALUES (?, ?, ?, ?)').run(name, icon, color, validType);
    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(category);
  } catch (error) {
    if (error.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'Category name already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Update category
router.put('/:id', (req, res) => {
  try {
    const { name, icon, color, type } = req.body;

    // Validate type if provided
    const validType = type ? (type === 'income' ? 'income' : 'expense') : null;

    const result = db.prepare(`
      UPDATE categories 
      SET name = COALESCE(?, name),
          icon = COALESCE(?, icon),
          color = COALESCE(?, color),
          type = COALESCE(?, type)
      WHERE id = ?
    `).run(name, icon, color, validType, req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete category
router.delete('/:id', (req, res) => {
  try {
    // Check if category is in use
    const inUse = db.prepare('SELECT COUNT(*) as count FROM expenses WHERE category_id = ?').get(req.params.id);
    if (inUse.count > 0) {
      return res.status(400).json({ error: 'Category is in use by transactions. Remove or reassign them first.' });
    }

    const result = db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
