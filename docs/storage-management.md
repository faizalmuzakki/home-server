# Storage Management

## Overview

The home server runs on a 57GB root filesystem (`/dev/mapper/ubuntu--vg-ubuntu--lv`). The primary consumer of disk space is Docker — specifically image layers, build cache, and volumes accumulating over time.

---

## Incident: March 2026 — Root Filesystem at 99%

### What Happened

The root partition hit **99% usage (54GB/57GB)**, leaving only ~578MB free. The server was still functional but at risk of write failures.

### Root Cause Analysis

| Docker Resource | Total | Reclaimable |
|---|---|---|
| Images (40 total, 21 active) | 32.93GB | 16.52GB (50%) |
| Local Volumes (29 total, 2 active) | 2.87GB | 2.87GB (99%) |
| Build Cache | 8.96GB | 5.41GB |

**Contributing factors:**

1. **No post-build cleanup in deploy scripts** — Every push triggers `docker compose up -d --build` in `deploy.sh`, which rebuilds images (especially `palu-gada-bot` at ~2.33GB) and leaves old layers as dangling images. Over time, 22 dangling images had accumulated.

2. **Watchtower in monitor-only mode** — `WATCHTOWER_CLEANUP=true` was already configured, but `WATCHTOWER_MONITOR_ONLY` defaults to `true`, so Watchtower never performs actual updates or cleanup. It only sends notifications.

3. **`--no-cache` builds in monorepo deploys** — `deploy-monorepo.sh` uses `docker compose build --no-cache`, which skips layer reuse and generates more orphaned cache entries per deploy.

4. **No scheduled cleanup** — No cron job or automated process existed to periodically prune Docker resources.

### Resolution

**Immediate:** Ran `docker system prune -f` and `docker builder prune -f`, freeing **~17GB**. Disk dropped from 99% → 69% (37GB/57GB used).

---

## Fixes Applied

### 1. Post-build prune in `webhook/scripts/deploy.sh`

Added `docker image prune -f` inside `deploy_service()` immediately after `docker compose up -d --build`. This removes dangling layers after every home-server deployment.

```sh
execute "docker compose up -d --build --remove-orphans"
# Remove dangling images left behind by the rebuild
execute "docker image prune -f"
```

### 2. Post-build prune in `webhook/scripts/deploy-monorepo.sh`

Added `docker image prune -f` after `docker compose up -d --force-recreate` in the `NEEDS_BUILD=true` branch.

```sh
docker compose up -d --force-recreate
# Remove dangling images left behind by the rebuild
docker image prune -f
```

### 3. Weekly cron job (safety net)

Added to `solork`'s crontab on the server — runs every Sunday at 3:00 AM:

```cron
0 3 * * 0 docker system prune -f >> /home/solork/docker-prune.log 2>&1
```

This catches anything that slips through (e.g., manual `docker pull` calls, Watchtower updates if monitor-only is disabled, or stopped containers).

---

## Ongoing Storage Breakdown

| Location | Size | Notes |
|---|---|---|
| `/swap.img` | 4.1GB | Fixed swap file |
| `/home` | 3.4GB | User data |
| `/usr` | 3.3GB | System packages |
| `/var/lib/docker` | ~35GB+ | Docker data root — main variable |
| `/opt` | 760MB | Misc |

> The Docker data root (`/var/lib/docker`) is on the root LVM volume. There is no separate partition for it, so Docker growth directly impacts overall available disk space.

---

## Manual Cleanup Reference

**Safe — removes only dangling/unused resources:**
```bash
docker system prune -f
```
Removes: stopped containers, dangling images, unused networks, dangling build cache.

**More aggressive — also removes unused tagged images:**
```bash
docker image prune -a -f
```
> Use with care — removes any image not attached to a running container, including images for paused stacks (homeassistant, media, syncthing, etc.).

**Remove unused volumes (dangerous — data loss risk):**
```bash
docker volume prune -f
```
> Only run this if you know which volumes are truly orphaned. Most "dangling" volumes belong to intentionally stopped compose stacks and contain persistent data.

**Check current state:**
```bash
docker system df
df -h /
```

---

## Watchtower Note

Watchtower (`containrrr/watchtower`) is configured with `WATCHTOWER_CLEANUP=true` and a daily 4AM check schedule. However, `WATCHTOWER_MONITOR_ONLY` defaults to `true` (set in `watchtower/docker-compose.yml`), meaning it **only sends notifications** and does not actually pull or clean up images.

To enable auto-updates with cleanup, set in `watchtower/.env`:
```env
WATCHTOWER_MONITOR_ONLY=false
```
This is intentionally left as `true` for safety on this home server — manual deploys via webhook are the preferred update mechanism.
