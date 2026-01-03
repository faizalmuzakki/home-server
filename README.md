# Home Server

Personal home server running on Docker.

## Prerequisites

### Recommended OS

**Ubuntu Server 24.04 LTS** (recommended) or Debian 12

### Server Setup

Run the setup script on a fresh server installation:

```bash
git clone git@github.com:faizalmuzakki/home-server.git
cd home-server
sudo ./scripts/setup-server.sh
```

This installs:
- Docker & Docker Compose
- Git, curl, wget, htop, vim, jq, tmux
- UFW firewall (configured)
- fail2ban (SSH protection)
- Automatic security updates

### Manual Prerequisites (if not using setup script)

```bash
# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Essential tools
sudo apt install -y git curl wget htop vim jq tmux
```

## Hardware

| Component | Spec |
|-----------|------|
| **CPU** | Intel Core i5 Gen 7 |
| **RAM** | 16GB |
| **Storage (OS)** | 128GB NVMe SSD |
| **Storage (Data)** | 240GB SATA SSD |

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          Mini PC (Bare Metal Linux)                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                   Docker                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                         Traefik (Reverse Proxy)                         │ │
│  │                    SSL termination, routing, load balancing             │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                       │
│    ┌─────────────┬─────────────┬─────┴─────┬─────────────┬─────────────┐    │
│    ▼             ▼             ▼           ▼             ▼             ▼    │
│ ┌───────┐  ┌──────────┐  ┌─────────┐  ┌────────┐  ┌──────────┐  ┌────────┐ │
│ │MongoDB│  │ Expense  │  │ Media   │  │  Home  │  │Vaultwarden│  │Syncthing│ │
│ │       │  │ Tracker  │  │ Stack   │  │Assistant│  │          │  │        │ │
│ └───────┘  └──────────┘  └─────────┘  └────────┘  └──────────┘  └────────┘ │
│                                                                              │
│ ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                     │
│ │  AdGuard Home │  │  Uptime Kuma  │  │    Dockge     │                     │
│ │  (DNS + Ads)  │  │  (Monitoring) │  │  (Container   │                     │
│ └───────────────┘  └───────────────┘  │   Management) │                     │
│                                       └───────────────┘                     │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Services

### Infrastructure

| Service | Port | Description | Directory |
|---------|------|-------------|-----------|
| [Homer](./homer/) | - | Home dashboard / landing page | `homer/` |
| [Traefik](./traefik/) | 80, 443 | Reverse proxy with auto SSL | `traefik/` |
| [Cloudflare Tunnel](./cloudflare-tunnel/) | - | Secure tunnel without port forwarding | `cloudflare-tunnel/` |
| [AdGuard Home](./adguard/) | 53, 3001 | Network-wide ad blocking & DNS | `adguard/` |
| [Uptime Kuma](./uptime-kuma/) | 3002 | Service monitoring & status page | `uptime-kuma/` |
| [Netdata](./netdata/) | - | Real-time server performance monitoring | `netdata/` |
| [Webhook](./webhook/) | - | GitHub CI/CD auto-deployment | `webhook/` |
| [Dockge](./dockge/) | 5001 | Docker Compose management UI | `dockge/` |
| [CrowdSec](./crowdsec/) | - | Community IDS & threat intelligence | `crowdsec/` |
| [Watchtower](./watchtower/) | - | Container update monitoring | `watchtower/` |

### Applications

| Service | Port | Description | Directory |
|---------|------|-------------|-----------|
| [MongoDB](./mongodb/) | 27017 | Database server | `mongodb/` |
| [Expense Tracker](./expense-tracker/) | 3000 | WhatsApp expense bot + API | `expense-tracker/` |
| [Vaultwarden](./vaultwarden/) | - | Bitwarden password manager | `vaultwarden/` |
| [2FAuth](./2fauth/) | - | Self-hosted TOTP authenticator | `2fauth/` |
| [Syncthing](./syncthing/) | 8384 | File synchronization | `syncthing/` |
| [Home Assistant](./homeassistant/) | 8123 | Home automation | `homeassistant/` |

### Media Stack

| Service | Port | Description | Directory |
|---------|------|-------------|-----------|
| [Jellyfin](./media/) | 8096 | Media streaming server | `media/` |
| [Sonarr](./media/) | 8989 | TV show management | `media/` |
| [Radarr](./media/) | 7878 | Movie management | `media/` |
| [Prowlarr](./media/) | 9696 | Indexer manager | `media/` |
| [qBittorrent](./media/) | 8081 | Torrent client | `media/` |
| [Bazarr](./media/) | 6767 | Subtitle management | `media/` |

## Storage Layout

```
128GB NVMe (OS Drive)
├── /                    # OS + Docker
└── /var/lib/docker      # Docker volumes

240GB SATA SSD (Data Drive) - Mount to /data
├── /data/media/
│   ├── movies/
│   ├── tv/
│   └── music/
├── /data/downloads/
│   ├── complete/
│   └── incomplete/
├── /data/sync/          # Syncthing
└── /data/backups/
```

## Data Persistence (Bind Mounts)

All services use **bind mounts** instead of Docker named volumes for data persistence. This means:

- ✅ **Direct file access** - Data is stored in visible directories you can browse
- ✅ **Easy backups** - Just copy the folders (rsync, rclone, etc.)
- ✅ **Survives Docker issues** - Data is independent of Docker's storage layer
- ✅ **Version controlled** - `.gitignore` excludes data, but structure is documented

### Data Locations by Service

| Service | Data Directory | Contents |
|---------|---------------|----------|
| **Vaultwarden** 🔐 | `vaultwarden/data/` | Password vault (CRITICAL) |
| **2FAuth** 🔐 | `2fauth/data/` | 2FA tokens (CRITICAL) |
| **MongoDB** | `mongodb/data/` | Database files |
| **Expense Tracker** | `expense-tracker/api/data/` | SQLite database |
| | `expense-tracker/whatsapp-bot/auth_info/` | WhatsApp session |
| **Home Assistant** | `homeassistant/homeassistant/` | HA config |
| | `homeassistant/mosquitto/` | MQTT broker |
| | `homeassistant/zigbee2mqtt/` | Zigbee config |
| **Media Stack** | `media/jellyfin/` | Jellyfin config + cache |
| | `media/sonarr/`, `media/radarr/` | *arr configs |
| | `media/prowlarr/`, `media/qbittorrent/` | Indexer + torrent |
| | `media/bazarr/` | Subtitles config |
| **AdGuard** | `adguard/work/`, `adguard/conf/` | DNS config + blocklists |
| **CrowdSec** | `crowdsec/data/`, `crowdsec/config/` | Security decisions |
| **Uptime Kuma** | `uptime-kuma/data/` | Monitors + history |
| **Dockge** | `dockge/data/` | UI settings |
| **Syncthing** | `syncthing/config/` | Sync config |
| **Traefik** | `traefik/logs/` | Access logs |
| **Netdata** | `netdata/config/`, `netdata/lib/` | Monitoring data |

### Migration from Named Volumes

If upgrading from an older setup using Docker named volumes:

```bash
# Run the migration script (copies data from containers to local dirs)
./migrate-volumes.sh

# Then restart services
for d in */; do (cd "$d" && docker compose down 2>/dev/null); done
for d in */; do (cd "$d" && docker compose up -d 2>/dev/null); done

# Optional: Clean up old volumes after verifying
docker volume prune
```

### Backup Strategy

```bash
# Simple backup - copy all service data
rsync -av --exclude='*.log' ~/Projects/home-server/ /data/backups/home-server/

# Critical data only (passwords + 2FA)
cp -r vaultwarden/data /data/backups/vaultwarden-$(date +%Y%m%d)
cp -r 2fauth/data /data/backups/2fauth-$(date +%Y%m%d)

# Database export (MongoDB)
docker exec mongodb mongodump --out /shared/backup
cp -r /data/shared/backup /data/backups/mongodb-$(date +%Y%m%d)
```

## Quick Start

### 1. Initial Setup

```bash
# Create data directories
sudo mkdir -p /data/{media/{movies,tv,music},downloads/{complete,incomplete},sync,backups,shared/{imports,exports}}
sudo chown -R 1000:1000 /data

# Create Traefik network (required by all services)
docker network create traefik-public
```

### Optional: Install Teleport Client

If you need to sync databases from work servers via Teleport:

```bash
sudo ./scripts/install-teleport.sh

# Login to your Teleport cluster
tsh login --proxy=teleport.yourcompany.com
```

### 2. Start Services (Recommended Order)

```bash
# 1. Traefik (reverse proxy) - FIRST
cd traefik && cp .env.example .env && nano .env
docker compose up -d

# 2. Core services
cd ../mongodb && cp .env.example .env && docker compose up -d
cd ../adguard && cp .env.example .env && docker compose up -d
cd ../uptime-kuma && cp .env.example .env && docker compose up -d
cd ../dockge && cp .env.example .env && docker compose up -d
cd ../cloudflare-tunnel && cp .env.example .env && nano .env && docker compose up -d

# 3. Applications
cd ../vaultwarden && cp .env.example .env && nano .env && docker compose up -d
cd ../syncthing && cp .env.example .env && docker compose up -d
cd ../homeassistant && cp .env.example .env && docker compose up -d

# 4. Expense Tracker (needs WhatsApp QR scan)
cd ../expense-tracker && cp .env.example .env && nano .env
docker compose up whatsapp-bot  # Scan QR, then Ctrl+C
docker compose up -d

# 5. Media stack
cd ../media && cp .env.example .env && nano .env && docker compose up -d
```

## Domain Setup (with Traefik)

If using a domain with Cloudflare:

| Subdomain | Service |
|-----------|---------|
| `traefik.domain.com` | Traefik Dashboard |
| `dockge.domain.com` | Dockge |
| `vault.domain.com` | Vaultwarden |
| `auth.domain.com` | 2FAuth |
| `apps.domain.com` | Homer Dashboard |
| `status.domain.com` | Uptime Kuma |
| `monitor.domain.com` | Netdata |
| `webhook.domain.com` | GitHub Webhook |
| `home.domain.com` | Home Assistant |
| `sync.domain.com` | Syncthing |
| `jellyfin.domain.com` | Jellyfin |
| `adguard.domain.com` | AdGuard Home |
| `sonarr.domain.com` | Sonarr |
| `radarr.domain.com` | Radarr |

## Maintenance

### View all containers
```bash
docker ps -a
```

### Check resource usage
```bash
docker stats
```

### Update all services
```bash
# In each service directory:
docker compose pull
docker compose up -d
```

### Backup script
```bash
#!/bin/bash
BACKUP_DIR="/data/backups/$(date +%Y%m%d)"
mkdir -p $BACKUP_DIR

# Backup Docker volumes
for vol in $(docker volume ls -q); do
  docker run --rm -v $vol:/data -v $BACKUP_DIR:/backup alpine \
    tar czf /backup/$vol.tar.gz /data
done
```

## Network Diagram

```
Internet
    │
    ▼
┌─────────────┐
│  Router     │ ◄── Set DNS to server IP for AdGuard
│ 192.168.x.1 │
└─────┬───────┘
      │
      ▼
┌─────────────────┐
│  Home Server    │
│  192.168.x.100  │
├─────────────────┤
│ :80/:443 Traefik│
│ :53     AdGuard │
│ :27017  MongoDB │
│ :3000   API     │
│ :8096   Jellyfin│
│ :8123   HA      │
│ :3002   Uptime  │
└─────────────────┘
```

## Security Checklist

### Initial Setup
- [ ] Change all default passwords
- [ ] Set up Vaultwarden admin token
- [ ] Disable signups after creating accounts (`SIGNUPS_ALLOWED=false`)
- [ ] Configure firewall (UFW) - auto-configured by setup script
- [ ] Set up regular backups
- [ ] Configure AdGuard as network DNS
- [ ] Enable 2FA on all services that support it
- [ ] Set up Cloudflare Tunnel for external access

### Implemented Security Features

| Feature | Status | Details |
|---------|--------|---------|
| **UFW Firewall** | ✅ | Deny-by-default with specific port allowances |
| **fail2ban** | ✅ | SSH protection (3 retries, 1h ban) |
| **Auto Security Updates** | ✅ | unattended-upgrades enabled |
| **HTTPS Only** | ✅ | HTTP → HTTPS redirect |
| **Security Headers** | ✅ | HSTS, XSS, Content-Type, Frame-Deny |
| **Rate Limiting** | ✅ | 100 req/s standard, 10 req/s for auth |
| **IP Whitelisting** | ✅ | Admin panels restricted to LAN only |
| **Container Security** | ✅ | no-new-privileges, read-only mounts |
| **MongoDB** | ✅ | Bound to localhost only |
| **Admin Panels** | ✅ | LAN-only access via Traefik middleware |
| **SSH Key-Only** | 🔧 | Run `scripts/harden-ssh.sh` to enable |
| **Encrypted Backups** | 🔧 | Run `scripts/backup-encrypted.sh` |
| **CrowdSec IDS** | 🔧 | Community threat intelligence (`crowdsec/`) |
| **Watchtower** | 🔧 | Container update monitoring (`watchtower/`) |

> 🔧 = Optional, run manually to enable

### Middleware Reference

| Middleware | Purpose | Use For |
|------------|---------|---------|
| `secure-defaults@file` | Headers + Rate limit + Compress | Default for all services |
| `admin-secure@file` | LAN-only + Headers + Strict rate limit | Admin panels, sensitive services |
| `lan-only@file` | IP whitelist for private networks | Custom configurations |
| `rate-limit-auth@file` | 10 req/s limit | Authentication endpoints |
| `cloudflare-lan@file` | Cloudflare IPs + LAN | Tunnel-accessed services |

## Guides

| Guide | Description |
|-------|-------------|
| [Cloudflare Tunnel Setup](./cloudflare-tunnel/README.md) | Securely expose services without port forwarding |

## Remote Access

### SSH via Cloudflare Tunnel

Access your home server from anywhere without port forwarding.

#### Client Setup (macOS)

```bash
# 1. Install cloudflared
brew install cloudflared

# 2. Add to ~/.ssh/config
cat >> ~/.ssh/config << 'EOF'
Host home-server
    HostName ssh.solork.dev
    User solork
    ProxyCommand cloudflared access ssh --hostname %h
EOF

# 3. Connect from anywhere
ssh home-server
```

#### Server Setup (One-time)

Add SSH hostname in [Cloudflare Zero Trust](https://one.dash.cloudflare.com/):
1. **Networks** → **Tunnels** → Your tunnel → **Public Hostname**
2. Add hostname:
   - **Subdomain**: `ssh`
   - **Domain**: `solork.dev`
   - **Type**: `SSH`
   - **URL**: `host.docker.internal:22`

#### Recommended: Add Cloudflare Access

Require email authentication before SSH access:
1. **Access** → **Applications** → **Add Application** → **Self-hosted**
2. **Name**: `SSH Access`, **Domain**: `ssh.solork.dev`
3. Add policy: Allow your email with One-time PIN

### Middleware Options

| Middleware | IP Restriction | Use For |
|------------|----------------|---------|
| `secure-defaults@file` | None (public) | Services with their own auth (Jellyfin, Vaultwarden) |
| `tunnel-secure@file` | Cloudflare + LAN | Remote access via tunnel |
| `cf-access-secure@file` | Cloudflare + LAN | Remote access + Cloudflare Access auth ⭐ |
| `admin-secure@file` | LAN only | Sensitive admin panels (Dockge, Netdata) |

To enable remote access for a service: change middleware from `admin-secure@file` to `tunnel-secure@file` or `cf-access-secure@file`.

## Scripts

| Script | Description |
|--------|-------------|
| `scripts/setup-server.sh` | Initial server setup (Docker, UFW, fail2ban) |
| `scripts/install-teleport.sh` | Install Teleport client for work DB access |
| `scripts/sync-atlas-db.sh` | Sync MongoDB Atlas database to local |
| `scripts/harden-ssh.sh` | Disable password auth, enforce SSH keys only |
| `scripts/backup-encrypted.sh` | Encrypted backups with age encryption |
| `migrate-volumes.sh` | Migrate from Docker named volumes to bind mounts |

### Sync Atlas Database

Sync a database from MongoDB Atlas to your local MongoDB:

```bash
# On home server (local or via SSH)
cd ~/Projects/home-server

# Set Atlas URI in mongodb/.env
# ATLAS_URI=mongodb+srv://user:pass@cluster.mongodb.net

# Run sync
./scripts/sync-atlas-db.sh <database_name>

# Example
./scripts/sync-atlas-db.sh myapp_production
```

Or remotely via SSH:
```bash
ssh home-server "cd ~/Projects/home-server && ./scripts/sync-atlas-db.sh myapp_production"
```
