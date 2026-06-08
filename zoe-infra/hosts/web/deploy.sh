#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Missing .env. Copy .env.example to .env and edit it first." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

: "${GHCR_OWNER:?required}"
: "${DOMAIN:?required}"
: "${RUNNER_PRIVATE_URL:?required}"

echo "Pulling web stack images..."
docker compose pull

echo "Starting/recreating web stack..."
docker compose up -d --remove-orphans

echo "Current services:"
docker compose ps

echo "Pruning unused images..."
docker image prune -f >/dev/null || true

echo "Done. Run ./smoke-test.sh next."
