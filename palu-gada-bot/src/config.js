import dotenv from 'dotenv';
import { isGuildAllowed, getAllowedGuilds } from './database/models.js';
import crypto from 'crypto';

dotenv.config();

/**
 * Bot configuration loaded from environment variables
 */
const config = {
    // Discord
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET, // For OAuth2
    guildId: process.env.GUILD_ID, // For command deployment

    // API Keys
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,

    // Bot Settings
    ownerId: process.env.OWNER_ID, // Bot owner's Discord ID

    // Guild Restriction Mode
    // 'allowlist' = only allowed guilds can use the bot
    // 'open' = any guild can use the bot
    guildMode: process.env.GUILD_MODE || 'open',

    // Comma-separated list of allowed guild IDs (loaded into DB on first run)
    allowedGuildsEnv: process.env.ALLOWED_GUILDS?.split(',').filter(Boolean) || [],

    // Admin API Settings
    apiPort: parseInt(process.env.API_PORT) || 3000,
    apiEnabled: process.env.API_ENABLED !== 'false',

    // JWT Secret (auto-generate if not provided)
    jwtSecret: process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex'),

    // OAuth2 Redirect URI (your Cloudflare Pages URL + /callback)
    oauthRedirectUri: process.env.OAUTH_REDIRECT_URI || 'http://localhost:5173/callback',

    // Admin Panel URL (for CORS)
    adminPanelUrl: process.env.ADMIN_PANEL_URL || 'http://localhost:5173',

    // Shell Channel Settings
    shellChannelId: process.env.SHELL_CHANNEL_ID, // Dedicated channel for shell commands
    shellAllowedUsers: process.env.SHELL_ALLOWED_USERS?.split(',').filter(Boolean) || [],
};

/**
 * Check if a guild is allowed to use the bot
 */
export function checkGuildAccess(guildId) {
    // Open mode = everyone allowed
    if (config.guildMode === 'open') {
        return true;
    }

    // Allowlist mode = check database
    return isGuildAllowed(guildId);
}

/**
 * Get list of allowed guild IDs
 */
export function getConfiguredGuilds() {
    if (config.guildMode === 'open') {
        return null; // null means all guilds
    }
    return getAllowedGuilds();
}

/**
 * Check if user is bot owner
 */
export function isOwner(userId) {
    return userId === config.ownerId;
}

/**
 * Validate required config
 */
export function validateConfig() {
    const errors = [];

    if (!config.token) {
        errors.push('DISCORD_TOKEN is required');
    }

    if (!config.clientId) {
        errors.push('CLIENT_ID is required');
    }

    if (errors.length > 0) {
        console.error('[ERROR] Configuration errors:');
        errors.forEach(err => console.error(`  - ${err}`));
        process.exit(1);
    }

    // Warnings
    if (!config.anthropicApiKey) {
        console.warn('[WARN] ANTHROPIC_API_KEY not set - /summarize command will not work');
    }

    if (!config.ownerId) {
        console.warn('[WARN] OWNER_ID not set - owner-only commands will be disabled');
    }

    if (config.apiEnabled && !config.clientSecret) {
        console.warn('[WARN] CLIENT_SECRET not set - Admin panel OAuth will not work');
    }

    if (config.apiEnabled && !process.env.JWT_SECRET) {
        console.warn('[WARN] JWT_SECRET not set - using auto-generated secret (tokens will invalidate on restart)');
    }

    console.log(`[INFO] Guild mode: ${config.guildMode}`);
    console.log(`[INFO] Admin API: ${config.apiEnabled ? 'enabled' : 'disabled'}`);
}

export default config;
