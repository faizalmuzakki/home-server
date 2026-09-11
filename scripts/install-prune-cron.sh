#!/bin/bash
# Install weekly docker prune cron job into root's crontab.
#
# Must be run with sudo:
#   sudo ./scripts/install-prune-cron.sh
#
# Schedule: weekly on Sunday at 04:00 local time.
# Logs:     /var/log/docker-prune.log

set -e

if [ "$(id -u)" -ne 0 ]; then
    echo "Must run as root: sudo $0"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRUNE_SCRIPT="${SCRIPT_DIR}/docker-prune.sh"

[ -f "$PRUNE_SCRIPT" ] || { echo "Docker prune script not found at $PRUNE_SCRIPT"; exit 1; }
chmod +x "$PRUNE_SCRIPT"

LOG_FILE="/var/log/docker-prune.log"
CRON_JOB="0 4 * * 0 $PRUNE_SCRIPT >> $LOG_FILE 2>&1"

( crontab -l 2>/dev/null | grep -v "docker-prune.sh"; echo "$CRON_JOB" ) | crontab -

echo "Root cron job installed:"
echo "  Schedule : weekly on Sunday at 04:00"
echo "  Script   : $PRUNE_SCRIPT"
echo "  Log file : $LOG_FILE"
echo ""
echo "Verify with: sudo crontab -l"
echo "View logs  : tail -f $LOG_FILE"
echo "Run now    : sudo $PRUNE_SCRIPT"
