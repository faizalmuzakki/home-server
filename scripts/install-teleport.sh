#!/bin/bash
# Install Teleport (tsh) client on the home server
# This only installs the client tools, not the full Teleport server
#
# Usage: sudo ./install-teleport.sh [version]
# Example: sudo ./install-teleport.sh 14.3.3

set -e

TELEPORT_VERSION="${1:-14.3.3}"

echo "🔧 Installing Teleport client v${TELEPORT_VERSION}..."
echo ""

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo "❌ Cannot detect OS"
    exit 1
fi

case $OS in
    ubuntu|debian)
        echo "📦 Installing for Debian/Ubuntu..."
        
        # Add Teleport repository
        curl https://apt.releases.teleport.dev/gpg \
            -o /usr/share/keyrings/teleport-archive-keyring.asc
        
        echo "deb [signed-by=/usr/share/keyrings/teleport-archive-keyring.asc] \
            https://apt.releases.teleport.dev/${ID?} ${VERSION_CODENAME?} stable/v${TELEPORT_VERSION%%.*}" \
            | tee /etc/apt/sources.list.d/teleport.list > /dev/null
        
        apt-get update
        apt-get install -y teleport
        ;;
        
    fedora|rhel|centos|rocky|almalinux)
        echo "📦 Installing for RHEL/Fedora..."
        
        yum install -y yum-utils
        yum-config-manager --add-repo \
            "https://rpm.releases.teleport.dev/teleport.repo"
        yum install -y teleport
        ;;
        
    arch|manjaro)
        echo "📦 Installing for Arch Linux..."
        pacman -S --noconfirm teleport
        ;;
        
    *)
        echo "📦 Installing via tarball (generic Linux)..."
        
        ARCH=$(uname -m)
        case $ARCH in
            x86_64) ARCH="amd64" ;;
            aarch64) ARCH="arm64" ;;
            armv7l) ARCH="arm" ;;
        esac
        
        cd /tmp
        curl -L -o teleport.tar.gz \
            "https://cdn.teleport.dev/teleport-v${TELEPORT_VERSION}-linux-${ARCH}-bin.tar.gz"
        
        tar -xzf teleport.tar.gz
        cd teleport
        
        # Install only the client tools
        install -m 755 tsh /usr/local/bin/
        install -m 755 tctl /usr/local/bin/ 2>/dev/null || true
        
        # Cleanup
        cd /tmp
        rm -rf teleport teleport.tar.gz
        ;;
esac

echo ""
echo "✅ Teleport installed!"
echo ""
tsh version
echo ""
echo "Next steps:"
echo "  1. Login to your Teleport cluster:"
echo "     tsh login --proxy=teleport.yourcompany.com"
echo ""
echo "  2. List available nodes:"
echo "     tsh ls"
echo ""
echo "  3. Use with sync script:"
echo "     ./mongodb/scripts/sync-from-work.sh mydb --teleport"
