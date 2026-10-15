import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

process.env.DB_PATH = ':memory:';
const { initDatabase, db } = await import('../db/init.js');
initDatabase();
const { default: investmentRoutes } = await import('./investments.js');

const app = express();
app.use(express.json());
app.use('/api/investments', investmentRoutes);

let server, base;
before(() => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api/investments`;
});
after(() => server.close());

const send = (method, path, body) =>
  fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// The frontend sends parseFloat('') for an empty field: NaN, which JSON.stringify turns into null.
const bad = [NaN, '', 'abc', -1];

test('PUT /config rejects a NaN/empty/negative monthly_budget', async () => {
  for (const monthly_budget of bad) {
    assert.equal((await send('PUT', '/config', { monthly_budget })).status, 400, `monthly_budget=${monthly_budget}`);
  }
  assert.equal((await send('PUT', '/config', { monthly_budget: 7000000 })).status, 200);
  assert.equal(db.prepare('SELECT monthly_budget FROM investment_config').get().monthly_budget, 7000000);
});

test('PUT /holdings/:type rejects NaN/empty/negative values', async () => {
  for (const v of bad) {
    assert.equal((await send('PUT', '/holdings/gold', { current_value: v })).status, 400, `current_value=${v}`);
    assert.equal((await send('PUT', '/holdings/gold', { current_value: 1, current_grams: v })).status, 400, `current_grams=${v}`);
  }
  assert.equal((await send('PUT', '/holdings/gold', { current_value: 1500000, current_grams: 1.5 })).status, 200);
  const gold = db.prepare("SELECT current_value, current_grams FROM investment_holdings WHERE type = 'gold'").get();
  assert.deepEqual({ ...gold }, { current_value: 1500000, current_grams: 1.5 });
});

test('POST /contributions rejects a NaN/empty amount', async () => {
  for (const amount of [NaN, '', 'abc']) {
    assert.equal((await send('POST', '/contributions', { type: 'gold', amount })).status, 400, `amount=${amount}`);
  }
  assert.equal((await send('POST', '/contributions', { type: 'gold', amount: 250000 })).status, 200);
});
