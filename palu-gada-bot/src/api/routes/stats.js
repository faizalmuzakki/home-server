import { Router } from 'express';
import { getDiscordClient } from '../server.js';
import { getAllowedGuilds } from '../../database/models.js';
import config from '../../config.js';

const router = Router();

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
