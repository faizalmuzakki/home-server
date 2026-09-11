import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDuration } from './duration.js';

test('parses each unit', () => {
    assert.equal(parseDuration('30m'), 1_800_000);
    assert.equal(parseDuration('12h'), 43_200_000);
    assert.equal(parseDuration('3d'), 259_200_000);
    assert.equal(parseDuration('1w'), 604_800_000);
});

test('tolerates spacing and case', () => {
    assert.equal(parseDuration(' 2 H '), 7_200_000);
});

test('rejects junk, zero and unsupported units', () => {
    assert.equal(parseDuration('soon'), null);
    assert.equal(parseDuration('0h'), null);
    assert.equal(parseDuration('10s'), null);
    assert.equal(parseDuration(''), null);
    assert.equal(parseDuration(undefined), null);
});

test('rejects anything past the cap', () => {
    assert.equal(parseDuration('3w'), null);
    assert.equal(parseDuration('14d'), 1_209_600_000);
});
