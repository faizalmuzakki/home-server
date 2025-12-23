#!/bin/bash
# Import database dump into MongoDB
# Usage: ./import-to-mongodb.sh <database_name> [--drop]

set -e

# Load environment variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${SCRIPT_DIR}/../.env" ]; then
    source "${SCRIPT_DIR}/../.env"
fi

MONGO_USER="${MONGO_ROOT_USERNAME:-admin}"
MONGO_PASS="${MONGO_ROOT_PASSWORD:-}"
SHARED_PATH="/shared/imports"

# Parse arguments
DB_NAME="${1:-}"
DROP_FLAG=""

if [ "$2" == "--drop" ]; then
    DROP_FLAG="--drop"
    echo "⚠️  Warning: --drop flag set. Existing collections will be dropped!"
fi

if [ -z "$DB_NAME" ]; then
    echo "Usage: $0 <database_name> [--drop]"
    echo ""
    echo "Available dumps in ${SHARED_PATH}:"
    docker exec mongodb ls -la /shared/imports/ 2>/dev/null || echo "  (none found)"
    exit 1
fi

if [ -z "$MONGO_PASS" ]; then
    echo "❌ Error: MONGO_ROOT_PASSWORD not set. Check your .env file."
    exit 1
fi

echo "🔄 Importing database: ${DB_NAME}"
echo "   From: /shared/imports/${DB_NAME}"
echo "   Drop existing: ${DROP_FLAG:-no}"

# Check if dump exists
if ! docker exec mongodb test -d "/shared/imports/${DB_NAME}"; then
    echo "❌ Error: Dump directory not found: /shared/imports/${DB_NAME}"
    echo ""
    echo "Available dumps:"
    docker exec mongodb ls -la /shared/imports/
    exit 1
fi

# Run mongorestore
docker exec mongodb mongorestore \
    --uri="mongodb://${MONGO_USER}:${MONGO_PASS}@localhost:27017" \
    --authenticationDatabase=admin \
    --nsInclude="${DB_NAME}.*" \
    ${DROP_FLAG} \
    "/shared/imports/${DB_NAME}"

echo "✅ Import complete!"
echo ""
echo "Verify with:"
echo "  docker exec mongodb mongosh -u ${MONGO_USER} -p --eval 'use ${DB_NAME}; db.getCollectionNames()'"
