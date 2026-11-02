#!/usr/bin/env bash
# Operator-only, maintenance-window runtime acceptance. No runtime activation.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
SOURCE="${1:-}"
if [[ -z "$SOURCE" || ! -f "$SOURCE" || -L "$SOURCE" ]]; then
  echo 'P3B3_REFUSE: provide a regular canonical source JSON file' >&2
  exit 1
fi
SOURCE="$(realpath "$SOURCE")"
if [[ "$(stat -c '%a' "$SOURCE")" != "600" ]]; then
  echo 'P3B3_REFUSE: source JSON must have permissions 600' >&2
  exit 1
fi
cd "$ROOT"
# Verify the production deployment contract without changing containers.
./deploy.sh zoebuild --check
cd zoebuild
COMPOSE=(docker compose --env-file .env -f compose.yml)
CID="$("${COMPOSE[@]}" ps -aq runner)"
if [[ -z "$CID" || "$(docker inspect -f '{{.State.Health.Status}}' "$CID")" != 'healthy' ]]; then
  echo 'P3B3_REFUSE: existing ZoeBuild Runner is not healthy' >&2
  exit 1
fi
if [[ "$(docker inspect -f '{{.Config.Image}}' "$CID")" != ghcr.io/*@sha256:* ]]; then
  echo 'P3B3_REFUSE: existing Runner is not digest-pinned' >&2
  exit 1
fi
# Refuse to interrupt active managed sessions. Both learning and ZoeBuild run
# rootless daemons, but inspect ONLY ZoeBuild executor UID 1001 here.
EXISTING="$(sudo -u zoebuild-exec env \
  XDG_RUNTIME_DIR=/run/user/1001 \
  DOCKER_HOST=unix:///run/user/1001/docker.sock \
  docker ps -aq --filter 'label=com.zoeskoul.runner=true')"
if [[ -n "$EXISTING" ]]; then
  echo 'P3B3_REFUSE: existing ZoeBuild executor containers (no forced termination)' >&2
  exit 1
fi
# The Runner's workspace root is exclusively ZoeBuild's. Never stop an active
# service merely to discover a pre-existing workspace after launching the canary.
WORKSPACE_ROOT="$(docker inspect "$CID" -f '{{range .Config.Env}}{{println .}}{{end}}' |
  sed -n 's/^RUNNER_WORKSPACE_ROOT=//p')"
if [[ -z "$WORKSPACE_ROOT" || ! -d "$WORKSPACE_ROOT" || -L "$WORKSPACE_ROOT" ]]; then
  echo 'P3B3_REFUSE: missing or unsafe ZoeBuild workspace root' >&2
  exit 1
fi
if find "$WORKSPACE_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'zoeskoul-run-*' -print -quit | grep -q .; then
  echo 'P3B3_REFUSE: a ZoeBuild workspace already exists' >&2
  exit 1
fi
echo 'P3B3_OPERATOR_MAINTENANCE_GATE_PASS'
"${COMPOSE[@]}" stop runner
# Failure intentionally leaves the main Runner stopped to preserve forensic
# evidence. Do not use trap to auto-restart after an incomplete cleanup.
if ! "${COMPOSE[@]}" run --rm --no-deps -T \
  --entrypoint node \
  -e ZOEBUILD_P3B3_OPERATOR_CANARY=I_ACKNOWLEDGE_MAINTENANCE \
  runner --import=tsx dist/acceptance/tanstackCanary.js < "$SOURCE"; then
  echo 'P3B3_OPERATOR_CANARY_FAILED: preserve resources; Runner stays stopped' >&2
  exit 1
fi
"${COMPOSE[@]}" start runner
HEALTH=''
for _ in $(seq 1 45); do
  HEALTH="$(docker inspect -f '{{.State.Health.Status}}' "$CID")"
  [[ "$HEALTH" == healthy ]] && break
  [[ "$HEALTH" == unhealthy ]] && break
  sleep 3
done
if [[ "$HEALTH" != healthy ]]; then
  echo 'P3B3_POST_CANARY_RUNNER_UNHEALTHY' >&2
  exit 1
fi
./smoke-test.sh
echo 'P3B3_OPERATOR_CANARY_AND_RUNNER_RESTART_PASS'
