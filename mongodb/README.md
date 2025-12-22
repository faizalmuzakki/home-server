# MongoDB Home Server Setup

A Docker-based MongoDB instance for local network access.

## Prerequisites

- Docker and Docker Compose installed on your server
- Port 27017 available

## Quick Start

1. **Create your environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` with secure credentials:**
   ```bash
   nano .env
   ```

3. **Start MongoDB:**
   ```bash
   docker compose up -d
   ```

4. **Verify it's running:**
   ```bash
   docker compose ps
   docker compose logs mongodb
   ```

## Connecting from LAN Devices

Use your server's local IP address to connect from other devices:

```
mongodb://<username>:<password>@<server-ip>:27017/?authSource=admin
```

Example:
```
mongodb://admin:yourpassword@192.168.1.100:27017/?authSource=admin
```

### Find Your Server IP
```bash
ip addr show | grep "inet " | grep -v 127.0.0.1
# or
hostname -I
```

## Common Commands

| Action | Command |
|--------|---------|
| Start | `docker compose up -d` |
| Stop | `docker compose down` |
| View logs | `docker compose logs -f mongodb` |
| Restart | `docker compose restart` |
| Shell access | `docker exec -it mongodb mongosh -u admin -p` |

## Backup & Restore

### Backup
```bash
docker exec mongodb mongodump --username admin --password <password> --authenticationDatabase admin --out /data/db/backup
docker cp mongodb:/data/db/backup ./backup
```

### Restore
```bash
docker cp ./backup mongodb:/data/db/backup
docker exec mongodb mongorestore --username admin --password <password> --authenticationDatabase admin /data/db/backup
```

## Firewall (if enabled)

If you have a firewall, allow port 27017 for LAN access:

```bash
# UFW
sudo ufw allow from 192.168.1.0/24 to any port 27017

# firewalld
sudo firewall-cmd --permanent --add-port=27017/tcp
sudo firewall-cmd --reload
```

## Security Notes

- Change default credentials immediately
- Consider limiting access to specific IP ranges via firewall
- The `.env` file contains sensitive data - never commit it to version control
