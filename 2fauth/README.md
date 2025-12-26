# 2FAuth - Self-Hosted Authenticator

A web-based self-hosted TOTP authenticator as an alternative to Google Authenticator, Authy, etc.

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

## Backup

Data is stored in the `2fauth_data` volume:
```bash
docker run --rm -v 2fauth_2fauth_data:/data -v $(pwd):/backup alpine tar czf /backup/2fauth-backup.tar.gz /data
```

## Links

- [2FAuth GitHub](https://github.com/Bubka/2FAuth)
- [Documentation](https://docs.2fauth.app/)
