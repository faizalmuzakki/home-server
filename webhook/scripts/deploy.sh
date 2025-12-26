#!/bin/bash
set -e

REPO_NAME=$1
LOG_FILE="/home-server/webhook/deploy.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== Starting deployment for $REPO_NAME ==="

cd /home-server

# Pull latest changes
log "Pulling latest changes..."
git pull origin main

# Find all docker-compose.yml files and restart them
log "Restarting Docker services..."

# Core services first
for dir in traefik mongodb; do
    if [ -f "$dir/docker-compose.yml" ]; then
        log "Restarting $dir..."
        cd /home-server/$dir
        docker compose pull --quiet
        docker compose up -d
    fi
done

# Then all other services
for dir in */; do
    dir=${dir%/}
    if [ -f "$dir/docker-compose.yml" ] && [ "$dir" != "traefik" ] && [ "$dir" != "mongodb" ] && [ "$dir" != "webhook" ]; then
        log "Restarting $dir..."
        cd /home-server/$dir
        docker compose pull --quiet 2>/dev/null || true
        docker compose up -d
    fi
done

log "=== Deployment complete ==="
