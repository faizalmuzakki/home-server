#!/bin/bash
# Network watchdog — reboots the server if network is persistently dead.
#
# Designed for the RTL8192CU USB wifi adapter which silently freezes
# under sustained uptime. Runs via root's crontab every 5 minutes.
#
# Strategy:
#   1. Ping the gateway
#   2. If fail → attempt wifi interface reset (ip link down/up)
#   3. Wait 30s, re-ping
#   4. If still fail → increment a persistent failure counter
#   5. After 3 consecutive failures (~15 min) → reboot
#   6. Any success → reset the counter
#
# Safety: won't reboot if uptime < 10 minutes (prevents reboot loops).

set -u

GATEWAY="${GATEWAY:-192.168.1.1}"
WIFI_IF="${WIFI_IF:-wlx001f0563bcfe}"
FAIL_FILE="/tmp/network-watchdog-failures"
MAX_FAILURES=3
MIN_UPTIME_SEC=600
LOG="/data/backups/network-watchdog.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

# Don't reboot if we just started — prevents reboot loops
uptime_sec=$(awk '{print int($1)}' /proc/uptime)
if [ "$uptime_sec" -lt "$MIN_UPTIME_SEC" ]; then
    exit 0
fi

# Read current failure count
failures=0
if [ -f "$FAIL_FILE" ]; then
    failures=$(cat "$FAIL_FILE" 2>/dev/null || echo 0)
fi

# Test 1: ping gateway
if ping -c 3 -W 5 "$GATEWAY" >/dev/null 2>&1; then
    # Network is fine — reset counter if it was nonzero
    if [ "$failures" -gt 0 ]; then
        log "Network recovered after $failures failure(s)"
        echo 0 > "$FAIL_FILE"
    fi
    exit 0
fi

# Ping failed — try to recover wifi
log "Ping $GATEWAY failed (attempt $(( failures + 1 ))/$MAX_FAILURES). Resetting $WIFI_IF..."
ip link set "$WIFI_IF" down 2>/dev/null
sleep 2
ip link set "$WIFI_IF" up 2>/dev/null
sleep 30

# Test 2: re-ping after wifi reset
if ping -c 3 -W 5 "$GATEWAY" >/dev/null 2>&1; then
    log "Wifi reset fixed it — network recovered"
    echo 0 > "$FAIL_FILE"
    exit 0
fi

# Still dead — increment counter
failures=$(( failures + 1 ))
echo "$failures" > "$FAIL_FILE"
log "Network still dead after wifi reset. Consecutive failures: $failures/$MAX_FAILURES"

if [ "$failures" -ge "$MAX_FAILURES" ]; then
    log "REBOOTING — network unreachable for $MAX_FAILURES consecutive checks"
    echo 0 > "$FAIL_FILE"
    sync
    /sbin/reboot
fi
