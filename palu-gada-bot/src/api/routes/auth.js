import { Router } from 'express';
import jwt from 'jsonwebtoken';
import config from '../../config.js';

const router = Router();

const DISCORD_API = 'https://discord.com/api/v10';
const OAUTH_SCOPES = ['identify', 'guilds'];

/**
 * GET /api/auth/login
 * Returns Discord OAuth2 URL
 */
router.get('/login', (req, res) => {
    const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.oauthRedirectUri,
        response_type: 'code',
        scope: OAUTH_SCOPES.join(' '),
    });

    const authUrl = `https://discord.com/api/oauth2/authorize?${params}`;
    res.json({ url: authUrl });
});

/**
 * POST /api/auth/callback
 * Exchange code for tokens and create JWT
 */
router.post('/callback', async (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ error: 'Authorization code required' });
    }

    try {
        // Exchange code for access token
        const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: config.clientId,
                client_secret: config.clientSecret,
                grant_type: 'authorization_code',
                code,
                redirect_uri: config.oauthRedirectUri,
            }),
        });

        if (!tokenResponse.ok) {
            const error = await tokenResponse.text();
            console.error('[AUTH] Token exchange failed:', error);
            return res.status(400).json({ error: 'Failed to exchange authorization code' });
        }

        const tokens = await tokenResponse.json();

        // Get user info
        const userResponse = await fetch(`${DISCORD_API}/users/@me`, {
            headers: {
                Authorization: `Bearer ${tokens.access_token}`,
            },
        });

        if (!userResponse.ok) {
            return res.status(400).json({ error: 'Failed to get user info' });
        }

        const user = await userResponse.json();

        // Get user's guilds
        const guildsResponse = await fetch(`${DISCORD_API}/users/@me/guilds`, {
            headers: {
                Authorization: `Bearer ${tokens.access_token}`,
            },
        });

        const userGuilds = guildsResponse.ok ? await guildsResponse.json() : [];

        // Check if user is authorized (bot owner or has admin in any guild)
        const isOwner = user.id === config.ownerId;
        const adminGuilds = userGuilds.filter(g =>
            (parseInt(g.permissions) & 0x8) === 0x8 // ADMINISTRATOR permission
        );

        if (!isOwner && adminGuilds.length === 0) {
            return res.status(403).json({
                error: 'You must be the bot owner or a server admin to access the dashboard'
            });
        }

        // Create JWT
        const jwtPayload = {
            id: user.id,
            username: user.username,
            discriminator: user.discriminator,
            avatar: user.avatar,
            isOwner,
            adminGuildIds: adminGuilds.map(g => g.id),
        };

        const token = jwt.sign(jwtPayload, config.jwtSecret, {
            expiresIn: '7d',
        });

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                discriminator: user.discriminator,
                avatar: user.avatar,
                isOwner,
            },
        });
    } catch (error) {
        console.error('[AUTH] OAuth error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
});

/**
 * GET /api/auth/me
 * Get current user info from JWT
 */
router.get('/me', (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        const user = jwt.verify(token, config.jwtSecret);
        res.json({ user });
    } catch {
        res.status(401).json({ error: 'Invalid token' });
    }
});

export default router;
