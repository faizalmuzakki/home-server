import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

process.env.DB_PATH = ':memory:';
const { initDatabase, db } = await import('../db/init.js');
initDatabase();
const { default: travelRoutes } = await import('./travel-expenses.js');

const app = express();
app.use('/api/travel-expenses', travelRoutes);

let server, base;
before(() => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api/travel-expenses`;
});
after(() => server.close());

test('/trips does not add different currencies together', async () => {
  const insert = db.prepare(`INSERT INTO travel_expenses
    (trip_name, amount, currency, converted_amount, converted_currency, date) VALUES (?, ?, ?, ?, ?, ?)`);
  insert.run('Japan', 1000, 'JPY', 100000, 'IDR', '2026-01-10');
  insert.run('Japan', 2000, 'JPY', 200000, 'IDR', '2026-01-11');
  insert.run('Asia', 1000, 'JPY', 100000, 'IDR', '2026-02-10');
  insert.run('Asia', 50, 'SGD', 600000, 'IDR', '2026-02-11');
  insert.run('Asia', 5, 'SGD', null, 'IDR', '2026-02-12');

  const trips = await (await fetch(`${base}/trips`)).json();
  const japan = trips.find(t => t.trip_name === 'Japan');
  const asia = trips.find(t => t.trip_name === 'Asia');

  // Single-currency trip: existing fields unchanged.
  assert.equal(japan.currency, 'JPY');
  assert.equal(japan.total_amount, 3000);
  assert.equal(japan.total_converted, 300000);
  assert.equal(japan.converted_currency, 'IDR');
  assert.deepEqual(japan.totals_by_currency, [{ currency: 'JPY', total_amount: 3000, expense_count: 2 }]);

  // Mixed-currency trip: no single total, per-currency breakdown instead.
  assert.equal(asia.expense_count, 3);
  assert.equal(asia.currency, null);
  assert.equal(asia.total_amount, null);
  assert.equal(asia.total_converted, 700000);
  assert.equal(asia.converted_currency, 'IDR');
  assert.deepEqual(asia.totals_by_currency, [
    { currency: 'JPY', total_amount: 1000, expense_count: 1 },
    { currency: 'SGD', total_amount: 55, expense_count: 2 }
  ]);
});
