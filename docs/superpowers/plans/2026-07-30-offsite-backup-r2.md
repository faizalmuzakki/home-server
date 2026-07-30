# Offsite Backup to Cloudflare R2 + Discord Notifications

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up existing `backup-encrypted.sh` to sync encrypted backups to Cloudflare R2 and send success/failure notifications to Discord.

**Architecture:** The backup script already has full R2 and Discord webhook support — it reads `RCLONE_REMOTE` and `DISCORD_WEBHOOK_URL` from `scripts/.env.backup`. This plan provisions the cloud resources and fills in the config. Zero code changes needed.

**Tech Stack:** rclone, Cloudflare R2 (S3-compatible), Discord webhooks, age encryption (already in use)

## Global Constraints

- All operations happen on the server as root (backup script requires root)
- R2 free tier: 10GB storage, 1M Class A ops/month — current backup is ~1GB, well under
- The backup script is at `scripts/backup-encrypted.sh`, cron runs daily at 03:00
- `.env.backup` is gitignored — never commit secrets

---

### Task 1: Provision Cloudflare R2 + rclone config

This is all manual server-side work. No code changes.

**Files:**
- Create: `scripts/.env.backup` (from `.env.backup.example`, gitignored)

**Interfaces:**
- Consumes: nothing
- Produces: A working `rclone` remote named `r2` that can write to the R2 bucket

- [ ] **Step 1: Create R2 bucket in Cloudflare dashboard**

Go to Cloudflare Dashboard → R2 Object Storage → Create bucket.
- Bucket name: `home-server-backups`
- Location: auto (or nearest region)

- [ ] **Step 2: Create R2 API token**

Cloudflare Dashboard → R2 → Manage R2 API Tokens → Create API Token.
- Permissions: Object Read & Write
- Scope: Specific bucket → `home-server-backups`
- Save the Access Key ID and Secret Access Key

- [ ] **Step 3: Install rclone on the server**

```bash
sudo apt install rclone
# or for latest:
# curl https://rclone.org/install.sh | sudo bash
```

Verify: `rclone version`

- [ ] **Step 4: Configure rclone remote**

```bash
sudo rclone config
```

Interactive prompts:
1. `n` (new remote)
2. Name: `r2`
3. Storage type: `5` (Amazon S3 Compliant) — or type `s3`
4. Provider: `Cloudflare`
5. Access Key ID: (paste from step 2)
6. Secret Access Key: (paste from step 2)
7. Endpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
   - Find your Account ID in Cloudflare Dashboard → R2 → Overview (right sidebar)
8. Accept defaults for everything else

- [ ] **Step 5: Test rclone access**

```bash
sudo rclone lsd r2:home-server-backups
# Should return empty (no dirs yet) without errors
```

- [ ] **Step 6: Create `.env.backup` with R2 and Discord webhook**

```bash
cd /home/solork/Projects/home-server
sudo cp scripts/.env.backup.example scripts/.env.backup
sudo nano scripts/.env.backup
```

Fill in:
```
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/XXX/YYY
RCLONE_REMOTE=r2:home-server-backups
```

For the Discord webhook URL: reuse the same one from `webhook/.env` (`DISCORD_WEBHOOK_URL`), or create a new one in Discord (Server Settings → Integrations → Webhooks → New Webhook → pick a `#backups` channel).

- [ ] **Step 7: Run a manual backup test**

```bash
sudo /home/solork/Projects/home-server/scripts/backup-encrypted.sh
```

Watch for:
- `[4/4] Offsite sync...` → `synced to r2:home-server-backups` (not "skipped")
- Discord channel should receive a ✅ embed with size and item count

- [ ] **Step 8: Verify files in R2**

```bash
sudo rclone ls r2:home-server-backups | head -20
```

Should show `.age` encrypted files in a timestamped directory.

Also check Cloudflare Dashboard → R2 → `home-server-backups` to see the objects.

- [ ] **Step 9: Commit**

No code changes to commit — `.env.backup` is gitignored. But update TODO.md to mark this done:

```bash
# In the repo (as your user, not root)
cd /home/solork/Projects/home-server
```

Move the "Backups — offsite to Cloudflare R2" and "Discord notifications for backup" sections from `## Open` to `## Recently done` in `TODO.md`, with today's date.

```bash
git add TODO.md
git commit -m "docs: mark R2 offsite backup and Discord notifications as done"
```
