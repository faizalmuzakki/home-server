#!/bin/bash
# Fast deployment script for palu-gada-bot
# Usage: ./scripts/deploy.sh [--full]

set -e

cd "$(dirname "$0")/.."

echo "🔄 Pulling latest changes..."
git pull

if [ "$1" == "--full" ]; then
    echo "🔨 Full rebuild (clearing cache)..."
    docker compose build --no-cache
else
    echo "🔨 Quick build (using cache)..."
    docker compose build
fi

echo "🚀 Starting containers..."
docker compose up -d

echo "📋 Checking logs..."
sleep 2
docker compose logs --tail 20

echo ""
echo "✅ Deployment complete!"
echo "   Use 'docker compose logs -f' to follow logs"
