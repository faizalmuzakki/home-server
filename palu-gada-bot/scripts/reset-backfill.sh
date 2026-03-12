#!/bin/bash
# Master reset script for XP backfill
# Usage: ./scripts/reset-backfill.sh <guild_id>

GUILD_ID=$1

if [ -z "$GUILD_ID" ]; then
    echo "Error: Please provide a Guild ID."
    echo "Usage: ./scripts/reset-backfill.sh 661722599654424576"
    exit 1
fi

echo "=== Starting Full Reset for Guild: $GUILD_ID ==="

# 1. Stop Execution
echo "[1/4] Stopping all active backfill processes..."
# Find and kill any node processes running backfill-xp.js
# We use a robust way to find the PID inside the container (if run inside) or on host
for pid in /proc/[0-9]*; do
    if [ -f "$pid/cmdline" ] && grep -q "backfill-xp.js" "$pid/cmdline"; then
        kill -9 ${pid##*/} 2>/dev/null
        echo "  Killed process ${pid##*/}"
    fi
done
# Backup: pkill if available
pkill -f "backfill-xp.js" 2>/dev/null || true
echo "  All backfill processes stopped."

# 2. Reset the guild member exp
echo "[2/4] Resetting guild member XP in database..."
node --input-type=module -e "import Database from 'better-sqlite3'; const db = new Database('/app/data/bot.db'); db.prepare('DELETE FROM user_levels WHERE guild_id = ?').run('$GUILD_ID'); console.log('  XP cleared for guild $GUILD_ID');"

# 3. Remove message ID channel flag
echo "[3/4] Removing backfill progress channel flags..."
node --input-type=module -e "import Database from 'better-sqlite3'; const db = new Database('/app/data/bot.db'); db.prepare('DELETE FROM backfill_progress WHERE guild_id = ?').run('$GUILD_ID'); console.log('  Progress flags cleared for guild $GUILD_ID');"

# 4. Rerun the exec
echo "[4/4] Starting fresh backfill run in background..."
echo "  Check progress with: tail -f /tmp/backfill.log"
nohup node scripts/backfill-xp.js "$GUILD_ID" > /tmp/backfill.log 2>&1 &

echo "=== Reset Complete. Backfill is running in the background. ==="
