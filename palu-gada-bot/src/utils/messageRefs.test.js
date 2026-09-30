import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMessageRefs } from './messageRefs.js';

test('parses a single id', () => {
    assert.deepEqual(parseMessageRefs(' 123 '), ['123']);
});

test('parses mixed ids and links, spaces and commas', () => {
    const input = '111, https://discord.com/channels/1/2/222  333,https://discord.com/channels/1/2/444/';
    assert.deepEqual(parseMessageRefs(input), ['111', '222', '333', '444']);
});

test('collapses duplicates, keeps order', () => {
    assert.deepEqual(parseMessageRefs('2 1 2 https://discord.com/channels/1/2/1'), ['2', '1']);
});

test('empty input gives no ids', () => {
    assert.deepEqual(parseMessageRefs(' , '), []);
});
