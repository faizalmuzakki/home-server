#!/bin/bash
# Master reset script for XP backfill
# Usage: ./scripts/reset-backfill.sh <guild_id>

GUILD_ID=$1

if [ -z "$GUILD_ID" ]; then
    echo "Error: Please provide a Guild ID."
    echo "Usage: ./scripts/reset-backfill.sh 661722599654424576"
    exit 1
fi

CONTAINER_NAME="palu-gada-bot"

echo "=== Starting Full Reset for Guild: $GUILD_ID ==="

# 1. Stop Execution
echo "[1/4] Stopping all active backfill processes..."
docker exec "$CONTAINER_NAME" sh -c 'for pid in /proc/[0-9]*; do [ -f "$pid/cmdline" ] && grep -q "backfill-xp.js" "$pid/cmdline" 2>/dev/null && kill -9 ${pid##*/} && echo "  Killed process ${pid##*/}"; done; echo "  Done."' 2>/dev/null || echo "  No backfill process was running."

# 2 & 3. Reset XP and progress — write a temp script into /app inside the container so imports resolve correctly
echo "[2/4] Resetting guild member XP and backfill progress..."
docker exec "$CONTAINER_NAME" sh -c "cat > /app/_reset-tmp.mjs << 'EOF'
import Database from 'better-sqlite3';
const db = new Database('/app/data/bot.db');
db.pragma('journal_mode = WAL');
const xp = db.prepare('DELETE FROM user_levels WHERE guild_id = ?').run(process.argv[2]);
console.log('  XP cleared: ' + xp.changes + ' rows deleted');
try {
    const prog = db.prepare('DELETE FROM backfill_progress WHERE guild_id = ?').run(process.argv[2]);
    console.log('  Progress flags cleared: ' + prog.changes + ' rows deleted');
} catch(e) {
    console.log('  No backfill_progress table yet (OK)');
}
db.close();
EOF
node /app/_reset-tmp.mjs $GUILD_ID && rm -f /app/_reset-tmp.mjs"
if [ $? -ne 0 ]; then
    echo "  ERROR: Reset failed! Aborting."
    exit 1
fi

# 4. Rerun the exec inside the container
echo "[4/4] Starting fresh backfill run inside container..."
echo "  Check progress with: docker exec -it $CONTAINER_NAME tail -f /tmp/backfill.log"
docker exec -d "$CONTAINER_NAME" sh -c "node /app/scripts/backfill-xp.js $GUILD_ID > /tmp/backfill.log 2>&1"

echo "=== Reset Complete. Backfill is running in the background. ==="
