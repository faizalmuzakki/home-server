import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { existsSync, rmSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { default: uploadRoutes } = await import('./upload.js');
const API_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const escaped = path.join(API_ROOT, 'src/escaped.txt');

const app = express();
app.use(express.json());
app.use('/api/upload', uploadRoutes);

let server, base;
before(() => { server = app.listen(0); base = `http://127.0.0.1:${server.address().port}/api/upload`; });
after(() => { server.close(); rmSync(escaped, { force: true }); });

const upload = (filename) => fetch(base, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ image: Buffer.from('not really an image').toString('base64'), filename })
});

test('client filename cannot escape the uploads dir', async () => {
  const res = await upload('../../src/escaped.txt');
  assert.equal(res.status, 200);
  const { image_url } = await res.json();
  assert.equal(existsSync(escaped), false);
  assert.match(image_url, /^\/uploads\/receipt_\d+_[0-9a-f-]+\.jpg$/);
  rmSync(path.join(API_ROOT, 'data', image_url), { force: true });
});

test('two uploads never share a name', async () => {
  const [a, b] = await Promise.all([upload('receipt_1.jpg'), upload('receipt_1.jpg')]);
  const [ua, ub] = [(await a.json()).image_url, (await b.json()).image_url];
  assert.notEqual(ua, ub);
  for (const u of [ua, ub]) rmSync(path.join(API_ROOT, 'data', u), { force: true });
});
