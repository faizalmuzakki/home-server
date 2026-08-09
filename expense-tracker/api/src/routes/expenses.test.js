import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

process.env.DB_PATH = ':memory:';
const { initDatabase } = await import('../db/init.js');
initDatabase();
const { default: expenseRoutes } = await import('./expenses.js');

const app = express();
app.use(express.json());
app.use('/api/expenses', expenseRoutes);

let server, base;
before(() => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api/expenses`;
});
after(() => server.close());

// amount is sent as a string on purpose: that is what the WhatsApp bot posts,
// and comparing it unparsed to the REAL column never matches.
const post = (query = '') =>
  fetch(base + query, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: '12.50', date: '2026-08-09', vendor: 'Warung', source: 'whatsapp' })
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
