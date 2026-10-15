import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

process.env.DB_PATH = ':memory:';
const { initDatabase, db } = await import('../db/init.js');
initDatabase();
const { default: statsRoutes } = await import('./stats.js');

const app = express();
app.use('/api/stats', statsRoutes);

let server, base;
before(() => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api/stats`;
});
after(() => server.close());

test('/monthly?year= filters to that year', async () => {
  const insert = db.prepare("INSERT INTO expenses (amount, date, type) VALUES (?, ?, 'expense')");
  insert.run(10, '2025-12-31');
  insert.run(20, '2026-01-15');
  insert.run(30, '2026-03-02');

  const res = await fetch(`${base}/monthly?year=2026`);
  assert.equal(res.status, 200);
  const rows = await res.json();
  assert.deepEqual(rows.map(r => [r.month, r.expenses]), [['2026-01', 20], ['2026-03', 30]]);
});
