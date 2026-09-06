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
# shellcheck disable=SC1091
. ./storage-guard.sh

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-runner}"

echo "=== ZoeSkoul Runner storage maintenance ==="
echo "Disk before:"
df -h /
runner_storage_show_docker_usage

echo
runner_storage_prune_unused
runner_storage_assert_single_compose_owner
runner_storage_cleanup_stale_workspaces
runner_storage_vacuum_journal

echo
echo "Disk after:"
df -h /
runner_storage_show_docker_usage

# Maintenance uses the same production floor as deploys. A failure here is an
# intentional alert signal for the systemd timer / host monitoring.
runner_storage_assert_deploy_headroom

echo "Runner storage maintenance completed."
