# Traefik Reverse Proxy

Automatic SSL certificates and routing for all services.

## Features

- Automatic HTTPS with Let's Encrypt (via Cloudflare DNS)
- Dashboard for monitoring routes
- Docker auto-discovery
- Security headers middleware

## Setup

### 1. Cloudflare API Token

1. Go to Cloudflare Dashboard > My Profile > API Tokens
2. Create token with **Zone:DNS:Edit** permission
3. Copy token to `.env`

### 2. Configure Environment

```bash
cp .env.example .env
nano .env
```

### 3. Generate Dashboard Password

```bash
# Install htpasswd if needed: apt install apache2-utils
htpasswd -nb admin your-secure-password
# Copy output to TRAEFIK_DASHBOARD_AUTH in .env
# Note: escape $ with $$ in docker-compose
```

### 4. Create Certs Directory

```bash
mkdir -p certs
touch certs/acme.json
chmod 600 certs/acme.json
```

### 5. Start Traefik

```bash
docker compose up -d
```

## Adding Services to Traefik

Add these labels to any service's docker-compose:

```yaml
services:
  myapp:
    # ... your config
    networks:
      - traefik-public
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.myapp.rule=Host(`myapp.yourdomain.com`)"
      - "traefik.http.routers.myapp.entrypoints=websecure"
      - "traefik.http.routers.myapp.tls.certresolver=cloudflare"
      - "traefik.http.services.myapp.loadbalancer.server.port=8080"

networks:
  traefik-public:
    external: true
```

## Dashboard

Access at: `https://traefik.yourdomain.com`

## Useful Commands

```bash
# View logs
docker compose logs -f traefik

# Reload config
docker compose restart traefik

# Check certificate status
cat certs/acme.json | jq
```
