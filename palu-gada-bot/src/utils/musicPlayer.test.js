import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    formatDuration,
    createProgressBar,
    getCurrentPlaybackTime,
    getTotalQueueDuration,
    skipToTrack,
    createQueue,
    getQueue,
    deleteQueue,
    toggleLoop,
    shuffleQueue,
    clearQueue,
    pauseSong,
    resumeSong,
} from './musicPlayer.js';

test('formatDuration formats seconds properly', () => {
    assert.equal(formatDuration(null), 'Unknown');
    assert.equal(formatDuration(undefined), 'Unknown');
    assert.equal(formatDuration('invalid'), 'Unknown');
    assert.equal(formatDuration(0), '0:00');
    assert.equal(formatDuration(45), '0:45');
    assert.equal(formatDuration(65), '1:05');
    assert.equal(formatDuration(213), '3:33');
    assert.equal(formatDuration(3661), '1:01:01');
});

test('createProgressBar generates correct visual representation', () => {
    const liveBar = createProgressBar(30, 0);
    assert.match(liveBar, /Live/);

    const startBar = createProgressBar(0, 200, 10);
    assert.match(startBar, /\[🔘─+\]/);
    assert.match(startBar, /0:00 \/ 3:20/);

    const midBar = createProgressBar(100, 200, 10);
    assert.match(midBar, /\[─+🔘─+\]/);
    assert.match(midBar, /1:40 \/ 3:20/);

    const endBar = createProgressBar(200, 200, 10);
    assert.match(endBar, /\[─+🔘\]/);
    assert.match(endBar, /3:20 \/ 3:20/);
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

test('getTotalQueueDuration sums durations of all songs', () => {
    const guildId = 'test-guild-duration';
    const queue = createQueue(guildId, null, null);
    assert.equal(getTotalQueueDuration(queue), '0:00');

    queue.songs = [
        { durationInSec: 120 },
        { durationInSec: 185 },
        { durationInSec: 55 },
    ];
    assert.equal(getTotalQueueDuration(queue), '6:00');

    deleteQueue(guildId);
});

test('getCurrentPlaybackTime calculates elapsed time and handles pause/resume', () => {
    const guildId = 'test-guild-playback-time';
    const queue = createQueue(guildId, null, null);
    assert.equal(getCurrentPlaybackTime(queue), 0);

    queue.playing = true;
    queue.playbackStartedAt = Date.now() - 5000;
    queue.playbackSeekOffset = 10;
    const elapsed = getCurrentPlaybackTime(queue);
    assert.ok(elapsed >= 14 && elapsed <= 16, `Expected ~15s elapsed, got ${elapsed}`);

    // Mock player for pause/resume
    queue.player = { pause: () => {}, unpause: () => {} };
    pauseSong(queue);
    assert.ok(queue.pausedAt);

    resumeSong(queue);
    assert.equal(queue.pausedAt, null);

    deleteQueue(guildId);
});

test('skipToTrack removes intermediate songs and stops player', () => {
    const guildId = 'test-guild-skipto';
    const queue = createQueue(guildId, null, null);
    let stopped = false;
    queue.player = { stop: () => { stopped = true; } };
    queue.songs = [
        { title: 'Song 0' },
        { title: 'Song 1' },
        { title: 'Song 2' },
        { title: 'Song 3' },
    ];

    assert.equal(skipToTrack(queue, 5), false); // out of bounds
    assert.equal(skipToTrack(queue, 0), false); // cannot skip to current

    const result = skipToTrack(queue, 2); // jump to Song 2
    assert.equal(result, true);
    assert.equal(stopped, true);
    // Intermediate song 1 should be removed, leaving [Song 0, Song 2, Song 3]
    assert.equal(queue.songs[1].title, 'Song 2');

    deleteQueue(guildId);
});
