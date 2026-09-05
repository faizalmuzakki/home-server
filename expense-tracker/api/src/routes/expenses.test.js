import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

process.env.DB_PATH = ':memory:';
const { initDatabase } = await import('../db/init.js');
initDatabase();
const { default: expenseRoutes } = await import('./expenses.js');
const { default: statsRoutes } = await import('./stats.js');

const app = express();
app.use(express.json());
app.use('/api/expenses', expenseRoutes);
app.use('/api/stats', statsRoutes);

let server, base, statsBase;
before(() => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api/expenses`;
  statsBase = `http://127.0.0.1:${server.address().port}/api/stats`;
});
after(() => server.close());

// amount is sent as a string on purpose: that is what the WhatsApp bot posts,
// and comparing it unparsed to the REAL column never matches.
const post = (query = '', data = {}) =>
  fetch(base + query, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: '12.50', date: '2026-08-09', vendor: 'Warung', source: 'whatsapp', ...data })
  });

test('creates a transaction, then rejects the same one as a duplicate', async () => {
  const first = await post();
  assert.equal(first.status, 201);
  const created = await first.json();
  assert.equal(created.amount, 12.5);

  const second = await post();
  assert.equal(second.status, 409);
  assert.equal((await second.json()).existing_id, created.id);
});

test('?force=true overrides duplicate detection', async () => {
  const forced = await post('?force=true');
  assert.equal(forced.status, 201);
});

test('excludeCategoryId filters out transactions and stats', async () => {
  // Post two expenses in different categories (1 and 2)
  const res1 = await post('?force=true', { amount: '100', category_id: 1, vendor: 'Shop A' });
  const res2 = await post('?force=true', { amount: '200', category_id: 2, vendor: 'Shop B' });
  assert.equal(res1.status, 201);
  assert.equal(res2.status, 201);

  // GET /api/expenses without exclude
  const allExp = await (await fetch(base + '?limit=100')).json();
  const cat2Exp = allExp.filter(e => e.category_id === 2);
  assert.ok(cat2Exp.length > 0);

  // GET /api/expenses with excludeCategoryId=2
  const filteredExp = await (await fetch(base + '?excludeCategoryId=2&limit=100')).json();
  assert.ok(filteredExp.every(e => e.category_id !== 2));

  // GET /api/stats/summary with and without excludeCategoryId=2
  const allStats = await (await fetch(statsBase + '/summary')).json();
  const excludedStats = await (await fetch(statsBase + '/summary?excludeCategoryId=2')).json();
  assert.equal(allStats.expenses - excludedStats.expenses, 200);
  assert.ok(allStats.byCategory.some(c => c.id === 2));
  assert.ok(!excludedStats.byCategory.some(c => c.id === 2));

  // Test excludeCategory by name
  // In initDatabase, category 2 is Transportation
  const excludedByNameStats = await (await fetch(statsBase + '/summary?excludeCategory=transportation')).json();
  assert.equal(allStats.expenses - excludedByNameStats.expenses, 200);
  assert.ok(!excludedByNameStats.byCategory.some(c => c.id === 2));
});

