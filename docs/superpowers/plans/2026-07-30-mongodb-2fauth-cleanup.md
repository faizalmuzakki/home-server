# MongoDB Password Rotation + 2FAuth Cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix MongoDB auth so `mongodump` works in the backup script (clean dumps instead of data-dir tarballs), and decide the fate of the dead 2FAuth service.

**Architecture:** MongoDB is currently running with auth commented out (`--noauth` implied). The backup script tries `mongodump --username/--password` from `mongodb/.env`, which fails because those creds were rotated at some point. Fix: set a fresh password that matches what `.env` says. 2FAuth: either revive it or delete the compose — no code, just a decision and cleanup.

**Tech Stack:** MongoDB 8.0 (Docker), mongosh, better-sqlite3 backup (existing)

## Global Constraints

- MongoDB is bound to `127.0.0.1:27017` — local-only, no external exposure
- `mongodb/.env` is gitignored
- The backup script at `scripts/backup-encrypted.sh` reads `MONGO_ROOT_USERNAME` and `MONGO_ROOT_PASSWORD` from `mongodb/.env`
- Current compose has auth environment vars commented out (ponytail comment explains why)

---

### Task 1: Fix MongoDB auth + backup

**Files:**
- Modify: `mongodb/.env` (gitignored, on server only)
- Modify: `mongodb/docker-compose.yml` (re-enable auth env vars)

**Interfaces:**
- Consumes: nothing
- Produces: Working `mongodump` in the backup script (no more "auth mismatch" fallback)

- [ ] **Step 1: Check current mongo state**

```bash
# See if mongo currently requires auth
docker exec mongodb mongosh --eval "db.adminCommand('ping')"
# If this returns { ok: 1 } without auth, mongo is running --noauth
```

- [ ] **Step 2: Pick a fresh password and update `.env`**

```bash
# Generate a random password
NEW_PASS=$(openssl rand -base64 24)
echo "New password: $NEW_PASS"

# Update mongodb/.env
cd /home/solork/Projects/home-server
nano mongodb/.env
```

Set:
```
MONGO_ROOT_USERNAME=admin
MONGO_ROOT_PASSWORD=<paste NEW_PASS here>
```

Also store this password in Vaultwarden/Bitwarden.

- [ ] **Step 3: Create the admin user inside mongo**

Since mongo is currently running without auth, create the user first:

```bash
docker exec mongodb mongosh admin --eval "
  db.createUser({
    user: 'admin',
    pwd: '<paste NEW_PASS here>',
    roles: ['root']
  })
"
```

If the user already exists, update the password instead:
```bash
docker exec mongodb mongosh admin --eval "
  db.changeUserPassword('admin', '<paste NEW_PASS here>')
"
```

- [ ] **Step 4: Re-enable auth in docker-compose.yml**

In `mongodb/docker-compose.yml`, uncomment the environment block:

```yaml
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_ROOT_USERNAME}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_ROOT_PASSWORD}
```

This makes the container pass `--auth` on startup.

- [ ] **Step 5: Restart mongo with auth enabled**

```bash
cd /home/solork/Projects/home-server/mongodb
docker compose up -d
```

Wait a few seconds, then verify:

```bash
# This should now FAIL (no auth):
docker exec mongodb mongosh --eval "db.adminCommand('ping')"

# This should SUCCEED:
docker exec mongodb mongosh -u admin -p '<NEW_PASS>' --authenticationDatabase admin --eval "db.adminCommand('ping')"
```

- [ ] **Step 6: Test mongodump via the backup script path**

```bash
source /home/solork/Projects/home-server/mongodb/.env
docker exec mongodb mongodump \
    --username "$MONGO_ROOT_USERNAME" \
    --password "$MONGO_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --archive --gzip > /tmp/test-mongodump.gz 2>/dev/null

# Check it produced output
ls -la /tmp/test-mongodump.gz
rm /tmp/test-mongodump.gz
```

- [ ] **Step 7: Run a full backup to confirm the mongodump path works**

```bash
sudo /home/solork/Projects/home-server/scripts/backup-encrypted.sh
```

Watch for: `→ mongodb-dump (via mongodump)` — no "falling back to data-dir tarball" message.

- [ ] **Step 8: Commit the compose change**

```bash
cd /home/solork/Projects/home-server
git add mongodb/docker-compose.yml
git commit -m "fix(mongodb): re-enable auth in docker-compose

Password has been rotated and set inside mongo. mongodump now
succeeds in the backup script instead of falling back to data-dir tarball."
```

---

### Task 2: Resolve 2FAuth — delete or revive

This is a decision task. The Feb 15 TOTP export CSVs are the only copy of those secrets.

**Files:**
- Possibly delete: `2fauth/docker-compose.yml`
- Modify: `TODO.md`

**Interfaces:**
- Consumes: nothing
- Produces: One fewer zombie service in the repo

- [ ] **Step 1: Check if the TOTP secrets are already in Vaultwarden**

Open Vaultwarden (or Bitwarden client) and check if TOTP codes from the Feb 15 export are already saved there.

- [ ] **Step 2A: If already migrated → delete 2FAuth**

```bash
cd /home/solork/Projects/home-server
rm -rf 2fauth/
git add -A 2fauth/
git commit -m "chore: remove dead 2fauth service

TOTP secrets are in Vaultwarden. The 2FAuth container was never
running and the Feb 15 export CSVs have been migrated."
```

- [ ] **Step 2B: If NOT migrated → import into Vaultwarden first**

Import the CSV into Bitwarden/Vaultwarden:
1. Open Vaultwarden web vault → Tools → Import data
2. Format: select the appropriate format (Bitwarden CSV or generic TOTP)
3. Upload the export CSV
4. Verify the TOTP codes work
5. Then run Step 2A to delete 2FAuth

- [ ] **Step 3: Update TODO.md**

Move the "2FAuth — not running" section from `## Open` to `## Recently done` with today's date and the decision made.

```bash
git add TODO.md
git commit -m "docs: mark 2fauth resolved in TODO"
```
