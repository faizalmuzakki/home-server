# Netdata - Real-time Server Monitoring

Real-time performance monitoring for your home server with beautiful visualizations.

## Features

- 📊 **Real-time metrics** - CPU, RAM, Disk, Network
- 🐳 **Docker monitoring** - Container stats and health
- 📈 **Historical data** - Charts with zoom/pan
- 🔔 **Alerts** - Configurable notifications
- ⚡ **Low overhead** - ~2% CPU usage

## Quick Start

```bash
# Copy and configure environment
cp .env.example .env

# Generate auth password
htpasswd -nb admin yourpassword
# Copy the output to NETDATA_AUTH in .env

# Start Netdata
docker compose up -d
```

## Access

- **URL**: `https://monitor.solork.dev`
- **Auth**: Required (set in .env)

## Metrics Available

| Category | Metrics |
|----------|---------|
| **System** | CPU usage, load, temperatures |
| **Memory** | RAM, swap, cache |
| **Disk** | I/O, space, latency |
| **Network** | Bandwidth, packets, errors |
| **Docker** | Container CPU, memory, network |

## Optional: Netdata Cloud

For free cloud dashboard and alerts:
1. Go to https://app.netdata.cloud
2. Create account and get claim token
3. Add token to `.env`
4. Restart container

## Links

- [Netdata GitHub](https://github.com/netdata/netdata)
- [Netdata Cloud](https://app.netdata.cloud/)
