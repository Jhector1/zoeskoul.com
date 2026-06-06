#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$INFRA_DIR/env/production.env}"
JUDGE0_ENV_FILE="${JUDGE0_ENV_FILE:-$INFRA_DIR/env/judge0.env}"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
if [[ -f "$JUDGE0_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$JUDGE0_ENV_FILE"
fi
set +a

echo "== Compose services =="
"$SCRIPT_DIR/compose.sh" ps

echo "== Postgres health =="
docker exec zoeskoul-postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"

echo "== Redis health =="
docker exec zoeskoul-redis redis-cli ping

echo "== Runner health, internal only =="
docker exec zoeskoul-runner wget -qO- http://127.0.0.1:4001/health >/dev/null
echo "Runner health OK"

echo "== Runner host port should be closed unless EXPOSE_RUNNER_LOCAL=1 =="
if [[ "${EXPOSE_RUNNER_LOCAL:-0}" != "1" ]]; then
  if curl -fsS "http://127.0.0.1:${RUNNER_HOST_PORT:-4001}/health" >/dev/null 2>&1; then
    echo "ERROR: runner responded on host port, but EXPOSE_RUNNER_LOCAL is not enabled." >&2
    exit 1
  else
    echo "Runner host port is closed as expected."
  fi
fi

echo "== Caddy config =="
docker exec zoeskoul-edge-caddy caddy validate --config /etc/caddy/Caddyfile

echo "== Web edge preview =="
if curl -fsSI "${CADDY_WEB_SITE:-http://localhost}" >/dev/null 2>&1; then
  echo "Web edge responded."
else
  echo "WARN: Web edge did not respond. This is expected if ENABLE_WEB=1 was not used or web app is not running."
fi

if [[ "${ENABLE_JUDGE0:-0}" == "1" ]]; then
  echo "== Judge0 health, internal only =="
  docker exec zoeskoul-judge0-api wget -qO- --header="${JUDGE0_AUTHN_HEADER:-X-Judge0-Token}: ${JUDGE0_AUTHN_TOKEN}" http://127.0.0.1:2358/about >/dev/null
  echo "Judge0 responded internally."
  if [[ "${EXPOSE_JUDGE0_LOCAL:-0}" != "1" ]]; then
    if curl -fsS "http://127.0.0.1:${JUDGE0_HOST_PORT:-2358}/about" >/dev/null 2>&1; then
      echo "ERROR: Judge0 responded on host port, but EXPOSE_JUDGE0_LOCAL is not enabled." >&2
      exit 1
    else
      echo "Judge0 host port is closed as expected."
    fi
  fi
fi

echo "Smoke tests complete."
