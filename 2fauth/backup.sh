#!/bin/bash
# 2FAuth Database Backup Script
# Creates timestamped backups of the SQLite database

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${SCRIPT_DIR}/data"
BACKUP_DIR="${SCRIPT_DIR}/backups"
DATE=$(date +%Y%m%d_%H%M%S)
KEEP_DAYS=${KEEP_DAYS:-30}  # Keep backups for 30 days by default

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Check if database exists
if [ ! -f "$DATA_DIR/database.sqlite" ]; then
    echo -e "${RED}Error: Database not found at $DATA_DIR/database.sqlite${NC}"
    exit 1
fi

# Create backup
BACKUP_FILE="$BACKUP_DIR/2fauth_backup_${DATE}.sqlite"
echo -e "${YELLOW}Creating backup...${NC}"
cp "$DATA_DIR/database.sqlite" "$BACKUP_FILE"

# Compress backup
gzip "$BACKUP_FILE"
BACKUP_FILE="${BACKUP_FILE}.gz"

echo -e "${GREEN}✓ Backup created: $BACKUP_FILE${NC}"
echo -e "  Size: $(du -h "$BACKUP_FILE" | cut -f1)"

# Cleanup old backups
echo -e "${YELLOW}Cleaning up backups older than ${KEEP_DAYS} days...${NC}"
find "$BACKUP_DIR" -name "2fauth_backup_*.sqlite.gz" -mtime +${KEEP_DAYS} -delete 2>/dev/null || true

# List current backups
echo -e "\n${GREEN}Current backups:${NC}"
ls -lh "$BACKUP_DIR"/*.gz 2>/dev/null || echo "No backups found"
