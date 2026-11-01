#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] || exit 1
set -a
# shellcheck disable=SC1091
. ./.env
set +a
docker compose --env-file .env -f compose.yml exec -T caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null
echo 'GATEWAY_CONFIG_HEALTH_PASS'
if [ "${RUNNER_PUBLIC_SMOKE:-false}" = true ]; then
  curl --fail --show-error --silent --head --max-time 15 "https://${RUNNER_DOMAIN}/healthz" >/dev/null
  echo 'GATEWAY_PUBLIC_TLS_PASS'
else
  echo 'Gateway public TLS not checked (set RUNNER_PUBLIC_SMOKE=true for release acceptance)'
fi
