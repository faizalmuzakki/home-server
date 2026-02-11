# Palu Gada Bot

A multi-purpose Discord bot - "apa lu mau, gua ada" (whatever you need, I got it).

## Features

### Music
- Play music from YouTube URLs and search queries
- Play music from Spotify tracks, playlists, and albums
- Queue management with shuffle and loop functionality
- Auto-leave after inactivity
- Custom playlist saving and loading
- Lyrics lookup
- Volume control and seeking

### Utility
- AI-powered chat summarization using Claude 3.5 Haiku
- Urban Dictionary lookups
- Weather information
- QR code generation
- URL shortening
- Math expression evaluation
- Dictionary definitions
- Emoji information

### Productivity
- Reminders with DM/channel notifications
- Personal todo lists
- Note-taking system
- AFK status with auto-notifications

### Moderation
- Warning system for users
- Slowmode management
- Channel/server lockdown
- Server audit logging

### Server Management
- Welcome messages for new members
- Auto-role assignment
- Command enable/disable per server
- Global command toggles

### Economy & Leveling
- XP-based leveling system
- Earn XP from messages (15-25 XP per message, 1 min cooldown)
- Earn XP from voice channels (5-10 XP per 5 minutes, requires 2+ people)
- Server leaderboards
- Virtual currency (wallet/bank)
- Daily rewards
- Balance transfers

### Fun & Social
- Birthday tracking and announcements
- Starboard for highlighted messages
- Giveaway system with button entries
- Anonymous confessions

## Commands

### Music Commands
| Command | Description |
|---------|-------------|
| `/play <query>` | Play a song from YouTube/Spotify URL or search query |
| `/skip` | Skip the current song |
| `/stop` | Stop playing and clear the queue |
| `/pause` | Pause the current song |
| `/resume` | Resume the paused song |
| `/queue [page]` | Show the current music queue |
| `/nowplaying` | Show the currently playing song |
| `/shuffle` | Shuffle the queue |
| `/loop` | Toggle loop mode for the current song |
| `/clear` | Clear the music queue |
| `/leave` | Make the bot leave the voice channel |
| `/lyrics [title]` | Get lyrics for current or specified song |
| `/seek <position>` | Seek to a position in the current song |
| `/volume [level]` | View or set playback volume (0-200%) |
| `/playlist <subcommand>` | Manage custom playlists (create/save/load/delete/list/view) |

### Utility Commands
| Command | Description |
|---------|-------------|
| `/urban <term>` | Look up a word on Urban Dictionary |
| `/summarize [hours] [channel]` | Summarize chat history using Claude AI |
| `/answer [hours]` | Reply to a question, AI answers on your behalf based on your conversation style |
| `/weather <location>` | Get weather information for a location |
| `/qrcode <text>` | Generate a QR code |
| `/shorten <url>` | Shorten a URL using is.gd |
| `/math <expression>` | Evaluate a math expression |
| `/define <word>` | Get dictionary definition of a word |
| `/emoji <emoji>` | Get information about an emoji |

### Productivity Commands
| Command | Description |
|---------|-------------|
| `/remind <time> <message>` | Set a reminder |
| `/reminders` | View your pending reminders |
| `/todo <subcommand>` | Manage your todo list (add/list/complete/delete/clear) |
| `/note <subcommand>` | Manage your notes (add/list/view/edit/delete) |
| `/afk [message]` | Set your AFK status |

### Moderation Commands
| Command | Description |
|---------|-------------|
| `/warn <user> <reason>` | Warn a user |
| `/warnings <user>` | View warnings for a user |
| `/clearwarnings <user>` | Clear all warnings for a user |
| `/slowmode <duration>` | Set channel slowmode (0s, 5s, 10s, 30s, 1m, 5m, 10m, 1h) |
| `/lockdown <action>` | Lock or unlock a channel/server |
| `/logs <subcommand>` | Configure server logging |

### Server Management Commands
| Command | Description |
|---------|-------------|
| `/welcomer <subcommand>` | Configure welcome messages (setup/message/toggle/status) |
| `/autorole <subcommand>` | Configure auto-role (setup/toggle/status) |
| `/toggle <command> <enabled>` | Enable/disable a command in this server |

### Economy & Leveling Commands
| Command | Description |
|---------|-------------|
| `/level [user]` | View your or another user's level |
| `/leaderboard [type]` | View server levels or global economy rankings |
| `/daily` | Claim your daily coins |
| `/balance [subcommand]` | View/manage your balance (view/deposit/withdraw/transfer) |

### Fun & Social Commands
| Command | Description |
|---------|-------------|
| `/birthday <subcommand>` | Manage birthdays (set/view/remove/upcoming/today) |
| `/starboard <subcommand>` | Configure starboard (setup/threshold/toggle/status) |
| `/giveaway <subcommand>` | Manage giveaways (start/end/reroll/list) |
| `/confession send <message>` | Send an anonymous confession |
| `/confession setup <channel>` | Set up confession channel (admin) |

## Prerequisites

- Node.js 18.0.0 or higher
- FFmpeg installed on your system
- A Discord bot token
- Anthropic API key (for /summarize command)

## Installation

1. Clone the repository and navigate to the bot folder:
   ```bash
   cd palu-gada-bot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Install FFmpeg (if not already installed):
   ```bash
   # Ubuntu/Debian
   sudo apt install ffmpeg

   # macOS
   brew install ffmpeg

   # Windows - Download from https://ffmpeg.org/download.html
   ```

4. Create a `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```

5. Edit `.env` and add your credentials:
   ```env
   DISCORD_TOKEN=your_discord_bot_token
   CLIENT_ID=your_client_id
   GUILD_ID=your_guild_id  # Optional, for testing
   OWNER_ID=your_discord_user_id  # Your Discord ID
   ANTHROPIC_API_KEY=your_anthropic_api_key  # For /summarize
   ```

## Configuration

### Guild Access Control

You can restrict the bot to only work in specific servers:

```env
# In .env file

# Mode: 'open' (default) or 'allowlist'
GUILD_MODE=allowlist

# Comma-separated list of allowed guild IDs
ALLOWED_GUILDS=123456789012345678,987654321098765432
```

| Mode | Behavior |
|------|----------|
| `open` | Bot works in any server (default) |
| `allowlist` | Bot only works in servers listed in `ALLOWED_GUILDS` or database |

When in allowlist mode:
- Bot auto-leaves unauthorized servers
- Commands return an error in unauthorized servers
- Allowed guilds can be managed via database

### Database

The bot uses SQLite for persistent storage. Data is stored in `data/bot.db`.

**Tables:**
- `guild_settings` - Per-server configuration (welcome, autorole, starboard, etc.)
- `allowed_guilds` - Allowlist for guild access control
- `bot_config` - Key-value store for bot settings
- `user_preferences` - Per-user settings
- `guild_commands` - Enable/disable commands per server
- `global_commands` - Global command toggles
- `reminders` - User reminders
- `warnings` - Moderation warnings
- `user_todos` - Personal todo lists
- `user_notes` - Personal notes
- `afk_status` - AFK statuses
- `user_economy` - Virtual currency balances
- `user_levels` - XP and levels per server
- `user_playlists` - Custom music playlists
- `birthdays` - User birthdays per server
- `starboard_messages` - Starred messages
- `giveaways` - Active giveaways
- `giveaway_entries` - Giveaway participants
- `confessions` - Anonymous confessions

## Admin Panel

The bot includes a web-based admin panel for managing servers and commands.

### Features

- Discord OAuth2 login
- View bot statistics (servers, users, uptime, memory)
- Manage server allowlist (owner only)
- Enable/disable commands per server
- View all servers the bot is in

### Architecture

```
┌─────────────────────┐      ┌──────────────────────┐
│  Cloudflare Pages   │      │   Docker Container   │
│  (admin-panel/)     │─────▶│  ┌────────────────┐  │
│                     │ API  │  │  Express API   │  │
│  Static frontend    │      │  │  :3000         │  │
└─────────────────────┘      │  └────────────────┘  │
                             │  ┌────────────────┐  │
                             │  │  Discord Bot   │  │
                             │  └────────────────┘  │
                             └──────────────────────┘
```

### Setup

1. **Get Discord OAuth2 credentials:**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Select your application → OAuth2
   - Copy the **Client Secret**
   - Add a redirect URI: `https://your-admin-panel.pages.dev/callback`

2. **Configure environment variables:**
   ```env
   CLIENT_SECRET=your_client_secret
   OWNER_ID=your_discord_user_id
   JWT_SECRET=generate_a_random_string
   OAUTH_REDIRECT_URI=https://your-admin-panel.pages.dev/callback
   ADMIN_PANEL_URL=https://your-admin-panel.pages.dev
   ```

3. **Deploy admin panel to Cloudflare Pages via Wrangler CLI:**

   First, install Wrangler globally (if not already installed):
   ```bash
   npm install -g wrangler
   ```

   Login to your Cloudflare account:
   ```bash
   wrangler login
   ```
   This opens a browser window for authentication.

   Navigate to the admin panel directory:
   ```bash
   cd admin-panel
   ```

   **Option A: First-time deployment (creates new project)**
   ```bash
   wrangler pages project create palu-gada-admin
   ```

   Then deploy:
   ```bash
   wrangler pages deploy . --project-name=palu-gada-admin
   ```

   **Option B: Quick deploy (auto-creates project if needed)**
   ```bash
   wrangler pages deploy . --project-name=palu-gada-admin
   ```

   After deployment, Wrangler will output your URL:
   ```
   ✨ Deployment complete! Take a peek over at https://palu-gada-admin.pages.dev
   ```

   **Updating the deployment:**
   ```bash
   # From admin-panel directory, just run deploy again
   wrangler pages deploy . --project-name=palu-gada-admin
   ```

   **Useful Wrangler commands:**
   ```bash
   # List all your Pages projects
   wrangler pages project list

   # View deployment history
   wrangler pages deployment list --project-name=palu-gada-admin

   # Delete a project (careful!)
   wrangler pages project delete palu-gada-admin
   ```

4. **Update the API URL in the frontend:**
   - Open `admin-panel/app.js`
   - Or visit `https://your-panel.pages.dev#config` to set it

### Local Development

```bash
# Start the bot (includes API server)
npm start

# Serve admin panel locally (use any static server)
cd admin-panel
npx serve .
# or
python -m http.server 5173
```

## Getting Discord Bot Credentials

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to the "Bot" section and click "Add Bot"
4. Copy the **Token** (this is your `DISCORD_TOKEN`)
5. Go to "OAuth2" > "General" and copy the **Client ID**
6. Enable these **Privileged Gateway Intents** in the Bot section:
   - Message Content Intent
   - Server Members Intent (required for welcomer, autorole, leveling)
   - Presence Intent (optional)

## Inviting the Bot to Your Server

1. Go to "OAuth2" > "URL Generator" in the Developer Portal
2. Select these scopes:
   - `bot`
   - `applications.commands`
3. Select these bot permissions:
   - Connect
   - Speak
   - Send Messages
   - Embed Links
   - Use Slash Commands
   - Read Message History
   - Manage Messages (for slowmode/lockdown)
   - Manage Roles (for autorole)
   - Add Reactions (for starboard)
4. Copy the generated URL and open it in your browser
5. Select your server and authorize the bot

## Usage

1. Deploy slash commands (run once, or after adding new commands):
   ```bash
   npm run deploy
   ```

2. Start the bot:
   ```bash
   npm start
   ```

3. For development with auto-reload:
   ```bash
   npm run dev
   ```

## Home Server Integration

This bot is integrated into the home-server infrastructure at **port 3003** (changed from default 3000 to avoid conflict with expense-tracker).

### Quick Start (Home Server)

```bash
cd ~/Projects/home-server/palu-gada-bot

# 1. Configure environment
cp .env.example .env
nano .env  # Add Discord tokens and set DOMAIN

# 2. Create data directories
mkdir -p data logs && chmod 777 data logs

# 3. Deploy Discord commands (required once)
docker compose run --rm palu-gada-bot node src/deploy-commands.js

# 4. Start the bot
docker compose up -d

# 5. Verify
docker compose logs -f
curl http://localhost:3003/health
```

### Access Points
- **Local API**: `http://localhost:3003`
- **Traefik domain**: `https://bot-api.${DOMAIN}`
- **Port**: 3003 (localhost only)

### Integration Features
- Connected to `traefik-public` network
- Security hardening: `no-new-privileges`, `cap_drop: ALL`
- Resource limits: 512MB RAM, 1.0 CPU
- Healthcheck endpoint enabled
- Data persistence: `./data/` (SQLite), `./logs/` (logs)

### Maintenance

```bash
# Restart bot
docker compose restart

# Update bot
docker compose pull && docker compose up -d --build

# View logs
docker compose logs -f

# Backup data
cp -r data /data/backups/palu-gada-bot-$(date +%Y%m%d)
```

## Docker Deployment (Standalone)

### Prerequisites
- Docker and Docker Compose installed

### Quick Start with Docker

1. Create your `.env` file:
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

2. Create the data directory with proper permissions (required for SQLite database):
   ```bash
   mkdir -p data logs && chmod 777 data logs
   ```

3. Deploy slash commands (required once):
   ```bash
   docker compose run --rm palu-gada-bot node src/deploy-commands.js
   ```

4. Start the bot:
   ```bash
   docker compose up -d
   ```

### Docker Commands

```bash
# Start the bot (detached)
docker compose up -d

# View logs
docker compose logs -f

# Stop the bot
docker compose down

# Rebuild after code changes
docker compose up -d --build

# Restart the bot
docker compose restart
```

### Running on Raspberry Pi / Mini PC

The Docker image works on ARM64 and x86:

```bash
# Clone and setup
git clone <your-repo>
cd palu-gada-bot
cp .env.example .env
nano .env  # Add your tokens

# Deploy commands and start
docker compose run --rm palu-gada-bot node src/deploy-commands.js
docker compose up -d
```

## Supported Formats

### YouTube
- Single video URLs: `https://youtube.com/watch?v=...`
- Short URLs: `https://youtu.be/...`
- Playlist URLs: `https://youtube.com/playlist?list=...`
- Search queries: Any text that isn't a URL

### Spotify
- Track URLs: `https://open.spotify.com/track/...`
- Playlist URLs: `https://open.spotify.com/playlist/...`
- Album URLs: `https://open.spotify.com/album/...`

Note: Spotify tracks are played by searching for them on YouTube, so audio quality and availability may vary.

## Troubleshooting

### Bot doesn't respond to commands
- Make sure you've deployed the commands using `npm run deploy`
- For global commands, wait up to 1 hour for them to propagate
- For instant testing, set `GUILD_ID` in your `.env` file

### Audio not playing
- Make sure FFmpeg is installed and accessible in PATH
- Check that the bot has permissions to Connect and Speak in the voice channel

### "Could not find track" errors
- Some region-restricted or age-restricted videos may not work
- Spotify tracks that aren't available on YouTube will fail

### Leveling not working
- Make sure the Server Members Intent is enabled in Discord Developer Portal
- Verify the bot has permission to read messages in the channels

### Welcome messages not sending
- Ensure the Server Members Intent is enabled
- Check that the bot has permission to send messages in the welcome channel

## License

MIT
