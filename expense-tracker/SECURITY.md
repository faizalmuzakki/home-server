# Security Policy

## Overview

This expense tracker application handles sensitive financial data and WhatsApp authentication. This document outlines the security measures implemented and best practices for deployment.

## Security Measures Implemented

### 1. Access Control

- **WhatsApp Bot Whitelist**: The bot requires `ALLOWED_NUMBERS` to be configured and will refuse to start without it. Only whitelisted phone numbers can interact with the bot.
- **CORS Protection**: The API enforces CORS with configurable `ALLOWED_ORIGINS`. Set this to your specific frontend domain(s) in production.
- **Rate Limiting**: All API endpoints are rate-limited:
  - General API: 100 requests per 15 minutes
  - AI/Parse endpoints: 30 requests per 15 minutes (expensive operations)
  - Upload endpoints: 20 requests per 15 minutes

### 2. Input Validation

- All API inputs are validated using `express-validator`
- Maximum field lengths are enforced
- SQL injection is prevented through parameterized queries
- Base64 image inputs are sanitized

### 3. Docker Security Hardening

All containers run with:
- `read_only: true` - Immutable filesystem (except explicit mounts)
- `no-new-privileges: true` - Prevents privilege escalation
- `cap_drop: ALL` - Drops all Linux capabilities
- Resource limits to prevent DoS attacks
- Separate tmpfs mounts for temporary files

### 4. HTTP Security Headers

The API uses Helmet.js to set security headers including:
- Content-Security-Policy
- X-Content-Type-Options
- X-Frame-Options
- Strict-Transport-Security (via Cloudflare)

### 5. Dependency Security

- All dependencies are pinned to exact versions (no `^` or `~`)
- `npm audit` script available for vulnerability scanning
- Run `npm run audit` in both `api/` and `whatsapp-bot/` directories

## Configuration Requirements

### Required Environment Variables

| Variable | Description | Security Impact |
|----------|-------------|-----------------|
| `ALLOWED_NUMBERS` | WhatsApp phone whitelist | **CRITICAL** - Bot won't start if empty |
| `ALLOWED_ORIGINS` | CORS allowed origins | Set to specific domains in production |
| `ANTHROPIC_API_KEY` | AI API key | Keep secret, never commit |
| `CLOUDFLARE_TUNNEL_TOKEN` | Tunnel authentication | Keep secret, never commit |
| `DASHBOARD_PIN` | Dashboard access PIN | Use a strong PIN |

### Production Deployment Checklist

- [ ] Set `ALLOWED_NUMBERS` to specific phone numbers
- [ ] Set `ALLOWED_ORIGINS` to your frontend domain(s) (not `*`)
- [ ] Ensure all API keys and tokens are set via environment variables
- [ ] Never commit `.env` files to version control
- [ ] Run `npm audit` and address any vulnerabilities
- [ ] Enable Cloudflare's security features (WAF, rate limiting)
- [ ] Regularly backup the SQLite database
- [ ] Monitor container logs for suspicious activity

## Known Risks

### WhatsApp API (Baileys)

The `@whiskeysockets/baileys` package:
- Is an unofficial WhatsApp API (violates WhatsApp ToS)
- Has access to file system and environment variables
- May result in phone number bans from WhatsApp

**Mitigations:**
- Package version is pinned to prevent supply-chain attacks
- Bot runs in isolated container with minimal privileges
- Only trusted phone numbers can interact with bot

### Session Security

WhatsApp authentication tokens are stored in `./whatsapp-bot/auth_info/`:
- This directory contains sensitive session data
- Compromise of these files = full access to WhatsApp account

**Mitigations:**
- Mounted as a Docker volume (not in container image)
- Container runs with minimal privileges
- Consider encrypting the host filesystem

## Vulnerability Reporting

If you discover a security vulnerability:

1. **Do NOT** open a public GitHub issue
2. Contact the maintainer directly
3. Provide detailed information about the vulnerability
4. Allow reasonable time for a fix before public disclosure

## Security Auditing

Run the following commands regularly:

```bash
# Check for vulnerabilities in API dependencies
cd api && npm run audit

# Check for vulnerabilities in WhatsApp bot dependencies
cd whatsapp-bot && npm run audit

# View Docker container security settings
docker compose config
```

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-07 | 1.1.0 | Added security hardening: rate limiting, input validation, Docker security, required whitelist |
| 2025-12-26 | 1.0.0 | Initial release |
