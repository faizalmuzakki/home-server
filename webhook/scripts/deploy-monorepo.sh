#!/bin/sh
# Smart deploy script for monorepo
# Usage: ./scripts/deploy-monorepo.sh [repository.name]

# Install dependencies if missing (git for diff/pull, su-exec for dropping privileges)
# Check if dependencies are installed
if ! command -v git >/dev/null 2>&1 || ! command -v ssh >/dev/null 2>&1 || ! command -v su-exec >/dev/null 2>&1 || ! command -v docker >/dev/null 2>&1; then
    echo "Installing git, curl, su-exec, and docker..."
    apk add --no-cache git curl su-exec openssh-client docker-cli docker-cli-compose >/dev/null 2>&1
fi

# Configure git safe directory for both root and webhook user (needed for git commands in mounted volume)
git config --global --add safe.directory /home/solork/Projects/monorepo

set -e

REPO_NAME="${1:-monorepo}"
LOG_FILE="/home-server/webhook/deploy-monorepo.log"
MONOREPO_DIR="/home/solork/Projects/monorepo"
# User ID to run git commands as (matches host user usually 1000)
GIT_USER="webhook"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Wrapper to run commands as non-root user for git operations
run_as_user() {
    if [ "$(id -u)" = "0" ]; then
        # Check if user exists, create if not (alpine specific)
        if ! id -u $GIT_USER >/dev/null 2>&1; then
            adduser -D -u 1000 $GIT_USER
        fi
        su-exec $GIT_USER "$@"
    else
        "$@"
    fi
}

# Discord notification (same as deploy.sh)
send_notification() {
    local status=$1
    local message=$2
    local color=$3
    
    if [ -z "$DISCORD_WEBHOOK_URL" ]; then
        return
    fi
    
    # Escape quotes
    safe_message=$(echo "$message" | sed 's/"/\\"/g')
    
    # Simple JSON payload
    json="{\"embeds\":[{\"title\":\"Monorepo Deploy ${status}\",\"description\":\"${safe_message}\",\"color\":${color},\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}]}"
    
    curl -H "Content-Type: application/json" -d "$json" "$DISCORD_WEBHOOK_URL" >/dev/null 2>&1 || true
}

# Trap exit
cleanup() {
    exit_code=$?
    if [ $exit_code -ne 0 ]; then
        send_notification "Failed" "Deployment failed for $REPO_NAME. Check logs." 16711680
    fi
}
trap cleanup EXIT

log "=== Starting deployment for $REPO_NAME ==="
send_notification "Received" "📥 Webhook received for **monorepo**. Starting deployment..." 3447003

cd "$MONOREPO_DIR"

# Check ownership of .git directory
if [ -d ".git" ]; then
    owner=$(stat -c '%u' .git)
    if [ "$owner" != "1000" ] && [ "$(id -u)" = "0" ]; then
        log "Warning: .git directory owned by $owner (expected 1000). Fixing permissions..."
        chown -R 1000:1000 .git
    fi
fi

# Check current HEAD
OLD_HEAD=$(run_as_user env GIT_SSH_COMMAND='ssh -o StrictHostKeyChecking=no' git rev-parse HEAD)

# Pull latest changes (Using fetch + reset --hard to handle forced pushes)
log "Pulling latest changes..."
run_as_user env GIT_SSH_COMMAND='ssh -o StrictHostKeyChecking=no' git fetch origin main
run_as_user env GIT_SSH_COMMAND='ssh -o StrictHostKeyChecking=no' git reset --hard origin/main

# Check new HEAD
NEW_HEAD=$(run_as_user git rev-parse HEAD)

if [ "$OLD_HEAD" = "$NEW_HEAD" ]; then
    log "No changes detected. Exiting."
    send_notification "No Changes" "ℹ️ No new commits for **monorepo**. Nothing to deploy." 8421504
    exit 0
fi

# Get changed files
CHANGED_FILES=$(run_as_user git diff --name-only $OLD_HEAD $NEW_HEAD)
# Extract top-level directories
CHANGED_DIRS=$(echo "$CHANGED_FILES" | cut -d/ -f1 | sort -u)

if [ -z "$CHANGED_DIRS" ]; then
    log "No directory changes detected."
    exit 0
fi

log "Changed projects: $(echo $CHANGED_DIRS | tr '\n' ' ')"

# Configure safe directory for /monorepo again just in case su-exec needs it
run_as_user git config --global --add safe.directory /home/solork/Projects/monorepo || true

# Function to deploy a project
deploy_project() {
    project=$1
    if [ ! -d "$MONOREPO_DIR/$project" ]; then
        return
    fi
    if [ ! -f "$MONOREPO_DIR/$project/docker-compose.yml" ]; then
        return
    fi
    
    log "Deploying $project..."
    
    cd "$MONOREPO_DIR/$project"
    
    # Check if build is required (if Dockerfile or package.json changed)
    NEEDS_BUILD=false
    if echo "$CHANGED_FILES" | grep -q "^$project/Dockerfile" || echo "$CHANGED_FILES" | grep -q "^$project/package.json"; then
        NEEDS_BUILD=true
    fi
    
    if [ "$NEEDS_BUILD" = true ]; then
         log "Rebuilding $project..."
         docker compose build --no-cache
         docker compose up -d --force-recreate
    else
         log "Restarting $project..."
         # Try pull if image-based, otherwise just up
         docker compose pull --quiet 2>/dev/null || true
         docker compose up -d
    fi
}

for dir in $CHANGED_DIRS; do
    deploy_project "$dir"
done

if [ -n "$CHANGED_DIRS" ]; then
    SHORT_OLD=$(echo $OLD_HEAD | cut -c1-7)
    SHORT_NEW=$(echo $NEW_HEAD | cut -c1-7)
    COMMIT_MSG=$(run_as_user git log --format='%s' -1 $NEW_HEAD 2>/dev/null || echo 'unknown')
    send_notification "Success" "✅ **monorepo** deployed successfully\n\n**Commit:** \`$SHORT_OLD\` → \`$SHORT_NEW\`\n**Message:** $COMMIT_MSG\n**Projects:** $(echo $CHANGED_DIRS | tr '\n' ', ')" 65280
fi

log "=== Deployment complete ==="
