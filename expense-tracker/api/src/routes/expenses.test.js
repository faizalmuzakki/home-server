import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

process.env.DB_PATH = ':memory:';
const { initDatabase } = await import('../db/init.js');
initDatabase();
const { default: expenseRoutes } = await import('./expenses.js');
const { default: statsRoutes } = await import('./stats.js');

const { default: categoryRoutes } = await import('./categories.js');

const app = express();
app.use(express.json());
app.use('/api/expenses', expenseRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/categories', categoryRoutes);

let server, base, statsBase, catBase;
before(() => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api/expenses`;
  statsBase = `http://127.0.0.1:${server.address().port}/api/stats`;
  catBase = `http://127.0.0.1:${server.address().port}/api/categories`;
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
  const allStats = await (await fetch(statsBase + '/summary?includeExcluded=true')).json();
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

test('category with exclude_from_dashboard=1 is excluded from stats automatically', async () => {
  // 1. Create a category with exclude_from_dashboard: 1
  const catRes = await fetch(catBase, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Renov Test Category',
      icon: '🧱',
      color: '#B45309',
      type: 'expense',
      exclude_from_dashboard: 1
    })
  });
  assert.equal(catRes.status, 201);
  const cat = await catRes.json();
  assert.equal(cat.exclude_from_dashboard, 1);

  // 2. Post an expense to that category
  const expRes = await post('?force=true', {
    amount: '500000',
    category_id: cat.id,
    vendor: 'Toko Bangunan'
  });
  assert.equal(expRes.status, 201);

  // 3. Stats summary should exclude it by default
  const statsRes = await fetch(statsBase + '/summary');
  const stats = await statsRes.json();
  assert.ok(!stats.byCategory.some(c => c.id === cat.id));

  // 4. Specifically querying by categoryId should still return its stats
  const catSpecificStats = await (await fetch(`${statsBase}/summary?categoryId=${cat.id}`)).json();
  assert.equal(catSpecificStats.expenses, 500000);

  // 5. Updating category to exclude_from_dashboard: 0 includes it again
  const putRes = await fetch(`${catBase}/${cat.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exclude_from_dashboard: 0 })
  });
  assert.equal(putRes.status, 200);
  const updatedCat = await putRes.json();
  assert.equal(updatedCat.exclude_from_dashboard, 0);

  const updatedStats = await (await fetch(statsBase + '/summary')).json();
  assert.ok(updatedStats.byCategory.some(c => c.id === cat.id));
});

