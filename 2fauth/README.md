# 2FAuth

Self-hosted 2FA management service.

## Features

- 📱 **PWA Support** - Works offline on mobile
- 🔐 **Self-hosted** - Your 2FA secrets never leave your server
- 📥 **Import/Export** - Supports Google Authenticator, Aegis, etc.
- 🌙 **Dark Mode** - Easy on the eyes
- 👥 **Multi-user** - Family/Team support

## Quick Start

```bash
# Copy and configure environment
cp .env.example .env

# Generate APP_KEY
echo "APP_KEY=base64:$(openssl rand -base64 32)" >> .env

# Edit your domain
nano .env

# Start the service
docker compose up -d
```

## Access

- **URL**: `https://auth.yourdomain.com`
- First user to register becomes admin

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DOMAIN` | Your domain (e.g., `solork.dev`) |
| `APP_KEY` | Laravel app key (generate with openssl) |

## Security

- First registered user is admin
- Enable 2FA for your 2FAuth account (yes, meta!)
- Consider IP restrictions via Cloudflare

## Data Persistence

All data is stored in `./data/` which is mounted to `/2fauth` inside the container:

```
data/
├── database.sqlite    # Main database (accounts, tokens, settings)
├── storage/           # Uploaded icons and files
└── installed          # Installation marker
```

⚠️ **Important**: The `./data` directory is gitignored. Make sure to back it up!

## Backup

Run the backup script to create a timestamped backup:

```bash
./backup.sh
```

Backups are stored in `./backups/` and automatically rotated (30 days by default).

### Restore from backup

```bash
# Stop the container
docker compose down

# Restore database
gunzip -c backups/2fauth_backup_YYYYMMDD_HHMMSS.sqlite.gz > data/database.sqlite

# Start the container
docker compose up -d
```

## Import from Google Authenticator

1. Open Google Authenticator → Menu → Transfer accounts → Export
2. Go to your 2FAuth instance → Add → Import → Google Authenticator
3. Scan or upload the QR code

## Links

- [2FAuth GitHub](https://github.com/Bubka/2FAuth)
- [Documentation](https://docs.2fauth.app/)
