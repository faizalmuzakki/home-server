#!/bin/bash
# MongoDB Atlas to Local Sync Script
# 
# Usage: 
#   ./sync-atlas-db.sh <database_name>
#   ./sync-atlas-db.sh myapp_production
#
# Prerequisites:
#   - mongodump and mongorestore installed (mongodb-database-tools)
#   - Atlas connection string in ATLAS_URI environment variable or .env file
#
# This script:
#   1. Dumps the specified database from MongoDB Atlas
#   2. Saves it to ~/dump/<database_name>
#   3. Restores it to the local MongoDB Docker container

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DUMP_DIR="${HOME}/dump"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOME_SERVER_DIR="$(dirname "$SCRIPT_DIR")"

# Load environment variables from mongodb/.env if exists
if [ -f "${HOME_SERVER_DIR}/mongodb/.env" ]; then
    source "${HOME_SERVER_DIR}/mongodb/.env"
fi

# Check for database name argument
if [ -z "$1" ]; then
    echo -e "${RED}Error: Database name required${NC}"
    echo "Usage: $0 <database_name>"
    echo "Example: $0 myapp_production"
    exit 1
fi

DATABASE_NAME="$1"

# Check for Atlas URI
if [ -z "$ATLAS_URI" ]; then
    echo -e "${YELLOW}ATLAS_URI not set. Please enter your MongoDB Atlas connection string:${NC}"
    read -r ATLAS_URI
fi

# Check for local MongoDB credentials
MONGO_HOST="${MONGO_HOST:-localhost}"
MONGO_PORT="${MONGO_PORT:-27017}"
MONGO_ROOT_USERNAME="${MONGO_ROOT_USERNAME:-}"
MONGO_ROOT_PASSWORD="${MONGO_ROOT_PASSWORD:-}"

echo -e "${GREEN}📦 MongoDB Atlas to Local Sync${NC}"
echo "================================"
echo "Database: ${DATABASE_NAME}"
echo "Dump directory: ${DUMP_DIR}"
echo ""

# Create dump directory
mkdir -p "${DUMP_DIR}"

# Step 1: Dump from Atlas
echo -e "${YELLOW}[1/3] Dumping from MongoDB Atlas...${NC}"
mongodump --uri="${ATLAS_URI}" --db="${DATABASE_NAME}" --out="${DUMP_DIR}" --gzip

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to dump from Atlas${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Dump completed: ${DUMP_DIR}/${DATABASE_NAME}${NC}"

# Step 2: Restore to local MongoDB
echo ""
echo -e "${YELLOW}[2/3] Restoring to local MongoDB...${NC}"

# Build auth string if credentials are set
AUTH_ARGS=""
if [ -n "$MONGO_ROOT_USERNAME" ] && [ -n "$MONGO_ROOT_PASSWORD" ]; then
    AUTH_ARGS="--username=${MONGO_ROOT_USERNAME} --password=${MONGO_ROOT_PASSWORD} --authenticationDatabase=admin"
fi

# Restore using mongorestore
mongorestore \
    --host="${MONGO_HOST}" \
    --port="${MONGO_PORT}" \
    ${AUTH_ARGS} \
    --db="${DATABASE_NAME}" \
    --gzip \
    --drop \
    "${DUMP_DIR}/${DATABASE_NAME}"

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to restore to local MongoDB${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Restore completed${NC}"

# Step 3: Verify
echo ""
echo -e "${YELLOW}[3/3] Verifying...${NC}"

if [ -n "$MONGO_ROOT_USERNAME" ]; then
    COLLECTION_COUNT=$(docker exec mongodb mongosh \
        --username "${MONGO_ROOT_USERNAME}" \
        --password "${MONGO_ROOT_PASSWORD}" \
        --authenticationDatabase admin \
        --quiet \
        --eval "db.getSiblingDB('${DATABASE_NAME}').getCollectionNames().length")
else
    COLLECTION_COUNT=$(docker exec mongodb mongosh \
        --quiet \
        --eval "db.getSiblingDB('${DATABASE_NAME}').getCollectionNames().length")
fi

echo -e "${GREEN}✓ Database '${DATABASE_NAME}' has ${COLLECTION_COUNT} collections${NC}"

echo ""
echo -e "${GREEN}🎉 Sync complete!${NC}"
echo "Dump saved at: ${DUMP_DIR}/${DATABASE_NAME}"
