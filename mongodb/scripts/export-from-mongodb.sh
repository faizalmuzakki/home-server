#!/bin/bash
# Export database from MongoDB to shared directory
# Usage: ./export-from-mongodb.sh <database_name>

set -e

# Load environment variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${SCRIPT_DIR}/../.env" ]; then
    source "${SCRIPT_DIR}/../.env"
fi

EXPORT_PATH="/shared/exports"

DB_NAME="${1:-}"

if [ -z "$DB_NAME" ]; then
    echo "Usage: $0 <database_name>"
    echo ""
    echo "Available databases:"
    docker exec mongodb mongosh --quiet --eval 'db.adminCommand("listDatabases").databases.forEach(d => print("  - " + d.name))'
    exit 1
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
EXPORT_DIR="${EXPORT_PATH}/${DB_NAME}_${TIMESTAMP}"

echo "🔄 Exporting database: ${DB_NAME}"
echo "   To: ${EXPORT_DIR}"

# Create export directory
docker exec mongodb mkdir -p "${EXPORT_DIR}"

# Run mongodump
docker exec mongodb mongodump \
    --db="${DB_NAME}" \
    --out="${EXPORT_DIR}"

echo "✅ Export complete!"
echo ""
echo "Export location: /data/shared/exports/${DB_NAME}_${TIMESTAMP}"
echo ""
echo "To copy to another server:"
echo "  scp -r /data/shared/exports/${DB_NAME}_${TIMESTAMP} user@remote:/path/to/destination"
