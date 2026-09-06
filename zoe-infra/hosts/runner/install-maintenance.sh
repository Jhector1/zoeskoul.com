#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
ROOT_DIR="$(pwd -P)"
SERVICE_NAME="zoeskoul-runner-storage-maintenance"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
TIMER_FILE="/etc/systemd/system/${SERVICE_NAME}.timer"

if [ ! -f .env ]; then
  echo "Missing .env. Copy .env.example to .env and edit it first." >&2
  exit 1
fi

cat <<UNIT | sudo tee "$SERVICE_FILE" >/dev/null
[Unit]
Description=ZoeSkoul runner storage maintenance
After=docker.service

[Service]
Type=oneshot
WorkingDirectory=${ROOT_DIR}
ExecStart=${ROOT_DIR}/cleanup.sh
Nice=10
IOSchedulingClass=best-effort
IOSchedulingPriority=7
UNIT

cat <<UNIT | sudo tee "$TIMER_FILE" >/dev/null
[Unit]
Description=Run ZoeSkoul runner storage maintenance hourly

[Timer]
OnBootSec=10min
OnUnitActiveSec=1h
RandomizedDelaySec=5min
Persistent=true
Unit=${SERVICE_NAME}.service

[Install]
WantedBy=timers.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now "${SERVICE_NAME}.timer"

echo "Installed ${SERVICE_NAME}.timer"
sudo systemctl status "${SERVICE_NAME}.timer" --no-pager || true
