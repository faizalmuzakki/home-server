#!/bin/bash
# deploy-expense-tracker.sh
# Quick deployment script for the expense-tracker service
# Usage: ./scripts/deploy-expense-tracker.sh [component]
#   component: api, whatsapp, frontend, or all (default)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOME_SERVER_DIR="${SCRIPT_DIR}/.."
EXPENSE_TRACKER_DIR="${HOME_SERVER_DIR}/expense-tracker"
EXPENSES_FE_DIR="${HOME_SERVER_DIR}/../expenses"
LOG_FILE="${SCRIPT_DIR}/deploy-expense-tracker.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${BLUE}[$timestamp]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}✓${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}✗${NC} $1" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}!${NC} $1" | tee -a "$LOG_FILE"
}

# Pull latest code
pull_latest() {
    log "Pulling latest changes..."
    
    # Home server repo (backend)
    if [ -d "$HOME_SERVER_DIR/.git" ]; then
        cd "$HOME_SERVER_DIR"
        git pull origin main
        success "Updated home-server repo"
    fi
    
    # Expenses frontend repo
    if [ -d "$EXPENSES_FE_DIR/.git" ]; then
        cd "$EXPENSES_FE_DIR"
        git pull origin main
        success "Updated expenses frontend repo"
    fi
}

# Deploy API and/or WhatsApp bot
deploy_backend() {
    local component=$1  # api, whatsapp, or both
    
    log "Deploying expense-tracker backend..."
    cd "$EXPENSE_TRACKER_DIR"
    
    case $component in
        api)
            log "Rebuilding API only..."
            docker compose build --no-cache api
            docker compose up -d --force-recreate api
            ;;
        whatsapp)
            log "Rebuilding WhatsApp bot only..."
            docker compose build --no-cache whatsapp-bot
            docker compose up -d --force-recreate whatsapp-bot
            ;;
        *)
            log "Rebuilding all backend services..."
            docker compose build --no-cache
            docker compose up -d --force-recreate
            ;;
    esac
    
    # Wait for health check
    log "Waiting for API health check..."
    for i in {1..30}; do
        if docker exec expense-tracker-api wget -q --spider http://localhost:3000/health 2>/dev/null; then
            success "API is healthy!"
            break
        fi
        sleep 2
        if [ $i -eq 30 ]; then
            error "API health check timed out"
            return 1
        fi
    done
    
    success "Backend deployment complete!"
}

# Deploy frontend to Cloudflare Pages
deploy_frontend() {
    log "Deploying expenses frontend to Cloudflare Pages..."
    
    if [ ! -d "$EXPENSES_FE_DIR" ]; then
        error "Frontend directory not found: $EXPENSES_FE_DIR"
        return 1
    fi
    
    cd "$EXPENSES_FE_DIR"
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        log "Installing dependencies..."
        npm install
    fi
    
    # Build
    log "Building frontend..."
    npm run build
    
    # Deploy to Cloudflare
    if command -v npx &> /dev/null; then
        log "Deploying to Cloudflare Pages..."
        npx wrangler pages deploy dist --project-name=expenses
        success "Frontend deployed to Cloudflare!"
    else
        warn "wrangler not available, skipping Cloudflare deployment"
        warn "Run manually: npx wrangler pages deploy dist --project-name=expenses"
    fi
}

# Show logs
show_logs() {
    local service=$1
    if [ -z "$service" ]; then
        docker compose -f "$EXPENSE_TRACKER_DIR/docker-compose.yml" logs --tail=50 -f
    else
        docker compose -f "$EXPENSE_TRACKER_DIR/docker-compose.yml" logs --tail=50 -f "$service"
    fi
}

# Show status
show_status() {
    log "Expense Tracker Status:"
    echo ""
    docker compose -f "$EXPENSE_TRACKER_DIR/docker-compose.yml" ps
    echo ""
    
    # Check API health
    if docker exec expense-tracker-api wget -q --spider http://localhost:3000/health 2>/dev/null; then
        success "API: Healthy"
    else
        error "API: Unhealthy or not running"
    fi
    
    # Check WhatsApp bot
    if docker ps --format '{{.Names}}' | grep -q expense-tracker-whatsapp; then
        success "WhatsApp Bot: Running"
    else
        warn "WhatsApp Bot: Not running"
    fi
}

# Usage help
show_help() {
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  all       Deploy everything (default)"
    echo "  backend   Deploy API + WhatsApp bot"
    echo "  api       Deploy API only"
    echo "  whatsapp  Deploy WhatsApp bot only"
    echo "  frontend  Deploy frontend to Cloudflare"
    echo "  status    Show service status"
    echo "  logs      Show logs (optionally: logs api|whatsapp-bot)"
    echo "  pull      Pull latest code only"
    echo ""
    echo "Examples:"
    echo "  $0                  # Deploy everything"
    echo "  $0 api              # Deploy only the API"
    echo "  $0 frontend         # Deploy only the frontend"
    echo "  $0 logs api         # Tail API logs"
}

# Main
main() {
    local command=${1:-all}
    local arg=$2
    
    echo "=========================================="
    echo " Expense Tracker Deployment"
    echo " $(date)"
    echo "=========================================="
    echo ""
    
    case $command in
        all)
            pull_latest
            deploy_backend
            deploy_frontend
            ;;
        backend)
            pull_latest
            deploy_backend
            ;;
        api)
            pull_latest
            deploy_backend api
            ;;
        whatsapp)
            pull_latest
            deploy_backend whatsapp
            ;;
        frontend)
            pull_latest
            deploy_frontend
            ;;
        status)
            show_status
            ;;
        logs)
            show_logs "$arg"
            ;;
        pull)
            pull_latest
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            error "Unknown command: $command"
            show_help
            exit 1
            ;;
    esac
    
    echo ""
    log "Done!"
}

main "$@"
