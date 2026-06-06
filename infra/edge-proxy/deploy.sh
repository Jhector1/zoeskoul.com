#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# ✅ This is where mkdir -p logs goes
mkdir -p logs

echo "== Validate Caddyfile parses =="
docker run --rm -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" caddy:2 \
  caddy adapt --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
echo "OK: Caddyfile parses"

echo "== Recreate edge-caddy =="
docker compose up -d --force-recreate

echo "== Show trusted_proxies config (should include MANY ranges) =="
docker exec -it edge-caddy sh -lc \
  'caddy adapt --config /etc/caddy/Caddyfile --adapter caddyfile | grep -n "\"trusted_proxies\"" -A3 || true'

echo "== Tail last 5 access logs =="
docker exec -it edge-caddy sh -lc 'tail -n 5 /var/log/caddy/access.log || true'

echo "Done."
