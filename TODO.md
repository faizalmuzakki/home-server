# Home Server TODO

Open items and ideas for future sessions. Keep this current — remove what's done, add what comes up.

## Open

### Backups — offsite to Cloudflare R2

Local encrypted backups are running daily at 03:00. Still need offsite.

**Steps:**
1. Create a Cloudflare R2 bucket (e.g. `home-server-backups`). Free tier: 10GB storage, 1M Class A ops/month — current backup is ~1GB so well under.
2. Create an R2 API token scoped to that bucket (Access Key ID + Secret).
3. On the server, install rclone: `sudo apt install rclone` (or `curl https://rclone.org/install.sh | sudo bash` for latest).
4. Run `rclone config` and add an S3-compatible remote:
   - name: `r2`
   - provider: `Cloudflare`
   - access_key_id / secret_access_key: from step 2
   - endpoint: `https://<account_id>.r2.cloudflarestorage.com`
5. Create `scripts/.env.backup` (gitignored) from `scripts/.env.backup.example` and set:
   ```
   RCLONE_REMOTE=r2:home-server-backups
   DISCORD_WEBHOOK_URL=...  # optional, reuse the deploy webhook
   ```
6. Test manually: `sudo /home/solork/Projects/home-server/scripts/backup-encrypted.sh`
7. Verify files in R2 dashboard.

### MongoDB — admin password rotation

Current `mongodb/.env` password doesn't match what's actually stored in the DB (auth was rotated inside mongo at some point). The backup script currently falls back to a data-dir tarball, which works but isn't transaction-safe.

**Fix:** start mongo once with `--noauth`, rotate the admin user, restart. Then mongodump will succeed and backups will be clean dumps instead of live data-dir copies.

### 2FAuth — not running

`2fauth/` has a compose file but no container is up, and no `data/` dir exists. The Feb 15 export CSVs are the only copy of those TOTP secrets. Decide: revive the service, or delete the compose and formally migrate those secrets into Vaultwarden/Bitwarden.

### Discord notifications for backup

`scripts/.env.backup.example` supports `DISCORD_WEBHOOK_URL`. Once R2 is wired up, plug in the same webhook used by the deploy script (or a separate backup channel) so failures page you.

## Ideas — not committed to, just parked

### Bot consolidation
`palu-gada-root-bot` has far fewer features than `palu-gada-bot` — the two codebases have diverged. Either port features over or convert root-bot into a thin wrapper that imports from the main bot.

### New `/server` admin commands for the Discord bot
Disk usage, memory, container status, restart-service. Socket-proxy is already in place (`palu-gada-socket-proxy`) so the infra exists.

### Expense tracker ↔ bot integration
`/expense today`, `/budget` slash commands pulling from the expense-tracker SQLite DB.

### New services worth considering
- **Paperless-ngx** — document scanning/search (pairs well with Syncthing)
- **Immich** — self-hosted Google Photos (needs the `/data` drive we just set up)
- **Gitea / Forgejo** — private git mirror
- **Homepage** (gethomepage.dev) — modern dashboard with live widgets
- **Scrutiny** — SMART disk health monitoring
- **Tailscale** — complement to Cloudflare Tunnel for raw TCP/SSH access

### Maintenance
- Move `/var/lib/docker` to the new `/data` SSD so Docker images/volumes stop competing with the OS partition for space (not urgent now — root is at 36%).
- `docker system prune` pass periodically.

## Recently done

- 2026-04-13 — Extended LVM from 58G to 116G; `/` went from 72% to 36% used.
- 2026-04-13 — Wiped the idle 240G SATA SSD (was NTFS, empty) and mounted it at `/data` via fstab. Gives ~220G of dedicated data space.
- 2026-04-13 — Rewrote `scripts/backup-encrypted.sh` for the bind-mount data layout. Daily root cron at 03:00, 16 targets, age-encrypted, age key at `/etc/home-server/age.key` (also stored in Bitwarden). `restore-backup.sh` updated to match.
