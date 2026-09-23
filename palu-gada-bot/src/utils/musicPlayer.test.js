import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    formatDuration,
    createQueue,
    getQueue,
    deleteQueue,
    toggleLoop,
    shuffleQueue,
    clearQueue,
} from './musicPlayer.js';

test('formatDuration formats seconds properly', () => {
    assert.equal(formatDuration(null), 'Unknown');
    assert.equal(formatDuration(undefined), 'Unknown');
    assert.equal(formatDuration('invalid'), 'Unknown');
    assert.equal(formatDuration(0), 'Unknown');
    assert.equal(formatDuration(45), '0:45');
    assert.equal(formatDuration(65), '1:05');
    assert.equal(formatDuration(213), '3:33');
    assert.equal(formatDuration(3661), '1:01:01');
});

test('queue management creates, retrieves, and deletes queue', () => {
    const guildId = 'test-guild-123';
    const fakeVoice = { id: 'vc-1' };
    const fakeText = { id: 'tc-1', send: () => {} };

    const queue = createQueue(guildId, fakeVoice, fakeText, 80);
    assert.equal(queue.guildId, guildId);
    assert.equal(queue.volume, 80);
    assert.equal(queue.loop, false);
    assert.equal(queue.playing, false);
    assert.deepEqual(queue.songs, []);

    assert.equal(getQueue(guildId), queue);

    deleteQueue(guildId);
    assert.equal(getQueue(guildId), undefined);
});

test('toggleLoop toggles loop state', () => {
    const guildId = 'test-guild-loop';
    const queue = createQueue(guildId, null, null);
    assert.equal(queue.loop, false);

    assert.equal(toggleLoop(queue), true);
    assert.equal(queue.loop, true);

    assert.equal(toggleLoop(queue), false);
    assert.equal(queue.loop, false);

    deleteQueue(guildId);
});

test('shuffleQueue keeps playing song in front and shuffles remaining', () => {
    const guildId = 'test-guild-shuffle';
    const queue = createQueue(guildId, null, null);
    queue.songs = [
        { title: 'Song 1' },
        { title: 'Song 2' },
        { title: 'Song 3' },
        { title: 'Song 4' },
        { title: 'Song 5' },
    ];

    shuffleQueue(queue);
    assert.equal(queue.songs[0].title, 'Song 1');
    assert.equal(queue.songs.length, 5);

    deleteQueue(guildId);
});

test('clearQueue empties the songs list', () => {
    const guildId = 'test-guild-clear';
    const queue = createQueue(guildId, null, null);
    queue.songs = [{ title: 'A' }, { title: 'B' }];

    clearQueue(queue);
    assert.deepEqual(queue.songs, []);

    deleteQueue(guildId);
});
