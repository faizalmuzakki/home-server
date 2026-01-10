# Webhook - GitHub Auto-Deployment

Automatically deploy home-server changes when pushing to GitHub.

## How it Works

```
GitHub Push → Webhook → git pull → docker compose restart
```

## Quick Start

```bash
# Copy and configure environment
cp .env.example .env

# Generate webhook secret
openssl rand -hex 32
# Add to .env as WEBHOOK_SECRET

# Generate hooks.json from template
./scripts/generate-hooks.sh

# Make scripts executable
chmod +x scripts/*.sh

# Start webhook
docker compose up -d
```

## Configuration

The webhook configuration uses a template system:

1. **`hooks.json.template`** - Template with `${WEBHOOK_SECRET}` placeholder
2. **`.env`** - Contains the actual secret
3. **`scripts/generate-hooks.sh`** - Generates `hooks.json` from template

When you update secrets, run:
```bash
./scripts/generate-hooks.sh
docker compose restart webhook
```

## GitHub Setup

1. Go to your repo → Settings → Webhooks → Add webhook
2. **Payload URL**: `https://webhook.solork.dev/hooks/home-server-deploy`
3. **Content type**: `application/json`
4. **Secret**: Same as `WEBHOOK_SECRET` in .env
5. **Events**: Just the push event
6. **Active**: ✅

## Testing

```bash
# Check webhook logs
docker logs webhook -f

# Manual test (from server)
curl -X POST https://webhook.solork.dev/hooks/home-server-deploy
```

## Deploy Log

View deployment history:
```bash
cat ~/Projects/home-server/webhook/deploy.log
```

## Security

- HMAC-SHA256 signature validation
- Only triggers on `main` branch
- Secrets stored in `.env` (gitignored)
- `hooks.json` is generated and gitignored

