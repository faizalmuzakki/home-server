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

# Update hooks.json with your secret
# Replace WEBHOOK_SECRET_PLACEHOLDER with your secret

# Make deploy script executable
chmod +x scripts/deploy.sh

# Start webhook
docker compose up -d
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
- Secret stored in environment variable
