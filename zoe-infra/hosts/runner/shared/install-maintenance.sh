#!/usr/bin/env bash
set -euo pipefail
POOL="${1:?pool required}"
case "$POOL" in zoebuild|zoeskoul-learning) ;; *) exit 1 ;; esac
POOL_DIR="$(cd "$(dirname "$0")/../$POOL" && pwd -P)"
[ -f "$POOL_DIR/.env" ] || { echo 'Missing pool .env' >&2;exit 1; }
NAME="zoeskoul-${POOL}-storage-maintenance"
PERIOD='1h'; [ "$POOL" = zoebuild ] && PERIOD='6h'
printf '[Unit]\nDescription=Runner %s rootless cleanup\nAfter=docker.service\n\n[Service]\nType=oneshot\nWorkingDirectory=%s\nExecStart=%s/cleanup.sh\nNice=10\nIOSchedulingClass=best-effort\nIOSchedulingPriority=7\n' "$POOL" "$POOL_DIR" "$POOL_DIR" | sudo tee "/etc/systemd/system/$NAME.service" >/dev/null
printf '[Unit]\nDescription=Runner %s cleanup cadence\n\n[Timer]\nOnBootSec=10min\nOnUnitActiveSec=%s\nRandomizedDelaySec=5min\nPersistent=true\nUnit=%s.service\n\n[Install]\nWantedBy=timers.target\n' "$POOL" "$PERIOD" "$NAME" | sudo tee "/etc/systemd/system/$NAME.timer" >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now "$NAME.timer"
echo "Installed $NAME.timer"
