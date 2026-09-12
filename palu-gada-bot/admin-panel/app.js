// Configuration - Update this with your API URL
const API_URL = localStorage.getItem('apiUrl') || 'https://palu-gada.solork.dev';

// State
let token = localStorage.getItem('token');
let user = null;
let currentGuildId = null;

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const dashboard = document.getElementById('dashboard');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Check URL params for OAuth callback
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (code) {
        handleOAuthCallback(code);
        return;
    }

    // Check for existing token
    if (token) {
        validateToken();
    } else {
        showLogin();
    }

    // Setup event listeners
    setupEventListeners();
});

function setupEventListeners() {
    // Login button
    loginBtn.addEventListener('click', startOAuth);

    // Logout button
    logoutBtn.addEventListener('click', logout);

    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            showPage(page);
        });
    });

    // Add guild button
    document.getElementById('add-guild-btn')?.addEventListener('click', addGuildToAllowlist);

    // Manual refresh on the overview
    document.getElementById('refresh-btn')?.addEventListener('click', () => {
        setText('overview-stamp', 'refreshing…');
        loadOverview();
    });

    // Panel links that jump to a full page
    document.querySelectorAll('.panel-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            showPage(link.dataset.page);
        });
    });

    // Leaderboard load button
    document.getElementById('leaderboard-load-btn')?.addEventListener('click', () => {
        const guildId = document.getElementById('leaderboard-guild-select').value;
        const limit = parseInt(document.getElementById('leaderboard-limit').value) || 100;
        if (guildId) loadLeaderboard(guildId, limit);
    });
}

// Auth Functions
async function startOAuth() {
    try {
        const response = await fetch(`${API_URL}/api/auth/login`);
        const data = await response.json();
        window.location.href = data.url;
    } catch (error) {
        console.error('Failed to start OAuth:', error);
        setStatus('login-status', 'Could not reach the bot. Check that it is running, then try again.');
    }
}

async function handleOAuthCallback(code) {
    try {
        const response = await fetch(`${API_URL}/api/auth/callback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Authentication failed');
        }

        const data = await response.json();
        token = data.token;
        user = data.user;

        localStorage.setItem('token', token);

        // Clear URL params
        window.history.replaceState({}, document.title, window.location.pathname);

        // Setup event listeners before showing dashboard
        // This is needed because the DOMContentLoaded handler returns early for OAuth callbacks
        setupEventListeners();

        showDashboard();
    } catch (error) {
        console.error('OAuth callback failed:', error);
        showLogin();
        setStatus('login-status', `Sign-in failed: ${error.message}. Try signing in again.`);
    }
}

async function validateToken() {
    try {
        const response = await fetch(`${API_URL}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!response.ok) {
            throw new Error('Invalid token');
        }

        const data = await response.json();
        user = data.user;
        showDashboard();
    } catch (error) {
        console.error('Token validation failed:', error);
        localStorage.removeItem('token');
        token = null;
        showLogin();
    }
}

function logout() {
    setOverviewRefresh(false);
    localStorage.removeItem('token');
    token = null;
    user = null;
    showLogin();
}

// UI Functions
function showLogin() {
    loginScreen.classList.remove('hidden');
    dashboard.classList.add('hidden');
}

function showDashboard() {
    loginScreen.classList.add('hidden');
    dashboard.classList.remove('hidden');

    // Update user info
    document.getElementById('user-name').textContent = user.username;
    document.getElementById('user-avatar').src = user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
        : 'https://cdn.discordapp.com/embed/avatars/0.png';

    // Show/hide owner-only items
    document.querySelectorAll('.owner-only').forEach(el => {
        el.classList.toggle('hidden', !user.isOwner);
    });

    // Load initial page
    showPage('overview');

    // Pre-populate leaderboard guild selector
    loadLeaderboardPage();
}

function showPage(page) {
    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });

    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));

    // Show selected page
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) {
        pageEl.classList.remove('hidden');
    }

    // Load page data
    setOverviewRefresh(page === 'overview');

    switch (page) {
        case 'overview':
            loadOverview();
            break;
        case 'guilds':
            loadGuilds();
            break;
        case 'allowlist':
            loadAllowlist();
            break;
        case 'global-commands':
            loadAiCostToggle();
            loadGlobalCommands();
            break;
        case 'leaderboard':
            loadLeaderboardPage();
            break;
    }
}

// Make showPage available globally for onclick handlers
window.showPage = showPage;

// The heartbeat is only worth drawing if it stays current while the tab is
// open; the sampler takes one reading every 30 seconds, so match it.
let overviewTimer = null;

function setOverviewRefresh(on) {
    clearInterval(overviewTimer);
    overviewTimer = null;
    if (on) overviewTimer = setInterval(loadOverview, 30_000);
}

/**
 * Inline status line, shown inside the panel that owns the failure. The panel
 * is where the user is looking; an OS dialog is not, and it cannot say what
 * to do next without stealing focus first.
 */
function setStatus(id, message, kind = 'error') {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message;
    el.className = message ? `status ${kind}` : 'status';
}

/**
 * Runs a PATCH behind a switch: the row goes quiet while it is in flight, and
 * on failure the switch goes back where it was and the row says why.
 */
async function commitToggle(input, request, label) {
    const row = input.closest('.row');
    const wanted = input.checked;

    input.disabled = true;
    row?.classList.add('pending');
    row?.classList.remove('failed');

    try {
        await request();
        return true;
    } catch (error) {
        input.checked = !wanted;
        row?.classList.add('failed');
        const desc = row?.querySelector('.row-desc');
        if (desc) desc.textContent = `${label} did not change: ${error.message}. Try again.`;
        return false;
    } finally {
        input.disabled = false;
        row?.classList.remove('pending');
    }
}

// API Functions
async function apiRequest(endpoint, options = {}) {
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Request failed');
    }

    return response.json();
}

// Overview Page
async function loadOverview() {
    try {
        const [stats, history, commands, globalState, guilds] = await Promise.all([
            apiRequest('/api/stats'),
            apiRequest('/api/stats/history').catch(() => null),
            apiRequest('/api/stats/commands').catch(() => null),
            apiRequest('/api/guilds/global/commands').catch(() => null),
            apiRequest('/api/guilds').catch(() => null),
        ]);

        // "19d 4h 11m 2s" is four values pretending to be a headline. The
        // two coarsest carry the answer; the rest goes in the note.
        const uptimeParts = stats.uptime.formatted.split(' ');
        setText('stat-uptime', uptimeParts.slice(0, 2).join(' '));
        setText('stat-uptime-note', `${stats.uptime.formatted} since restart`);

        setText('bot-name', stats.bot.username || '–');
        setText('bot-mode', stats.config.guildMode);
        setText('stat-guilds', stats.config.guildMode === 'allowlist'
            ? `${stats.guilds.total} (${stats.guilds.allowed} allowed)`
            : String(stats.guilds.total));
        setText('stat-users', stats.users.total.toLocaleString());
        setText('stat-memory', `${stats.memory.used} MB of ${stats.memory.total} MB`);

        renderHeartbeat(history);
        renderOverviewCommands(commands, globalState);
        renderOverviewGuilds(guilds);

        setText('overview-stamp', `updated ${new Date().toLocaleTimeString()}`);
    } catch (error) {
        console.error('Failed to load overview:', error);
        setText('stat-uptime-note', 'could not reach the bot');
        setText('overview-stamp', 'could not reach the bot');
        document.getElementById('stat-uptime')?.classList.add('down');
        document.getElementById('brand-dot')?.classList.add('down');
    }
}

/**
 * The five commands most recently registered, as switches, so the page the
 * owner lands on is also where the switches are.
 */
function renderOverviewCommands(commands, globalState) {
    const container = document.getElementById('overview-commands');
    if (!container) return;

    if (!commands || !commands.commands) {
        container.innerHTML = '<p class="status error">Could not read the command list.</p>';
        return;
    }

    const disabled = new Set(
        (globalState?.commands || []).filter(c => c.enabled === 0).map(c => c.command_name)
    );

    const shown = [...commands.commands]
        .sort((a, b) => Number(disabled.has(b.name)) - Number(disabled.has(a.name)) || a.name.localeCompare(b.name))
        .slice(0, 6);

    container.innerHTML = shown.map(cmd => commandRow(cmd, !disabled.has(cmd.name), 'toggleGlobalCommand')).join('');
}

function renderOverviewGuilds(guilds) {
    const container = document.getElementById('overview-guilds');
    if (!container) return;

    if (!guilds || !guilds.guilds) {
        container.innerHTML = '<p class="status error">Could not read the server list.</p>';
        return;
    }

    if (guilds.guilds.length === 0) {
        container.innerHTML = '<p class="status">The bot is not in any server yet.</p>';
        return;
    }

    container.innerHTML = [...guilds.guilds]
        .sort((a, b) => b.memberCount - a.memberCount)
        .slice(0, 6)
        .map(guild => `
            <button type="button" class="row row-click" onclick="openGuild('${guild.id}')">
                <img src="${guild.icon || 'https://cdn.discordapp.com/embed/avatars/0.png'}" alt="" class="avatar">
                <span class="row-main">
                    <span class="row-name">${escapeHtml(guild.name)}</span>
                    <span class="row-desc">${guild.memberCount.toLocaleString()} members</span>
                </span>
                ${guilds.guildMode === 'allowlist'
                    ? `<span class="tag ${guild.isAllowed ? '' : 'off'}">${guild.isAllowed ? 'allowed' : 'blocked'}</span>`
                    : ''}
            </button>
        `).join('');
}

/**
 * One command row. Both the Overview and the Commands page render it, so the
 * switch behaves the same in both places.
 */
function commandRow(cmd, enabled, handler) {
    return `
        <div class="row">
            <span class="row-main">
                <span class="row-name cmd">/${cmd.name}</span>
                <span class="row-desc">${escapeHtml(cmd.description)}</span>
            </span>
            <span class="tag ${enabled ? '' : 'off'}">${enabled ? 'enabled' : 'disabled'}</span>
            <label class="toggle">
                <input type="checkbox" ${enabled ? 'checked' : ''}
                       onchange="${handler}('${cmd.name}', this.checked, this)">
                <span class="toggle-slider"></span>
                <span class="sr-only">/${cmd.name}</span>
            </label>
        </div>
    `;
}

/**
 * Draws one bar per health sample, oldest on the left. Bar height carries
 * gateway latency, colour carries up or down; empty slots stay grey so the
 * row does not pretend to more history than the process has.
 */
function renderHeartbeat(history) {
    const container = document.getElementById('heartbeat');
    const note = document.getElementById('heartbeat-note');
    const pill = document.getElementById('heartbeat-pill');
    const dot = document.getElementById('brand-dot');
    if (!container) return;

    if (!history || !history.samples || history.samples.length === 0) {
        container.innerHTML = '';
        setText('heartbeat-note', 'no samples yet');
        if (pill) {
            pill.textContent = 'no samples';
            pill.className = 'pill muted';
        }
        return;
    }

    const samples = history.samples;
    const slots = 40;
    const pings = samples.filter(s => typeof s.ping === 'number').map(s => s.ping);
    const worst = Math.max(120, ...pings);

    const bars = [];
    for (let i = 0; i < slots - samples.length; i++) {
        bars.push('<span class="beat empty" style="height:15%" title="no sample yet"></span>');
    }
    for (const sample of samples) {
        const height = sample.up && typeof sample.ping === 'number'
            ? Math.max(18, Math.round((sample.ping / worst) * 100))
            : 100;
        const when = new Date(sample.t).toLocaleTimeString();
        const label = sample.up
            ? `${when} · up · ${sample.ping} ms`
            : `${when} · down · no reading`;
        bars.push(
            `<span class="beat ${sample.up ? '' : 'down'}" style="height:${height}%" title="${label}"></span>`
        );
    }
    container.innerHTML = bars.join('');

    const last = samples[samples.length - 1];
    const upCount = samples.filter(s => s.up).length;

    // One tab stop for the row, not one per bar: the operator is tabbing
    // towards a switch, and forty stops in the way is a worse row than none.
    container.setAttribute('tabindex', '0');
    container.setAttribute('role', 'img');
    const ratio = ((upCount / samples.length) * 100).toFixed(1);
    const minutes = Math.round((samples.length * history.intervalMs) / 60000);
    const avg = history.avgPing === null ? 'no latency reading' : `avg ${history.avgPing} ms`;

    note.textContent = `${avg} · peak ${worst} ms · ${minutes} min since restart · hover a bar for its check`;

    container.setAttribute(
        'aria-label',
        `Last ${samples.length} health checks: ${upCount} up, ${samples.length - upCount} down, ${avg}.`
    );

    if (pill) {
        pill.textContent = `${last.up ? 'Up' : 'Down'} · ${upCount}/${samples.length} checks · ${ratio}%`;
        pill.className = `pill ${last.up ? '' : 'down'}`;
    }

    setText('bot-ping', typeof last.ping === 'number' ? `${last.ping} ms` : 'no reading');
    if (dot) {
        dot.classList.toggle('up', last.up);
        dot.classList.toggle('down', !last.up);
    }
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

// Guilds Page
async function loadGuilds() {
    const container = document.getElementById('guilds-list');
    container.innerHTML = '<div class="loading">Loading servers...</div>';

    try {
        const data = await apiRequest('/api/guilds');

        if (data.guilds.length === 0) {
            container.innerHTML = '<p class="empty">The bot is not in any server yet.</p>';
            return;
        }

        container.innerHTML = data.guilds.map(guild => `
            <button type="button" class="row row-click" onclick="openGuild('${guild.id}')">
                <img src="${guild.icon || 'https://cdn.discordapp.com/embed/avatars/0.png'}"
                     alt="" class="avatar">
                <span class="row-main">
                    <span class="row-name">${escapeHtml(guild.name)}</span>
                    <span class="row-desc">${guild.memberCount.toLocaleString()} members</span>
                </span>
                ${data.guildMode === 'allowlist' ? `
                    <span class="tag ${guild.isAllowed ? '' : 'off'}">${guild.isAllowed ? 'allowed' : 'blocked'}</span>
                ` : ''}
                <span class="row-meta">${guild.id}</span>
            </button>
        `).join('');
    } catch (error) {
        container.innerHTML = `<p class="empty">Could not load servers: ${escapeHtml(error.message)}</p>`;
    }
}

async function openGuild(guildId) {
    currentGuildId = guildId;

    // Hide guilds page, show detail page
    document.getElementById('page-guilds').classList.add('hidden');
    document.getElementById('page-guild-detail').classList.remove('hidden');

    try {
        const data = await apiRequest(`/api/guilds/${guildId}`);
        const commands = await apiRequest('/api/stats/commands');

        // Update guild header
        document.getElementById('guild-icon').src = data.guild.icon
            || 'https://cdn.discordapp.com/embed/avatars/0.png';
        document.getElementById('guild-name').textContent = data.guild.name;
        document.getElementById('guild-members').textContent = `${data.guild.memberCount.toLocaleString()} members`;

        // Render commands
        const container = document.getElementById('commands-list');
        container.innerHTML = commands.commands
            .map(cmd => commandRow(cmd, data.commands[cmd.name] !== false, 'toggleCommand'))
            .join('');
    } catch (error) {
        console.error('Failed to load guild:', error);
        document.getElementById('commands-list').innerHTML =
            `<p class="status error">Could not load this server: ${escapeHtml(error.message)}. Go back and open it again.</p>`;
    }
}

async function toggleCommand(commandName, enabled, input) {
    await commitToggle(
        input,
        () => apiRequest(`/api/guilds/${currentGuildId}/commands/${commandName}`, {
            method: 'PATCH',
            body: JSON.stringify({ enabled }),
        }),
        `/${commandName}`
    );
}

// Make openGuild available globally
window.openGuild = openGuild;
window.toggleCommand = toggleCommand;

// Allowlist Page
async function loadAllowlist() {
    const container = document.getElementById('allowlist-guilds');
    container.innerHTML = '<div class="loading">Loading allowlist...</div>';

    try {
        const [allowedData, guildsData] = await Promise.all([
            apiRequest('/api/guilds/allowed'),
            apiRequest('/api/guilds'),
        ]);

        const guildMap = new Map(guildsData.guilds.map(g => [g.id, g]));

        if (allowedData.guilds.length === 0) {
            container.innerHTML = '<p class="empty">No servers on the allowlist.</p>';
            return;
        }

        container.innerHTML = allowedData.guilds.map(guildId => {
            const guild = guildMap.get(guildId);
            return `
                <div class="row">
                    <span class="row-main">
                        <span class="row-name">${guild ? escapeHtml(guild.name) : 'Bot is not in this server'}</span>
                        <span class="row-desc"><code>${guildId}</code></span>
                    </span>
                    <button class="btn btn-remove" onclick="removeFromAllowlist('${guildId}')">Remove</button>
                </div>
            `;
        }).join('');
    } catch (error) {
        container.innerHTML = `<p class="empty">Could not load the allowlist: ${escapeHtml(error.message)}</p>`;
    }
}

async function addGuildToAllowlist() {
    const guildIdInput = document.getElementById('add-guild-id');
    const notesInput = document.getElementById('add-guild-notes');

    const guildId = guildIdInput.value.trim();
    const notes = notesInput.value.trim();

    if (!guildId) {
        setStatus('allowlist-status', 'Enter the server ID first. Right-click a server in Discord and copy its ID.');
        guildIdInput.focus();
        return;
    }

    try {
        await apiRequest('/api/guilds/allowed', {
            method: 'POST',
            body: JSON.stringify({ guildId, notes }),
        });

        guildIdInput.value = '';
        notesInput.value = '';
        setStatus('allowlist-status', `${guildId} added to the allowlist.`, 'ok');
        loadAllowlist();
    } catch (error) {
        setStatus('allowlist-status', `Could not add ${guildId}: ${error.message}`);
    }
}

async function removeFromAllowlist(guildId) {
    if (!confirm('Are you sure you want to remove this server from the allowlist?')) {
        return;
    }

    try {
        await apiRequest(`/api/guilds/allowed/${guildId}`, {
            method: 'DELETE',
        });
        setStatus('allowlist-status', `${guildId} removed from the allowlist.`, 'ok');
        loadAllowlist();
    } catch (error) {
        setStatus('allowlist-status', `Could not remove ${guildId}: ${error.message}`);
    }
}

// Make allowlist functions available globally
window.removeFromAllowlist = removeFromAllowlist;

// Global Commands Page
async function loadGlobalCommands() {
    const container = document.getElementById('global-commands-list');
    container.innerHTML = '<div class="loading">Loading global commands...</div>';

    try {
        const [commandsData, globalData] = await Promise.all([
            apiRequest('/api/stats/commands'),
            apiRequest('/api/guilds/global/commands'),
        ]);

        // Create a map of disabled commands
        const disabledCommands = new Set(
            globalData.commands
                .filter(cmd => cmd.enabled === 0)
                .map(cmd => cmd.command_name)
        );

        container.innerHTML = commandsData.commands
            .map(cmd => commandRow(cmd, !disabledCommands.has(cmd.name), 'toggleGlobalCommand'))
            .join('');
    } catch (error) {
        container.innerHTML = `<p class="empty">Could not load commands: ${escapeHtml(error.message)}</p>`;
    }
}

async function loadAiCostToggle() {
    const input = document.getElementById('ai-cost-toggle');
    if (!input) return;

    try {
        const { enabled } = await apiRequest('/api/guilds/global/ai-cost');
        input.checked = enabled;
    } catch (error) {
        console.error('Failed to load AI cost setting:', error);
    }
}

async function toggleAiCost(enabled, input) {
    await commitToggle(
        input,
        () => apiRequest('/api/guilds/global/ai-cost', {
            method: 'PATCH',
            body: JSON.stringify({ enabled }),
        }),
        'The cost estimate'
    );
}

async function toggleGlobalCommand(commandName, enabled, input) {
    const ok = await commitToggle(
        input,
        () => apiRequest(`/api/guilds/global/commands/${commandName}`, {
            method: 'PATCH',
            body: JSON.stringify({ enabled }),
        }),
        `/${commandName}`
    );

    if (!ok) return;

    const tag = input.closest('.row')?.querySelector('.tag');
    if (tag) {
        tag.textContent = enabled ? 'enabled' : 'disabled';
        tag.className = `tag ${enabled ? '' : 'off'}`;
    }
}

// Make global command functions available globally
window.toggleGlobalCommand = toggleGlobalCommand;
window.toggleAiCost = toggleAiCost;

// Leaderboard Page
async function loadLeaderboardPage() {
    const select = document.getElementById('leaderboard-guild-select');
    if (select.options.length > 1) return; // Already populated

    try {
        const data = await apiRequest('/api/guilds');
        console.log('[Leaderboard] Guilds loaded:', data.guilds?.length, data.guilds);
        if (!data.guilds || data.guilds.length === 0) {
            console.warn('[Leaderboard] No guilds returned from API');
            return;
        }
        data.guilds.forEach(guild => {
            const opt = document.createElement('option');
            opt.value = guild.id;
            opt.textContent = guild.name;
            select.appendChild(opt);
        });
    } catch (error) {
        console.error('[Leaderboard] Failed to load guilds:', error);
    }
}

async function loadLeaderboard(guildId, limit = 100) {
    const container = document.getElementById('leaderboard-content');
    container.innerHTML = '<div class="loading">Loading leaderboard…</div>';

    try {
        const data = await apiRequest(`/api/guilds/${guildId}/leaderboard?limit=${limit}`);
        const lb = data.leaderboard;

        if (!lb || lb.length === 0) {
            container.innerHTML = '<p class="empty">No XP recorded in this server yet.</p>';
            return;
        }

        const rows = lb.map((entry, i) => {
            const avatar = `<img src="${entry.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="avatar small" alt=""
                 onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">`;
            return `
                <tr>
                    <td class="cell-rank ${i < 3 ? 'top' : ''}">${i + 1}</td>
                    <td><span class="cell-user">${avatar}${escapeHtml(entry.username)}</span></td>
                    <td>${entry.level}</td>
                    <td>${entry.xp.toLocaleString()}</td>
                    <td>${entry.messages.toLocaleString()}</td>
                    <td class="cell-id">${entry.user_id}</td>
                </tr>
            `;
        }).join('');

        container.innerHTML = `
            <section class="panel">
                <h2 class="panel-title">Standings</h2>
                <div class="table-meta">${lb.length} members with XP</div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>Member</th>
                                <th>Level</th>
                                <th>XP</th>
                                <th>Messages</th>
                                <th>User ID</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </section>
        `;
    } catch (error) {
        container.innerHTML = `<p class="empty">Could not load the leaderboard: ${escapeHtml(error.message)}</p>`;
    }
}

// Utility Functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// API URL configuration has been removed for security reasons
// The API URL is now only configurable via the API_URL constant at the top of this file
// To change the API URL for development, modify the localStorage value directly in devtools:
// localStorage.setItem('apiUrl', 'http://your-api-url');
