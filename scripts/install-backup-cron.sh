#!/bin/bash
# Install daily encrypted backup cron job into root's crontab.
#
# Must be run with sudo:
#   sudo ./scripts/install-backup-cron.sh
#
# Schedule: daily at 03:00 local time.
# Logs:     /data/backups/backup.log

set -e

if [ "$(id -u)" -ne 0 ]; then
    echo "Must run as root: sudo $0"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="${SCRIPT_DIR}/backup-encrypted.sh"

[ -f "$BACKUP_SCRIPT" ] || { echo "Backup script not found at $BACKUP_SCRIPT"; exit 1; }
chmod +x "$BACKUP_SCRIPT"

CRON_JOB="0 3 * * * $BACKUP_SCRIPT"

( crontab -l 2>/dev/null | grep -v "backup-encrypted"; echo "$CRON_JOB" ) | crontab -

echo "Root cron job installed:"
echo "  Schedule : daily at 03:00"
echo "  Script   : $BACKUP_SCRIPT"
echo "  Log file : /data/backups/backup.log"
echo ""
echo "Verify with: sudo crontab -l"
echo "View logs  : tail -f /data/backups/backup.log"
echo "Run now    : sudo $BACKUP_SCRIPT"
