#!/bin/bash
# Home Server Initial Setup Script
# Tested on: Ubuntu Server 24.04 LTS, Debian 12
#
# Usage: sudo ./setup-server.sh
#
# This script installs all required dependencies for the home server

set -e

echo "🏠 Home Server Setup Script"
echo "==========================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Please run as root: sudo $0"
    exit 1
fi

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VERSION=$VERSION_ID
    echo "📋 Detected OS: $PRETTY_NAME"
else
    echo "❌ Cannot detect OS"
    exit 1
fi

echo ""
echo "This script will install:"
echo "  - Docker & Docker Compose"
echo "  - Git"
echo "  - curl, wget, htop, vim"
echo "  - UFW firewall"
echo "  - fail2ban"
echo "  - unattended-upgrades (security updates)"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

echo ""
echo "📦 Updating system packages..."
apt-get update
apt-get upgrade -y

echo ""
echo "📦 Installing essential packages..."
apt-get install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    wget \
    gnupg \
    lsb-release \
    git \
    htop \
    vim \
    nano \
    tree \
    jq \
    unzip \
    net-tools \
    dnsutils \
    ncdu \
    tmux

echo ""
echo "🐳 Installing Docker..."

# Remove old Docker versions
apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

# Add Docker's official GPG key
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/$OS/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$OS \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add current user to docker group
SUDO_USER_NAME="${SUDO_USER:-$USER}"
if [ "$SUDO_USER_NAME" != "root" ]; then
    usermod -aG docker "$SUDO_USER_NAME"
    echo "✅ Added $SUDO_USER_NAME to docker group"
fi

# Enable Docker service
systemctl enable docker
systemctl start docker

echo ""
echo "🔥 Setting up UFW firewall..."
apt-get install -y ufw

# Default policies
ufw default deny incoming
ufw default allow outgoing

# Allow SSH
ufw allow ssh

# Allow common ports for home server
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 53/tcp    # DNS
ufw allow 53/udp    # DNS

# Allow LAN access to all services (adjust subnet as needed)
# ufw allow from 192.168.0.0/16

# Enable firewall
echo "y" | ufw enable
ufw status

echo ""
echo "🛡️ Installing fail2ban..."
apt-get install -y fail2ban

# Create basic config
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
EOF

systemctl enable fail2ban
systemctl restart fail2ban

echo ""
echo "🔄 Setting up automatic security updates..."
apt-get install -y unattended-upgrades

# Enable automatic security updates
cat > /etc/apt/apt.conf.d/20auto-upgrades << 'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

systemctl enable unattended-upgrades

echo ""
echo "📁 Creating data directories..."
mkdir -p /data/{media/{movies,tv,music},downloads/{complete,incomplete},sync,backups,shared/{imports,exports}}
chown -R 1000:1000 /data

echo ""
echo "🌐 Creating Docker network..."
docker network create traefik-public 2>/dev/null || echo "Network already exists"

echo ""
echo "============================================"
echo "✅ Server setup complete!"
echo "============================================"
echo ""
echo "Installed:"
echo "  - Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"
echo "  - Docker Compose $(docker compose version --short)"
echo "  - Git $(git --version | cut -d' ' -f3)"
echo "  - UFW firewall (enabled)"
echo "  - fail2ban (SSH protection)"
echo "  - Automatic security updates"
echo ""
echo "Data directories created at /data/"
echo ""
echo "⚠️  IMPORTANT: Log out and back in for Docker group to take effect!"
echo ""
echo "Next steps:"
echo "  1. Log out and back in (or run: newgrp docker)"
echo "  2. Clone your home-server repo"
echo "  3. Configure .env files for each service"
echo "  4. Start services with docker compose"
echo ""
echo "Optional:"
echo "  - Mount your 240GB SATA drive to /data"
echo "  - Install Teleport: sudo ./scripts/install-teleport.sh"
echo "  - Configure SSH keys for passwordless access"
