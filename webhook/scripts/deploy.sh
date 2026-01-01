#!/bin/bash
set -e

REPO_NAME=$1
LOG_FILE="/home/solork/Projects/home-server/webhook/deploy.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== Starting deployment for $REPO_NAME ==="

cd /home/solork/Projects/home-server

# Pull latest changes
log "Pulling latest changes..."
git pull origin main

# Services that need rebuilding (use local Dockerfiles)
REBUILD_SERVICES="expense-tracker"

# Function to deploy a service
deploy_service() {
    local dir=$1
    cd /home/solork/Projects/home-server/$dir
    
    if echo "$REBUILD_SERVICES" | grep -qw "$dir"; then
        log "Rebuilding $dir (local build)..."
        docker compose build --no-cache
        docker compose up -d --force-recreate
    else
        log "Updating $dir (image pull)..."
        docker compose pull --quiet 2>/dev/null || true
        docker compose up -d
    fi
}

log "Restarting Docker services..."

# Core services first (order matters)
for dir in traefik mongodb; do
    if [ -f "$dir/docker-compose.yml" ]; then
        deploy_service "$dir"
    fi
done

# Then all other services
for dir in */; do
    dir=${dir%/}
    if [ -f "$dir/docker-compose.yml" ] && [ "$dir" != "traefik" ] && [ "$dir" != "mongodb" ] && [ "$dir" != "webhook" ]; then
        deploy_service "$dir"
    fi
done

log "=== Deployment complete ==="

