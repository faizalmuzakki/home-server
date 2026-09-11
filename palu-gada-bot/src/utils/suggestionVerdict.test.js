import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRequiredVotes, computeVerdict, DEFAULT_SUGGESTION_SETTINGS } from './suggestionVerdict.js';

const settings = DEFAULT_SUGGESTION_SETTINGS;

test('quorum scales with active members', () => {
    assert.equal(computeRequiredVotes(30, settings), 6);
    assert.equal(computeRequiredVotes(28, settings), 6);
});

test('quorum never drops below the floor', () => {
    assert.equal(computeRequiredVotes(0, settings), 3);
    assert.equal(computeRequiredVotes(5, settings), 3);
});

test('quorum never climbs above the ceiling', () => {
    assert.equal(computeRequiredVotes(500, settings), 15);
});

test('too few votes is no quorum regardless of ratio', () => {
    const v = computeVerdict({ up: 2, down: 0, activeMembers: 30, settings });
    assert.equal(v.status, 'no_quorum');
    assert.equal(v.required, 6);
});

test('clear majority passes', () => {
    const v = computeVerdict({ up: 6, down: 2, activeMembers: 30, settings });
    assert.equal(v.status, 'passed');
    assert.equal(v.total, 8);
    assert.equal(Math.round(v.ratioPct), 75);
});

test('exactly at the pass ratio passes', () => {
    assert.equal(computeVerdict({ up: 6, down: 4, activeMembers: 30, settings }).status, 'passed');
});

test('clear minority is rejected', () => {
    assert.equal(computeVerdict({ up: 3, down: 5, activeMembers: 30, settings }).status, 'rejected');
});

test('exactly at the reject ratio is rejected', () => {
    assert.equal(computeVerdict({ up: 4, down: 6, activeMembers: 30, settings }).status, 'rejected');
});

test('a split vote is undecided', () => {
    assert.equal(computeVerdict({ up: 5, down: 4, activeMembers: 30, settings }).status, 'undecided');
});

test('zero votes with the floor quorum is no quorum, not a division by zero', () => {
    const v = computeVerdict({ up: 0, down: 0, activeMembers: 0, settings });
    assert.equal(v.status, 'no_quorum');
    assert.equal(v.ratioPct, 0);
});
