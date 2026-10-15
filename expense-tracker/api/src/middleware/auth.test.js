import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

process.env.API_AUTH_SECRET = 'test-secret';
process.env.DASHBOARD_EMAIL = 'me@example.com';
process.env.DASHBOARD_PIN = '424242';
const { requireAuth, issueToken, isValidToken } = await import('./auth.js');
const { default: authRoutes } = await import('../routes/auth.js');

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use(['/api', '/uploads'], requireAuth);
app.get('/api/expenses', (_req, res) => res.json([]));
app.get('/uploads/r.jpg', (_req, res) => res.send('img'));

let server, base;
before(() => { server = app.listen(0); base = `http://127.0.0.1:${server.address().port}`; });
after(() => server.close());

const login = (pin) => fetch(`${base}/api/auth/verify-pin`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'ME@example.com', pin })
});

test('API rejects requests without credentials', async () => {
  assert.equal((await fetch(`${base}/api/expenses`)).status, 401);
  assert.equal((await fetch(`${base}/uploads/r.jpg`)).status, 401);
  assert.equal((await fetch(`${base}/api/expenses`, { headers: { Authorization: 'Bearer 9999999999999.forged' } })).status, 401);
  assert.equal((await fetch(`${base}/api/expenses`, { headers: { 'X-Api-Key': 'wrong' } })).status, 401);
});

test('wrong PIN gets no token, right PIN gets a working token', async () => {
  const bad = await login('000000');
  assert.equal(bad.status, 401);
  assert.equal((await bad.json()).token, undefined);

  const { token } = await (await login('424242')).json();
  assert.equal((await fetch(`${base}/api/expenses`, { headers: { Authorization: `Bearer ${token}` } })).status, 200);
  assert.equal((await fetch(`${base}/uploads/r.jpg?token=${encodeURIComponent(token)}`)).status, 200);
  // ?token= is only for <img> on /uploads, not the JSON API
  assert.equal((await fetch(`${base}/api/expenses?token=${encodeURIComponent(token)}`)).status, 401);
});

test('bots authenticate with X-Api-Key', async () => {
  assert.equal((await fetch(`${base}/api/expenses`, { headers: { 'X-Api-Key': 'test-secret' } })).status, 200);
});

test('tokens expire', () => {
  const token = issueToken(Date.now() - 31 * 24 * 60 * 60 * 1000);
  assert.equal(isValidToken(token), false);
  assert.equal(isValidToken(issueToken()), true);
});
