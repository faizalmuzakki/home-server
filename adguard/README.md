# AdGuard Home

Network-wide ad blocking and DNS server.

## Features

- Block ads and trackers for all devices on your network
- DNS-over-HTTPS and DNS-over-TLS support
- Per-client settings
- Query logging and statistics

## Setup

### 1. Configure Environment

```bash
cp .env.example .env
nano .env
```

### 2. Disable System DNS (if running)

```bash
# Check if systemd-resolved is using port 53
sudo lsof -i :53

# If needed, disable stub listener
sudo nano /etc/systemd/resolved.conf
# Set: DNSStubListener=no
sudo systemctl restart systemd-resolved
```

### 3. Start AdGuard

```bash
docker compose up -d
```

### 4. Initial Setup

1. Go to `http://YOUR_SERVER_IP:3001`
2. Complete the setup wizard
3. Set admin username and password
4. Configure upstream DNS (recommended: `1.1.1.1`, `8.8.8.8`)

### 5. Configure Router

Point your router's DHCP DNS to your server's IP address.

Or configure individual devices to use your server as DNS.

## Recommended Blocklists

Add these in **Filters > DNS blocklists**:

- AdGuard DNS filter (default)
- `https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts`
- `https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/pro.txt`

## Access

- **Setup UI**: `http://YOUR_SERVER_IP:3001` (first time only)
- **Admin Panel**: `http://YOUR_SERVER_IP:8080` or `https://adguard.yourdomain.com`

## DNS Ports

| Port | Protocol | Description |
|------|----------|-------------|
| 53 | TCP/UDP | Standard DNS |
| 443 | TCP | DNS-over-HTTPS |
| 853 | TCP | DNS-over-TLS |

## Useful Commands

```bash
# View logs
docker compose logs -f adguard

# Restart
docker compose restart adguard

# Check DNS is working
dig @YOUR_SERVER_IP google.com
```
