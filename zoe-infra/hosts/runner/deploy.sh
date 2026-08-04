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

# A normal deployment always follows the mutable production tag. Pass an
# immutable commit SHA explicitly only for a rollback or pinned deployment.
export IMAGE_TAG="${1:-prod}"

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

sudo mkdir -p /var/lib/zoeskoul-runner/workspaces
sudo chown -R "${USER}:${USER}" /var/lib/zoeskoul-runner

if [ ! -S "${RUNNER_DOCKER_SOCKET_HOST:-/run/user/1000/docker.sock}" ]; then
  echo "WARNING: Docker socket not found: ${RUNNER_DOCKER_SOCKET_HOST:-/run/user/1000/docker.sock}" >&2
  echo "Run ../../scripts/install-rootless-docker.sh or adjust RUNNER_DOCKER_SOCKET_HOST in .env." >&2
fi

RUNTIME_IMAGE="ghcr.io/${GHCR_OWNER}/zoeskoul-runtime:${IMAGE_TAG}"
EXEC_DOCKER_SOCKET="${RUNNER_DOCKER_SOCKET_HOST:-/run/user/1000/docker.sock}"

echo "Deploying ZoeSkoul Runner image tag: ${IMAGE_TAG}"
echo "Pulling sandbox runtime image into the execution Docker daemon: ${RUNTIME_IMAGE}"
if [ -S "$EXEC_DOCKER_SOCKET" ]; then
  pull_with_retry env DOCKER_HOST="unix://${EXEC_DOCKER_SOCKET}" docker pull "$RUNTIME_IMAGE"
else
  echo "WARNING: execution Docker socket not found, falling back to default Docker daemon for runtime image pull." >&2
  pull_with_retry docker pull "$RUNTIME_IMAGE"
fi

echo "Pulling runner stack images..."
pull_with_retry docker compose pull

echo "Starting/recreating runner stack..."
# Compose recreates services whose pulled image digest changed. --wait keeps
# deploy.sh attached until the runner and Judge0 health checks are ready.
docker compose up \
  -d \
  --remove-orphans \
  --wait \
  --wait-timeout 300

echo "Current services:"
docker compose ps

echo "Running smoke tests..."
./smoke-test.sh

echo "Pruning unused images..."
docker image prune -f >/dev/null || true

echo "ZoeSkoul Runner deployment completed successfully."
