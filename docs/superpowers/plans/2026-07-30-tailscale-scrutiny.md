# Tailscale Sidecar + Scrutiny Disk Monitoring

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Tailscale for raw TCP/SSH access to the server from anywhere (complements Cloudflare Tunnel), and Scrutiny for SMART disk health monitoring of the two SSDs.

**Architecture:** Both are single-container deploys with minimal config. Tailscale runs as a sidecar with `--advertise-exit-node` disabled (just access, not routing). Scrutiny runs a collector + web UI in one container, reads `/dev/sd*` for SMART data.

**Tech Stack:** Tailscale (Docker), Scrutiny (Docker), Traefik (existing)

## Global Constraints

- Both services need `privileged` or specific `cap_add` — document why
- Both should be behind Traefik with `admin-secure@file` middleware (Scrutiny web UI only — Tailscale has no web UI to expose)
- Branch off main, create PR
- Add both to backup targets if they have persistent config

---

### Task 1: Tailscale sidecar

**Files:**
- Create: `tailscale/docker-compose.yml`
- Create: `tailscale/.env.example`

**Interfaces:**
- Consumes: Tailscale auth key (from tailscale.com admin console)
- Produces: The server appears on your Tailnet; SSH access via `ssh user@<tailscale-ip>`

- [ ] **Step 1: Create Tailscale auth key**

Go to https://login.tailscale.com/admin/settings/keys
- Create an auth key
- Check "Reusable" and "Ephemeral" OFF (this is a permanent server node)
- Check "Pre-approved" if you don't want to manually approve in the admin console
- Copy the key

- [ ] **Step 2: Create `tailscale/.env.example`**

```
# Get an auth key from https://login.tailscale.com/admin/settings/keys
TAILSCALE_AUTHKEY=tskey-auth-XXXX
# Hostname this machine will appear as on your Tailnet
TAILSCALE_HOSTNAME=homeserver
```

- [ ] **Step 3: Create `tailscale/.env` (gitignored)**

```bash
cd /home/solork/Projects/home-server
cp tailscale/.env.example tailscale/.env
nano tailscale/.env
# Paste the auth key from step 1
```

- [ ] **Step 4: Create `tailscale/docker-compose.yml`**

```yaml
services:
  tailscale:
    image: tailscale/tailscale:latest
    container_name: tailscale
    restart: unless-stopped
    hostname: ${TAILSCALE_HOSTNAME:-homeserver}
    environment:
      - TS_AUTHKEY=${TAILSCALE_AUTHKEY}
      - TS_STATE_DIR=/var/lib/tailscale
      - TS_USERSPACE=false
    volumes:
      - ./data:/var/lib/tailscale
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
    # Host network so Tailscale can reach all local services
    network_mode: host
```

- [ ] **Step 5: Start Tailscale**

```bash
cd /home/solork/Projects/home-server/tailscale
docker compose up -d
docker logs tailscale
```

Should show: `Logged in as ... ` and the Tailscale IP. Verify the machine appears at https://login.tailscale.com/admin/machines.

- [ ] **Step 6: Test SSH via Tailscale**

From another device on your Tailnet:
```bash
ssh solork@<tailscale-ip>
```

- [ ] **Step 7: Commit**

```bash
cd /home/solork/Projects/home-server
git add tailscale/docker-compose.yml tailscale/.env.example
git commit -m "feat: add Tailscale sidecar for raw TCP/SSH access

Host network mode so all local services are reachable.
Complements Cloudflare Tunnel for when CF is down or for
raw TCP protocols (SSH, Docker socket, etc)."
```

---

### Task 2: Scrutiny disk health monitoring

**Files:**
- Create: `scrutiny/docker-compose.yml`

**Interfaces:**
- Consumes: `/dev/sda`, `/dev/sdb` (or whatever the two SSDs are)
- Produces: Web UI showing SMART data, temperature trends, and health status

- [ ] **Step 1: Find the disk device names**

```bash
lsblk -d -o NAME,SIZE,MODEL,SERIAL
```

Note the device paths (e.g., `/dev/sda`, `/dev/sdb`).

- [ ] **Step 2: Create `scrutiny/docker-compose.yml`**

Adjust `/dev/sda` and `/dev/sdb` to match your actual devices from step 1:

```yaml
services:
  scrutiny:
    image: ghcr.io/analogj/scrutiny:master-omnibus
    container_name: scrutiny
    restart: unless-stopped
    cap_add:
      - SYS_RAWIO    # needed for smartctl to read SMART data
    volumes:
      - ./config:/opt/scrutiny/config
      - ./influxdb:/opt/scrutiny/influxdb
      - /run/udev:/run/udev:ro
    devices:
      - /dev/sda
      - /dev/sdb
    networks:
      - traefik-public
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.scrutiny.rule=Host(`disks.${DOMAIN}`)"
      - "traefik.http.routers.scrutiny.entrypoints=websecure"
      - "traefik.http.routers.scrutiny.tls.certresolver=cloudflare"
      - "traefik.http.routers.scrutiny.middlewares=admin-secure@file"
      - "traefik.http.services.scrutiny.loadbalancer.server.port=8080"

networks:
  traefik-public:
    external: true
```

> **Note:** The "omnibus" image bundles the web UI, API, and collector in one container. For a multi-host setup you'd split them, but for a single server this is simpler.

- [ ] **Step 3: Add DNS record**

Add a CNAME record in Cloudflare DNS:
- Name: `disks`
- Target: your tunnel hostname (or the same target as other subdomains)
- Proxied: yes

(Or if using Cloudflare Tunnel, add the route in the tunnel config.)

- [ ] **Step 4: Start Scrutiny**

```bash
cd /home/solork/Projects/home-server/scrutiny
docker compose up -d
docker logs scrutiny
```

Wait ~30 seconds for the initial SMART scan.

- [ ] **Step 5: Verify the web UI**

Visit `https://disks.${DOMAIN}` — should show both SSDs with SMART attributes, temperature, and health score.

- [ ] **Step 6: Commit**

```bash
cd /home/solork/Projects/home-server
git add scrutiny/docker-compose.yml
git commit -m "feat: add Scrutiny for SMART disk health monitoring

Omnibus image (web + collector + influxdb in one container).
Monitors both SSDs. UI at disks.\${DOMAIN} behind admin-secure middleware."
```

---

### Task 3: Add both to backups and update TODO

**Files:**
- Modify: `scripts/backup-encrypted.sh` (add to TARGETS)
- Modify: `TODO.md`

- [ ] **Step 1: Add to backup targets**

In `scripts/backup-encrypted.sh`, add to the `TARGETS=()` array:

```bash
    "tailscale-state:tailscale/data"
    "scrutiny-config:scrutiny/config"
```

Scrutiny's influxdb data is less critical (it'll rebuild from fresh SMART scans), so backing up just config is sufficient.

- [ ] **Step 2: Update TODO.md**

Move the Tailscale and Scrutiny entries from `## Ideas` to `## Recently done` with today's date.

- [ ] **Step 3: Commit**

```bash
git add scripts/backup-encrypted.sh TODO.md
git commit -m "chore: add tailscale + scrutiny to backups, update TODO"
```
