# Cloudflare Tunnel Setup Guide

This guide covers setting up Cloudflare Tunnel (formerly Argo Tunnel) to securely expose your home server services to the internet without opening ports on your router.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Installing cloudflared](#installing-cloudflared)
- [Creating a Tunnel](#creating-a-tunnel)
- [Configuring the Tunnel](#configuring-the-tunnel)
- [Setting Up DNS Records](#setting-up-dns-records)
- [Integration with Docker Services](#integration-with-docker-services)
- [Running as a Service](#running-as-a-service)
- [Troubleshooting](#troubleshooting)

---

## Overview

### What is Cloudflare Tunnel?

Cloudflare Tunnel creates a secure, outbound-only connection between your server and Cloudflare's edge network. This means:

- **No open ports**: Your router doesn't need port forwarding
- **No exposed IP**: Your home IP address stays hidden
- **Built-in DDoS protection**: Cloudflare's security applies automatically
- **Zero Trust ready**: Integrate with Cloudflare Access for authentication

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Your Home Server                                │
│                                                                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────────┐ │
│  │  Jellyfin   │    │ Vaultwarden │    │     Other Services...      │ │
│  │  :8096      │    │    :80      │    │                             │ │
│  └──────┬──────┘    └──────┬──────┘    └─────────────┬───────────────┘ │
│         │                  │                         │                  │
│         └──────────────────┼─────────────────────────┘                  │
│                            │                                             │
│                    ┌───────▼───────┐                                    │
│                    │  cloudflared  │  (outbound connection only)        │
│                    │   container   │                                    │
│                    └───────┬───────┘                                    │
│                            │                                             │
└────────────────────────────┼────────────────────────────────────────────┘
                             │
                             ▼ Encrypted tunnel (no inbound ports needed)
                    ┌─────────────────┐
                    │   Cloudflare    │
                    │   Edge Network  │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │    Internet     │
                    │   (Users)       │
                    └─────────────────┘
```

### Cloudflare Tunnel vs Traefik

Your current setup uses **Traefik** as a reverse proxy with Cloudflare DNS for SSL certificates. Here's when to use each:

| Feature | Traefik (Current) | Cloudflare Tunnel |
|---------|-------------------|-------------------|
| Port forwarding required | Yes (80, 443) | No |
| IP address exposure | Yes (can proxy via CF) | No |
| SSL certificates | Let's Encrypt via CF DNS | Cloudflare handles it |
| Local network access | Works | Requires separate config |
| Latency | Direct connection | Slight overhead |
| Best for | Static IP, full control | Dynamic IP, max security |

**Recommendation**: You can use both! Traefik for local network routing, and Cloudflare Tunnel for external access without port forwarding.

---

## Prerequisites

Before starting, ensure you have:

- [ ] A Cloudflare account (free tier works)
- [ ] A domain added to Cloudflare (DNS managed by Cloudflare)
- [ ] Docker and Docker Compose installed
- [ ] Access to your home server terminal

### Cloudflare Account Setup

1. Create a Cloudflare account at https://dash.cloudflare.com/sign-up
2. Add your domain to Cloudflare
3. Update your domain's nameservers to Cloudflare's (provided during setup)
4. Wait for DNS propagation (usually 5-10 minutes, can take up to 24 hours)

---

## Installing cloudflared

### Option 1: Docker (Recommended)

No installation needed! We'll run cloudflared as a Docker container. Skip to [Creating a Tunnel](#creating-a-tunnel).

### Option 2: Native Installation (Debian/Ubuntu)

```bash
# Add Cloudflare's GPG key
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null

# Add the repository
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list

# Install cloudflared
sudo apt update
sudo apt install cloudflared

# Verify installation
cloudflared --version
```

### Option 3: Download Binary Directly

```bash
# Download the latest release
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared

# Make executable and move to PATH
chmod +x cloudflared
sudo mv cloudflared /usr/local/bin/

# Verify installation
cloudflared --version
```

---

## Creating a Tunnel

### Method 1: Cloudflare Dashboard (Recommended for Beginners)

1. Go to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. Navigate to **Networks** → **Tunnels**
3. Click **Create a tunnel**
4. Select **Cloudflared** as the connector
5. Name your tunnel (e.g., `home-server`)
6. Click **Save tunnel**
7. **Copy the tunnel token** - you'll need this for configuration

The token looks like:
```
eyJhIjoiNzM0MjE1NjM0MjE1NjM0MjE1NjM0MjE1NjM0MjE1NjM0IiwidCI6IjEyMzQ1Njc4LTEyMzQtMTIzNC0xMjM0LTEyMzQ1Njc4OTBhYiIsInMiOiJNeVR1bm5lbFNlY3JldCJ9
```

### Method 2: CLI Authentication

```bash
# Login to Cloudflare (opens browser)
cloudflared tunnel login

# Create a new tunnel
cloudflared tunnel create home-server

# This creates credentials at ~/.cloudflared/<TUNNEL_ID>.json
# Note the Tunnel ID displayed

# List tunnels to verify
cloudflared tunnel list
```

---

## Configuring the Tunnel

### Understanding Tunnel Configuration

A tunnel configuration defines:
- Which services to expose
- What hostnames map to which internal services
- Access policies and security settings

### Configuration File Structure

Create the configuration file:

```bash
mkdir -p ~/.cloudflared
```

Create `~/.cloudflared/config.yml`:

```yaml
# Tunnel UUID (from 'cloudflared tunnel create' or dashboard)
tunnel: <TUNNEL_ID>

# Path to credentials file (only needed for CLI-created tunnels)
credentials-file: /home/<username>/.cloudflared/<TUNNEL_ID>.json

# Ingress rules - map hostnames to services
ingress:
  # Jellyfin - Media streaming
  - hostname: jellyfin.example.com
    service: http://localhost:8096

  # Vaultwarden - Password manager
  - hostname: vault.example.com
    service: http://localhost:80

  # Home Assistant - Home automation
  - hostname: home.example.com
    service: http://localhost:8123

  # Syncthing - File sync (web UI)
  - hostname: sync.example.com
    service: http://localhost:8384

  # Uptime Kuma - Monitoring
  - hostname: status.example.com
    service: http://localhost:3002

  # Sonarr - TV management
  - hostname: sonarr.example.com
    service: http://localhost:8989

  # Radarr - Movie management
  - hostname: radarr.example.com
    service: http://localhost:7878

  # Prowlarr - Indexer manager
  - hostname: prowlarr.example.com
    service: http://localhost:9696

  # qBittorrent - Torrent client
  - hostname: qbit.example.com
    service: http://localhost:8081

  # Catch-all rule (required - must be last)
  - service: http_status:404
```

### Advanced Configuration Options

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /path/to/credentials.json

# Global options
originRequest:
  # Connection timeout
  connectTimeout: 30s
  # Keep connections alive
  noTLSVerify: false
  # HTTP/2 support
  http2Origin: true

ingress:
  # Service with custom settings
  - hostname: jellyfin.example.com
    service: http://localhost:8096
    originRequest:
      # Allow large media uploads
      httpHostHeader: jellyfin.example.com
      # Increase timeout for streaming
      connectTimeout: 60s

  # WebSocket support (for Home Assistant, Vaultwarden, etc.)
  - hostname: home.example.com
    service: http://localhost:8123
    originRequest:
      # Required for WebSocket connections
      noTLSVerify: false

  # SSH access (optional)
  - hostname: ssh.example.com
    service: ssh://localhost:22

  # Required catch-all
  - service: http_status:404
```

---

## Setting Up DNS Records

### Automatic DNS (Recommended)

When using the Cloudflare Dashboard to create tunnels, DNS records are created automatically when you add a public hostname.

### Manual DNS Setup

For each service, create a CNAME record pointing to your tunnel:

1. Go to Cloudflare Dashboard → Your Domain → DNS
2. Add a CNAME record:
   - **Name**: `jellyfin` (or subdomain of your choice)
   - **Target**: `<TUNNEL_ID>.cfargotunnel.com`
   - **Proxy status**: Proxied (orange cloud)

Example DNS records:
```
jellyfin    CNAME   abc123-def456-ghi789.cfargotunnel.com
vault       CNAME   abc123-def456-ghi789.cfargotunnel.com
home        CNAME   abc123-def456-ghi789.cfargotunnel.com
status      CNAME   abc123-def456-ghi789.cfargotunnel.com
```

### Using cloudflared CLI for DNS

```bash
# Route DNS to your tunnel
cloudflared tunnel route dns home-server jellyfin.example.com
cloudflared tunnel route dns home-server vault.example.com
cloudflared tunnel route dns home-server home.example.com
```

---

## Integration with Docker Services

### Option 1: Standalone Cloudflared Container (Recommended)

This approach runs cloudflared as a separate container that connects to your existing services.

Create `cloudflare-tunnel/docker-compose.yml`:

```yaml
version: "3.8"

services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared
    restart: unless-stopped
    command: tunnel run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    networks:
      - traefik-public
      - media-network
      - homeassistant-network

networks:
  traefik-public:
    external: true
  media-network:
    external: true
  homeassistant-network:
    external: true
```

Create `cloudflare-tunnel/.env`:
```bash
# Get this from Cloudflare Zero Trust Dashboard
CLOUDFLARE_TUNNEL_TOKEN=your-tunnel-token-here
```

Create `cloudflare-tunnel/.env.example`:
```bash
# Cloudflare Tunnel Token
# Get this from: https://one.dash.cloudflare.com/ → Networks → Tunnels → Your Tunnel
CLOUDFLARE_TUNNEL_TOKEN=
```

### Option 2: Configuration File with Docker

If using a config file instead of token:

```yaml
version: "3.8"

services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared
    restart: unless-stopped
    command: tunnel --config /etc/cloudflared/config.yml run
    volumes:
      - ./config.yml:/etc/cloudflared/config.yml:ro
      - ./credentials.json:/etc/cloudflared/credentials.json:ro
    networks:
      - traefik-public
      - media-network
      - homeassistant-network

networks:
  traefik-public:
    external: true
  media-network:
    external: true
  homeassistant-network:
    external: true
```

### Connecting to Docker Services

When cloudflared runs in Docker, use **container names** instead of `localhost`:

```yaml
# In Cloudflare Dashboard or config.yml
ingress:
  - hostname: jellyfin.example.com
    service: http://jellyfin:8096  # Container name, internal port

  - hostname: vault.example.com
    service: http://vaultwarden:80

  - hostname: home.example.com
    service: http://homeassistant:8123

  - hostname: status.example.com
    service: http://uptime-kuma:3001  # Internal port, not mapped port

  - service: http_status:404
```

### Network Requirements

The cloudflared container must be on the same Docker network as the services it proxies:

```yaml
# Ensure cloudflared is on all required networks
networks:
  - traefik-public      # For Vaultwarden, Syncthing, AdGuard, Uptime Kuma
  - media-network       # For Jellyfin, Sonarr, Radarr, etc.
  - homeassistant-network  # For Home Assistant, MQTT, Zigbee2MQTT
```

### Complete Example: cloudflare-tunnel/docker-compose.yml

```yaml
version: "3.8"

services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared
    restart: unless-stopped
    command: tunnel run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    networks:
      - traefik-public
      - media-network
      - homeassistant-network
    # Health check
    healthcheck:
      test: ["CMD", "cloudflared", "tunnel", "info"]
      interval: 30s
      timeout: 10s
      retries: 3
    # Resource limits (optional)
    deploy:
      resources:
        limits:
          memory: 256M
        reservations:
          memory: 64M

networks:
  traefik-public:
    external: true
  media-network:
    external: true
  homeassistant-network:
    external: true
```

---

## Running as a Service

### Option 1: Docker Compose (Recommended)

Start the tunnel:
```bash
cd ~/home-server/cloudflare-tunnel
docker compose up -d
```

View logs:
```bash
docker compose logs -f cloudflared
```

Stop the tunnel:
```bash
docker compose down
```

### Option 2: Systemd Service (Native Installation)

Install as a system service:

```bash
# Install the service (uses ~/.cloudflared/config.yml)
sudo cloudflared service install

# Or with a specific token
sudo cloudflared service install <TUNNEL_TOKEN>
```

Manual systemd setup:

Create `/etc/systemd/system/cloudflared.service`:

```ini
[Unit]
Description=Cloudflare Tunnel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=cloudflared
Group=cloudflared
ExecStart=/usr/local/bin/cloudflared tunnel --config /etc/cloudflared/config.yml run
Restart=on-failure
RestartSec=5
TimeoutStartSec=0

# Security hardening
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/var/log/cloudflared
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
# Create cloudflared user
sudo useradd -r -s /bin/false cloudflared

# Create directories
sudo mkdir -p /etc/cloudflared /var/log/cloudflared
sudo chown cloudflared:cloudflared /var/log/cloudflared

# Copy configuration
sudo cp ~/.cloudflared/config.yml /etc/cloudflared/
sudo cp ~/.cloudflared/<TUNNEL_ID>.json /etc/cloudflared/credentials.json
sudo chown -R cloudflared:cloudflared /etc/cloudflared
sudo chmod 600 /etc/cloudflared/credentials.json

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable cloudflared
sudo systemctl start cloudflared

# Check status
sudo systemctl status cloudflared
```

### Option 3: Using with Existing Service (Expense Tracker Example)

Your expense-tracker already demonstrates embedding cloudflared in a service stack:

```yaml
# From expense-tracker/docker-compose.yml
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: expense-cloudflared
    restart: unless-stopped
    command: tunnel run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    networks:
      - expense-network
    depends_on:
      - api
```

This pattern works well when you want a dedicated tunnel per application.

---

## Security Best Practices

### 1. Use Cloudflare Access

Add authentication to your services via Cloudflare Zero Trust:

1. Go to Zero Trust Dashboard → Access → Applications
2. Click "Add an application" → Self-hosted
3. Configure:
   - **Application name**: Jellyfin
   - **Session duration**: 24 hours
   - **Application domain**: jellyfin.example.com
4. Add policies:
   - Allow specific emails
   - Require authentication via Google, GitHub, etc.

### 2. Service-Specific Security

```yaml
# In Cloudflare Dashboard, configure per-service settings:

# Vaultwarden - Require strong authentication
- hostname: vault.example.com
  access:
    required: true
    teamName: your-team
    policies:
      - name: Allow Admins
        decision: allow
        include:
          - email: admin@example.com

# Jellyfin - Allow authenticated users
- hostname: jellyfin.example.com
  access:
    required: true
    policies:
      - name: Family Access
        decision: allow
        include:
          - emailDomain: example.com
```

### 3. Private Network Access

For sensitive services (like Sonarr, Radarr), consider not exposing them publicly and using Cloudflare WARP client instead:

```yaml
# Only expose essential services
ingress:
  - hostname: jellyfin.example.com
    service: http://jellyfin:8096

  - hostname: vault.example.com
    service: http://vaultwarden:80

  # Don't expose media management tools publicly
  # Access them via WARP or local network only

  - service: http_status:404
```

---

## Troubleshooting

### Check Tunnel Status

```bash
# Docker
docker logs cloudflared

# Native
sudo systemctl status cloudflared
journalctl -u cloudflared -f
```

### Common Issues

#### 1. "failed to connect to origin" Error

**Cause**: cloudflared can't reach the target service.

**Solutions**:
- Ensure the service is running: `docker ps`
- Check network connectivity: `docker exec cloudflared ping jellyfin`
- Verify port numbers match container's internal port
- Ensure cloudflared is on the correct Docker network

#### 2. "tunnel credentials file not found"

**Cause**: Missing or incorrect credentials path.

**Solutions**:
- For token-based: Ensure `TUNNEL_TOKEN` is set correctly
- For config-based: Verify `credentials-file` path in config.yml
- Check file permissions: `chmod 600 credentials.json`

#### 3. DNS Not Resolving

**Cause**: CNAME record not configured or not propagated.

**Solutions**:
- Verify DNS record in Cloudflare Dashboard
- Check propagation: `dig jellyfin.example.com`
- Ensure record is proxied (orange cloud)

#### 4. WebSocket Connection Failed

**Cause**: WebSocket upgrade not working.

**Solutions for Home Assistant, Vaultwarden**:
```yaml
# Ensure WebSocket support in Cloudflare Dashboard
# Under tunnel settings, enable HTTP/2 origin connection
```

#### 5. SSL Certificate Errors

**Cause**: Origin certificate issues.

**Solutions**:
```yaml
ingress:
  - hostname: example.com
    service: https://localhost:443
    originRequest:
      noTLSVerify: true  # Only if using self-signed certs
```

### Testing the Tunnel

```bash
# Test from outside your network (use mobile data or VPN)
curl -I https://jellyfin.example.com

# Test tunnel connectivity
docker exec cloudflared cloudflared tunnel info

# List active connections
docker exec cloudflared cloudflared tunnel list
```

### Logs Location

- **Docker**: `docker logs cloudflared`
- **Systemd**: `/var/log/cloudflared/` or `journalctl -u cloudflared`

---

## Quick Start Summary

1. **Create tunnel** in Cloudflare Zero Trust Dashboard
2. **Copy the token** from the tunnel configuration
3. **Create docker-compose.yml**:
   ```yaml
   version: "3.8"
   services:
     cloudflared:
       image: cloudflare/cloudflared:latest
       container_name: cloudflared
       restart: unless-stopped
       command: tunnel run
       environment:
         - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
       networks:
         - traefik-public
         - media-network
   networks:
     traefik-public:
       external: true
     media-network:
       external: true
   ```
4. **Create .env** with your token
5. **Configure hostnames** in Cloudflare Dashboard
6. **Start**: `docker compose up -d`
7. **Test**: Access your services via the configured hostnames

---

## Related Documentation

- [Cloudflare Tunnel Docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- [Cloudflare Zero Trust](https://developers.cloudflare.com/cloudflare-one/)
- [Traefik Integration](../traefik/README.md)
- [Expense Tracker Example](../expense-tracker/README.md)
