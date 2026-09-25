#!/usr/bin/env bash
# Pings the gateway every INTERVAL seconds; on sustained failure, escalates
# recovery of the RTL8188CUS WiFi adapter without (usually) needing a reboot.
set -uo pipefail
GW="192.168.1.1"
USB_VID="0bda"; USB_PID="8176"
INTERVAL=30                 # seconds between checks
FAIL_LINK=3                 # consecutive fails -> link down/up   (~90s)
FAIL_USB=6                  # -> USB unbind/rebind                (~3m)
FAIL_SVC=10                 # -> restart wpa_supplicant+networkd  (~5m)
FAIL_REBOOT=20              # -> reboot (last resort)             (~10m)
REBOOT_MIN_UPTIME=900       # never reboot within 15m of boot
REBOOT_COOLDOWN=1800        # >=30m between watchdog reboots
STATE=/run/wifi-watchdog; mkdir -p "$STATE"

find_iface(){ for n in /sys/class/net/wl*; do [ -e "$n" ] && { basename "$n"; return; }; done; }
find_usbdev(){
  local d
  for d in /sys/bus/usb/devices/*/; do
    [ -f "$d/idVendor" ] || continue
    [ "$(cat "$d/idVendor" 2>/dev/null)" = "$USB_VID" ] || continue
    [ "$(cat "$d/idProduct" 2>/dev/null)" = "$USB_PID" ] || continue
    basename "$d"; return
  done
}
uptime_s(){ awk '{print int($1)}' /proc/uptime; }

fails=0; wan_down=0
logger -t wifi-watchdog "started (gw=$GW interval=${INTERVAL}s)"
while true; do
  if ping -c1 -W3 "$GW" >/dev/null 2>&1; then
    [ "$fails" -ne 0 ] && logger -t wifi-watchdog "recovered after $fails failed checks"
    fails=0
    # Gateway fine: only log ISP-side outages (nothing local fixes those, so no
    # action). `journalctl -t wifi-watchdog` then tells ISP vs our hardware apart.
    if ping -c1 -W3 1.1.1.1 >/dev/null 2>&1 || ping -c1 -W3 8.8.8.8 >/dev/null 2>&1; then
      [ "$wan_down" -ne 0 ] && logger -t wifi-watchdog "WAN back after ~$((wan_down*INTERVAL))s (ISP side, LAN was fine)"
      wan_down=0
    else
      wan_down=$((wan_down+1))
      [ "$wan_down" -eq 1 ] && logger -t wifi-watchdog "WAN down, gateway up -> ISP/router uplink, no local action"
    fi
  else
    fails=$((fails+1))
    logger -t wifi-watchdog "gateway $GW unreachable (consecutive=$fails)"
    IFACE="$(find_iface)"; USBDEV="$(find_usbdev)"
    if   [ "$fails" -eq "$FAIL_LINK" ] && [ -n "${IFACE:-}" ]; then
        logger -t wifi-watchdog "ACTION link bounce $IFACE"
        ip link set "$IFACE" down; sleep 3; ip link set "$IFACE" up
    elif [ "$fails" -eq "$FAIL_USB" ] && [ -n "${USBDEV:-}" ]; then
        logger -t wifi-watchdog "ACTION usb rebind $USBDEV"
        echo "$USBDEV" > /sys/bus/usb/drivers/usb/unbind 2>/dev/null || true
        sleep 4
        echo "$USBDEV" > /sys/bus/usb/drivers/usb/bind   2>/dev/null || true
    elif [ "$fails" -eq "$FAIL_SVC" ]; then
        logger -t wifi-watchdog "ACTION restart wpa_supplicant + systemd-networkd"
        systemctl restart wpa_supplicant     2>/dev/null || true
        systemctl restart systemd-networkd   2>/dev/null || true
    elif [ "$fails" -ge "$FAIL_REBOOT" ]; then
        up=$(uptime_s); now=$(date +%s); last=0
        [ -f "$STATE/last-reboot" ] && last=$(cat "$STATE/last-reboot")
        if [ "$up" -ge "$REBOOT_MIN_UPTIME" ] && [ $((now-last)) -ge "$REBOOT_COOLDOWN" ]; then
            logger -t wifi-watchdog "ACTION reboot (last resort, fails=$fails)"
            echo "$now" > "$STATE/last-reboot"; systemctl reboot
        else
            logger -t wifi-watchdog "reboot suppressed (uptime=${up}s / cooldown guard)"
        fi
    fi
  fi
  sleep "$INTERVAL"
done
