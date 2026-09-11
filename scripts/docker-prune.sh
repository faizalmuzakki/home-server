#!/bin/bash
# Docker Weekly Prune Script
#
# Removes unused images and build cache older than 168h (7 days).
# Does NOT remove stopped containers — inactive/archived compose stacks (media,
# palu-gada-root-bot) must survive the prune. Named volumes are untouched.
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

log "Running docker image prune -af --filter 'until=168h'..."
docker image prune -af --filter "until=168h"

log "Running docker builder prune -f --filter 'until=168h'..."
docker builder prune -f --filter "until=168h"

log "Weekly Docker prune completed."
