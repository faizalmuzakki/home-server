# Homepage Dashboard — Replace Homer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Homer (static YAML dashboard) with Homepage (gethomepage.dev) — a modern dashboard with live Docker container status, service health widgets, and resource monitoring.

**Architecture:** Homepage is a single Docker container that auto-discovers services via Docker labels. It replaces `homer/` on the same Traefik route (`apps.${DOMAIN}`). Homer gets archived (compose commented out, like we did with palu-gada-root-bot), and Homepage takes its place.

**Tech Stack:** Homepage (gethomepage.dev), Docker, Traefik (existing)

## Global Constraints

- Route: `apps.${DOMAIN}` (same as current Homer)
- Must go through Traefik with `admin-secure@file` middleware (same as Homer)
- Homepage reads Docker socket for container status — use the existing `palu-gada-socket-proxy` or a read-only socket mount
- Branch off main, create PR — don't push directly

---

### Task 1: Set up Homepage and archive Homer

**Files:**
- Create: `homepage/docker-compose.yml`
- Create: `homepage/config/settings.yaml`
- Create: `homepage/config/services.yaml`
- Create: `homepage/config/widgets.yaml`
- Create: `homepage/config/docker.yaml`
- Modify: `homer/docker-compose.yml` (comment out, archive)
- Modify: `TODO.md`

**Interfaces:**
- Consumes: Traefik network (`traefik-public`), Docker socket (via socket-proxy)
- Produces: Live dashboard at `apps.${DOMAIN}`

- [ ] **Step 1: Create `homepage/docker-compose.yml`**

```yaml
services:
  homepage:
    image: ghcr.io/gethomepage/homepage:latest
    container_name: homepage
    restart: unless-stopped
    environment:
      - HOMEPAGE_ALLOWED_HOSTS=apps.${DOMAIN}
    volumes:
      - ./config:/app/config
    networks:
      - traefik-public
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.homepage.rule=Host(`apps.${DOMAIN}`)"
      - "traefik.http.routers.homepage.entrypoints=websecure"
      - "traefik.http.routers.homepage.tls.certresolver=cloudflare"
      - "traefik.http.routers.homepage.middlewares=admin-secure@file"
      - "traefik.http.services.homepage.loadbalancer.server.port=3000"

networks:
  traefik-public:
    external: true
```

- [ ] **Step 2: Create `homepage/config/docker.yaml`**

This tells Homepage how to discover Docker containers. Use the socket proxy if available, otherwise direct mount.

Option A — Socket proxy (preferred, matches existing pattern):
```yaml
docker:
  host: http://palu-gada-socket-proxy
  port: 2375
```

Option B — Direct socket mount (if socket-proxy doesn't work for Homepage):
Add to `docker-compose.yml` volumes:
```yaml
      - /var/run/docker.sock:/var/run/docker.sock:ro
```
And in `docker.yaml`:
```yaml
docker:
  socket: /var/run/docker.sock
```

- [ ] **Step 3: Create `homepage/config/settings.yaml`**

```yaml
title: Home Server
favicon: https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/homepage.png
theme: dark
color: slate
headerStyle: clean
layout:
  Infrastructure:
    style: row
    columns: 4
  Applications:
    style: row
    columns: 3
  Monitoring:
    style: row
    columns: 3
```

- [ ] **Step 4: Create `homepage/config/services.yaml`**

Populate with the actual services on the server. Adapt URLs to match your domain:

```yaml
- Infrastructure:
    - Traefik:
        href: https://traefik.${DOMAIN}
        description: Reverse Proxy
        icon: traefik
        server: docker
        container: traefik
    - Vaultwarden:
        href: https://vault.${DOMAIN}
        description: Password Manager
        icon: vaultwarden
        server: docker
        container: vaultwarden
    - AdGuard Home:
        href: https://adguard.${DOMAIN}
        description: DNS & Ad Blocking
        icon: adguard-home
        server: docker
        container: adguardhome
    - Syncthing:
        href: https://sync.${DOMAIN}
        description: File Sync
        icon: syncthing
        server: docker
        container: syncthing

- Applications:
    - Expense Tracker:
        href: https://expense.${DOMAIN}
        description: Expense Tracking
        icon: mdi-cash-register
        server: docker
        container: expense-tracker-api
    - Jellyfin:
        href: https://media.${DOMAIN}
        description: Media Server
        icon: jellyfin
        server: docker
        container: jellyfin
    - Dockge:
        href: https://dockge.${DOMAIN}
        description: Docker Compose Manager
        icon: dockge
        server: docker
        container: dockge

- Monitoring:
    - Uptime Kuma:
        href: https://status.${DOMAIN}
        description: Uptime Monitor
        icon: uptime-kuma
        server: docker
        container: uptime-kuma
    - Netdata:
        href: https://netdata.${DOMAIN}
        description: System Monitor
        icon: netdata
        server: docker
        container: netdata
```

> **Note:** The exact service names, URLs, and container names above are guesses based on the repo structure. Adjust to match your actual setup. Check `docker ps --format '{{.Names}}'` for exact container names.

- [ ] **Step 5: Create `homepage/config/widgets.yaml`**

```yaml
- resources:
    cpu: true
    memory: true
    disk: /
    expanded: true
- docker:
    expanded: false
- datetime:
    text_size: xl
    format:
      dateStyle: short
      timeStyle: short
```

- [ ] **Step 6: Stop Homer**

```bash
cd /home/solork/Projects/home-server/homer
docker compose down
```

- [ ] **Step 7: Comment out Homer compose (archive pattern)**

Edit `homer/docker-compose.yml` — wrap services in comments like we did with palu-gada-root-bot:

```yaml
# ARCHIVED: replaced by homepage/ (gethomepage.dev)
# Uncomment to revive.
#
# services:
#   homer:
#     image: b4bz/homer:latest
#     ...
```

- [ ] **Step 8: Start Homepage**

```bash
cd /home/solork/Projects/home-server/homepage
docker compose up -d
```

Visit `https://apps.${DOMAIN}` — should show the Homepage dashboard with live container statuses.

- [ ] **Step 9: Iterate on config**

Homepage hot-reloads config changes. Edit the YAML files and refresh the browser. Common tweaks:
- Fix container names that don't match
- Add/remove services
- Adjust layout columns

- [ ] **Step 10: Commit**

```bash
cd /home/solork/Projects/home-server
git add homepage/ homer/docker-compose.yml
git commit -m "feat: replace Homer with Homepage dashboard (gethomepage.dev)

- Homepage: live Docker container status, resource widgets, dark theme
- Homer: archived (compose commented out, config preserved)
- Same Traefik route: apps.\${DOMAIN} with admin-secure middleware"
```

---

### Task 2: Add Homepage to backup targets

**Files:**
- Modify: `scripts/backup-encrypted.sh` (add `homepage/config` to TARGETS array)

**Interfaces:**
- Consumes: `homepage/config/` directory
- Produces: Homepage config included in daily encrypted backups

- [ ] **Step 1: Add homepage config to backup targets**

In `scripts/backup-encrypted.sh`, find the `TARGETS=()` array and add:

```bash
    "homepage-config:homepage/config"
```

- [ ] **Step 2: Commit**

```bash
git add scripts/backup-encrypted.sh
git commit -m "chore: add homepage config to backup targets"
```
