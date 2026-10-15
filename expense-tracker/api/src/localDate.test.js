import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDate } from './localDate.js';

test('03:00 WIB on Nov 1 is Nov 1, not Oct 31 (UTC)', () => {
  process.env.TZ = 'Asia/Jakarta';
  assert.equal(localDate(new Date('2026-10-31T20:00:00Z')), '2026-11-01');
  assert.equal(localDate(new Date('2026-11-01T16:59:00Z')), '2026-11-01');
});
