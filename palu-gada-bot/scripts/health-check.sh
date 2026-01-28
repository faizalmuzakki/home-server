#!/bin/bash
# Health check for palu-gada-bot
# Usage: ./scripts/health-check.sh

set -e

cd "$(dirname "$0")/.."

echo "🏥 Palu Gada Bot Health Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if container is running
echo "📦 Container Status:"
if docker ps --format '{{.Names}}' | grep -q '^palu-gada-bot$'; then
    echo "   ✅ Container is running"
    
    # Get container stats
    STATS=$(docker stats palu-gada-bot --no-stream --format "{{.CPUPerc}} {{.MemUsage}}")
    CPU=$(echo $STATS | awk '{print $1}')
    MEM=$(echo $STATS | awk '{print $2}')
    echo "   📊 CPU: ${CPU}, Memory: ${MEM}"
else
    echo "   ❌ Container is not running"
    exit 1
fi

echo ""

# Check API health endpoint
echo "🌐 API Health:"
if curl -sf http://localhost:3003/health > /dev/null 2>&1; then
    RESPONSE=$(curl -s http://localhost:3003/health)
    echo "   ✅ API is responding"
    echo "   Response: ${RESPONSE}"
else
    echo "   ❌ API is not responding on port 3003"
    exit 1
fi

echo ""

# Check database
echo "💾 Database:"
if [ -f "data/bot.db" ]; then
    DB_SIZE=$(du -h data/bot.db | cut -f1)
    echo "   ✅ Database exists (${DB_SIZE})"
else
    echo "   ⚠️  Database not found"
fi

echo ""

# Check logs for errors
echo "📋 Recent Logs (last 20 lines):"
docker compose logs --tail 20 palu-gada-bot 2>/dev/null | sed 's/^/   /'

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Health check complete!"
