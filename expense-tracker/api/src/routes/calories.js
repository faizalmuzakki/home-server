import { Router } from 'express';
import { db } from '../db/init.js';
import { insertCalorieEntry, listCalorieEntries, calorieSummary } from '../db/calories.js';
import { createCalorieValidators, listCalorieValidators } from '../middleware/validators.js';

const router = Router();

// Create a calorie entry (called by the WhatsApp bot)
router.post('/', createCalorieValidators, (req, res) => {
  try {
    const row = insertCalorieEntry(db, req.body);
    res.status(201).json(row);
  } catch (error) {
    console.error('Create calorie entry error:', error);
    res.status(500).json({ error: error.message });
  }
});

// List entries: ?sender_id=&startDate=&endDate=&limit=
router.get('/', listCalorieValidators, (req, res) => {
  try {
    const rows = listCalorieEntries(db, req.query);
    res.json(rows);
  } catch (error) {
    console.error('List calorie entries error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Per-sender aggregated totals: ?startDate=&endDate=
router.get('/summary', listCalorieValidators, (req, res) => {
  try {
    const rows = calorieSummary(db, req.query);
    res.json(rows);
  } catch (error) {
    console.error('Calorie summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
