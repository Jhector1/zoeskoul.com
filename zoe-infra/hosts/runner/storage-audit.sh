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
# shellcheck disable=SC1091
. ./storage-guard.sh

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-runner}"
EXEC_SOCKET="$(runner_storage_exec_socket)"
runner_storage_require_exec_socket

SYSTEM_ROOT="$(runner_storage_docker_root '')"
EXEC_ROOT="$(runner_storage_docker_root "$EXEC_SOCKET")"
WORKSPACE_ROOT="${RUNNER_WORKSPACE_HOST_ROOT:-/var/lib/zoeskoul-runner/workspaces}"

echo "=== ZoeSkoul Runner storage audit ==="
df -h /
echo
printf 'system_docker_root=%s\n' "$SYSTEM_ROOT"
printf 'executor_docker_root=%s\n' "$EXEC_ROOT"
printf 'workspace_root=%s\n' "$WORKSPACE_ROOT"
echo
runner_storage_show_docker_usage

echo
echo "Top-level filesystem usage:"
sudo du -xhd1 / 2>/dev/null | sort -h

echo
echo "Runner-owned storage:"
for p in "$SYSTEM_ROOT" "$EXEC_ROOT" "$WORKSPACE_ROOT" /var/log/journal; do
  if [ -e "$p" ]; then
    sudo du -sh "$p" 2>/dev/null || true
  fi
done

echo
echo "Compose ownership:"
docker ps -a --format 'table {{.ID}}\t{{.Image}}\t{{.Names}}\t{{.Label "com.docker.compose.project"}}'

echo
if runner_storage_assert_single_compose_owner; then
  echo "compose_owner=PASS"
else
  echo "compose_owner=FAIL"
fi

if runner_storage_assert_deploy_headroom; then
  echo "deploy_headroom=PASS"
else
  echo "deploy_headroom=FAIL"
fi
