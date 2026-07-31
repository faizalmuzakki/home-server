#!/bin/bash
# Migrate Docker Data Root (/var/lib/docker -> /data/docker)
# Run with: sudo ./scripts/migrate-docker-data-root.sh [TARGET_DIR]

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root: sudo $0${NC}"
    exit 1
fi

TARGET_DIR="${1:-/data/docker}"
SOURCE_DIR="/var/lib/docker"

echo ""
echo -e "${YELLOW}🐳 Docker Data Root Migration${NC}"
echo "=============================="
echo "Source: $SOURCE_DIR"
echo "Target: $TARGET_DIR"
echo ""

# Check if target parent directory exists/is mounted
TARGET_PARENT=$(dirname "$TARGET_DIR")
if [ ! -d "$TARGET_PARENT" ]; then
    echo -e "${RED}Error: Target parent directory $TARGET_PARENT does not exist.${NC}"
    exit 1
fi

# Check current Docker root
CURRENT_ROOT=""
if command -v docker >/dev/null 2>&1 && systemctl is-active --quiet docker; then
    CURRENT_ROOT=$(docker info -f '{{.DockerRootDir}}' 2>/dev/null || true)
fi

if [ "$CURRENT_ROOT" = "$TARGET_DIR" ]; then
    echo -e "${GREEN}✓ Docker is already using data-root: $TARGET_DIR${NC}"
    exit 0
fi

echo -e "${YELLOW}This script will:${NC}"
echo "  1. Stop docker service & socket"
echo "  2. Rsync contents from $SOURCE_DIR to $TARGET_DIR"
echo "  3. Update /etc/docker/daemon.json data-root setting"
echo "  4. Restart docker service & verify"
echo ""

read -p "Proceed with migration? (yes/no) " -r
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "Migration cancelled."
    exit 1
fi

echo ""
echo -e "${GREEN}1. Creating target directory...${NC}"
mkdir -p "$TARGET_DIR"

echo -e "${GREEN}2. Stopping Docker daemon...${NC}"
systemctl stop docker.service docker.socket || true

echo -e "${GREEN}3. Rsyncing Docker data root (this may take a few minutes)...${NC}"
if [ -d "$SOURCE_DIR" ]; then
    rsync -aHAX --info=progress2 "$SOURCE_DIR/" "$TARGET_DIR/"
fi

echo -e "${GREEN}4. Updating /etc/docker/daemon.json...${NC}"
mkdir -p /etc/docker
CONFIG_FILE="/etc/docker/daemon.json"

if [ -f "$CONFIG_FILE" ]; then
    cp "$CONFIG_FILE" "${CONFIG_FILE}.bak.$(date +%Y%m%d%H%M%S)"
fi

python3 -c "
import json, os

config_path = '$CONFIG_FILE'
target_dir = '$TARGET_DIR'

data = {}
if os.path.exists(config_path) and os.path.getsize(config_path) > 0:
    try:
        with open(config_path, 'r') as f:
            data = json.load(f)
    except Exception:
        data = {}

data['data-root'] = target_dir

with open(config_path, 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
"

echo -e "${GREEN}5. Restarting Docker daemon...${NC}"
systemctl start docker.service

NEW_ROOT=$(docker info -f '{{.DockerRootDir}}')
echo ""
echo "============================================"
echo -e "${GREEN}✅ Docker Data Root Migration Complete!${NC}"
echo "============================================"
echo "Active Docker Root: $NEW_ROOT"
echo ""
if [ "$NEW_ROOT" = "$TARGET_DIR" ]; then
    echo -e "${GREEN}✓ Migration successfully verified.${NC}"
    echo "Once you confirm all containers are functioning properly, you can clean up the old data:"
    echo "  sudo rm -rf $SOURCE_DIR"
else
    echo -e "${RED}⚠️ Warning: Docker root is reporting '$NEW_ROOT' instead of '$TARGET_DIR'. Please verify /etc/docker/daemon.json.${NC}"
fi
echo ""
