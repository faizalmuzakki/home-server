#!/bin/bash
# Encrypted Backup Restore Script
#
# Usage:
#   ./restore-backup.sh list                        — list available backups
#   ./restore-backup.sh volume <file.tar.gz.age>    — restore a Docker volume
#   ./restore-backup.sh compose <file.tar.gz.age>   — restore a compose config
#
# Prerequisites: age  (sudo apt install age)

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

BACKUP_BASE="/data/backups"
AGE_KEY="${HOME}/.config/age/key.txt"

# ── helpers ──────────────────────────────────────────────────────────────────

require_age() {
    if ! command -v age &>/dev/null; then
        echo -e "${RED}Error: 'age' is not installed${NC}"
        echo "Install with: sudo apt install age"
        exit 1
    fi
}

require_key() {
    if [ ! -f "$AGE_KEY" ]; then
        echo -e "${RED}Error: Age key not found at $AGE_KEY${NC}"
        echo "The key was generated when backups were first created."
        echo "Restore the key file before attempting to decrypt backups."
        exit 1
    fi
}

decrypt_to_tmp() {
    local src=$1
    local tmp
    tmp=$(mktemp /tmp/restore-XXXXXX.tar.gz)
    age -d -i "$AGE_KEY" "$src" > "$tmp"
    echo "$tmp"
}

# ── subcommands ───────────────────────────────────────────────────────────────

cmd_list() {
    if [ ! -d "$BACKUP_BASE" ]; then
        echo -e "${YELLOW}No backups found at $BACKUP_BASE${NC}"
        exit 0
    fi

    echo -e "${CYAN}Available backups:${NC}"
    echo ""

    for date_dir in "$BACKUP_BASE"/*/; do
        [ -d "$date_dir" ] || continue
        local date_label
        date_label=$(basename "$date_dir")
        local size
        size=$(du -sh "$date_dir" 2>/dev/null | cut -f1)
        echo -e "  ${GREEN}${date_label}${NC}  (${size})"

        for f in "$date_dir"*.age; do
            [ -f "$f" ] || continue
            local fname
            fname=$(basename "$f")
            local fsize
            fsize=$(du -h "$f" | cut -f1)
            echo "    └─ $fname  ($fsize)"
        done
        echo ""
    done
}

cmd_volume() {
    local archive=$1

    require_age
    require_key

    if [ ! -f "$archive" ]; then
        echo -e "${RED}Error: File not found: $archive${NC}"
        exit 1
    fi

    # Derive volume name from filename: <vol>.tar.gz.age
    local basename
    basename=$(basename "$archive" .tar.gz.age)

    echo -e "${YELLOW}Restoring volume '${basename}' from:${NC}"
    echo "  $archive"
    echo ""

    # Warn if volume exists
    if docker volume inspect "$basename" &>/dev/null; then
        echo -e "${RED}Warning: Volume '${basename}' already exists.${NC}"
        read -r -p "Overwrite existing data? [y/N] " confirm
        if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
            echo "Aborted."
            exit 0
        fi
    else
        docker volume create "$basename" > /dev/null
    fi

    echo -n "Decrypting... "
    local tmp
    tmp=$(decrypt_to_tmp "$archive")
    echo -e "${GREEN}✓${NC}"

    echo -n "Restoring... "
    docker run --rm \
        -v "${basename}:/data" \
        -v "$(dirname "$tmp"):/backup:ro" \
        alpine sh -c "cd /data && tar xzf /backup/$(basename "$tmp")"
    rm -f "$tmp"
    echo -e "${GREEN}✓${NC}"

    echo ""
    echo -e "${GREEN}Volume '${basename}' restored successfully.${NC}"
}

cmd_compose() {
    local archive=$1

    require_age
    require_key

    if [ ! -f "$archive" ]; then
        echo -e "${RED}Error: File not found: $archive${NC}"
        exit 1
    fi

    echo -e "${YELLOW}Restoring compose config from:${NC}"
    echo "  $archive"
    echo ""

    read -r -p "Restore to directory [current dir]: " dest_dir
    dest_dir="${dest_dir:-.}"

    if [ ! -d "$dest_dir" ]; then
        echo -e "${RED}Error: Directory does not exist: $dest_dir${NC}"
        exit 1
    fi

    echo -n "Decrypting... "
    local tmp
    tmp=$(decrypt_to_tmp "$archive")
    echo -e "${GREEN}✓${NC}"

    echo -n "Extracting to ${dest_dir}... "
    tar xzf "$tmp" -C "$dest_dir"
    rm -f "$tmp"
    echo -e "${GREEN}✓${NC}"

    echo ""
    echo -e "${GREEN}Compose config restored to ${dest_dir}.${NC}"
    echo -e "${YELLOW}Note: Review and update .env values before starting services.${NC}"
}

# ── main ──────────────────────────────────────────────────────────────────────

ACTION=${1:-help}

case "$ACTION" in
    list)
        cmd_list
        ;;
    volume)
        if [ -z "$2" ]; then
            echo "Usage: $0 volume <path/to/volume.tar.gz.age>"
            exit 1
        fi
        cmd_volume "$2"
        ;;
    compose)
        if [ -z "$2" ]; then
            echo "Usage: $0 compose <path/to/compose-service.tar.gz.age>"
            exit 1
        fi
        cmd_compose "$2"
        ;;
    *)
        echo "Encrypted Backup Restore"
        echo ""
        echo "Usage:"
        echo "  $0 list                           List available backups"
        echo "  $0 volume  <file.tar.gz.age>      Restore a Docker volume"
        echo "  $0 compose <file.tar.gz.age>      Restore a compose config"
        echo ""
        echo "Key: $AGE_KEY"
        ;;
esac
