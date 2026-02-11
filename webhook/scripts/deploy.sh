#!/bin/sh
# Smart deploy script for home-server
# Usage: ./scripts/deploy.sh [repo_name] [--dry-run]

# Install dependencies if missing (git for diff/pull, curl for notifications, envsubst for hooks)
if ! command -v git >/dev/null 2>&1 || ! command -v ssh >/dev/null 2>&1 || ! command -v envsubst >/dev/null 2>&1; then
    echo "Installing git and curl..."
    apk add --no-cache git curl openssh-client gettext >/dev/null 2>&1
fi

# Configure git safe directory to avoid ownership errors
git config --global --add safe.directory /home-server

set -e

REPO_NAME="${1:-home-server}"
LOG_FILE="/home-server/webhook/deploy.log"
DRY_RUN=false

# Check for dry-run flag
for arg in "$@"; do
    if [ "$arg" = "--dry-run" ]; then
        DRY_RUN=true
        break
    fi
done

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

execute() {
    if [ "$DRY_RUN" = true ]; then
        log "[DRY-RUN] Would execute: $*"
    else
        eval "$@"
    fi
}

# Discord notification function
send_notification() {
    local status=$1
    local message=$2
    local color=$3 # decimal color (65280=green, 16711680=red)
    
    if [ -z "$DISCORD_WEBHOOK_URL" ] || [ "$DRY_RUN" = true ]; then
        return
    fi
    
    # Construct JSON payload using printf to avoid heredoc issues in some shells, keeping it simple
    # Color 65280 is GREEN, 16711680 is RED
    
    # Escape quotes in message
    safe_message=$(echo "$message" | sed 's/"/\\"/g')
    
    json="{\"embeds\":[{\"title\":\"Deployment $status\",\"description\":\"$safe_message\",\"color\":$color,\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}]}"
    
    curl -H "Content-Type: application/json" -d "$json" "$DISCORD_WEBHOOK_URL" >/dev/null 2>&1 || true
}

# Trap exit to check for failure
cleanup() {
    exit_code=$?
    if [ $exit_code -ne 0 ]; then
        send_notification "Failed" "Deployment failed for $REPO_NAME. Check logs." 16711680
    fi
}
trap cleanup EXIT

log "=== Starting deployment for $REPO_NAME ==="
send_notification "Received" "📥 Webhook received for **$REPO_NAME**. Starting deployment..." 3447003

cd /home-server

# Check current HEAD before pull
OLD_HEAD=$(git rev-parse HEAD)

# Pull latest changes
log "Pulling latest changes..."
execute "env GIT_SSH_COMMAND='ssh -o StrictHostKeyChecking=no' git pull origin main"

# Check new HEAD
NEW_HEAD=$(git rev-parse HEAD)

if [ "$OLD_HEAD" = "$NEW_HEAD" ] && [ "$DRY_RUN" = false ]; then
    log "No changes detected. Exiting."
    send_notification "No Changes" "ℹ️ No new commits for **$REPO_NAME**. Nothing to deploy." 8421504
    exit 0
fi

# Get list of changed files
if [ "$OLD_HEAD" != "$NEW_HEAD" ]; then
    CHANGED_FILES=$(git diff --name-only $OLD_HEAD $NEW_HEAD)
else
    # Dry run with no actual changes
    CHANGED_FILES=""
fi

# Extract top-level directories
CHANGED_DIRS=$(echo "$CHANGED_FILES" | cut -d/ -f1 | sort -u)

if [ -z "$CHANGED_DIRS" ]; then
    log "No directory changes detected."
    exit 0
fi

log "Changed directories: $(echo $CHANGED_DIRS | tr '\n' ' ')"

# Services that need explicit rebuild
REBUILD_SERVICES="expense-tracker"

# Function to deploy a service
deploy_service() {
    dir=$1
    if [ ! -d "/home-server/$dir" ]; then
        return
    fi
    # Check if docker-compose exists
    if [ ! -f "/home-server/$dir/docker-compose.yml" ]; then
        return
    fi
    
    cd /home-server/$dir
    
    log "Deploying $dir..."
    
    if echo "$REBUILD_SERVICES" | grep -qw "$dir"; then
         execute "docker compose build --no-cache"
         execute "docker compose up -d --force-recreate"
    else
         execute "docker compose pull --quiet 2>/dev/null || true"
         execute "docker compose up -d"
    fi
}

# Iterate over changed directories
for dir in $CHANGED_DIRS; do
    # Skip excluded
    if [ "$dir" = "webhook" ]; then
        if [ -f "/home-server/webhook/scripts/generate-hooks.sh" ]; then
             log "Regenerating hooks..."
             execute "/home-server/webhook/scripts/generate-hooks.sh"
        fi
        continue
    fi
    
    deploy_service "$dir"
done

# Send success notification if we processed changes
if [ -n "$CHANGED_DIRS" ]; then
    SHORT_OLD=$(echo $OLD_HEAD | cut -c1-7)
    SHORT_NEW=$(echo $NEW_HEAD | cut -c1-7)
    COMMIT_MSG=$(git log --format='%s' -1 $NEW_HEAD 2>/dev/null || echo 'unknown')
    send_notification "Success" "✅ **$REPO_NAME** deployed successfully\n\n**Commit:** \`$SHORT_OLD\` → \`$SHORT_NEW\`\n**Message:** $COMMIT_MSG\n**Services:** $(echo $CHANGED_DIRS | tr '\n' ', ')" 65280
fi

log "=== Deployment complete ==="
