#!/bin/sh
# ExecStartPre for docker.service. Docker's data-root is /data/docker, so
# starting it with /data unmounted runs every stack off an empty dir on the
# root disk. 2026-09-25: power cut -> boot fsck of /data got killed -> the
# `nofail` mount was skipped -> zero containers, no cloudflared, no remote SSH.
# Repair + mount here instead; a non-zero exit keeps docker down.
set -u
DEV=/dev/disk/by-uuid/aaf074f2-52a5-43b1-8d98-ca04dfcfcb37

mountpoint -q /data && exit 0
[ -b "$DEV" ] || { logger -t data-guard "data disk $DEV missing"; exit 1; }

e2fsck -p "$DEV"; rc=$?
# 0 clean, 1-3 fixed; 4+ needs a human: sudo e2fsck -f $DEV
[ "$rc" -lt 4 ] || { logger -t data-guard "e2fsck -p rc=$rc, fix by hand: e2fsck -f $DEV"; exit 1; }

mount /data || exit 1
logger -t data-guard "mounted /data (e2fsck rc=$rc)"
