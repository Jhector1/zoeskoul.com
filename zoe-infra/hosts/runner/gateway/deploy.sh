#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] || { echo 'Missing gateway/.env' >&2;exit 1; }
set -a
# shellcheck disable=SC1091
. ./.env
set +a
: "${RUNNER_DOMAIN:?required}" "${JUDGE0_DOMAIN:?required}" "${JUDGE0_AUTHN_TOKEN:?required}"
docker compose --env-file .env -f compose.yml config --quiet
[ "${1:-}" = '--check' ] && { echo 'GATEWAY_CONFIG_PASS';exit 0; }
[ "$#" -eq 0 ] || { echo 'Usage: deploy.sh [--check]' >&2;exit 2; }
docker network inspect "${RUNNER_INGRESS_NETWORK:-zoeskoul-runner-ingress}" >/dev/null
# Two backends must exist before publishing gateway routes.
case "${ZOEBUILD_ROUTE_FILE:-routes/zoebuild-enabled.caddy}" in
  routes/zoebuild-enabled.caddy) backend_names="zoeskoul-learning-runner- zoebuild-runner-runner- zoeskoul-learning-judge0-" ;;
  routes/zoebuild-disabled.caddy) backend_names="zoeskoul-learning-runner- zoeskoul-learning-judge0-" ;;
  *) echo "ERROR: invalid ZoeBuild gateway route selection" >&2; exit 1 ;;
esac
for name in $backend_names;do
  docker ps --filter "network=${RUNNER_INGRESS_NETWORK:-zoeskoul-runner-ingress}" \
    --format '{{.Names}}' | grep -Fq "$name" || {
    echo "ERROR: missing backend for gateway: $name" >&2;exit 1;
  }
done
docker compose --env-file .env -f compose.yml pull
docker compose --env-file .env -f compose.yml up -d --wait --wait-timeout 180
./smoke-test.sh
echo 'GATEWAY_DEPLOY_PASS'
