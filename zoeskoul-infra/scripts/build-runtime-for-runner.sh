#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$INFRA_DIR/env/production.env}"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

MONOREPO_ROOT="${MONOREPO_ROOT:-$(cd "$INFRA_DIR/.." && pwd)}"
RUNTIME_IMAGE="${RUNTIME_IMAGE:-zoeskoul-runtime:preview}"
RUNNER_DOCKER_SOCKET_HOST="${RUNNER_DOCKER_SOCKET_HOST:?required}"

if [[ ! -f "$MONOREPO_ROOT/apps/runtime/Dockerfile" ]]; then
  echo "apps/runtime/Dockerfile not found under MONOREPO_ROOT=$MONOREPO_ROOT" >&2
  exit 1
fi

echo "Building runtime image into the runner Docker daemon: $RUNTIME_IMAGE"
echo "Docker host socket: $RUNNER_DOCKER_SOCKET_HOST"
docker --host "unix://$RUNNER_DOCKER_SOCKET_HOST" build \
  -t "$RUNTIME_IMAGE" \
  -f "$MONOREPO_ROOT/apps/runtime/Dockerfile" \
  "$MONOREPO_ROOT"

echo "Runtime image available to runner daemon."
