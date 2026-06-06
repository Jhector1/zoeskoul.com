#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT="$INFRA_DIR/firewall/cloudflare-ips.txt"
mkdir -p "$(dirname "$OUT")"

curl -fsSL https://www.cloudflare.com/ips-v4 > "$OUT.tmp"
curl -fsSL https://www.cloudflare.com/ips-v6 >> "$OUT.tmp"
mv "$OUT.tmp" "$OUT"

echo "Updated $OUT"
echo "Review firewall/ufw-cloudflare-only.sh and compose/edge/Caddyfile if ranges changed."
