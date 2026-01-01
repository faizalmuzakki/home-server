#!/bin/bash
# Encrypted Backup Script
#
# Usage: ./backup-encrypted.sh [volumes|all]
#
# Creates encrypted backups using age encryption
# Backups are stored in /data/backups/YYYYMMDD/
#
# Prerequisites:
#   - age (encryption): sudo apt install age OR brew install age
#   - Generated key pair in ~/.config/age/
#
# First time setup:
#   age-keygen -o ~/.config/age/key.txt
#   # Save the public key for encryption

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
BACKUP_BASE="/data/backups"
BACKUP_DIR="${BACKUP_BASE}/$(date +%Y%m%d)"
AGE_KEY="${HOME}/.config/age/key.txt"
RETENTION_DAYS=30

# Check for age
if ! command -v age &> /dev/null; then
    echo -e "${RED}Error: 'age' is not installed${NC}"
    echo "Install with: sudo apt install age (Linux) or brew install age (macOS)"
    exit 1
fi

# Check for age key
if [ ! -f "$AGE_KEY" ]; then
    echo -e "${YELLOW}Age key not found. Generating new key pair...${NC}"
    mkdir -p "$(dirname "$AGE_KEY")"
    age-keygen -o "$AGE_KEY"
    chmod 600 "$AGE_KEY"
    echo ""
    echo -e "${GREEN}Key generated at: $AGE_KEY${NC}"
    echo -e "${YELLOW}⚠️  IMPORTANT: Back up this key securely! Without it, you cannot decrypt backups.${NC}"
    echo ""
fi

# Get public key for encryption
AGE_RECIPIENT=$(grep "public key:" "$AGE_KEY" | cut -d: -f2 | tr -d ' ')

echo -e "${GREEN}📦 Encrypted Backup Script${NC}"
echo "=========================="
echo "Backup directory: ${BACKUP_DIR}"
echo "Encryption: age (${AGE_RECIPIENT:0:20}...)"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"

backup_volume() {
    local vol=$1
    local output_file="${BACKUP_DIR}/${vol}.tar.gz.age"
    
    echo -n "  Backing up ${vol}... "
    
    docker run --rm \
        -v "${vol}:/data:ro" \
        alpine tar czf - -C /data . 2>/dev/null | \
        age -r "$AGE_RECIPIENT" > "$output_file"
    
    local size=$(du -h "$output_file" | cut -f1)
    echo -e "${GREEN}✓${NC} (${size})"
}

backup_compose() {
    local dir=$1
    local name=$(basename "$dir")
    local output_file="${BACKUP_DIR}/compose-${name}.tar.gz.age"
    
    echo -n "  Backing up ${name} config... "
    
    # Backup docker-compose.yml and .env (excluding .env.example)
    tar czf - -C "$dir" \
        --exclude='*.example' \
        --exclude='node_modules' \
        --exclude='.git' \
        docker-compose.yml .env 2>/dev/null | \
        age -r "$AGE_RECIPIENT" > "$output_file"
    
    echo -e "${GREEN}✓${NC}"
}

echo -e "${YELLOW}[1/3] Backing up Docker volumes...${NC}"
for vol in $(docker volume ls -q); do
    backup_volume "$vol"
done

echo ""
echo -e "${YELLOW}[2/3] Backing up compose configurations...${NC}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOME_SERVER_DIR="$(dirname "$SCRIPT_DIR")"

for dir in "$HOME_SERVER_DIR"/*/; do
    if [ -f "${dir}docker-compose.yml" ] && [ -f "${dir}.env" ]; then
        backup_compose "$dir"
    fi
done

echo ""
echo -e "${YELLOW}[3/3] Cleaning old backups (>${RETENTION_DAYS} days)...${NC}"
find "$BACKUP_BASE" -maxdepth 1 -type d -mtime +${RETENTION_DAYS} -exec rm -rf {} \; 2>/dev/null || true
echo -e "${GREEN}✓${NC} Cleanup complete"

# Calculate total size
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)

echo ""
echo -e "${GREEN}🎉 Backup complete!${NC}"
echo "Location: ${BACKUP_DIR}"
echo "Total size: ${TOTAL_SIZE}"
echo ""
echo "To decrypt a backup:"
echo "  age -d -i ~/.config/age/key.txt backup.tar.gz.age > backup.tar.gz"
