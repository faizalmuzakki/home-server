#!/bin/sh
# Smart deploy script for home-server
# Usage: ./scripts/deploy.sh [repo_name] [--dry-run]

# Install dependencies if missing
if ! command -v git >/dev/null 2>&1 || ! command -v ssh >/dev/null 2>&1 || ! command -v envsubst >/dev/null 2>&1 || ! command -v docker >/dev/null 2>&1; then
    echo "Installing git, curl, and docker..."
    apk add --no-cache git curl openssh-client gettext docker-cli docker-cli-compose >/dev/null 2>&1
fi

# Configure git safe directory
git config --global --add safe.directory /home/solork/Projects/home-server

set -e

REPO_NAME="${1:-home-server}"
LOG_FILE="/home/solork/Projects/home-server/webhook/deploy.log"
RUN_LOG=$(mktemp)
DRY_RUN=false

# Check for dry-run flag
for arg in "$@"; do
    if [ "$arg" = "--dry-run" ]; then
        DRY_RUN=true
        break
    fi
done

log() {
    # Log to stdout, main log file, and run-specific log
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE" "$RUN_LOG"
}

escape_json() {
    # Escape backslashes, quotes, newlines, and tabs for JSON
    echo "$1" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | sed ':a;N;$!ba;s/\n/\\n/g' | sed 's/\t/\\t/g'
}

send_notification() {
    local status=$1
    local message=$2
    local color=$3
    
    if [ -z "$DISCORD_WEBHOOK_URL" ] || [ "$DRY_RUN" = true ]; then
        return
    fi
    
    safe_message=$(escape_json "$message")
    
    # Construct JSON payload
    json="{\"embeds\":[{\"title\":\"Deployment $status\",\"description\":\"$safe_message\",\"color\":$color,\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}]}"
    
    curl -H "Content-Type: application/json" -d "$json" "$DISCORD_WEBHOOK_URL" >/dev/null 2>&1 || true
}

execute() {
    log "Exec: $*"
    if [ "$DRY_RUN" = true ]; then return; fi

    # Capture stdout and stderr to a temp file while preserving exit code
    TMP_OUT=$(mktemp)
    
    # Execute command (sh-compatible)
    if eval "$@" > "$TMP_OUT" 2>&1; then
        cat "$TMP_OUT" | tee -a "$LOG_FILE" "$RUN_LOG"
        rm "$TMP_OUT"
        return 0
    else
        local exit_code=$?
        cat "$TMP_OUT" | tee -a "$LOG_FILE" "$RUN_LOG"
        log "❌ Command failed with exit code $exit_code"
        rm "$TMP_OUT"
        return $exit_code
    fi
}

cleanup() {
    exit_code=$?
    if [ $exit_code -ne 0 ]; then
        # Capture last 1500 chars of log for the notification
        LOG_CONTENT=$(tail -c 1500 "$RUN_LOG")
        send_notification "Failed" "Deployment failed for **$REPO_NAME**.\n\n**Error Logs:**\n\`\`\`\n...$LOG_CONTENT\n\`\`\`" 16711680
    fi
    rm -f "$RUN_LOG"
}
trap cleanup EXIT

log "=== Starting deployment for $REPO_NAME ==="
send_notification "Received" "📥 Webhook received for **$REPO_NAME**. Starting deployment..." 3447003

cd /home/solork/Projects/home-server

# Check current HEAD before pull
OLD_HEAD=$(git rev-parse HEAD)

# Pull latest changes
log "Pulling latest changes from origin/main..."
execute "env GIT_SSH_COMMAND='ssh -o StrictHostKeyChecking=no' git fetch origin main"
execute "env GIT_SSH_COMMAND='ssh -o StrictHostKeyChecking=no' git reset --hard origin/main"

# Check new HEAD
NEW_HEAD=$(git rev-parse HEAD)

if [ "$OLD_HEAD" = "$NEW_HEAD" ] && [ "$DRY_RUN" = false ]; then
    log "No changes detected. Exiting."
    send_notification "No Changes" "ℹ️ No new commits for **$REPO_NAME**. Nothing to deploy." 8421504
    exit 0
fi

if [ "$OLD_HEAD" != "$NEW_HEAD" ]; then
    CHANGED_FILES=$(git diff --name-only $OLD_HEAD $NEW_HEAD)
else
    CHANGED_FILES=""
fi

# Extract top-level directories
if [ -n "$CHANGED_FILES" ]; then
    CHANGED_DIRS=$(echo "$CHANGED_FILES" | cut -d/ -f1 | sort -u)
else
    CHANGED_DIRS=""
fi

log "Changed directories: $(echo $CHANGED_DIRS | tr '\n' ' ')"

deploy_service() {
    local service=$1
    if [ -f "$service/docker-compose.yml" ]; then
         log "Deploying $service..."
         cd "/home/solork/Projects/home-server/$service"
         execute "docker compose up -d --remove-orphans"
    fi
}

# Iterate over changed directories
for dir in $CHANGED_DIRS; do
    # Skip excluded
    if [ "$dir" = "webhook" ]; then
        if [ -f "/home/solork/Projects/home-server/webhook/scripts/generate-hooks.sh" ]; then
             log "Regenerating hooks..."
             execute "/home/solork/Projects/home-server/webhook/scripts/generate-hooks.sh"
        fi
        continue
    fi
    
    deploy_service "$dir"
    
    # Post-deploy actions
    if [ "$dir" = "palu-gada-bot" ]; then
        log "Registering Discord commands..."
        # Execute deploy script inside the running container
        # Using docker exec instead of run --rm to use the already running container
        execute "docker exec palu-gada-bot npm run deploy"
    fi
done

# Send success notification
if [ -n "$CHANGED_DIRS" ]; then
    SHORT_OLD=$(echo $OLD_HEAD | cut -c1-7)
    SHORT_NEW=$(echo $NEW_HEAD | cut -c1-7)
    COMMIT_MSG=$(git log --format='%s' -1 $NEW_HEAD 2>/dev/null || echo 'unknown')
    
    # Escape commit message for JSON
    # (actually send_notification handles escaping, so we just pass raw string)
    MSG="✅ **$REPO_NAME** deployed successfully\n\n**Commit:** \`$SHORT_OLD\` → \`$SHORT_NEW\`\n**Message:** $COMMIT_MSG\n**Services:** $(echo $CHANGED_DIRS | tr '\n' ', ')"
    
    send_notification "Success" "$MSG" 65280
fi

log "=== Deployment complete ==="
