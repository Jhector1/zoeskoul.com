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

echo "Pulling production images..."
docker compose pull web postgres redis

echo "Starting database and Redis..."
docker compose up \
  -d \
  --wait \
  --wait-timeout 180 \
  postgres \
  redis

echo "Running database migrations..."
./migrate.sh

echo "Starting/replacing ZoeSkoul Web..."
docker compose up \
  -d \
  --wait \
  --wait-timeout 180 \
  web

echo "Current services:"
docker compose ps

echo "Running smoke tests..."
./smoke-test.sh

echo "Pruning unused images..."
docker image prune -f >/dev/null || true

echo "ZoeSkoul Web deployment completed successfully."
