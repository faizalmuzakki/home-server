#!/bin/bash
# Restart palu-gada-bot
# Usage: ./scripts/restart.sh

set -e

cd "$(dirname "$0")/.."

echo "🔄 Restarting Palu Gada Bot..."
echo ""

docker compose restart palu-gada-bot

echo ""
echo "⏳ Waiting for container to be healthy..."
sleep 3

# Check if it's running
if docker ps --format '{{.Names}}' | grep -q '^palu-gada-bot$'; then
    echo "✅ Bot restarted successfully!"
    echo ""
    echo "📋 Recent logs:"
    docker compose logs --tail 10 palu-gada-bot
else
    echo "❌ Bot failed to start!"
    echo ""
    echo "📋 Error logs:"
    docker compose logs --tail 20 palu-gada-bot
    exit 1
fi
