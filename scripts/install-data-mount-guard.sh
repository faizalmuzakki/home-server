#!/bin/sh
# Installs the /data guard on docker.service and the WAN-aware wifi watchdog,
# then brings docker back if /data is currently unmounted.
#   sudo scripts/install-data-mount-guard.sh
set -eu
[ "$(id -u)" -eq 0 ] || { echo "run with sudo" >&2; exit 1; }
here=$(cd "$(dirname "$0")" && pwd)

install -m 755 "$here/ensure-data-mounted.sh" /usr/local/sbin/ensure-data-mounted.sh
install -m 755 "$here/wifi-watchdog.sh" /usr/local/sbin/wifi-watchdog.sh
mkdir -p /etc/systemd/system/docker.service.d
cat > /etc/systemd/system/docker.service.d/require-data.conf <<'EOF'
[Unit]
After=data.mount

[Service]
ExecStartPre=/usr/local/sbin/ensure-data-mounted.sh
EOF
systemctl daemon-reload
systemctl restart wifi-watchdog

if ! mountpoint -q /data; then
    echo "/data not mounted: restarting docker through the guard"
    systemctl stop docker.socket docker.service
    systemctl start docker.socket docker.service
fi

mountpoint /data
docker ps --format '{{.Names}}\t{{.Status}}'
