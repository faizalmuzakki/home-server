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
}

// Auth Functions
async function startOAuth() {
    try {
        const response = await fetch(`${API_URL}/api/auth/login`);
        const data = await response.json();
        window.location.href = data.url;
    } catch (error) {
        console.error('Failed to start OAuth:', error);
        alert('Failed to connect to API. Make sure the bot is running.');
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
        alert(error.message);
        showLogin();
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
            loadGlobalCommands();
            break;
    }
}

// Make showPage available globally for onclick handlers
window.showPage = showPage;

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
        const stats = await apiRequest('/api/stats');

        document.getElementById('stat-guilds').textContent = stats.guilds.total;
        document.getElementById('stat-users').textContent = stats.users.total.toLocaleString();
        document.getElementById('stat-uptime').textContent = stats.uptime.formatted;
        document.getElementById('stat-memory').textContent = `${stats.memory.used}MB`;

        document.getElementById('bot-name').textContent = stats.bot.username;
        document.getElementById('bot-mode').textContent = stats.config.guildMode;
        document.getElementById('bot-avatar').src = stats.bot.avatar
            || 'https://cdn.discordapp.com/embed/avatars/0.png';
    } catch (error) {
        console.error('Failed to load overview:', error);
    }
}

// Guilds Page
async function loadGuilds() {
    const container = document.getElementById('guilds-list');
    container.innerHTML = '<div class="loading">Loading servers...</div>';

    try {
        const data = await apiRequest('/api/guilds');

        if (data.guilds.length === 0) {
            container.innerHTML = '<p>No servers found.</p>';
            return;
        }

        container.innerHTML = data.guilds.map(guild => `
            <div class="guild-card" onclick="openGuild('${guild.id}')">
                <img src="${guild.icon || 'https://cdn.discordapp.com/embed/avatars/0.png'}"
                     alt="${guild.name}" class="avatar">
                <div class="guild-info">
                    <div class="guild-name">${escapeHtml(guild.name)}</div>
                    <div class="guild-members">${guild.memberCount.toLocaleString()} members</div>
                </div>
                ${data.guildMode === 'allowlist' ? `
                    <span class="guild-status ${guild.isAllowed ? 'allowed' : 'not-allowed'}">
                        ${guild.isAllowed ? 'Allowed' : 'Not Allowed'}
                    </span>
                ` : ''}
            </div>
        `).join('');
    } catch (error) {
        container.innerHTML = `<p>Failed to load servers: ${error.message}</p>`;
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
        container.innerHTML = commands.commands.map(cmd => {
            const enabled = data.commands[cmd.name] !== false; // Default to enabled
            return `
                <div class="command-item">
                    <div>
                        <div class="command-name">/${cmd.name}</div>
                        <div class="command-desc">${escapeHtml(cmd.description)}</div>
                    </div>
                    <label class="toggle">
                        <input type="checkbox" ${enabled ? 'checked' : ''}
                               onchange="toggleCommand('${cmd.name}', this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Failed to load guild:', error);
        alert('Failed to load server details');
    }
}

async function toggleCommand(commandName, enabled) {
    try {
        await apiRequest(`/api/guilds/${currentGuildId}/commands/${commandName}`, {
            method: 'PATCH',
            body: JSON.stringify({ enabled }),
        });
    } catch (error) {
        console.error('Failed to toggle command:', error);
        alert('Failed to update command');
        // Reload to reset state
        openGuild(currentGuildId);
    }
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
            container.innerHTML = '<p>No servers in allowlist.</p>';
            return;
        }

        container.innerHTML = allowedData.guilds.map(guildId => {
            const guild = guildMap.get(guildId);
            return `
                <div class="allowlist-item">
                    <div>
                        <div class="guild-id">${guildId}</div>
                        <div class="notes">${guild ? escapeHtml(guild.name) : 'Bot not in server'}</div>
                    </div>
                    <button class="btn btn-remove" onclick="removeFromAllowlist('${guildId}')">
                        Remove
                    </button>
                </div>
            `;
        }).join('');
    } catch (error) {
        container.innerHTML = `<p>Failed to load allowlist: ${error.message}</p>`;
    }
}

async function addGuildToAllowlist() {
    const guildIdInput = document.getElementById('add-guild-id');
    const notesInput = document.getElementById('add-guild-notes');

    const guildId = guildIdInput.value.trim();
    const notes = notesInput.value.trim();

    if (!guildId) {
        alert('Please enter a server ID');
        return;
    }

    try {
        await apiRequest('/api/guilds/allowed', {
            method: 'POST',
            body: JSON.stringify({ guildId, notes }),
        });

        guildIdInput.value = '';
        notesInput.value = '';
        loadAllowlist();
    } catch (error) {
        alert('Failed to add server: ' + error.message);
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
        loadAllowlist();
    } catch (error) {
        alert('Failed to remove server: ' + error.message);
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

        container.innerHTML = commandsData.commands.map(cmd => {
            const enabled = !disabledCommands.has(cmd.name);
            return `
                <div class="command-item ${!enabled ? 'disabled-globally' : ''}">
                    <div>
                        <div class="command-name">/${cmd.name}</div>
                        <div class="command-desc">${escapeHtml(cmd.description)}</div>
                    </div>
                    <label class="toggle">
                        <input type="checkbox" ${enabled ? 'checked' : ''}
                               onchange="toggleGlobalCommand('${cmd.name}', this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            `;
        }).join('');
    } catch (error) {
        container.innerHTML = `<p>Failed to load global commands: ${error.message}</p>`;
    }
}

async function toggleGlobalCommand(commandName, enabled) {
    try {
        await apiRequest(`/api/guilds/global/commands/${commandName}`, {
            method: 'PATCH',
            body: JSON.stringify({ enabled }),
        });

        // Visual feedback - update the item styling
        loadGlobalCommands();
    } catch (error) {
        console.error('Failed to toggle global command:', error);
        alert('Failed to update command');
        loadGlobalCommands();
    }
}

// Make global command functions available globally
window.toggleGlobalCommand = toggleGlobalCommand;

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
