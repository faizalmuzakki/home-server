import { Router } from 'express';
import { db } from '../db/init.js';
import {
  createTravelExpenseValidators,
  updateTravelExpenseValidators,
  getTravelExpenseValidators,
  listTravelExpenseValidators
} from '../middleware/travel-validators.js';

const router = Router();

// --- Exchange Rate ---

// Fetch latest exchange rate from frankfurter.dev (free, no API key needed)
router.get('/exchange-rate', (req, res) => {
  const { from = 'USD', to = 'IDR' } = req.query;

  const url = `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`;

  fetch(url)
    .then(response => {
      if (!response.ok) throw new Error(`Exchange rate API returned ${response.status}`);
      return response.json();
    })
    .then(data => {
      const rate = data.rates?.[to.toUpperCase()];
      if (rate == null) {
        return res.status(404).json({ error: `Rate not found for ${from} -> ${to}` });
      }
      res.json({
        from: from.toUpperCase(),
        to: to.toUpperCase(),
        rate,
        date: data.date
      });
    })
    .catch(error => {
      console.error('Exchange rate fetch error:', error);
      res.status(502).json({ error: 'Failed to fetch exchange rate' });
    });
});

// --- Travel Categories ---

router.get('/categories', (_req, res) => {
  try {
    const categories = db.prepare('SELECT * FROM travel_categories ORDER BY name').all();
    res.json(categories);
  } catch (error) {
    console.error('List travel categories error:', error);
    res.status(500).json({ error: 'Failed to fetch travel categories' });
  }
});

router.post('/categories', (req, res) => {
  try {
    const { name, icon, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const result = db.prepare('INSERT INTO travel_categories (name, icon, color) VALUES (?, ?, ?)').run(name, icon || null, color || null);
    const category = db.prepare('SELECT * FROM travel_categories WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(category);
  } catch (error) {
    if (error.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Category already exists' });
    }
    console.error('Create travel category error:', error);
    res.status(500).json({ error: 'Failed to create travel category' });
  }
});

// --- CRUD for Travel Expenses ---

router.get('/', listTravelExpenseValidators, (req, res) => {
  try {
    const { startDate, endDate, categoryId, currency, tripName, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT te.*, tc.name as category_name, tc.icon as category_icon, tc.color as category_color
      FROM travel_expenses te
      LEFT JOIN travel_categories tc ON te.category_id = tc.id
      WHERE 1=1
    `;
    const params = [];

    if (startDate) {
      query += ' AND DATE(te.date) >= DATE(?)';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND DATE(te.date) <= DATE(?)';
      params.push(endDate);
    }
    if (categoryId) {
      query += ' AND te.category_id = ?';
      params.push(parseInt(categoryId));
    }
    if (currency) {
      query += ' AND te.currency = ?';
      params.push(currency.toUpperCase());
    }
    if (tripName) {
      query += ' AND te.trip_name = ?';
      params.push(tripName);
    }

    query += ' ORDER BY te.date DESC, te.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const expenses = db.prepare(query).all(...params);
    res.json(expenses);
  } catch (error) {
    console.error('List travel expenses error:', error);
    res.status(500).json({ error: 'Failed to fetch travel expenses' });
  }
});

router.get('/trips', (_req, res) => {
  try {
    const trips = db.prepare(`
      SELECT trip_name, currency,
        COUNT(*) as expense_count,
        SUM(amount) as total_amount,
        SUM(converted_amount) as total_converted,
        converted_currency,
        MIN(date) as start_date,
        MAX(date) as end_date
      FROM travel_expenses
      WHERE trip_name IS NOT NULL
      GROUP BY trip_name
      ORDER BY MAX(date) DESC
    `).all();
    res.json(trips);
  } catch (error) {
    console.error('List trips error:', error);
    res.status(500).json({ error: 'Failed to fetch trips' });
  }
});

router.get('/summary', (req, res) => {
  try {
    const { tripName, startDate, endDate } = req.query;

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (tripName) {
      whereClause += ' AND trip_name = ?';
      params.push(tripName);
    }
    if (startDate) {
      whereClause += ' AND DATE(date) >= DATE(?)';
      params.push(startDate);
    }
    if (endDate) {
      whereClause += ' AND DATE(date) <= DATE(?)';
      params.push(endDate);
    }

    // Per-currency totals
    const byCurrency = db.prepare(`
      SELECT currency, SUM(amount) as total, COUNT(*) as count
      FROM travel_expenses ${whereClause}
      GROUP BY currency
    `).all(...params);

    // Total converted to home currency
    const convertedTotal = db.prepare(`
      SELECT converted_currency, SUM(converted_amount) as total
      FROM travel_expenses ${whereClause} AND converted_amount IS NOT NULL
      GROUP BY converted_currency
    `).all(...params);

    // By category
    const byCategory = db.prepare(`
      SELECT tc.name as category_name, tc.icon as category_icon, tc.color as category_color,
        te.currency, SUM(te.amount) as total, COUNT(*) as count
      FROM travel_expenses te
      LEFT JOIN travel_categories tc ON te.category_id = tc.id
      ${whereClause.replace(/WHERE/, 'WHERE')}
      GROUP BY te.category_id, te.currency
      ORDER BY total DESC
    `.replace('1=1', '1=1')).all(...params);

    res.json({ by_currency: byCurrency, converted_total: convertedTotal, by_category: byCategory });
  } catch (error) {
    console.error('Travel summary error:', error);
    res.status(500).json({ error: 'Failed to fetch travel summary' });
  }
});

router.get('/:id', getTravelExpenseValidators, (req, res) => {
  try {
    const expense = db.prepare(`
      SELECT te.*, tc.name as category_name, tc.icon as category_icon, tc.color as category_color
      FROM travel_expenses te
      LEFT JOIN travel_categories tc ON te.category_id = tc.id
      WHERE te.id = ?
    `).get(parseInt(req.params.id));

    if (!expense) return res.status(404).json({ error: 'Travel expense not found' });
    res.json(expense);
  } catch (error) {
    console.error('Get travel expense error:', error);
    res.status(500).json({ error: 'Failed to fetch travel expense' });
  }
});

router.post('/', createTravelExpenseValidators, (req, res) => {
  try {
    const {
      amount, currency = 'USD', converted_amount, converted_currency = 'IDR',
      exchange_rate, description, vendor, category_id, date,
      trip_name, source = 'manual', notes
    } = req.body;

    const result = db.prepare(`
      INSERT INTO travel_expenses (amount, currency, converted_amount, converted_currency, exchange_rate,
        description, vendor, category_id, date, trip_name, source, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      parseFloat(amount),
      currency.toUpperCase(),
      converted_amount != null ? parseFloat(converted_amount) : null,
      converted_currency.toUpperCase(),
      exchange_rate != null ? parseFloat(exchange_rate) : null,
      description || null,
      vendor || null,
      category_id ? parseInt(category_id) : null,
      date,
      trip_name || null,
      source,
      notes || null
    );

    const expense = db.prepare('SELECT * FROM travel_expenses WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(expense);
  } catch (error) {
    console.error('Create travel expense error:', error);
    res.status(500).json({ error: 'Failed to create travel expense' });
  }
});

router.put('/:id', updateTravelExpenseValidators, (req, res) => {
  try {
    const {
      amount, currency, converted_amount, converted_currency,
      exchange_rate, description, vendor, category_id, date,
      trip_name, notes
    } = req.body;

    const result = db.prepare(`
      UPDATE travel_expenses
      SET amount = COALESCE(?, amount),
          currency = COALESCE(?, currency),
          converted_amount = COALESCE(?, converted_amount),
          converted_currency = COALESCE(?, converted_currency),
          exchange_rate = COALESCE(?, exchange_rate),
          description = COALESCE(?, description),
          vendor = COALESCE(?, vendor),
          category_id = COALESCE(?, category_id),
          date = COALESCE(?, date),
          trip_name = COALESCE(?, trip_name),
          notes = COALESCE(?, notes),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      amount != null ? parseFloat(amount) : null,
      currency ? currency.toUpperCase() : null,
      converted_amount != null ? parseFloat(converted_amount) : null,
      converted_currency ? converted_currency.toUpperCase() : null,
      exchange_rate != null ? parseFloat(exchange_rate) : null,
      description,
      vendor,
      category_id != null ? parseInt(category_id) : null,
      date,
      trip_name,
      notes,
      parseInt(req.params.id)
    );

    if (result.changes === 0) return res.status(404).json({ error: 'Travel expense not found' });

    const expense = db.prepare('SELECT * FROM travel_expenses WHERE id = ?').get(parseInt(req.params.id));
    res.json(expense);
  } catch (error) {
    console.error('Update travel expense error:', error);
    res.status(500).json({ error: 'Failed to update travel expense' });
  }
});

router.delete('/:id', getTravelExpenseValidators, (req, res) => {
  try {
    const result = db.prepare('DELETE FROM travel_expenses WHERE id = ?').run(parseInt(req.params.id));
    if (result.changes === 0) return res.status(404).json({ error: 'Travel expense not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete travel expense error:', error);
    res.status(500).json({ error: 'Failed to delete travel expense' });
  }
});

export default router;
