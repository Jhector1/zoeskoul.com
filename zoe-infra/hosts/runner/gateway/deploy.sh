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
for name in zoeskoul-learning-runner- zoebuild-runner-runner- zoeskoul-learning-judge0-;do
  docker ps --filter "network=${RUNNER_INGRESS_NETWORK:-zoeskoul-runner-ingress}" \
    --format '{{.Names}}' | grep -Fq "$name" || {
    echo "ERROR: missing backend for gateway: $name" >&2;exit 1;
  }
done
docker compose --env-file .env -f compose.yml pull
docker compose --env-file .env -f compose.yml up -d --wait --wait-timeout 180
./smoke-test.sh
echo 'GATEWAY_DEPLOY_PASS'
