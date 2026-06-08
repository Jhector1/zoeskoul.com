#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$INFRA_DIR/env/production.env}"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

socket="${RUNNER_DOCKER_SOCKET_HOST:-}"
if [[ -z "$socket" ]]; then
  echo "RUNNER_DOCKER_SOCKET_HOST is missing." >&2
  exit 1
fi

if [[ "$socket" == "/var/run/docker.sock" && "${ALLOW_ROOT_DOCKER_SOCKET:-0}" != "1" ]]; then
  cat >&2 <<'MSG'
ERROR: Runner is configured to use /var/run/docker.sock.

That is intentionally blocked. The root Docker socket grants root-equivalent host control.
Use ./scripts/install-rootless-docker.sh and set RUNNER_DOCKER_SOCKET_HOST=/run/user/<uid>/docker.sock.

For throwaway local debugging only, set ALLOW_ROOT_DOCKER_SOCKET=1 in env/production.env.
MSG
  exit 1
fi

if [[ ! -S "$socket" ]]; then
  echo "Runner Docker socket does not exist or is not a socket: $socket" >&2
  echo "Run ./scripts/install-rootless-docker.sh or fix RUNNER_DOCKER_SOCKET_HOST in env/production.env." >&2
  exit 1
fi

actual_gid="$(stat -c '%g' "$socket")"
if [[ "${RUNNER_DOCKER_SOCKET_GID:-}" != "$actual_gid" ]]; then
  echo "RUNNER_DOCKER_SOCKET_GID=${RUNNER_DOCKER_SOCKET_GID:-unset}, but socket GID is $actual_gid." >&2
  echo "Update env/production.env: RUNNER_DOCKER_SOCKET_GID=$actual_gid" >&2
  exit 1
fi

echo "Runner Docker socket check OK: $socket"
