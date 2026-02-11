#!/bin/bash
# View palu-gada-bot logs
# Usage: ./scripts/logs.sh [lines]

LINES="${1:-50}"

cd "$(dirname "$0")/.."

echo "📋 Palu Gada Bot Logs (last ${LINES} lines)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

docker compose logs --tail "${LINES}" -f palu-gada-bot
