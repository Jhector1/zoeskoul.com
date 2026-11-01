#!/usr/bin/env bash
set -euo pipefail
POOL="${1:?pool required}"
cd "$(dirname "$0")/../$POOL"
# shellcheck disable=SC1091
. ../shared/pool-common.sh
pool_load_env "$(pwd -P)"
[ "$RUNNER_EXECUTION_POOL" = "$POOL" ] || exit 1
pool_require_isolated_executor
if [ "$POOL" = zoebuild ]; then
  # Keeping reusable image identities is intentional; only stopped ephemeral containers
  # are collected here. Source/workspaces are managed by the runner's session lifecycle.
  pool_docker container prune -f --filter until=72h >/dev/null
else
  pool_docker container prune -f --filter until=24h >/dev/null
  pool_docker image prune -f --filter until=168h >/dev/null
  pool_docker builder prune -f --filter until=168h >/dev/null
fi
# Host workspaces are NOT deleted on mtime; live sessions can own old directories.
# Dedicated, session-aware workspace GC must use the runner's authoritative leases.
echo "${POOL} executor disk usage:"
pool_docker system df
pool_check_headroom "$(pool_docker info --format '{{.DockerRootDir}}')" "$POOL-executor"
echo "${POOL}_MAINTENANCE_PASS"
