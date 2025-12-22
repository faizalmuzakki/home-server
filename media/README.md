# Media Server Stack

Complete media server with Jellyfin and the *arr suite.

## Services

| Service | Port | Description |
|---------|------|-------------|
| **Jellyfin** | 8096 | Media streaming server |
| **Sonarr** | 8989 | TV show management |
| **Radarr** | 7878 | Movie management |
| **Prowlarr** | 9696 | Indexer manager |
| **qBittorrent** | 8081 | Torrent client |
| **Bazarr** | 6767 | Subtitle management |

## Architecture

```
┌─────────────┐     ┌─────────────┐
│  Prowlarr   │────▶│   Sonarr    │──┐
│  (Indexers) │     │   (TV)      │  │
└─────────────┘     └─────────────┘  │
       │            ┌─────────────┐  │    ┌─────────────┐
       └───────────▶│   Radarr    │──┼───▶│ qBittorrent │
                    │  (Movies)   │  │    │ (Downloads) │
                    └─────────────┘  │    └──────┬──────┘
                    ┌─────────────┐  │           │
                    │   Bazarr    │──┘           │
                    │ (Subtitles) │              │
                    └─────────────┘              │
                                                 ▼
                    ┌─────────────────────────────────┐
                    │           Jellyfin              │
                    │        (Media Server)           │
                    └─────────────────────────────────┘
```

## Setup

### 1. Create Media Directories

```bash
sudo mkdir -p /data/media/{movies,tv,music}
sudo mkdir -p /data/downloads/{complete,incomplete}
sudo chown -R 1000:1000 /data
```

### 2. Configure Environment

```bash
cp .env.example .env
nano .env
```

### 3. Start Services

```bash
docker compose up -d
```

### 4. Initial Configuration

#### Prowlarr (First)
1. Go to `http://YOUR_IP:9696`
2. Add indexers (torrent sites)
3. Add Sonarr/Radarr as apps

#### Sonarr
1. Go to `http://YOUR_IP:8989`
2. Settings > Media Management: Set root folder to `/media/tv`
3. Settings > Download Clients: Add qBittorrent
4. Settings > Indexers: Sync from Prowlarr

#### Radarr
1. Go to `http://YOUR_IP:7878`
2. Settings > Media Management: Set root folder to `/media/movies`
3. Settings > Download Clients: Add qBittorrent
4. Settings > Indexers: Sync from Prowlarr

#### qBittorrent
1. Go to `http://YOUR_IP:8081`
2. Default login: admin / adminadmin (change immediately!)
3. Settings > Downloads: Set paths

#### Jellyfin
1. Go to `http://YOUR_IP:8096`
2. Complete setup wizard
3. Add libraries pointing to `/media/movies`, `/media/tv`

#### Bazarr
1. Go to `http://YOUR_IP:6767`
2. Connect to Sonarr and Radarr
3. Configure subtitle providers

## Storage Layout

```
/data/
├── media/
│   ├── movies/
│   ├── tv/
│   └── music/
└── downloads/
    ├── complete/
    └── incomplete/
```

## Useful Commands

```bash
# View all logs
docker compose logs -f

# Restart specific service
docker compose restart jellyfin

# Update all images
docker compose pull
docker compose up -d
```

## Notes

- qBittorrent default password is `adminadmin` - change it immediately
- Configure VPN for qBittorrent if needed (add gluetun container)
- Storage will fill up fast - consider adding more drives later
