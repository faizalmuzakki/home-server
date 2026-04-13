#!/bin/bash
# Encrypted Backup Script
#
# Backs up bind-mount data directories + MongoDB dump, encrypted with age.
# Runs as root to read container-owned files. Intended to be invoked by
# root's crontab (see install-backup-cron.sh).
#
# Prerequisites:
#   - age: sudo apt install age
#   - jq:  sudo apt install jq
#   - Key pair at /etc/home-server/age.key (auto-generated on first run)
#
# Config via scripts/.env.backup (optional):
#   DISCORD_WEBHOOK_URL=...  # for failure/success notifications
#   RCLONE_REMOTE=r2:bucket  # for offsite sync (requires rclone configured)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

BACKUP_BASE="/data/backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_BASE}/${STAMP}"
AGE_KEY="${AGE_KEY:-/etc/home-server/age.key}"
RETENTION_DAYS=14
LOG_FILE="${BACKUP_BASE}/backup.log"

if [ "$(id -u)" -ne 0 ]; then
    echo "This script must run as root (needed to read container-owned data dirs)."
    echo "Run with: sudo $0"
    exit 1
fi

if [ -f "${SCRIPT_DIR}/.env.backup" ]; then
    # shellcheck disable=SC1091
    source "${SCRIPT_DIR}/.env.backup"
fi

mkdir -p "$BACKUP_BASE"
exec > >(tee -a "$LOG_FILE") 2>&1

log() { echo "[$(date +%H:%M:%S)] $*"; }
die() { log "ERROR: $*"; notify_failure "$*"; exit 1; }

notify_discord() {
    local title=$1 desc=$2 color=$3
    [ -z "${DISCORD_WEBHOOK_URL:-}" ] && return 0
    curl -sf -H "Content-Type: application/json" \
        -d "$(jq -nc --arg t "$title" --arg d "$desc" --argjson c "$color" \
            '{embeds:[{title:$t,description:$d,color:$c,timestamp:(now|todate)}]}')" \
        "$DISCORD_WEBHOOK_URL" >/dev/null || true
}

notify_failure() {
    notify_discord "❌ Backup failed" "$1" 15158332
}

notify_success() {
    local size=$1 count=$2
    notify_discord "✅ Backup complete" "Size: ${size}\nItems: ${count}\nPath: ${BACKUP_DIR}" 3066993
}

command -v age >/dev/null || die "'age' not installed (sudo apt install age)"
command -v jq  >/dev/null || die "'jq' not installed"

if [ ! -f "$AGE_KEY" ]; then
    log "Generating age key at $AGE_KEY"
    mkdir -p "$(dirname "$AGE_KEY")"
    chmod 700 "$(dirname "$AGE_KEY")"
    age-keygen -o "$AGE_KEY"
    chmod 600 "$AGE_KEY"
    log "⚠️  BACK UP THIS KEY: $AGE_KEY — without it, backups cannot be decrypted"
fi
AGE_RECIPIENT=$(grep "public key:" "$AGE_KEY" | cut -d: -f2 | tr -d ' ')

mkdir -p "$BACKUP_DIR"
log "=== Backup started: $STAMP ==="
log "Target: $BACKUP_DIR"

# Services with bind-mounted data directories worth backing up.
# Format: <label>:<path-relative-to-repo>
TARGETS=(
    "vaultwarden:vaultwarden/data"
    "mongodb-dump:__mongodump__"
    "expense-tracker-api:expense-tracker/api/data"
    "expense-tracker-wa:expense-tracker/whatsapp-bot/auth_info"
    "palu-gada-bot:palu-gada-bot/data"
    "palu-gada-root-bot:palu-gada-root-bot/data"
    "uptime-kuma:uptime-kuma/data"
    "adguard-conf:adguard/conf"
    "adguard-work:adguard/work"
    "homeassistant:homeassistant/homeassistant"
    "traefik-certs:traefik/certs"
    "dockge:dockge/data"
    "homer:homer/config"
    "syncthing:syncthing/config"
    "crowdsec-config:crowdsec/config"
)

ITEM_COUNT=0
SKIPPED=()

backup_path() {
    local label=$1 path=$2
    local out="${BACKUP_DIR}/${label}.tar.gz.age"
    if [ ! -e "$path" ]; then
        SKIPPED+=("$label (missing: $path)")
        return 0
    fi
    log "  → $label"
    # tar exit 1 = "some files changed during read" (live DB files) — non-fatal.
    # exit 2 = fatal. Anything else we swallow and log as warning.
    set +e
    tar czf "${out}.tar.gz.tmp" \
        --warning=no-file-changed \
        --warning=no-file-removed \
        -C "$(dirname "$path")" "$(basename "$path")" 2>/dev/null
    local rc=$?
    set -e
    if [ $rc -ne 0 ] && [ $rc -ne 1 ]; then
        rm -f "${out}.tar.gz.tmp"
        SKIPPED+=("$label (tar exit $rc)")
        return 0
    fi
    age -r "$AGE_RECIPIENT" < "${out}.tar.gz.tmp" > "$out"
    rm -f "${out}.tar.gz.tmp"
    ITEM_COUNT=$((ITEM_COUNT + 1))
}

backup_mongodump() {
    local out="${BACKUP_DIR}/mongodb-dump.archive.age"
    if ! docker ps --format '{{.Names}}' | grep -q '^mongodb$'; then
        SKIPPED+=("mongodb-dump (container not running)")
        return 0
    fi
    # shellcheck disable=SC1091
    set -a; source "${REPO_DIR}/mongodb/.env"; set +a

    log "  → mongodb-dump (via mongodump)"
    local tmp="/tmp/.mongodump.$$"
    set +e
    docker exec mongodb mongodump \
        --username "$MONGO_ROOT_USERNAME" \
        --password "$MONGO_ROOT_PASSWORD" \
        --authenticationDatabase admin \
        --archive --gzip >"$tmp" 2>/dev/null
    local dump_rc=$?
    set -e

    if [ $dump_rc -eq 0 ] && [ -s "$tmp" ]; then
        age -r "$AGE_RECIPIENT" <"$tmp" >"$out"
        rm -f "$tmp"
        ITEM_COUNT=$((ITEM_COUNT + 1))
    else
        rm -f "$tmp"
        log "     mongodump failed (auth mismatch?) — falling back to data-dir tarball"
        backup_path "mongodb-datadir" "${REPO_DIR}/mongodb/data"
    fi
}

log "[1/4] Backing up service data..."
for entry in "${TARGETS[@]}"; do
    label="${entry%%:*}"
    target="${entry#*:}"
    if [ "$target" = "__mongodump__" ]; then
        backup_mongodump
    else
        backup_path "$label" "${REPO_DIR}/${target}"
    fi
done

log "[2/4] Backing up compose configs and .env files..."
COMPOSE_OUT="${BACKUP_DIR}/compose-configs.tar.gz.age"
(cd "$REPO_DIR" && tar czf - \
    --exclude='*/node_modules' \
    --exclude='*/data' \
    --exclude='*/logs' \
    --exclude='.git' \
    $(find . -maxdepth 2 -name 'docker-compose.yml' -o -name '.env' | sed 's|^\./||')) \
    | age -r "$AGE_RECIPIENT" > "$COMPOSE_OUT"
ITEM_COUNT=$((ITEM_COUNT + 1))

log "[3/4] Pruning local backups older than ${RETENTION_DAYS} days..."
find "$BACKUP_BASE" -maxdepth 1 -type d -name '20*' -mtime +${RETENTION_DAYS} \
    -exec rm -rf {} \; 2>/dev/null || true

log "[4/4] Offsite sync..."
if [ -n "${RCLONE_REMOTE:-}" ] && command -v rclone >/dev/null; then
    rclone sync "$BACKUP_BASE" "$RCLONE_REMOTE" \
        --exclude 'backup.log' \
        --transfers 4 \
        --retries 3 \
        || die "rclone sync failed"
    log "  → synced to $RCLONE_REMOTE"
else
    log "  → skipped (RCLONE_REMOTE unset or rclone missing)"
fi

TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
log "=== Backup complete: $TOTAL_SIZE, $ITEM_COUNT items ==="
if [ ${#SKIPPED[@]} -gt 0 ]; then
    log "Skipped:"
    for s in "${SKIPPED[@]}"; do log "  - $s"; done
fi

notify_success "$TOTAL_SIZE" "$ITEM_COUNT"
