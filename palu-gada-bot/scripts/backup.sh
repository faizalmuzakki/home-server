#!/bin/bash
# Backup palu-gada-bot data
# Usage: ./scripts/backup.sh [backup-dir]

set -e

cd "$(dirname "$0")/.."

BACKUP_DIR="${1:-/data/backups/palu-gada-bot}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="${BACKUP_DIR}/${TIMESTAMP}"

echo "🗄️  Backing up Palu Gada Bot..."
echo "   Source: $(pwd)/data"
echo "   Destination: ${BACKUP_PATH}"
echo ""

# Create backup directory
mkdir -p "${BACKUP_PATH}"

# Backup database
if [ -f "data/bot.db" ]; then
    echo "📦 Backing up database..."
    cp data/bot.db "${BACKUP_PATH}/bot.db"
    echo "   ✅ bot.db ($(du -h data/bot.db | cut -f1))"
else
    echo "   ⚠️  No database found"
fi

# Backup logs (last 7 days)
if [ -d "logs" ] && [ "$(ls -A logs 2>/dev/null)" ]; then
    echo "📋 Backing up recent logs..."
    mkdir -p "${BACKUP_PATH}/logs"
    find logs -type f -mtime -7 -exec cp {} "${BACKUP_PATH}/logs/" \;
    echo "   ✅ logs ($(du -sh "${BACKUP_PATH}/logs" | cut -f1))"
fi

# Create compressed archive
echo "🗜️  Compressing backup..."
cd "${BACKUP_DIR}"
tar -czf "${TIMESTAMP}.tar.gz" "${TIMESTAMP}"
rm -rf "${TIMESTAMP}"

echo ""
echo "✅ Backup complete!"
echo "   File: ${BACKUP_DIR}/${TIMESTAMP}.tar.gz"
echo "   Size: $(du -h "${BACKUP_DIR}/${TIMESTAMP}.tar.gz" | cut -f1)"
echo ""

# Clean old backups (keep last 7)
echo "🧹 Cleaning old backups (keeping last 7)..."
ls -t "${BACKUP_DIR}"/*.tar.gz 2>/dev/null | tail -n +8 | xargs rm -f 2>/dev/null || true
echo "   Current backups: $(ls -1 "${BACKUP_DIR}"/*.tar.gz 2>/dev/null | wc -l | tr -d ' ')"
