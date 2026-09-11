import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDbDate, toDbDate } from './dbDate.js';

test('sqlite datetimes are read as UTC, not local time', () => {
    assert.equal(parseDbDate('2026-09-13 10:23:00').toISOString(), '2026-09-13T10:23:00.000Z');
});

test('ISO strings we wrote ourselves survive untouched', () => {
    assert.equal(parseDbDate('2026-09-13T10:23:00.000Z').toISOString(), '2026-09-13T10:23:00.000Z');
});

test('an offset-bearing timestamp keeps its offset', () => {
    assert.equal(parseDbDate('2026-09-13T17:23:00+07:00').toISOString(), '2026-09-13T10:23:00.000Z');
});

test('written datetimes sort as text against sqlite datetime("now")', () => {
    const written = toDbDate(new Date('2026-09-13T10:23:45.678Z'));
    assert.equal(written, '2026-09-13 10:23:45');
    assert.ok(written < '2026-09-13 10:23:46');
    assert.ok(written > '2026-09-13 10:23:44');
});

test('a written datetime reads back as the same instant', () => {
    const now = new Date('2026-09-13T10:23:45.000Z');
    assert.equal(parseDbDate(toDbDate(now)).getTime(), now.getTime());
});
