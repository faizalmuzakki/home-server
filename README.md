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

- [ ] Change all default passwords
- [ ] Set up Vaultwarden admin token
- [ ] Disable signups after creating accounts
- [ ] Configure firewall (UFW)
- [ ] Set up regular backups
- [ ] Configure AdGuard as network DNS
- [ ] Enable 2FA where available
- [ ] Set up Cloudflare Tunnel for external access

## Guides

| Guide | Description |
|-------|-------------|
| [Cloudflare Tunnel Setup](./cloudflare-tunnel/README.md) | Securely expose services without port forwarding |
