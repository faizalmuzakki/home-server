import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import config from '../config.js';
import authRoutes from './routes/auth.js';
import guildsRoutes from './routes/guilds.js';
import statsRoutes from './routes/stats.js';
import githubRoutes from './routes/github.js';

const app = express();

// ── In-process rate limiter ─────────────────────────────────────────────────
// Tracks request timestamps per IP in a rolling window.
const _rlWindows = new Map();

/**
 * @param {number} windowMs   - sliding window in ms
 * @param {number} max        - max requests per window
 * @param {string} [message]  - response body when limit hit
 */
function rateLimit(windowMs, max, message = 'Too many requests, please slow down.') {
    return (req, res, next) => {
        const key = req.ip || 'unknown';
        const now = Date.now();
        const cutoff = now - windowMs;

        const hits = (_rlWindows.get(key) || []).filter(t => t > cutoff);
        if (hits.length >= max) {
            res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
            return res.status(429).json({ error: message });
        }
        hits.push(now);
        _rlWindows.set(key, hits);
        next();
    };
}

// Prune stale entries every 5 minutes to prevent memory growth
setInterval(() => {
    const cutoff = Date.now() - 15 * 60 * 1000;
    for (const [key, hits] of _rlWindows) {
        const fresh = hits.filter(t => t > cutoff);
        if (fresh.length === 0) _rlWindows.delete(key);
        else _rlWindows.set(key, fresh);
    }
}, 5 * 60 * 1000).unref();
// ────────────────────────────────────────────────────────────────────────────

// GitHub webhook needs raw body for signature verification
app.use('/api/github/webhook', express.raw({ type: 'application/json' }));

// Middleware
app.use(express.json());
app.use(cors({
    origin: config.adminPanelUrl || '*',
    credentials: true,
}));

// Global rate limit: 120 req / min per IP
app.use(rateLimit(60_000, 120));

// Tighter limit on auth endpoints to slow brute-force attempts
app.use('/api/auth', rateLimit(15 * 60_000, 20, 'Too many auth attempts, try again in 15 minutes.'));

// JWT Authentication middleware
export function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, config.jwtSecret, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
}

// Check if user is bot owner
export function requireOwner(req, res, next) {
    if (req.user.id !== config.ownerId) {
        return res.status(403).json({ error: 'Only bot owner can perform this action' });
    }
    next();
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/guilds', authenticateToken, guildsRoutes);
app.use('/api/stats', authenticateToken, statsRoutes);
app.use('/api/github', githubRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err, req, res, next) => {
    console.error('[API ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
});

let discordClient = null;

export function setDiscordClient(client) {
    discordClient = client;
}

export function getDiscordClient() {
    return discordClient;
}

export function startApiServer(port = 3000) {
    return new Promise((resolve, reject) => {
        const server = app.listen(port, () => {
            console.log(`[INFO] Admin API server running on port ${port}`);
            resolve(server);
        });

        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                reject(new Error(`Port ${port} is already in use. Please choose a different port or stop the process using it.`));
            } else {
                reject(err);
            }
        });
    });
}

export default app;
