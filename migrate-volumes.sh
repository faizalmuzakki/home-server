#!/bin/bash
# Migration script: Named Volumes → Bind Mounts
# This script copies data from Docker named volumes to local directories
# Run this on your server BEFORE redeploying with the new docker-compose files

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

HOME_SERVER_PATH="${HOME_SERVER_PATH:-/home/solork/Projects/home-server}"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Docker Named Volumes → Bind Mounts Migration Script     ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Function to migrate a volume
migrate_volume() {
    local VOLUME_NAME="$1"
    local CONTAINER_NAME="$2"
    local CONTAINER_PATH="$3"
    local LOCAL_PATH="$4"
    
    echo -e "${YELLOW}┌─────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${YELLOW}│ Migrating: ${VOLUME_NAME}${NC}"
    echo -e "${YELLOW}│ From container: ${CONTAINER_NAME}:${CONTAINER_PATH}${NC}"
    echo -e "${YELLOW}│ To: ${LOCAL_PATH}${NC}"
    echo -e "${YELLOW}└─────────────────────────────────────────────────────────────┘${NC}"
    
    # Check if container exists
    if ! docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo -e "${RED}  ✗ Container ${CONTAINER_NAME} not found, skipping...${NC}"
        return 0
    fi
    
    # Create local directory
    mkdir -p "$LOCAL_PATH"
    
    # Copy data from container
    if docker cp "${CONTAINER_NAME}:${CONTAINER_PATH}/." "$LOCAL_PATH/" 2>/dev/null; then
        echo -e "${GREEN}  ✓ Successfully migrated ${VOLUME_NAME}${NC}"
    else
        echo -e "${RED}  ✗ Failed to migrate ${VOLUME_NAME} (container might be stopped)${NC}"
        # Try starting container temporarily
        echo -e "${YELLOW}  → Attempting to start container temporarily...${NC}"
        if docker start "${CONTAINER_NAME}" 2>/dev/null; then
            sleep 2
            if docker cp "${CONTAINER_NAME}:${CONTAINER_PATH}/." "$LOCAL_PATH/" 2>/dev/null; then
                echo -e "${GREEN}  ✓ Successfully migrated ${VOLUME_NAME}${NC}"
            else
                echo -e "${RED}  ✗ Still failed to migrate ${VOLUME_NAME}${NC}"
            fi
            docker stop "${CONTAINER_NAME}" 2>/dev/null || true
        fi
    fi
    echo ""
}

# Function to set correct ownership
fix_ownership() {
    local PATH_TO_FIX="$1"
    local OWNER="${2:-1000:1000}"
    
    if [ -d "$PATH_TO_FIX" ]; then
        echo -e "${YELLOW}  → Setting ownership of ${PATH_TO_FIX} to ${OWNER}${NC}"
        sudo chown -R "$OWNER" "$PATH_TO_FIX" 2>/dev/null || true
    fi
}

echo -e "${BLUE}Starting migration...${NC}"
echo ""

# ══════════════════════════════════════════════════════════════
# CRITICAL - Password/Auth data
# ══════════════════════════════════════════════════════════════

echo -e "${RED}━━━ CRITICAL DATA ━━━${NC}"

# Vaultwarden (Password vault)
migrate_volume "vaultwarden_data" "vaultwarden" "/data" \
    "${HOME_SERVER_PATH}/vaultwarden/data"

# 2FAuth (2FA tokens)
migrate_volume "2fauth_data" "2fauth" "/srv" \
    "${HOME_SERVER_PATH}/2fauth/data"

# ══════════════════════════════════════════════════════════════
# DATABASES
# ══════════════════════════════════════════════════════════════

echo -e "${RED}━━━ DATABASES ━━━${NC}"

# MongoDB
migrate_volume "mongodb_data" "mongodb" "/data/db" \
    "${HOME_SERVER_PATH}/mongodb/data/db"
migrate_volume "mongodb_config" "mongodb" "/data/configdb" \
    "${HOME_SERVER_PATH}/mongodb/data/configdb"

# Expense Tracker API
migrate_volume "expense-tracker_api_data" "expense-tracker-api" "/app/data" \
    "${HOME_SERVER_PATH}/expense-tracker/api/data"

# ══════════════════════════════════════════════════════════════
# HOME AUTOMATION
# ══════════════════════════════════════════════════════════════

echo -e "${BLUE}━━━ HOME AUTOMATION ━━━${NC}"

# Home Assistant
migrate_volume "homeassistant_config" "homeassistant" "/config" \
    "${HOME_SERVER_PATH}/homeassistant/homeassistant"

# Mosquitto MQTT
migrate_volume "mosquitto_config" "mosquitto" "/mosquitto/config" \
    "${HOME_SERVER_PATH}/homeassistant/mosquitto/config"
migrate_volume "mosquitto_data" "mosquitto" "/mosquitto/data" \
    "${HOME_SERVER_PATH}/homeassistant/mosquitto/data"
migrate_volume "mosquitto_log" "mosquitto" "/mosquitto/log" \
    "${HOME_SERVER_PATH}/homeassistant/mosquitto/log"

# Zigbee2MQTT
migrate_volume "zigbee2mqtt_data" "zigbee2mqtt" "/app/data" \
    "${HOME_SERVER_PATH}/homeassistant/zigbee2mqtt"

# ══════════════════════════════════════════════════════════════
# MEDIA STACK
# ══════════════════════════════════════════════════════════════

echo -e "${BLUE}━━━ MEDIA STACK ━━━${NC}"

# Jellyfin
migrate_volume "jellyfin_config" "jellyfin" "/config" \
    "${HOME_SERVER_PATH}/media/jellyfin/config"
migrate_volume "jellyfin_cache" "jellyfin" "/cache" \
    "${HOME_SERVER_PATH}/media/jellyfin/cache"

# Sonarr
migrate_volume "sonarr_config" "sonarr" "/config" \
    "${HOME_SERVER_PATH}/media/sonarr"

# Radarr
migrate_volume "radarr_config" "radarr" "/config" \
    "${HOME_SERVER_PATH}/media/radarr"

# Prowlarr
migrate_volume "prowlarr_config" "prowlarr" "/config" \
    "${HOME_SERVER_PATH}/media/prowlarr"

# qBittorrent
migrate_volume "qbittorrent_config" "qbittorrent" "/config" \
    "${HOME_SERVER_PATH}/media/qbittorrent"

# Bazarr
migrate_volume "bazarr_config" "bazarr" "/config" \
    "${HOME_SERVER_PATH}/media/bazarr"

# ══════════════════════════════════════════════════════════════
# NETWORKING & SECURITY
# ══════════════════════════════════════════════════════════════

echo -e "${BLUE}━━━ NETWORKING & SECURITY ━━━${NC}"

# AdGuard
migrate_volume "adguard_work" "adguard" "/opt/adguardhome/work" \
    "${HOME_SERVER_PATH}/adguard/work"
migrate_volume "adguard_conf" "adguard" "/opt/adguardhome/conf" \
    "${HOME_SERVER_PATH}/adguard/conf"

# CrowdSec
migrate_volume "crowdsec_data" "crowdsec" "/var/lib/crowdsec/data" \
    "${HOME_SERVER_PATH}/crowdsec/data"
migrate_volume "crowdsec_config" "crowdsec" "/etc/crowdsec" \
    "${HOME_SERVER_PATH}/crowdsec/config"

# Traefik logs
migrate_volume "traefik_logs" "traefik" "/logs" \
    "${HOME_SERVER_PATH}/traefik/logs"

# ══════════════════════════════════════════════════════════════
# MONITORING & UTILITIES
# ══════════════════════════════════════════════════════════════

echo -e "${BLUE}━━━ MONITORING & UTILITIES ━━━${NC}"

# Uptime Kuma
migrate_volume "uptime_kuma_data" "uptime-kuma" "/app/data" \
    "${HOME_SERVER_PATH}/uptime-kuma/data"

# Dockge
migrate_volume "dockge_data" "dockge" "/app/data" \
    "${HOME_SERVER_PATH}/dockge/data"

# Syncthing
migrate_volume "syncthing_config" "syncthing" "/config" \
    "${HOME_SERVER_PATH}/syncthing/config"

# Netdata
migrate_volume "netdata_config" "netdata" "/etc/netdata" \
    "${HOME_SERVER_PATH}/netdata/config"
migrate_volume "netdata_lib" "netdata" "/var/lib/netdata" \
    "${HOME_SERVER_PATH}/netdata/lib"
migrate_volume "netdata_cache" "netdata" "/var/cache/netdata" \
    "${HOME_SERVER_PATH}/netdata/cache"

# WhatsApp Bot (Expense Tracker)
migrate_volume "expense-tracker_whatsapp_auth" "expense-tracker-whatsapp" "/app/auth_info" \
    "${HOME_SERVER_PATH}/expense-tracker/whatsapp-bot/auth_info"

# ══════════════════════════════════════════════════════════════
# FIX OWNERSHIP
# ══════════════════════════════════════════════════════════════

echo -e "${BLUE}━━━ FIXING OWNERSHIP ━━━${NC}"

# Most services run as UID 1000
fix_ownership "${HOME_SERVER_PATH}/media" "1000:1000"
fix_ownership "${HOME_SERVER_PATH}/syncthing/config" "1000:1000"
fix_ownership "${HOME_SERVER_PATH}/netdata" "root:root"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    Migration Complete!                       ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Review the migrated data in each service directory"
echo "2. Pull the latest docker-compose changes: git pull"
echo "3. Stop all services: for d in */; do (cd \"\$d\" && docker compose down 2>/dev/null); done"
echo "4. Start services with new bind mounts: for d in */; do (cd \"\$d\" && docker compose up -d 2>/dev/null); done"
echo ""
echo -e "${YELLOW}Optional cleanup (after verifying everything works):${NC}"
echo "docker volume prune  # Remove unused volumes"
echo ""
echo -e "${RED}⚠️  IMPORTANT: Keep a backup before running 'docker volume prune'!${NC}"
