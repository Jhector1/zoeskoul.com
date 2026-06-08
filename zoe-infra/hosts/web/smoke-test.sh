#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Missing .env" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
. ./.env
set +a

echo "Checking docker services..."
docker compose ps

echo "Checking web through local Caddy domain..."
curl -fsSIL "https://${DOMAIN}" | head -20

echo "Checking runner through Caddy public runner domain..."
curl -fsSIL "https://${RUNNER_DOMAIN}/healthz" | head -20

echo "Checking runner private URL from VM 1..."
curl -fsS "${RUNNER_PRIVATE_URL}/healthz"
echo

echo "Checking Caddy logs for leaked websocket tokens..."
if docker compose logs caddy 2>/dev/null | grep -q 'token='; then
  echo "ERROR: found token= in Caddy logs" >&2
  exit 1
fi

echo "Smoke test passed."
