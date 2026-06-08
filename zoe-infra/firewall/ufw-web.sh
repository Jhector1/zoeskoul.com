#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = "" ]; then
  echo "Usage: $0 YOUR_HOME_IP" >&2
  exit 2
fi
HOME_IP="$1"

sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from "$HOME_IP" to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status verbose
