import { Router } from 'express';
import { getDiscordClient } from '../server.js';
import { getAllowedGuilds } from '../../database/models.js';
import config from '../../config.js';

const router = Router();

// ── Health samples ──────────────────────────────────────────────────────────
// The panel's heartbeat row plots real checks, so something has to take them.
// A ring in memory is enough: the series only claims to cover the time since
// the last restart, and it says so on the page. Longer history is uptime-kuma's
// job, and it already alerts to Discord.
const SAMPLE_COUNT = 40;
const SAMPLE_INTERVAL_MS = 30_000;
const samples = [];

function takeSample() {
    const client = getDiscordClient();
    const ping = client?.ws?.ping;

    samples.push({
        t: Date.now(),
        // discord.js reports -1 before the first heartbeat has come back.
        up: Boolean(client?.isReady()) && typeof ping === 'number' && ping >= 0,
        ping: typeof ping === 'number' && ping >= 0 ? Math.round(ping) : null,
    });

    if (samples.length > SAMPLE_COUNT) samples.shift();
}

takeSample();
setInterval(takeSample, SAMPLE_INTERVAL_MS).unref();

/**
 * GET /api/stats/history
 * Health samples since the process started, oldest first.
 */
router.get('/history', (req, res) => {
    const seen = samples.filter(s => s.ping !== null);
    const avgPing = seen.length
        ? Math.round(seen.reduce((acc, s) => acc + s.ping, 0) / seen.length)
        : null;

    res.json({
        samples,
        intervalMs: SAMPLE_INTERVAL_MS,
        avgPing,
        upRatio: samples.length
            ? samples.filter(s => s.up).length / samples.length
            : null,
        sinceRestart: true,
    });
});

/**
 * GET /api/stats
 * Get bot statistics
 */
router.get('/', (req, res) => {
    const client = getDiscordClient();

    if (!client) {
        return res.status(500).json({ error: 'Bot not connected' });
    }

    const stats = {
        bot: {
            username: client.user?.username,
            discriminator: client.user?.discriminator,
            avatar: client.user?.avatarURL(),
            id: client.user?.id,
        },
        guilds: {
            total: client.guilds.cache.size,
            allowed: getAllowedGuilds().length,
        },
        users: {
            total: client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0),
        },
        uptime: {
            seconds: Math.floor(process.uptime()),
            formatted: formatUptime(process.uptime()),
        },
        memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            unit: 'MB',
        },
        config: {
            guildMode: config.guildMode,
        },
    };

    res.json(stats);
});

/**
 * GET /api/stats/commands
 * Get list of all available commands
 */
router.get('/commands', (req, res) => {
    const client = getDiscordClient();

    if (!client) {
        return res.status(500).json({ error: 'Bot not connected' });
    }

    const commands = Array.from(client.commands?.values() || []).map(cmd => ({
        name: cmd.data.name,
        description: cmd.data.description,
    }));

    res.json({ commands });
});

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);

    return parts.join(' ');
}

export default router;
