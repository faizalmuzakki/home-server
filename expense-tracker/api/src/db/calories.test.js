import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {
  initCalorieSchema,
  insertCalorieEntry,
  listCalorieEntries,
  calorieSummary
} from './calories.js';

function freshDb() {
  const db = new Database(':memory:');
  initCalorieSchema(db);
  return db;
}

test('insertCalorieEntry stores and returns the row with an id', () => {
  const db = freshDb();
  const row = insertCalorieEntry(db, {
    sender_id: '628111',
    sender_name: 'Faizal',
    description: 'Nasi goreng + telur',
    calories: 650,
    protein_g: 28,
    carbs_g: 72,
    fat_g: 24,
    items: [{ name: 'Nasi goreng', calories: 450, portion: '1 plate' }],
    confidence: 0.7,
    image_url: '/uploads/food_1.jpg',
    date: '2026-05-19'
  });
  assert.ok(row.id > 0);
  assert.equal(row.calories, 650);
  assert.equal(row.sender_name, 'Faizal');
  assert.deepEqual(JSON.parse(row.items), [
    { name: 'Nasi goreng', calories: 450, portion: '1 plate' }
  ]);
});

test('listCalorieEntries filters by sender and date range, newest first', () => {
  const db = freshDb();
  insertCalorieEntry(db, { sender_id: 'A', calories: 100, date: '2026-05-17' });
  insertCalorieEntry(db, { sender_id: 'A', calories: 200, date: '2026-05-19' });
  insertCalorieEntry(db, { sender_id: 'B', calories: 999, date: '2026-05-19' });

  const all = listCalorieEntries(db, {});
  assert.equal(all.length, 3);

  const aOnly = listCalorieEntries(db, { sender_id: 'A' });
  assert.equal(aOnly.length, 2);
  assert.equal(aOnly[0].calories, 200); // newest date first

  const ranged = listCalorieEntries(db, { startDate: '2026-05-18', endDate: '2026-05-19' });
  assert.equal(ranged.length, 2);
});

test('calorieSummary aggregates kcal and macros per sender', () => {
  const db = freshDb();
  insertCalorieEntry(db, { sender_id: 'A', sender_name: 'Al', calories: 100, protein_g: 10, carbs_g: 5, fat_g: 2, date: '2026-05-19' });
  insertCalorieEntry(db, { sender_id: 'A', sender_name: 'Al', calories: 250, protein_g: 20, carbs_g: 15, fat_g: 8, date: '2026-05-19' });
  insertCalorieEntry(db, { sender_id: 'B', sender_name: 'Bo', calories: 400, protein_g: 30, carbs_g: 40, fat_g: 12, date: '2026-05-19' });

  const summary = calorieSummary(db, {});
  const a = summary.find(s => s.sender_id === 'A');
  const b = summary.find(s => s.sender_id === 'B');
  assert.equal(a.sender_name, 'Al');
  assert.equal(a.total_calories, 350);
  assert.equal(a.total_protein_g, 30);
  assert.equal(a.entry_count, 2);
  assert.equal(b.total_calories, 400);
});

test('calorieSummary today() filter returns only today rows', () => {
  const db = freshDb();
  const today = new Date().toISOString().split('T')[0];
  insertCalorieEntry(db, { sender_id: 'A', calories: 500, date: today });
  insertCalorieEntry(db, { sender_id: 'A', calories: 999, date: '2000-01-01' });
  const summary = calorieSummary(db, { startDate: today, endDate: today });
  assert.equal(summary.length, 1);
  assert.equal(summary[0].total_calories, 500);
});
