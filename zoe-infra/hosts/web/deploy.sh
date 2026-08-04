#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Missing .env. Copy .env.example to .env and edit it first." >&2
  exit 1
fi

if [ "$#" -gt 1 ]; then
  echo "Usage: $0 [image-tag]" >&2
  exit 2
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

: "${GHCR_OWNER:?required}"
: "${DOMAIN:?required}"
: "${RUNNER_PRIVATE_URL:?required}"

# A normal deployment always follows the mutable production tag. Pass an
# immutable commit SHA explicitly only for a rollback or pinned deployment.
export IMAGE_TAG="${1:-prod}"

echo "Deploying ZoeSkoul Web image tag: ${IMAGE_TAG}"

pull_with_retry() {
  local attempt

  for attempt in 1 2 3; do
    if "$@"; then
      return 0
    fi

    if [ "$attempt" -eq 3 ]; then
      echo "Image pull failed after ${attempt} attempts." >&2
      return 1
    fi

    echo "Image pull attempt ${attempt} failed; retrying in $((attempt * 5)) seconds..." >&2
    sleep $((attempt * 5))
  done
}

echo "Pulling production images..."
pull_with_retry docker compose pull web postgres redis

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
# The image was pulled above. Force-recreate guarantees that the running Web
# container adopts the newly pulled digest even though the tag remains `prod`.
docker compose up \
  -d \
  --force-recreate \
  --no-deps \
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
