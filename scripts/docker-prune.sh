#!/bin/bash
# Docker Weekly Prune Script
#
# Cleans up old stopped containers, dangling images, networks, and build cache older than 24h,
# as well as unused images older than 7 days (168h). Preserves named volumes.
#
# Installation as a weekly root cron job (Sunday at 04:00):
#   Run the installer helper script:
#     sudo ./scripts/install-prune-cron.sh
#
#   Or add manually to root crontab (sudo crontab -e):
#     0 4 * * 0 /home/solork/Projects/home-server/scripts/docker-prune.sh >> /var/log/docker-prune.log 2>&1

set -euo pipefail

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

if [ "$(id -u)" -ne 0 ]; then
    log "ERROR: Must run as root (e.g. sudo $0)"
    exit 1
fi

log "Starting weekly Docker prune..."

log "Running docker system prune -af --filter 'until=24h'..."
docker system prune -af --filter "until=24h"

log "Running docker image prune -af --filter 'until=168h'..."
docker image prune -af --filter "until=168h"

log "Weekly Docker prune completed."
