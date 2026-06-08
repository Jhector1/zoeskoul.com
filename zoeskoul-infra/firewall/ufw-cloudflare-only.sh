#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IPS_FILE="$SCRIPT_DIR/cloudflare-ips.txt"
SSH_PORT="${SSH_PORT:-22}"
ALLOW_DIRECT_PREVIEW_HTTP="${ALLOW_DIRECT_PREVIEW_HTTP:-0}"

if [[ ! -f "$IPS_FILE" ]]; then
  echo "Missing $IPS_FILE" >&2
  exit 1
fi

echo "This resets UFW. Make sure SSH_PORT=$SSH_PORT is correct."
echo "Type APPLY to continue:"
read -r confirm
if [[ "$confirm" != "APPLY" ]]; then
  echo "Aborted."
  exit 1
fi

sudo apt-get update -y >/dev/null
sudo apt-get install -y ufw >/dev/null
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow "${SSH_PORT}/tcp"

while IFS= read -r ip; do
  [[ -z "$ip" || "$ip" =~ ^# ]] && continue
  sudo ufw allow from "$ip" to any port 80 proto tcp
  sudo ufw allow from "$ip" to any port 443 proto tcp
done < "$IPS_FILE"

if [[ "$ALLOW_DIRECT_PREVIEW_HTTP" == "1" ]]; then
  echo "WARN: Allowing direct preview HTTP/HTTPS from anywhere. Do not use this for real prod."
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
fi

sudo ufw --force enable
sudo ufw status verbose
