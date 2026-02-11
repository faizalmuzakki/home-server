#!/bin/sh
# Generate hooks.json from template by substituting environment variables
# This script is run before starting the webhook container

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Allow explicit override for when called from deploy scripts
# Default: try parent of script dir, else /home-server/webhook
if [ -n "$1" ]; then
    WEBHOOK_DIR="$1"
elif [ -f "$(dirname "$SCRIPT_DIR")/hooks.json.template" ]; then
    WEBHOOK_DIR="$(dirname "$SCRIPT_DIR")"
else
    WEBHOOK_DIR="/home-server/webhook"
fi

# Check if .env exists
if [ -f "$WEBHOOK_DIR/.env" ]; then
    # Export variables from .env
    set -a
    . "$WEBHOOK_DIR/.env"
    set +a
fi

# Verify required variables
if [ -z "$WEBHOOK_SECRET" ]; then
    echo "ERROR: WEBHOOK_SECRET is not set"
    echo "Please create webhook/.env with WEBHOOK_SECRET=<your-secret>"
    exit 1
fi

# Generate hooks.json from template
if [ -f "$WEBHOOK_DIR/hooks.json.template" ]; then
    envsubst < "$WEBHOOK_DIR/hooks.json.template" > "$WEBHOOK_DIR/hooks.json"
    echo "Generated hooks.json from template"
else
    echo "ERROR: hooks.json.template not found in $WEBHOOK_DIR"
    exit 1
fi
