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
# shellcheck disable=SC1091
. ./storage-guard.sh

: "${GHCR_OWNER:?required}"

# A normal deployment always follows the mutable production tag. Pass an
# immutable commit SHA explicitly only for a rollback or pinned deployment.
export IMAGE_TAG="${1:-prod}"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-runner}"

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

WORKSPACE_ROOT="${RUNNER_WORKSPACE_HOST_ROOT:-/var/lib/zoeskoul-runner/workspaces}"
sudo mkdir -p "$WORKSPACE_ROOT"
sudo chown -R "${USER}:${USER}" "$(dirname "$WORKSPACE_ROOT")"

# Production must have exactly one stack owner and two intentionally separate
# Docker daemons: system Docker for the service stack and rootless Docker for
# learner execution. Falling back between them recreates the disk/ownership bug.
runner_storage_require_exec_socket

# Reclaim only unused Docker objects before ownership/disk gates. This is safe
# even on a host that still has a legacy stack because in-use images are kept.
runner_storage_prune_unused
runner_storage_assert_single_compose_owner
runner_storage_assert_deploy_headroom

RUNTIME_IMAGE="ghcr.io/${GHCR_OWNER}/zoeskoul-runtime:${IMAGE_TAG}"
EXEC_DOCKER_SOCKET="$(runner_storage_exec_socket)"

echo "Deploying ZoeSkoul Runner image tag: ${IMAGE_TAG}"
echo "Pulling sandbox runtime image into rootless execution Docker: ${RUNTIME_IMAGE}"
pull_with_retry env DOCKER_HOST="unix://${EXEC_DOCKER_SOCKET}" docker pull "$RUNTIME_IMAGE"

echo "Pulling runner stack images into system Docker..."
pull_with_retry docker compose pull

echo "Starting/recreating runner stack..."
docker compose up \
  -d \
  --remove-orphans \
  --wait \
  --wait-timeout 300

echo "Current services:"
docker compose ps

echo "Running smoke tests..."
./smoke-test.sh

# Once the new deployment is healthy, no unused local image is needed for
# correctness; immutable rollback tags remain in GHCR and can be re-pulled.
runner_storage_prune_unused
runner_storage_cleanup_stale_workspaces
runner_storage_vacuum_journal
runner_storage_assert_deploy_headroom

runner_storage_show_docker_usage

echo "ZoeSkoul Runner deployment completed successfully."
