#!/bin/bash
# Sync database dump from work server to home server
# Usage: ./sync-from-work.sh [database_name] [--teleport]
#
# Options:
#   --teleport, -t    Use Teleport (tsh) instead of regular SSH/SCP

set -e

# Load environment if exists
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${SCRIPT_DIR}/.env" ]; then
    source "${SCRIPT_DIR}/.env"
fi

# Configuration - Update these values or set in .env
WORK_SERVER_USER="${WORK_SERVER_USER:-your_username}"
WORK_SERVER_HOST="${WORK_SERVER_HOST:-work.server.com}"
WORK_SERVER_PATH="${WORK_SERVER_PATH:-/path/to/dumps}"
LOCAL_SHARED_PATH="${LOCAL_SHARED_PATH:-/data/shared}"

# Teleport configuration (optional)
TELEPORT_PROXY="${TELEPORT_PROXY:-teleport.solork.dev}"
TELEPORT_CLUSTER="${TELEPORT_CLUSTER:-}"

# Parse arguments
USE_TELEPORT=false
DB_NAME=""

for arg in "$@"; do
    case $arg in
        --teleport|-t)
            USE_TELEPORT=true
            shift
            ;;
        *)
            if [ -z "$DB_NAME" ]; then
                DB_NAME="$arg"
            fi
            ;;
    esac
done

echo "🔄 Syncing database dumps from work server..."
echo "   From: ${WORK_SERVER_USER}@${WORK_SERVER_HOST}:${WORK_SERVER_PATH}"
echo "   To:   ${LOCAL_SHARED_PATH}/imports"
echo "   Mode: $([ "$USE_TELEPORT" = true ] && echo "Teleport (tsh)" || echo "Regular SSH")"
echo ""

# Create imports directory if not exists
mkdir -p "${LOCAL_SHARED_PATH}/imports"

# Select SCP command based on mode
if [ "$USE_TELEPORT" = true ]; then
    # Check if logged into Teleport
    if ! tsh status &>/dev/null; then
        echo "🔐 Not logged into Teleport. Logging in..."
        if [ -n "$TELEPORT_CLUSTER" ]; then
            tsh login --proxy="${TELEPORT_PROXY}" --cluster="${TELEPORT_CLUSTER}"
        else
            tsh login --proxy="${TELEPORT_PROXY}"
        fi
    fi
    SCP_CMD="tsh scp"
else
    SCP_CMD="scp"
fi

if [ -n "$DB_NAME" ]; then
    # Sync specific database
    echo "📦 Syncing database: ${DB_NAME}"
    $SCP_CMD -r "${WORK_SERVER_USER}@${WORK_SERVER_HOST}:${WORK_SERVER_PATH}/${DB_NAME}" \
        "${LOCAL_SHARED_PATH}/imports/"
else
    # Sync all dumps
    echo "📦 Syncing all database dumps..."
    $SCP_CMD -r "${WORK_SERVER_USER}@${WORK_SERVER_HOST}:${WORK_SERVER_PATH}/*" \
        "${LOCAL_SHARED_PATH}/imports/"
fi

echo ""
echo "✅ Sync complete!"
echo ""
echo "Next steps:"
echo "  1. Run: ./import-to-mongodb.sh [database_name]"
echo "  2. Or manually: docker exec mongodb mongorestore --uri='mongodb://admin:password@localhost:27017' /shared/imports/[db_name]"
