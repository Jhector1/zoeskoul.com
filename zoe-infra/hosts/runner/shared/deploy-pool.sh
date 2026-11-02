#!/usr/bin/env bash
set -euo pipefail
POOL="${1:?pool required}"; shift
cd "$(dirname "$0")/../$POOL"
ROOT="$(pwd -P)"
# shellcheck disable=SC1091
. ../shared/pool-common.sh
pool_load_env "$ROOT"
[ "$RUNNER_EXECUTION_POOL" = "$POOL" ] || { echo 'ERROR: pool identity mismatch' >&2; exit 1; }
case "$POOL" in
  zoebuild) OTHER='../zoeskoul-learning/.env' ;;
  zoeskoul-learning) OTHER='../zoebuild/.env' ;;
  *) echo 'Invalid pool' >&2; exit 1;;
esac
pool_check_not_shared "$OTHER"
pool_require_isolated_executor

[ "${1:-}" = '--check' ] && CHECK_ONLY=true || CHECK_ONLY=false
[ "$#" -eq 0 ] || [ "$1" = '--check' ] || { echo 'Usage: deploy.sh [--check]' >&2;exit 2; }

docker compose --env-file .env -f compose.yml config --quiet
# Reject mutable/fallback images before any pull, restart, or service replacement.
if [ "$POOL" = zoebuild ]; then
  docker compose --env-file .env -f compose.yml config --format json | \
    python3 ../shared/verify-image-pins.py "$POOL"
fi
pool_docker info --format 'Execution Docker root={{.DockerRootDir}}'
if $CHECK_ONLY; then echo "${POOL}_CONFIG_PASS"; exit 0;fi

[ -d "$RUNNER_WORKSPACE_HOST_ROOT" ] || {
  local_uid="${RUNNER_CONTAINER_USER%%:*}"; local_gid="${RUNNER_CONTAINER_USER#*:}"
  sudo install -d -m 0770 -o "$local_uid" -g "$local_gid" "$RUNNER_WORKSPACE_HOST_ROOT"
}
[ "$(stat -c %u "$RUNNER_WORKSPACE_HOST_ROOT")" = "${RUNNER_CONTAINER_USER%%:*}" ] || {
  echo 'ERROR: workspace root ownership differs; refusing recursive chown' >&2; exit 1;
}
pool_check_headroom "$RUNNER_WORKSPACE_HOST_ROOT" "$POOL-workspace"
pool_docker_root="$(pool_docker info --format '{{.DockerRootDir}}')"
pool_check_headroom "$pool_docker_root" "$POOL-executor"

docker network inspect "${RUNNER_INGRESS_NETWORK:-zoeskoul-runner-ingress}" >/dev/null 2>&1 || {
  echo 'ERROR: shared ingress network missing; run hosts/runner/setup.sh first' >&2;exit 1;
}
RUNTIME_IMAGE="${RUNNER_IMAGE_REF:-ghcr.io/${GHCR_OWNER}/zoeskoul-runtime:${IMAGE_TAG:-prod}}"
echo "Pulling runtime into dedicated ${POOL} executor..."
pool_docker pull "$RUNTIME_IMAGE"
echo "Pulling ${POOL} service images..."
docker compose --env-file .env -f compose.yml pull
echo "Starting ${POOL}..."
docker compose --env-file .env -f compose.yml up -d --wait --wait-timeout 300
../shared/smoke-pool.sh "$POOL"
echo "${POOL}_DEPLOY_PASS"
