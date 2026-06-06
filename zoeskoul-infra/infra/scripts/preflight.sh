#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$INFRA_DIR/env/production.env}"
JUDGE0_ENV_FILE="${JUDGE0_ENV_FILE:-$INFRA_DIR/env/judge0.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Run ./scripts/generate-env.sh first." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
if [[ -f "$JUDGE0_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$JUDGE0_ENV_FILE"
fi
set +a

MONOREPO_ROOT="${MONOREPO_ROOT:-$(cd "$INFRA_DIR/.." && pwd)}"
BACKEND_NETWORK="${BACKEND_NETWORK:-zoeskoul-backend}"
EDGE_WEB_NETWORK="${EDGE_WEB_NETWORK:-zoeskoul-edge-web}"
EDGE_RUNNER_NETWORK="${EDGE_RUNNER_NETWORK:-zoeskoul-edge-runner}"
JUDGE0_NETWORK="${JUDGE0_NETWORK:-zoeskoul-judge0-internal}"
RUNNER_WORKSPACE_ROOT="${RUNNER_WORKSPACE_ROOT:-/var/lib/zoeskoul/runner-workspaces}"

export INFRA_DIR MONOREPO_ROOT

echo "== Host =="
uname -a

echo "== Docker =="
command -v docker >/dev/null || { echo "Docker missing" >&2; exit 1; }
docker version --format 'Client={{.Client.Version}} Server={{.Server.Version}}' || true
docker compose version

echo "== Monorepo root =="
echo "$MONOREPO_ROOT"
if [[ ! -f "$MONOREPO_ROOT/apps/runner/Dockerfile" ]]; then
  echo "WARN: apps/runner/Dockerfile not found. Runner build will fail unless MONOREPO_ROOT is set correctly."
fi
if [[ ! -f "$MONOREPO_ROOT/apps/runtime/Dockerfile" ]]; then
  echo "WARN: apps/runtime/Dockerfile not found. Runtime image build will fail unless MONOREPO_ROOT is set correctly."
fi
if [[ "${ENABLE_WEB:-0}" == "1" && ! -f "$MONOREPO_ROOT/apps/web/Dockerfile" ]]; then
  echo "ERROR: ENABLE_WEB=1 but apps/web/Dockerfile not found." >&2
  exit 1
fi

echo "== Runner socket safety =="
"$SCRIPT_DIR/assert-safe-runner.sh"

echo "== Directories =="
sudo mkdir -p "$RUNNER_WORKSPACE_ROOT" "$INFRA_DIR/logs/caddy" "${BACKUP_DIR:-/var/backups/zoeskoul/postgres}"
sudo chown -R "$(id -u):$(id -g)" "$RUNNER_WORKSPACE_ROOT" "$INFRA_DIR/logs" || true

echo "== Networks =="
create_net() {
  local name="$1"
  local mode="$2"
  if ! docker network inspect "$name" >/dev/null 2>&1; then
    if [[ "$mode" == "internal" ]]; then
      docker network create --internal "$name" >/dev/null
    else
      docker network create "$name" >/dev/null
    fi
    echo "Created $mode network: $name"
  else
    echo "Exists: $name"
  fi
}
create_net "$BACKEND_NETWORK" internal
create_net "$EDGE_WEB_NETWORK" bridge
create_net "$EDGE_RUNNER_NETWORK" bridge
create_net "$JUDGE0_NETWORK" internal

echo "== Compose config validation =="
"$SCRIPT_DIR/compose.sh" config >/tmp/zoeskoul-compose-rendered.yml

echo "== Caddyfile validation =="
CADDY_ENV_ARGS=(--env-file "$ENV_FILE")
if [[ -f "$JUDGE0_ENV_FILE" ]]; then
  CADDY_ENV_ARGS+=(--env-file "$JUDGE0_ENV_FILE")
fi
docker run --rm \
  "${CADDY_ENV_ARGS[@]}" \
  -v "$INFRA_DIR/compose/edge/Caddyfile:/etc/caddy/Caddyfile:ro" \
  "${CADDY_IMAGE:-caddy:2.9.1}" \
  caddy validate --config /etc/caddy/Caddyfile

echo "== Secret sanity =="
"$SCRIPT_DIR/check-secrets.sh"

echo "Preflight OK."
