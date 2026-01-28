import db from './db.js';

// Prepared statements for better performance
const statements = {
    getGuildSettings: db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?'),
    upsertGuildSettings: db.prepare(`
        INSERT INTO guild_settings (guild_id, prefix, dj_role_id, music_channel_id, log_channel_id, volume,
            welcome_channel_id, welcome_message, welcome_enabled, autorole_id, autorole_enabled,
            log_enabled, starboard_channel_id, starboard_threshold, starboard_enabled,
            confession_channel_id, confession_enabled, message_edit_log_enabled, message_delete_log_enabled)
        VALUES (@guild_id, @prefix, @dj_role_id, @music_channel_id, @log_channel_id, @volume,
            @welcome_channel_id, @welcome_message, @welcome_enabled, @autorole_id, @autorole_enabled,
            @log_enabled, @starboard_channel_id, @starboard_threshold, @starboard_enabled,
            @confession_channel_id, @confession_enabled, @message_edit_log_enabled, @message_delete_log_enabled)
        ON CONFLICT(guild_id) DO UPDATE SET
            prefix = @prefix,
            dj_role_id = @dj_role_id,
            music_channel_id = @music_channel_id,
            log_channel_id = @log_channel_id,
            volume = @volume,
            welcome_channel_id = @welcome_channel_id,
            welcome_message = @welcome_message,
            welcome_enabled = @welcome_enabled,
            autorole_id = @autorole_id,
            autorole_enabled = @autorole_enabled,
            log_enabled = @log_enabled,
            starboard_channel_id = @starboard_channel_id,
            starboard_threshold = @starboard_threshold,
            starboard_enabled = @starboard_enabled,
            confession_channel_id = @confession_channel_id,
            confession_enabled = @confession_enabled,
            message_edit_log_enabled = @message_edit_log_enabled,
            message_delete_log_enabled = @message_delete_log_enabled,
            updated_at = CURRENT_TIMESTAMP
    `),

    // Allowed guilds
    getAllowedGuilds: db.prepare('SELECT guild_id FROM allowed_guilds'),
    isGuildAllowed: db.prepare('SELECT 1 FROM allowed_guilds WHERE guild_id = ?'),
    addAllowedGuild: db.prepare('INSERT OR REPLACE INTO allowed_guilds (guild_id, added_by, notes) VALUES (?, ?, ?)'),
    removeAllowedGuild: db.prepare('DELETE FROM allowed_guilds WHERE guild_id = ?'),

    // Bot config
    getConfig: db.prepare('SELECT value FROM bot_config WHERE key = ?'),
    setConfig: db.prepare('INSERT OR REPLACE INTO bot_config (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)'),

    // User preferences
    getUserPrefs: db.prepare('SELECT settings FROM user_preferences WHERE user_id = ?'),
    setUserPrefs: db.prepare(`
        INSERT INTO user_preferences (user_id, settings)
        VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            settings = excluded.settings,
            updated_at = CURRENT_TIMESTAMP
    `),

    // Guild commands
    getGuildCommands: db.prepare('SELECT command_name, enabled FROM guild_commands WHERE guild_id = ?'),
    getGuildCommand: db.prepare('SELECT enabled FROM guild_commands WHERE guild_id = ? AND command_name = ?'),
    setGuildCommand: db.prepare(`
        INSERT INTO guild_commands (guild_id, command_name, enabled)
        VALUES (?, ?, ?)
        ON CONFLICT(guild_id, command_name) DO UPDATE SET
            enabled = excluded.enabled,
            updated_at = CURRENT_TIMESTAMP
    `),

    // Global commands
    getGlobalCommands: db.prepare('SELECT command_name, enabled FROM global_commands'),
    getGlobalCommand: db.prepare('SELECT enabled FROM global_commands WHERE command_name = ?'),
    setGlobalCommand: db.prepare(`
        INSERT INTO global_commands (command_name, enabled)
        VALUES (?, ?)
        ON CONFLICT(command_name) DO UPDATE SET
            enabled = excluded.enabled,
            updated_at = CURRENT_TIMESTAMP
    `),

    // Reminders
    addReminder: db.prepare('INSERT INTO reminders (user_id, channel_id, guild_id, message, remind_at) VALUES (?, ?, ?, ?, ?)'),
    getPendingReminders: db.prepare("SELECT * FROM reminders WHERE completed = 0 AND remind_at <= datetime('now')"),
    getUserReminders: db.prepare('SELECT * FROM reminders WHERE user_id = ? AND completed = 0 ORDER BY remind_at ASC'),
    markReminderCompleted: db.prepare('UPDATE reminders SET completed = 1 WHERE id = ?'),
    deleteReminder: db.prepare('DELETE FROM reminders WHERE id = ? AND user_id = ?'),

    // Warnings
    addWarning: db.prepare('INSERT INTO warnings (guild_id, user_id, moderator_id, reason) VALUES (?, ?, ?, ?)'),
    getUserWarnings: db.prepare('SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC'),
    getWarningCount: db.prepare('SELECT COUNT(*) as count FROM warnings WHERE guild_id = ? AND user_id = ?'),
    deleteWarning: db.prepare('DELETE FROM warnings WHERE id = ? AND guild_id = ?'),
    clearUserWarnings: db.prepare('DELETE FROM warnings WHERE guild_id = ? AND user_id = ?'),

    // Todos
    addTodo: db.prepare('INSERT INTO user_todos (user_id, task) VALUES (?, ?)'),
    getUserTodos: db.prepare('SELECT * FROM user_todos WHERE user_id = ? ORDER BY completed ASC, created_at DESC'),
    toggleTodo: db.prepare('UPDATE user_todos SET completed = ? WHERE id = ? AND user_id = ?'),
    deleteTodo: db.prepare('DELETE FROM user_todos WHERE id = ? AND user_id = ?'),
    clearCompletedTodos: db.prepare('DELETE FROM user_todos WHERE user_id = ? AND completed = 1'),

    // Notes
    addNote: db.prepare('INSERT INTO user_notes (user_id, title, content) VALUES (?, ?, ?)'),
    getUserNotes: db.prepare('SELECT * FROM user_notes WHERE user_id = ? ORDER BY updated_at DESC'),
    getNote: db.prepare('SELECT * FROM user_notes WHERE id = ? AND user_id = ?'),
    updateNote: db.prepare('UPDATE user_notes SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'),
    deleteNote: db.prepare('DELETE FROM user_notes WHERE id = ? AND user_id = ?'),

    // AFK
    setAfk: db.prepare('INSERT OR REPLACE INTO afk_status (user_id, message, since) VALUES (?, ?, CURRENT_TIMESTAMP)'),
    getAfk: db.prepare('SELECT * FROM afk_status WHERE user_id = ?'),
    removeAfk: db.prepare('DELETE FROM afk_status WHERE user_id = ?'),
    getAllAfk: db.prepare('SELECT * FROM afk_status'),

    // Economy
    getEconomy: db.prepare('SELECT * FROM user_economy WHERE user_id = ?'),
    createEconomy: db.prepare('INSERT OR IGNORE INTO user_economy (user_id) VALUES (?)'),
    updateBalance: db.prepare('UPDATE user_economy SET balance = balance + ?, total_earned = total_earned + MAX(0, ?) WHERE user_id = ?'),
    setBalance: db.prepare('UPDATE user_economy SET balance = ? WHERE user_id = ?'),
    updateBank: db.prepare('UPDATE user_economy SET bank = bank + ? WHERE user_id = ?'),
    setLastDaily: db.prepare('UPDATE user_economy SET last_daily = CURRENT_TIMESTAMP WHERE user_id = ?'),
    getTopBalance: db.prepare('SELECT * FROM user_economy ORDER BY (balance + bank) DESC LIMIT ?'),

    // Levels
    getUserLevel: db.prepare('SELECT * FROM user_levels WHERE guild_id = ? AND user_id = ?'),
    createUserLevel: db.prepare('INSERT OR IGNORE INTO user_levels (guild_id, user_id) VALUES (?, ?)'),
    addXp: db.prepare('UPDATE user_levels SET xp = xp + ?, messages = messages + 1, last_xp_gain = CURRENT_TIMESTAMP WHERE guild_id = ? AND user_id = ?'),
    setLevel: db.prepare('UPDATE user_levels SET level = ? WHERE guild_id = ? AND user_id = ?'),
    getLeaderboard: db.prepare('SELECT * FROM user_levels WHERE guild_id = ? ORDER BY level DESC, xp DESC LIMIT ?'),

    // Playlists
    createPlaylist: db.prepare('INSERT INTO user_playlists (user_id, name, tracks) VALUES (?, ?, ?)'),
    getUserPlaylists: db.prepare('SELECT * FROM user_playlists WHERE user_id = ? ORDER BY updated_at DESC'),
    getPlaylist: db.prepare('SELECT * FROM user_playlists WHERE user_id = ? AND name = ?'),
    getPlaylistById: db.prepare('SELECT * FROM user_playlists WHERE id = ? AND user_id = ?'),
    updatePlaylist: db.prepare('UPDATE user_playlists SET tracks = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'),
    deletePlaylist: db.prepare('DELETE FROM user_playlists WHERE id = ? AND user_id = ?'),

    // Birthdays
    setBirthday: db.prepare('INSERT OR REPLACE INTO birthdays (guild_id, user_id, month, day, year) VALUES (?, ?, ?, ?, ?)'),
    getBirthday: db.prepare('SELECT * FROM birthdays WHERE user_id = ? AND guild_id = ?'),
    getTodayBirthdays: db.prepare('SELECT * FROM birthdays WHERE guild_id = ? AND month = ? AND day = ?'),
    // Note: getUpcomingBirthdays now requires dynamic query - see getUpcomingBirthdays function
    deleteBirthday: db.prepare('DELETE FROM birthdays WHERE guild_id = ? AND user_id = ?'),

    // Starboard
    getStarboardMessage: db.prepare('SELECT * FROM starboard_messages WHERE guild_id = ? AND original_message_id = ?'),
    addStarboardMessage: db.prepare('INSERT INTO starboard_messages (guild_id, original_message_id, starboard_message_id, star_count) VALUES (?, ?, ?, ?)'),
    updateStarboardCount: db.prepare('UPDATE starboard_messages SET star_count = ? WHERE guild_id = ? AND original_message_id = ?'),

    // Giveaways
    createGiveaway: db.prepare('INSERT INTO giveaways (guild_id, channel_id, message_id, prize, winner_count, ends_at, host_id) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    getGiveaway: db.prepare('SELECT * FROM giveaways WHERE message_id = ?'),
    getActiveGiveaways: db.prepare('SELECT * FROM giveaways WHERE guild_id = ? AND active = 1'),
    getExpiredGiveaways: db.prepare("SELECT * FROM giveaways WHERE active = 1 AND ends_at <= datetime('now')"),
    endGiveaway: db.prepare('UPDATE giveaways SET active = 0 WHERE message_id = ?'),
    addGiveawayEntry: db.prepare('INSERT OR IGNORE INTO giveaway_entries (message_id, user_id) VALUES (?, ?)'),
    getGiveawayEntries: db.prepare('SELECT * FROM giveaway_entries WHERE message_id = ?'),

    // Confessions
    createConfession: db.prepare('INSERT INTO confessions (guild_id, confession_id, user_id, content) VALUES (?, ?, ?, ?)'),
    getConfession: db.prepare('SELECT * FROM confessions WHERE guild_id = ? AND confession_id = ?'),

    // Audit logs
    addAuditLog: db.prepare('INSERT INTO audit_logs (guild_id, action, user_id, target_id, details) VALUES (?, ?, ?, ?, ?)'),
    getAuditLogs: db.prepare('SELECT * FROM audit_logs WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?'),

    // GitHub webhooks
    addGithubWebhook: db.prepare('INSERT INTO github_webhooks (guild_id, channel_id, organization, repository, events, webhook_secret) VALUES (?, ?, ?, ?, ?, ?)'),
    getGithubWebhooks: db.prepare('SELECT * FROM github_webhooks WHERE guild_id = ? AND enabled = 1'),
    getGithubWebhookById: db.prepare('SELECT * FROM github_webhooks WHERE id = ?'),
    getAllGithubWebhooks: db.prepare('SELECT * FROM github_webhooks WHERE enabled = 1'),
    updateGithubWebhook: db.prepare('UPDATE github_webhooks SET channel_id = ?, organization = ?, repository = ?, events = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'),
    deleteGithubWebhook: db.prepare('DELETE FROM github_webhooks WHERE id = ? AND guild_id = ?'),
    toggleGithubWebhook: db.prepare('UPDATE github_webhooks SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND guild_id = ?'),

    // Reaction roles
    addReactionRole: db.prepare('INSERT OR REPLACE INTO reaction_roles (guild_id, channel_id, message_id, emoji, role_id) VALUES (?, ?, ?, ?, ?)'),
    getReactionRole: db.prepare('SELECT * FROM reaction_roles WHERE guild_id = ? AND message_id = ? AND emoji = ?'),
    getReactionRolesByMessage: db.prepare('SELECT * FROM reaction_roles WHERE guild_id = ? AND message_id = ?'),
    getReactionRolesByGuild: db.prepare('SELECT * FROM reaction_roles WHERE guild_id = ? ORDER BY created_at DESC'),
    removeReactionRole: db.prepare('DELETE FROM reaction_roles WHERE guild_id = ? AND message_id = ? AND emoji = ?'),
    removeReactionRolesByMessage: db.prepare('DELETE FROM reaction_roles WHERE guild_id = ? AND message_id = ?'),
};

/**
 * Guild Settings
 */
export function getGuildSettings(guildId) {
    const settings = statements.getGuildSettings.get(guildId);
    return settings || {
        guild_id: guildId,
        welcome_enabled: false,
        welcome_channel_id: null,
        welcome_message: null,
        autorole_enabled: false,
        autorole_id: null,
        starboard_enabled: false,
        starboard_channel_id: null,
        starboard_threshold: 3,
        confession_enabled: false,
        confession_channel_id: null,
        message_edit_log_enabled: false,
        message_delete_log_enabled: false,
    };
}

export function setGuildSettings(settings) {
    const defaults = {
        prefix: '!',
        dj_role_id: null,
        music_channel_id: null,
        log_channel_id: null,
        volume: 100,
        welcome_channel_id: null,
        welcome_message: null,
        welcome_enabled: 0,
        autorole_id: null,
        autorole_enabled: 0,
        log_enabled: 0,
        starboard_channel_id: null,
        starboard_threshold: 3,
        starboard_enabled: 0,
        confession_channel_id: null,
        confession_enabled: 0,
        message_edit_log_enabled: 0,
        message_delete_log_enabled: 0,
    };

    // Merge with defaults
    const merged = { ...defaults, ...settings };

    // Sanitize values for SQLite (convert booleans to integers)
    const sanitized = {};
    for (const [key, value] of Object.entries(merged)) {
        if (typeof value === 'boolean') {
            sanitized[key] = value ? 1 : 0;
        } else {
            sanitized[key] = value;
        }
    }

    return statements.upsertGuildSettings.run(sanitized);
}

export function updateGuildSettings(guildId, updates) {
    const current = statements.getGuildSettings.get(guildId) || { guild_id: guildId };
    const merged = { ...current, ...updates };
    return setGuildSettings(merged);
}

// Update a single guild setting
export function updateGuildSetting(guildId, key, value) {
    return updateGuildSettings(guildId, { [key]: value });
}

/**
 * Allowed Guilds (Whitelist)
 */
export function getAllowedGuilds() {
    return statements.getAllowedGuilds.all().map(row => row.guild_id);
}

export function isGuildAllowed(guildId) {
    return statements.isGuildAllowed.get(guildId) !== undefined;
}

export function addAllowedGuild(guildId, addedBy = null, notes = null) {
    return statements.addAllowedGuild.run(guildId, addedBy, notes);
}

export function removeAllowedGuild(guildId) {
    return statements.removeAllowedGuild.run(guildId);
}

/**
 * Bot Config (Key-Value)
 */
export function getConfig(key, defaultValue = null) {
    const row = statements.getConfig.get(key);
    if (!row) return defaultValue;

    try {
        return JSON.parse(row.value);
    } catch {
        return row.value;
    }
}

export function setConfig(key, value) {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    return statements.setConfig.run(key, serialized);
}

/**
 * User Preferences
 */
export function getUserPreferences(userId) {
    const row = statements.getUserPrefs.get(userId);
    if (!row) return {};

    try {
        return JSON.parse(row.settings);
    } catch {
        return {};
    }
}

export function setUserPreferences(userId, settings) {
    return statements.setUserPrefs.run(userId, JSON.stringify(settings));
}

/**
 * Guild Commands (enable/disable per guild)
 */
export function getGuildCommands(guildId) {
    const rows = statements.getGuildCommands.all(guildId);
    const commands = {};
    for (const row of rows) {
        commands[row.command_name] = row.enabled === 1;
    }
    return commands;
}

export function isCommandEnabled(guildId, commandName) {
    // First check global toggle
    const globalRow = statements.getGlobalCommand.get(commandName);
    if (globalRow && globalRow.enabled === 0) {
        return false; // Globally disabled
    }

    // Then check guild-specific toggle
    const row = statements.getGuildCommand.get(guildId, commandName);
    if (!row) return true;
    return row.enabled === 1;
}

export function setGuildCommand(guildId, commandName, enabled) {
    return statements.setGuildCommand.run(guildId, commandName, enabled ? 1 : 0);
}

/**
 * Global Commands
 */
export function getGlobalCommands() {
    const rows = statements.getGlobalCommands.all();
    const commands = {};
    for (const row of rows) {
        commands[row.command_name] = row.enabled === 1;
    }
    return commands;
}

export function isGlobalCommandEnabled(commandName) {
    const row = statements.getGlobalCommand.get(commandName);
    if (!row) return true;
    return row.enabled === 1;
}

export function setGlobalCommand(commandName, enabled) {
    return statements.setGlobalCommand.run(commandName, enabled ? 1 : 0);
}

/**
 * Reminders
 */
export function addReminder(userId, channelId, guildId, message, remindAt) {
    return statements.addReminder.run(userId, channelId, guildId, message, remindAt);
}

export function getPendingReminders() {
    return statements.getPendingReminders.all();
}

export function getUserReminders(userId) {
    return statements.getUserReminders.all(userId);
}

export function markReminderCompleted(id) {
    return statements.markReminderCompleted.run(id);
}

export function deleteReminder(id, userId) {
    return statements.deleteReminder.run(id, userId);
}

/**
 * Warnings
 */
export function addWarning(guildId, userId, moderatorId, reason) {
    return statements.addWarning.run(guildId, userId, moderatorId, reason);
}

export function getUserWarnings(guildId, userId) {
    return statements.getUserWarnings.all(guildId, userId);
}

export function getWarningCount(guildId, userId) {
    return statements.getWarningCount.get(guildId, userId).count;
}

export function deleteWarning(id, guildId) {
    return statements.deleteWarning.run(id, guildId);
}

export function clearUserWarnings(guildId, userId) {
    return statements.clearUserWarnings.run(guildId, userId);
}

/**
 * Todos
 */
export function addTodo(userId, task) {
    return statements.addTodo.run(userId, task);
}

export function getUserTodos(userId) {
    return statements.getUserTodos.all(userId);
}

export function toggleTodo(id, userId, completed) {
    return statements.toggleTodo.run(completed ? 1 : 0, id, userId);
}

export function deleteTodo(id, userId) {
    return statements.deleteTodo.run(id, userId);
}

export function clearCompletedTodos(userId) {
    return statements.clearCompletedTodos.run(userId);
}

/**
 * Notes
 */
export function addNote(userId, title, content) {
    return statements.addNote.run(userId, title, content);
}

export function getUserNotes(userId) {
    return statements.getUserNotes.all(userId);
}

export function getNote(id, userId) {
    return statements.getNote.get(id, userId);
}

export function updateNote(id, userId, title, content) {
    return statements.updateNote.run(title, content, id, userId);
}

export function deleteNote(id, userId) {
    return statements.deleteNote.run(id, userId);
}

/**
 * AFK
 */
export function setAfk(userId, message) {
    return statements.setAfk.run(userId, message);
}

export function getAfk(userId) {
    return statements.getAfk.get(userId);
}

export function removeAfk(userId) {
    return statements.removeAfk.run(userId);
}

export function getAllAfk() {
    return statements.getAllAfk.all();
}

/**
 * Economy
 */
export function getEconomy(userId) {
    statements.createEconomy.run(userId);
    return statements.getEconomy.get(userId);
}

export function addBalance(userId, amount) {
    statements.createEconomy.run(userId);
    return statements.updateBalance.run(amount, amount, userId);
}

export function setBalance(userId, amount) {
    statements.createEconomy.run(userId);
    return statements.setBalance.run(amount, userId);
}

export function addToBank(userId, amount) {
    statements.createEconomy.run(userId);
    return statements.updateBank.run(amount, userId);
}

export function claimDaily(userId, amount) {
    statements.createEconomy.run(userId);
    statements.updateBalance.run(amount, amount, userId);
    return statements.setLastDaily.run(userId);
}

export function canClaimDaily(userId) {
    const eco = getEconomy(userId);
    if (!eco.last_daily) return true;
    // SQLite's CURRENT_TIMESTAMP stores UTC time without timezone indicator
    // Append 'Z' to explicitly parse as UTC to avoid timezone mismatch
    const lastDailyStr = eco.last_daily.endsWith('Z') ? eco.last_daily : eco.last_daily + 'Z';
    const lastDaily = new Date(lastDailyStr);
    const now = new Date();
    return now.getTime() - lastDaily.getTime() >= 24 * 60 * 60 * 1000;
}

export function getTopBalances(limit = 10) {
    return statements.getTopBalance.all(limit);
}

export function transferBalance(fromUserId, toUserId, amount) {
    const from = getEconomy(fromUserId);
    if (from.balance < amount) return false;

    statements.updateBalance.run(-amount, 0, fromUserId);
    statements.createEconomy.run(toUserId);
    statements.updateBalance.run(amount, 0, toUserId);
    return true;
}

/**
 * Levels
 */
export function getUserLevel(guildId, userId) {
    statements.createUserLevel.run(guildId, userId);
    return statements.getUserLevel.get(guildId, userId);
}

export function calculateLevel(xp) {
    return Math.floor(Math.sqrt(xp / 100));
}

export function xpForLevel(level) {
    return level * level * 100;
}

export function addXp(guildId, userId, amount) {
    statements.createUserLevel.run(guildId, userId);
    const before = statements.getUserLevel.get(guildId, userId);
    const oldLevel = before ? before.level : 0;

    statements.addXp.run(amount, guildId, userId);

    const after = statements.getUserLevel.get(guildId, userId);
    const newLevel = calculateLevel(after.xp);

    if (newLevel > oldLevel) {
        statements.setLevel.run(newLevel, guildId, userId);
        return { leveledUp: true, newLevel };
    }

    return { leveledUp: false };
}

export function getLeaderboard(guildId, limit = 10) {
    return statements.getLeaderboard.all(guildId, limit);
}

/**
 * Playlists
 */
export function createPlaylist(userId, name, tracks = []) {
    return statements.createPlaylist.run(userId, name, JSON.stringify(tracks));
}

export function getUserPlaylists(userId) {
    return statements.getUserPlaylists.all(userId).map(p => ({
        ...p,
        tracks: JSON.parse(p.tracks || '[]'),
    }));
}

export function getPlaylist(userId, name) {
    const playlist = statements.getPlaylist.get(userId, name);
    if (!playlist) return null;
    return {
        ...playlist,
        tracks: JSON.parse(playlist.tracks || '[]'),
    };
}

export function getPlaylistById(id, userId) {
    const playlist = statements.getPlaylistById.get(id, userId);
    if (!playlist) return null;
    return {
        ...playlist,
        tracks: JSON.parse(playlist.tracks || '[]'),
    };
}

export function updatePlaylistTracks(id, userId, tracks) {
    return statements.updatePlaylist.run(JSON.stringify(tracks), id, userId);
}

export function deletePlaylist(id, userId) {
    return statements.deletePlaylist.run(id, userId);
}

/**
 * Birthdays
 */
export function setBirthday(userId, guildId, month, day, year = null) {
    return statements.setBirthday.run(guildId, userId, month, day, year);
}

export function getBirthday(userId, guildId) {
    return statements.getBirthday.get(userId, guildId);
}

export function getTodayBirthdays(guildId) {
    const now = new Date();
    return statements.getTodayBirthdays.all(guildId, now.getMonth() + 1, now.getDate());
}

export function getUpcomingBirthdays(guildId, limit = 10) {
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentDay = now.getDate();

    // Use a dynamic query that calculates days until birthday with year wraparound
    // Birthdays later this year come first, then birthdays early next year
    const query = db.prepare(`
        SELECT *,
            CASE 
                WHEN month > ? OR (month = ? AND day >= ?) THEN 
                    (month - ?) * 31 + (day - ?)
                ELSE 
                    (12 - ? + month) * 31 + (day - ?) + 365
            END as days_until
        FROM birthdays 
        WHERE guild_id = ?
        ORDER BY days_until ASC
        LIMIT ?
    `);

    return query.all(currentMonth, currentMonth, currentDay, currentMonth, currentDay, currentMonth, currentDay, guildId, limit);
}

export function removeBirthday(userId, guildId) {
    return statements.deleteBirthday.run(guildId, userId);
}

/**
 * Starboard
 */
export function getStarboardMessage(guildId, originalMessageId) {
    return statements.getStarboardMessage.get(guildId, originalMessageId);
}

export function addStarboardMessage(guildId, originalMessageId, starboardMessageId, starCount) {
    return statements.addStarboardMessage.run(guildId, originalMessageId, starboardMessageId, starCount);
}

export function updateStarboardCount(guildId, originalMessageId, starCount) {
    return statements.updateStarboardCount.run(starCount, guildId, originalMessageId);
}

/**
 * Giveaways
 */
export function createGiveaway(guildId, channelId, messageId, prize, winnerCount, endsAt, hostId) {
    return statements.createGiveaway.run(guildId, channelId, messageId, prize, winnerCount, endsAt, hostId);
}

export function getGiveaway(messageId) {
    return statements.getGiveaway.get(messageId);
}

export function getActiveGiveaways(guildId) {
    return statements.getActiveGiveaways.all(guildId);
}

export function getExpiredGiveaways() {
    return statements.getExpiredGiveaways.all();
}

export function endGiveaway(messageId) {
    return statements.endGiveaway.run(messageId);
}

export function addGiveawayEntry(messageId, userId) {
    return statements.addGiveawayEntry.run(messageId, userId);
}

export function getGiveawayEntries(messageId) {
    return statements.getGiveawayEntries.all(messageId);
}

/**
 * Confessions
 */
export function createConfession(guildId, confessionId, userId, content) {
    return statements.createConfession.run(guildId, confessionId, userId, content);
}

export function getConfession(guildId, confessionId) {
    return statements.getConfession.get(guildId, confessionId);
}

/**
 * Audit Logs
 */
export function addAuditLog(guildId, action, userId, targetId, details) {
    return statements.addAuditLog.run(guildId, action, userId, targetId, details);
}

export function getAuditLogs(guildId, limit = 50) {
    return statements.getAuditLogs.all(guildId, limit);
}

/**
 * GitHub Webhooks
 */
export function addGithubWebhook(guildId, channelId, organization, repository, events, webhookSecret) {
    return statements.addGithubWebhook.run(guildId, channelId, organization, repository, JSON.stringify(events), webhookSecret);
}

export function getGithubWebhooks(guildId) {
    return statements.getGithubWebhooks.all(guildId).map(w => ({
        ...w,
        events: JSON.parse(w.events || '[]'),
    }));
}

export function getGithubWebhookById(id) {
    const webhook = statements.getGithubWebhookById.get(id);
    if (!webhook) return null;
    return {
        ...webhook,
        events: JSON.parse(webhook.events || '[]'),
    };
}

export function getAllGithubWebhooks() {
    return statements.getAllGithubWebhooks.all().map(w => ({
        ...w,
        events: JSON.parse(w.events || '[]'),
    }));
}

export function updateGithubWebhook(id, channelId, organization, repository, events, enabled) {
    return statements.updateGithubWebhook.run(channelId, organization, repository, JSON.stringify(events), enabled ? 1 : 0, id);
}

export function deleteGithubWebhook(id, guildId) {
    return statements.deleteGithubWebhook.run(id, guildId);
}

export function toggleGithubWebhook(id, guildId, enabled) {
    return statements.toggleGithubWebhook.run(enabled ? 1 : 0, id, guildId);
}

/**
 * Reaction Roles
 */
export function addReactionRole(guildId, channelId, messageId, emoji, roleId) {
    return statements.addReactionRole.run(guildId, channelId, messageId, emoji, roleId);
}

export function getReactionRole(guildId, messageId, emoji) {
    return statements.getReactionRole.get(guildId, messageId, emoji);
}

export function getReactionRolesByMessage(guildId, messageId) {
    return statements.getReactionRolesByMessage.all(guildId, messageId);
}

export function getReactionRolesByGuild(guildId) {
    return statements.getReactionRolesByGuild.all(guildId);
}

export function removeReactionRole(guildId, messageId, emoji) {
    return statements.removeReactionRole.run(guildId, messageId, emoji);
}

export function removeReactionRolesByMessage(guildId, messageId) {
    return statements.removeReactionRolesByMessage.run(guildId, messageId);
}

export default {
    getGuildSettings,
    setGuildSettings,
    updateGuildSettings,
    updateGuildSetting,
    getAllowedGuilds,
    isGuildAllowed,
    addAllowedGuild,
    removeAllowedGuild,
    getConfig,
    setConfig,
    getUserPreferences,
    setUserPreferences,
    getGuildCommands,
    isCommandEnabled,
    setGuildCommand,
    getGlobalCommands,
    isGlobalCommandEnabled,
    setGlobalCommand,
    addReminder,
    getPendingReminders,
    getUserReminders,
    markReminderCompleted,
    deleteReminder,
    addWarning,
    getUserWarnings,
    getWarningCount,
    deleteWarning,
    clearUserWarnings,
    addTodo,
    getUserTodos,
    toggleTodo,
    deleteTodo,
    clearCompletedTodos,
    addNote,
    getUserNotes,
    getNote,
    updateNote,
    deleteNote,
    setAfk,
    getAfk,
    removeAfk,
    getAllAfk,
    getEconomy,
    addBalance,
    setBalance,
    addToBank,
    claimDaily,
    canClaimDaily,
    getTopBalances,
    transferBalance,
    getUserLevel,
    calculateLevel,
    xpForLevel,
    addXp,
    getLeaderboard,
    createPlaylist,
    getUserPlaylists,
    getPlaylist,
    getPlaylistById,
    updatePlaylistTracks,
    deletePlaylist,
    setBirthday,
    getBirthday,
    getTodayBirthdays,
    getUpcomingBirthdays,
    removeBirthday,
    getStarboardMessage,
    addStarboardMessage,
    updateStarboardCount,
    createGiveaway,
    getGiveaway,
    getActiveGiveaways,
    getExpiredGiveaways,
    endGiveaway,
    addGiveawayEntry,
    getGiveawayEntries,
    createConfession,
    getConfession,
    addAuditLog,
    getAuditLogs,
    addGithubWebhook,
    getGithubWebhooks,
    getGithubWebhookById,
    getAllGithubWebhooks,
    updateGithubWebhook,
    deleteGithubWebhook,
    toggleGithubWebhook,
    addReactionRole,
    getReactionRole,
    getReactionRolesByMessage,
    getReactionRolesByGuild,
    removeReactionRole,
    removeReactionRolesByMessage,
};
