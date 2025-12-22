# Vaultwarden

Self-hosted Bitwarden-compatible password manager.

## Features

- Full Bitwarden compatibility (use official apps)
- Password vault with encryption
- TOTP authenticator
- Secure notes and cards
- Organization sharing

## Setup

### 1. Generate Admin Token

```bash
openssl rand -base64 48
```

### 2. Configure Environment

```bash
cp .env.example .env
nano .env
```

Set:
- `ADMIN_TOKEN` - Generated token above
- `SIGNUPS_ALLOWED=true` - Initially, to create your account

### 3. Start Vaultwarden

```bash
docker compose up -d
```

### 4. Create Your Account

1. Go to `https://vault.yourdomain.com`
2. Click "Create Account"
3. Set up your master password (REMEMBER THIS!)

### 5. Disable Signups

After creating your account(s):

```bash
# Edit .env
SIGNUPS_ALLOWED=false

# Restart
docker compose up -d
```

## Admin Panel

Access at: `https://vault.yourdomain.com/admin`

Use the `ADMIN_TOKEN` to log in.

From here you can:
- Manage users
- View diagnostics
- Configure settings

## Clients

Use official Bitwarden apps:
- Browser extensions (Chrome, Firefox, Safari, Edge)
- Desktop apps (Windows, macOS, Linux)
- Mobile apps (iOS, Android)

**Server URL**: `https://vault.yourdomain.com`

## Backup

**CRITICAL**: Back up your vault regularly!

```bash
# Backup data directory
docker cp vaultwarden:/data ./backup/vaultwarden-$(date +%Y%m%d)

# Or backup the volume
docker run --rm -v vaultwarden_vaultwarden_data:/data -v $(pwd):/backup alpine tar czf /backup/vaultwarden-backup.tar.gz /data
```

## Security Notes

- Use a strong master password
- Enable 2FA on your account
- Keep `SIGNUPS_ALLOWED=false` after setup
- Protect the admin token
- Regular backups are essential
- Consider restricting access to local network only

## Useful Commands

```bash
# View logs
docker compose logs -f vaultwarden

# Restart
docker compose restart vaultwarden

# Update
docker compose pull
docker compose up -d
```
