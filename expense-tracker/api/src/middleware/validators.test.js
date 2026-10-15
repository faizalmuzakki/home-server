import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createExpenseValidators, updateExpenseValidators } from './validators.js';
import { updateTravelExpenseValidators } from './travel-validators.js';

const app = express();
app.use(express.json());
const ok = (_req, res) => res.json({ ok: true });
app.post('/expenses', createExpenseValidators, ok);
app.put('/expenses/:id', updateExpenseValidators, ok);
app.put('/travel/:id', updateTravelExpenseValidators, ok);

let server, base;
before(() => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const send = (method, path, body) =>
  fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(r => r.status);

for (const path of ['/expenses/1', '/travel/1']) {
  test(`PUT ${path} rejects a non-positive amount, like create does`, async () => {
    assert.equal(await send('POST', '/expenses', { amount: -5, date: '2026-10-15' }), 400);
    assert.equal(await send('PUT', path, { amount: -5 }), 400);
    assert.equal(await send('PUT', path, { amount: '0' }), 400);
    assert.equal(await send('PUT', path, { amount: '12.5' }), 200);
    assert.equal(await send('PUT', path, { description: 'no amount' }), 200);
  });
}
