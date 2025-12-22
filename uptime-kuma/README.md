# Uptime Kuma

Self-hosted monitoring tool for all your services.

## Features

- Monitor HTTP(s), TCP, DNS, Docker containers
- Beautiful status pages
- Notifications (Telegram, Discord, Slack, Email, etc.)
- Multi-user support
- 90-day history

## Setup

### 1. Configure Environment

```bash
cp .env.example .env
nano .env
```

### 2. Start Uptime Kuma

```bash
docker compose up -d
```

### 3. Initial Setup

1. Go to `http://YOUR_IP:3002`
2. Create admin account
3. Start adding monitors

## Monitor Types

| Type | Use Case |
|------|----------|
| **HTTP(s)** | Web services, APIs |
| **TCP Port** | Database, custom services |
| **Ping** | Network devices |
| **DNS** | DNS servers |
| **Docker** | Container health |
| **Push** | Cron jobs, scripts |

## Recommended Monitors

Add these for your home server:

| Service | Type | URL/Host |
|---------|------|----------|
| Traefik | HTTP | `http://traefik:8080/ping` |
| MongoDB | TCP | `mongodb:27017` |
| Expense API | HTTP | `http://expense-tracker-api:3000/health` |
| Jellyfin | HTTP | `http://jellyfin:8096/health` |
| AdGuard | HTTP | `http://adguard:80` |
| Vaultwarden | HTTP | `http://vaultwarden:80` |
| Home Assistant | HTTP | `http://homeassistant:8123` |
| Syncthing | HTTP | `http://syncthing:8384` |

## Notifications

### Telegram
1. Create bot via @BotFather
2. Get chat ID from @userinfobot
3. Add notification in Uptime Kuma

### Discord
1. Create webhook in Discord server
2. Add webhook URL in Uptime Kuma

### Email
Configure SMTP settings in notification setup.

## Status Page

Create a public status page:
1. Go to Status Pages
2. Create new page
3. Add monitors
4. Share the URL

## Docker Monitoring

The compose file mounts Docker socket for container monitoring.

To monitor a container:
1. Add Monitor > Docker Container
2. Select container from dropdown

## Useful Commands

```bash
# View logs
docker compose logs -f uptime-kuma

# Restart
docker compose restart uptime-kuma

# Backup
docker cp uptime-kuma:/app/data ./backup/uptime-kuma-$(date +%Y%m%d)
```

## API

Uptime Kuma has an API for automation:

```bash
# Get status (requires API key from settings)
curl -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3002/api/status-page/heartbeat/main
```
