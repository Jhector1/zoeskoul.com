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

EDGE_CADDY_CONTAINER="${EDGE_CADDY_CONTAINER:-edge-caddy}"

echo "Checking ZoeSkoul services..."
docker compose ps

echo
echo "Checking Web container health..."
WEB_HEALTH="$(
  docker inspect zoeskoul-web \
    --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}'
)"

echo "Web health: ${WEB_HEALTH}"

if [ "$WEB_HEALTH" != "healthy" ]; then
  echo "ERROR: ZoeSkoul Web is not healthy." >&2
  exit 1
fi

echo
echo "Checking Web from the existing Caddy container..."
docker exec "$EDGE_CADDY_CONTAINER" \
  wget \
  -q \
  -S \
  -O /dev/null \
  http://zoeskoul-web:3000/ \
  2>&1 \
  | head -20

echo
echo "Checking public Web domain..."
curl -fsSIL "https://${DOMAIN}" | head -20

if [ -n "${RUNNER_DOMAIN:-}" ]; then
  echo
  echo "Checking public Runner domain..."
  curl -fsSIL "https://${RUNNER_DOMAIN}/healthz" | head -20
fi

echo
echo "Checking private Runner URL..."
curl -fsS "${RUNNER_PRIVATE_URL}/healthz"
echo

echo "Smoke test passed."
