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

sudo mkdir -p /var/lib/zoeskoul-runner/workspaces
sudo chown -R "${USER}:${USER}" /var/lib/zoeskoul-runner

if [ ! -S "${RUNNER_DOCKER_SOCKET_HOST:-/run/user/1000/docker.sock}" ]; then
  echo "WARNING: Docker socket not found: ${RUNNER_DOCKER_SOCKET_HOST:-/run/user/1000/docker.sock}" >&2
  echo "Run ../../scripts/install-rootless-docker.sh or adjust RUNNER_DOCKER_SOCKET_HOST in .env." >&2
fi

RUNTIME_IMAGE="ghcr.io/${GHCR_OWNER}/zoeskoul-runtime:${IMAGE_TAG:-prod}"
EXEC_DOCKER_SOCKET="${RUNNER_DOCKER_SOCKET_HOST:-/run/user/1000/docker.sock}"

echo "Pulling sandbox runtime image into the execution Docker daemon: ${RUNTIME_IMAGE}"
if [ -S "$EXEC_DOCKER_SOCKET" ]; then
  DOCKER_HOST="unix://${EXEC_DOCKER_SOCKET}" docker pull "$RUNTIME_IMAGE"
else
  echo "WARNING: execution Docker socket not found, falling back to default Docker daemon for runtime image pull." >&2
  docker pull "$RUNTIME_IMAGE"
fi

echo "Pulling runner stack images..."
docker compose pull

echo "Starting/recreating runner stack..."
docker compose up -d --remove-orphans

echo "Current services:"
docker compose ps

echo "Pruning unused images..."
docker image prune -f >/dev/null || true

echo "Done. Run ./smoke-test.sh next."
