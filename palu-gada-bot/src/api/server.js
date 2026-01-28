import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import config from '../config.js';
import authRoutes from './routes/auth.js';
import guildsRoutes from './routes/guilds.js';
import statsRoutes from './routes/stats.js';
import githubRoutes from './routes/github.js';

const app = express();

// GitHub webhook needs raw body for signature verification
app.use('/api/github/webhook', express.raw({ type: 'application/json' }));

// Middleware
app.use(express.json());
app.use(cors({
    origin: config.adminPanelUrl || '*',
    credentials: true,
}));

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
