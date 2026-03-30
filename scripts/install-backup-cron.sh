#!/bin/bash
# Install daily encrypted backup cron job
#
# Run as the server user (NOT root):
#   ./scripts/install-backup-cron.sh
#
# The backup runs every day at 02:00 local server time.
# Logs are written to /tmp/home-server-backup.log

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="${SCRIPT_DIR}/backup-encrypted.sh"
LOG_FILE="/tmp/home-server-backup.log"

if [ ! -f "$BACKUP_SCRIPT" ]; then
    echo "Error: backup script not found at $BACKUP_SCRIPT"
    exit 1
fi

chmod +x "$BACKUP_SCRIPT"

CRON_JOB="0 2 * * * $BACKUP_SCRIPT all >> $LOG_FILE 2>&1"

# Remove any pre-existing entry for this script, then add the new one
( crontab -l 2>/dev/null | grep -v "backup-encrypted"; echo "$CRON_JOB" ) | crontab -

echo "Backup cron job installed:"
echo "  Schedule : daily at 02:00"
echo "  Script   : $BACKUP_SCRIPT"
echo "  Log file : $LOG_FILE"
echo ""
echo "Verify with: crontab -l"
echo "View logs : tail -f $LOG_FILE"
