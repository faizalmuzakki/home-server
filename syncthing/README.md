# Syncthing

Continuous file synchronization between devices.

## Features

- Peer-to-peer sync (no cloud required)
- End-to-end encryption
- Cross-platform (Windows, macOS, Linux, Android)
- Selective sync and ignore patterns
- Version history

## Setup

### 1. Create Sync Directory

```bash
sudo mkdir -p /data/sync
sudo chown -R 1000:1000 /data/sync
```

### 2. Configure Environment

```bash
cp .env.example .env
nano .env
```

### 3. Start Syncthing

```bash
docker compose up -d
```

### 4. Initial Configuration

1. Go to `http://YOUR_IP:8384`
2. Set GUI password in **Actions > Settings > GUI**
3. Note your **Device ID** (Actions > Show ID)

### 5. Connect Devices

On other devices:
1. Install Syncthing
2. Add remote device using your server's Device ID
3. Accept the connection on the server
4. Share folders between devices

## Ports

| Port | Protocol | Description |
|------|----------|-------------|
| 8384 | TCP | Web UI |
| 22000 | TCP/UDP | Sync protocol |
| 21027 | UDP | Local discovery |

## Adding Folders

1. Go to Web UI
2. Click **Add Folder**
3. Set folder path (inside `/var/syncthing/data`)
4. Select devices to share with
5. Configure sync settings

## Sync Patterns

Create `.stignore` file in any synced folder:

```
// Ignore patterns
.DS_Store
Thumbs.db
*.tmp
node_modules
.git
```

## Useful Commands

```bash
# View logs
docker compose logs -f syncthing

# Restart
docker compose restart syncthing

# Check sync status
curl http://localhost:8384/rest/system/status
```

## Mobile Apps

- **Android**: Syncthing (F-Droid or Play Store)
- **iOS**: Möbius Sync (third-party, paid)

## Security Notes

- Set a strong GUI password
- Consider restricting Web UI to local network
- Device IDs act as authentication
