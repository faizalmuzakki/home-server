import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSenderName } from './message.js';

test('getSenderName returns pushName when present', () => {
  assert.equal(getSenderName({ pushName: 'Faizal' }), 'Faizal');
});

test('getSenderName falls back to empty string', () => {
  assert.equal(getSenderName({}), '');
  assert.equal(getSenderName({ pushName: null }), '');
});

test('localDate uses the local day, not UTC', async () => {
  const { localDate } = await import('./message.js');
  process.env.TZ = 'Asia/Jakarta';
  assert.equal(localDate(new Date('2026-10-31T20:00:00Z')), '2026-11-01');
});
