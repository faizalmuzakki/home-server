# Home Server TODO

Open items and ideas for future sessions. Keep this current — remove what's done, add what comes up.

## Open

### Backups — offsite to Cloudflare R2

Local encrypted backups are running daily at 03:00. Still need offsite.

Plan written: `docs/superpowers/plans/2026-07-30-offsite-backup-r2.md`
Requires manual server work (rclone config, R2 bucket creation, `.env.backup` secrets).

### MongoDB — admin password rotation

Current `mongodb/.env` password doesn't match what's actually stored in the DB. The backup script falls back to a data-dir tarball instead of clean `mongodump`.

Plan written: `docs/superpowers/plans/2026-07-30-mongodb-2fauth-cleanup.md` (Task 1)
Requires manual server work (mongosh password rotation, compose env uncomment).

### 2FAuth — decide: revive or delete

`2fauth/` has a compose file but no container is up, and no `data/` dir exists. The Feb 15 export CSVs are the only copy of those TOTP secrets.

Plan written: `docs/superpowers/plans/2026-07-30-mongodb-2fauth-cleanup.md` (Task 2)
Decision: import CSVs into Vaultwarden and delete, or revive the container.

### Tailscale — needs auth key

### Discord notifications for backup

`scripts/.env.backup.example` supports `DISCORD_WEBHOOK_URL`. Once R2 is wired up, plug in the same webhook used by the deploy script (or a separate backup channel) so failures page you.

## Ideas — not committed to, just parked

### Maintenance
- Move `/var/lib/docker` to the `/data` SSD so Docker images/volumes stop competing with the OS partition for space (not urgent — root is at 36%).
- **IPv6 egress is flaky on wifi** — `docker pull` from Docker Hub fails on the v6 path. Workaround: `sudo sysctl -w net.ipv6.conf.{all,default}.disable_ipv6=1`, pull, restore with `=0`.

### Media stack — VPN-gated *arr services (parked)
The full Sonarr/Radarr/Prowlarr/qBittorrent/Bazarr stack is commented out in `media/docker-compose.yml`. To revive: add a gluetun container + paid VPN, route qBittorrent through it. Do NOT enable qBittorrent without a VPN.

## Recently done

- 2026-07-30 — **Bot monolith refactor** (PR #16): split `palu-gada-bot/src/index.js` from 1183 lines to 129 lines. Extracted 6 background services to `src/services/` and 8 event handlers to `src/events/`.
- 2026-07-30 — **Infrastructure cleanup** (PR #14): archived `palu-gada-root-bot` (freed 512M RAM reservation), reduced `claude-api` RAM limit from 1G to 384M.
- 2026-07-30 — **Expense Discord integration** (PR #15): added `/expense today|month|summary|log` slash commands to `palu-gada-bot`.
- 2026-07-30 — **Server command upgrades** (PR #17): added `/server disk` and `/server memory` subcommands.
- 2026-07-30 — **Homepage dashboard** (PR #18): added `homepage/` (gethomepage.dev) replacing Homer, with live Docker container status widgets.
- 2026-07-30 — **Tailscale + Scrutiny** (PR #19): added Tailscale sidecar and Scrutiny SMART monitoring compose configs.
- 2026-04-14 — Added `/server` admin command to both bots (status/containers/stats/logs/restart).
- 2026-04-14 — palu-gada-bot: `/summarize /recap /explain /ask` upgraded to Sonnet 4.6 via `AI_MODEL_SMART`.
- 2026-04-14 — Ported `/quote /purge /schedule` from palu-gada-bot to palu-gada-root-bot.
- 2026-04-14 — Revived media stack as Jellyfin-only (port 127.0.0.1:8096, 1G mem cap, Traefik secure-defaults).
- 2026-04-13 — Extended LVM from 58G to 116G; `/` went from 72% to 36% used.
- 2026-07-31 — Purged obsolete 2FAuth service and docker-compose stack (TOTP secrets migrated to Vaultwarden).
