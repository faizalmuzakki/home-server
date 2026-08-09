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
