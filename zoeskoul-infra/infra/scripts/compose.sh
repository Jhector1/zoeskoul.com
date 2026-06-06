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

export INFRA_DIR
export MONOREPO_ROOT="${MONOREPO_ROOT:-$(cd "$INFRA_DIR/.." && pwd)}"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-zoeskoul}"

COMPOSE_FILES=()

# Runner + Judge0-only mode should not start the app database.
# When ENABLE_WEB=1, the app compose supplies Postgres + Redis + web.
# Otherwise, use a small Redis-only compose because the runner depends on Redis.
if [[ "${ENABLE_WEB:-0}" == "1" ]]; then
  COMPOSE_FILES+=(
    -f "$INFRA_DIR/compose/app/compose.prod.yml"
  )
else
  COMPOSE_FILES+=(
    -f "$INFRA_DIR/compose/runner/compose.redis.yml"
  )
fi

COMPOSE_FILES+=(
  -f "$INFRA_DIR/compose/runner/compose.prod.yml"
  -f "$INFRA_DIR/compose/edge/compose.yml"
)

if [[ "${EXPOSE_RUNNER_LOCAL:-0}" == "1" ]]; then
  COMPOSE_FILES+=(-f "$INFRA_DIR/compose/runner/compose.expose-local.yml")
fi

if [[ "${ENABLE_JUDGE0:-0}" == "1" ]]; then
  COMPOSE_FILES+=(--env-file "$JUDGE0_ENV_FILE" -f "$INFRA_DIR/compose/judge0/compose.preview.yml")
  if [[ "${EXPOSE_JUDGE0_LOCAL:-0}" == "1" ]]; then
    COMPOSE_FILES+=(-f "$INFRA_DIR/compose/judge0/compose.expose-local.yml")
  fi
fi

PROFILE_ARGS=()
if [[ "${ENABLE_WEB:-0}" == "1" ]]; then
  PROFILE_ARGS+=(--profile web)
fi

exec docker compose --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" "${PROFILE_ARGS[@]}" "$@"
