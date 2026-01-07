# Expense Tracker

A WhatsApp-integrated expense tracker with a web dashboard.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Docker Compose                          │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌─────────────┐  ┌───────────────────┐  │
│  │ WhatsApp Bot │──│     API     │──│ SQLite Database   │  │
│  │  (Baileys)   │  │  (Express)  │  │                   │  │
│  └──────────────┘  └──────┬──────┘  └───────────────────┘  │
│         │                 │                                 │
│         │ Claude Vision   │ Cloudflare Tunnel              │
│         ▼                 ▼                                 │
│  ┌──────────────┐  ┌─────────────┐                         │
│  │ Anthropic    │  │ cloudflared │                         │
│  │ API          │  │             │                         │
│  └──────────────┘  └─────────────┘                         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │  Cloudflare Pages   │
                 │    (Dashboard)      │
                 └─────────────────────┘
```

## Prerequisites

- Docker and Docker Compose
- Anthropic API key (for Claude Vision)
- Cloudflare account (for tunnel and Pages)

## Security

This application includes comprehensive security hardening. See [SECURITY.md](SECURITY.md) for full details.

**Key security features:**
- ✅ WhatsApp bot requires phone number whitelist (`ALLOWED_NUMBERS`)
- ✅ API rate limiting (general, AI, and upload endpoints)
- ✅ Input validation on all endpoints
- ✅ Helmet.js security headers
- ✅ Docker security hardening (read-only, no-new-privileges, capability drops)
- ✅ Pinned dependency versions with 0 known vulnerabilities
- ✅ CORS protection with configurable origins

**⚠️ Important:** The WhatsApp bot will **not start** without `ALLOWED_NUMBERS` configured!

## Quick Start

### 1. Configure Environment

```bash
cp .env.example .env
nano .env
```

Set your:
- `ANTHROPIC_API_KEY` - Get from https://console.anthropic.com
- `CLOUDFLARE_TUNNEL_TOKEN` - See Cloudflare Tunnel Setup below
- `ALLOWED_NUMBERS` - **Required!** Your WhatsApp number(s)
- `ALLOWED_ORIGINS` - Set to your frontend domain in production

### 2. Start Services

```bash
# First time - scan WhatsApp QR code
docker compose up whatsapp-bot

# After QR scan, run all services
docker compose up -d
```

### 3. Deploy Dashboard to Cloudflare Pages

```bash
cd dashboard
npm install
npm run build
```

Then deploy `dist/` folder to Cloudflare Pages.

## Cloudflare Tunnel Setup

1. Go to [Cloudflare Zero Trust](https://one.dash.cloudflare.com)
2. Navigate to **Access > Tunnels**
3. Create a new tunnel
4. Copy the tunnel token to your `.env`
5. Configure public hostname:
   - Subdomain: `expense-api` (or your choice)
   - Domain: your domain
   - Service: `http://api:3000`

## Dashboard Deployment (Cloudflare Pages)

1. Go to Cloudflare Dashboard > Pages
2. Create new project > Direct Upload or connect Git
3. Build settings:
   - Build command: `npm run build`
   - Build output: `dist`
4. Environment variables:
   - `VITE_API_URL`: `https://expense-api.yourdomain.com`

## WhatsApp Bot Usage

Send messages to your WhatsApp:

**Text expenses:**
- `50k lunch at warung`
- `Grab 25000`
- `Coffee 35k starbucks`

**Receipt photos:**
- Send a photo of your receipt
- Optionally add a caption for context

**Commands:**
- `/help` - Show help
- `/categories` - List categories

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/expenses` | List expenses |
| POST | `/api/expenses` | Create expense |
| PUT | `/api/expenses/:id` | Update expense |
| DELETE | `/api/expenses/:id` | Delete expense |
| GET | `/api/categories` | List categories |
| POST | `/api/categories` | Create category |
| PUT | `/api/categories/:id` | Update category |
| DELETE | `/api/categories/:id` | Delete category |
| POST | `/api/parse/text` | Parse expense from text |
| POST | `/api/parse/image` | Parse expense from image |
| GET | `/api/stats/summary` | Get spending summary |
| GET | `/api/stats/daily` | Get daily totals |
| GET | `/api/stats/monthly` | Get monthly totals |

## Backup

```bash
# Backup SQLite database
docker cp expense-tracker-api:/app/data/expenses.db ./backup/

# Backup WhatsApp session
docker cp expense-tracker-whatsapp:/app/auth_info ./backup/
```

## Troubleshooting

**WhatsApp disconnected:**
```bash
docker compose restart whatsapp-bot
# If QR needed again:
docker compose down whatsapp-bot
docker volume rm expense-tracker_whatsapp_auth
docker compose up whatsapp-bot
```

**API not responding:**
```bash
docker compose logs api
docker compose restart api
```

**Check all services:**
```bash
docker compose ps
docker compose logs -f
```

## Deployment

### Quick Deployment Script

Use the dedicated deployment script for quick deployments:

```bash
# Deploy everything (backend + frontend)
./scripts/deploy-expense-tracker.sh

# Deploy only the API
./scripts/deploy-expense-tracker.sh api

# Deploy only the WhatsApp bot
./scripts/deploy-expense-tracker.sh whatsapp

# Deploy only the frontend to Cloudflare
./scripts/deploy-expense-tracker.sh frontend

# Check status
./scripts/deploy-expense-tracker.sh status

# View logs
./scripts/deploy-expense-tracker.sh logs
./scripts/deploy-expense-tracker.sh logs api
```

### CI/CD (Automatic Deployment)

**Backend (Home Server):**
- Push to `main` branch triggers the webhook: `https://webhook.yourdomain.com/hooks/expense-tracker-deploy`
- The webhook is configured in `webhook/hooks.json`

**Frontend (Cloudflare Pages):**
- Push to `main` branch of the `expenses` repo triggers GitHub Actions
- Automatically builds and deploys to Cloudflare Pages
- Required secrets in GitHub:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
- Required variables in GitHub:
  - `VITE_API_URL` (e.g., `https://expense-api.yourdomain.com`)

### Manual Deployment

**Backend:**
```bash
cd ~/Projects/home-server/expense-tracker
git pull origin main
docker compose build --no-cache
docker compose up -d --force-recreate
```

**Frontend:**
```bash
cd ~/Projects/expenses
git pull origin main
npm install
npm run build
npx wrangler pages deploy dist --project-name=expenses
```

