#!/bin/bash
# Encrypted Backup Restore Script
#
# Usage:
#   ./restore-backup.sh list                          — list available backups
#   ./restore-backup.sh extract <file.age> [dest]     — decrypt & extract a tarball
#   ./restore-backup.sh mongo   <file.archive.age>    — restore a mongodump archive
#   ./restore-backup.sh show    <file.age>            — decrypt to stdout / list contents
#
# Prerequisites: age  (sudo apt install age)

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

BACKUP_BASE="/data/backups"
AGE_KEY="${AGE_KEY:-/etc/home-server/age.key}"

require_age() {
    command -v age >/dev/null || { echo -e "${RED}'age' not installed (sudo apt install age)${NC}"; exit 1; }
}

require_key() {
    [ -f "$AGE_KEY" ] || { echo -e "${RED}Key not found at $AGE_KEY${NC}"; exit 1; }
}

cmd_list() {
    [ -d "$BACKUP_BASE" ] || { echo -e "${YELLOW}No backups at $BACKUP_BASE${NC}"; exit 0; }
    echo -e "${CYAN}Available backups:${NC}"
    echo ""
    for d in "$BACKUP_BASE"/*/; do
        [ -d "$d" ] || continue
        local label size
        label=$(basename "$d")
        size=$(du -sh "$d" 2>/dev/null | cut -f1)
        echo -e "  ${GREEN}${label}${NC}  (${size})"
        for f in "$d"*.age; do
            [ -f "$f" ] || continue
            echo "    └─ $(basename "$f")  ($(du -h "$f" | cut -f1))"
        done
        echo ""
    done
}

cmd_extract() {
    local archive=$1 dest=${2:-.}
    require_age; require_key
    [ -f "$archive" ] || { echo -e "${RED}Not found: $archive${NC}"; exit 1; }
    [ -d "$dest" ] || { echo -e "${RED}Dest dir does not exist: $dest${NC}"; exit 1; }
    echo -e "${YELLOW}Extracting ${archive} → ${dest}${NC}"
    age -d -i "$AGE_KEY" "$archive" | tar xzf - -C "$dest"
    echo -e "${GREEN}✓ done${NC}"
}

cmd_mongo() {
    local archive=$1
    require_age; require_key
    [ -f "$archive" ] || { echo -e "${RED}Not found: $archive${NC}"; exit 1; }
    docker ps --format '{{.Names}}' | grep -q '^mongodb$' \
        || { echo -e "${RED}mongodb container not running${NC}"; exit 1; }
    echo -e "${YELLOW}WARNING: mongorestore will drop collections it replaces.${NC}"
    read -r -p "Continue? [y/N] " c
    [[ "$c" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

    local repo_dir
    repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    # shellcheck disable=SC1091
    set -a; source "${repo_dir}/mongodb/.env"; set +a

    age -d -i "$AGE_KEY" "$archive" \
      | docker exec -i mongodb mongorestore \
          --username "$MONGO_ROOT_USERNAME" \
          --password "$MONGO_ROOT_PASSWORD" \
          --authenticationDatabase admin \
          --archive --gzip --drop
    echo -e "${GREEN}✓ mongo restored${NC}"
}

cmd_show() {
    local archive=$1
    require_age; require_key
    [ -f "$archive" ] || { echo -e "${RED}Not found: $archive${NC}"; exit 1; }
    age -d -i "$AGE_KEY" "$archive" | tar tzf -
}

ACTION=${1:-help}
case "$ACTION" in
    list)    cmd_list ;;
    extract) [ -z "${2:-}" ] && { echo "Usage: $0 extract <file.age> [dest]"; exit 1; }; cmd_extract "$2" "${3:-.}" ;;
    mongo)   [ -z "${2:-}" ] && { echo "Usage: $0 mongo <file.archive.age>";   exit 1; }; cmd_mongo   "$2" ;;
    show)    [ -z "${2:-}" ] && { echo "Usage: $0 show <file.age>";            exit 1; }; cmd_show    "$2" ;;
    *)
        cat <<EOF
Encrypted Backup Restore

Usage:
  $0 list                            List available backups
  $0 show    <file.age>              List contents of an encrypted tarball
  $0 extract <file.age> [dest]       Decrypt & extract to dest (default: .)
  $0 mongo   <mongodb-dump.archive.age>  Restore a MongoDB archive

Key: $AGE_KEY
EOF
        ;;
esac
