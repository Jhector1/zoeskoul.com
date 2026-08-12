#!/usr/bin/env bash

cd "$(dirname "$0")" || exit 1

if [ ! -f .env ]; then
  echo "Missing .env. Copy .env.example to .env and edit it first." >&2
  exit 1
fi

if [ "$#" -gt 1 ]; then
  echo "Usage: $0 [image-tag]" >&2
  echo "  no argument  Deploy the CI-managed prod tag (normal deployment)" >&2
  echo "  image-tag    Deploy an explicit immutable tag/SHA (rollback or pin)" >&2
  exit 2
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

if [ -z "${GHCR_OWNER:-}" ]; then
  echo "GHCR_OWNER is required in .env." >&2
  exit 1
fi

ENV_IMAGE_TAG="${IMAGE_TAG:-}"

# Normal deployments follow the mutable production tag published only by the
# successful production-image workflow. An explicit argument is the only way
# to pin/rollback to an immutable commit SHA.
if [ "$#" -eq 1 ]; then
  IMAGE_TAG="$1"
  DEPLOY_MODE="pinned"
else
  IMAGE_TAG="prod"
  DEPLOY_MODE="automatic"

  if [ -n "$ENV_IMAGE_TAG" ] && [ "$ENV_IMAGE_TAG" != "prod" ]; then
    echo "Ignoring stale .env IMAGE_TAG=${ENV_IMAGE_TAG}; automatic deployment follows prod."
  fi
fi
export IMAGE_TAG

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

sudo mkdir -p /var/lib/zoeskoul-runner/workspaces || exit 1
sudo chown -R "${USER}:${USER}" /var/lib/zoeskoul-runner || exit 1

if [ ! -S "${RUNNER_DOCKER_SOCKET_HOST:-/run/user/1000/docker.sock}" ]; then
  echo "WARNING: Docker socket not found: ${RUNNER_DOCKER_SOCKET_HOST:-/run/user/1000/docker.sock}" >&2
  echo "Run ../../scripts/install-rootless-docker.sh or adjust RUNNER_DOCKER_SOCKET_HOST in .env." >&2
fi

RUNNER_IMAGE="ghcr.io/${GHCR_OWNER}/zoeskoul-runner:${IMAGE_TAG}"
RUNTIME_IMAGE="ghcr.io/${GHCR_OWNER}/zoeskoul-runtime:${IMAGE_TAG}"
EXEC_DOCKER_SOCKET="${RUNNER_DOCKER_SOCKET_HOST:-/run/user/1000/docker.sock}"

echo "Deployment mode: ${DEPLOY_MODE}"
echo "Runner image:     ${RUNNER_IMAGE}"
echo "Runtime image:    ${RUNTIME_IMAGE}"

echo "Pulling sandbox runtime image into the execution Docker daemon..."
if [ -S "$EXEC_DOCKER_SOCKET" ]; then
  if ! pull_with_retry env DOCKER_HOST="unix://${EXEC_DOCKER_SOCKET}" docker pull "$RUNTIME_IMAGE"; then
    exit 1
  fi
else
  echo "WARNING: execution Docker socket not found, falling back to default Docker daemon for runtime image pull." >&2
  if ! pull_with_retry docker pull "$RUNTIME_IMAGE"; then
    exit 1
  fi
fi

echo "Pulling runner stack images..."
if ! pull_with_retry docker compose pull; then
  exit 1
fi

echo "Starting/recreating runner stack..."
# Compose recreates services whose pulled image digest changed. --wait keeps
# deploy.sh attached until the runner and Judge0 health checks are ready.
if ! docker compose up \
  -d \
  --remove-orphans \
  --wait \
  --wait-timeout 300; then
  echo "Runner stack failed to become healthy." >&2
  exit 1
fi

echo "Current services:"
docker compose ps || exit 1

echo "Running smoke tests..."
if ! ./smoke-test.sh; then
  echo "Smoke tests failed; deployment is not considered successful." >&2
  exit 1
fi

echo "Pruning unused images..."
docker image prune -f >/dev/null || true

echo "ZoeSkoul Runner deployment completed successfully."
echo "Deployed image tag: ${IMAGE_TAG}"
