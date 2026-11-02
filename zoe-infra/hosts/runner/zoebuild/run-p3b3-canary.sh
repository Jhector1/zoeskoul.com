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
# Fail closed on Docker or filesystem inspection errors. The ZoeBuild workspace
# is owned by zoebuild-exec, so an unprivileged `find` can wrongly report empty.
# Discover UID from the account instead of assuming it is always 1001.
EXE_UID="$(id -u zoebuild-exec)"
WORKSPACE_ROOT="$(docker inspect "$CID" -f '{{range .Config.Env}}{{println .}}{{end}}' |
  sed -n 's/^RUNNER_WORKSPACE_ROOT=//p')"
if [[ -z "$WORKSPACE_ROOT" || "$WORKSPACE_ROOT" != /* || ! -d "$WORKSPACE_ROOT" || -L "$WORKSPACE_ROOT" ]]; then
  echo 'P3B3_REFUSE: missing or unsafe ZoeBuild workspace root' >&2
  exit 1
fi
assert_zoebuild_drained() {
  local existing pending
  if ! existing="$(sudo -u zoebuild-exec env \
    XDG_RUNTIME_DIR="/run/user/${EXE_UID}" \
    DOCKER_HOST="unix:///run/user/${EXE_UID}/docker.sock" \
    docker ps -aq --filter 'label=com.zoeskoul.runner=true')"; then
    echo 'P3B3_REFUSE: could not inspect ZoeBuild rootless executor' >&2
    return 1
  fi
  if [[ -n "$existing" ]]; then
    echo 'P3B3_REFUSE: existing ZoeBuild executor containers (no forced termination)' >&2
    return 1
  fi
  # Inspect only the top-level allocated workspaces, including any symlinks.
  # Capture the find status: permission errors must NOT be treated as empty.
  if ! pending="$(sudo find -P "$WORKSPACE_ROOT" \
    -mindepth 1 -maxdepth 1 -name 'zoeskoul-run-*' -print -quit)"; then
    echo 'P3B3_REFUSE: could not inspect ZoeBuild workspace root' >&2
    return 1
  fi
  if [[ -n "$pending" ]]; then
    echo 'P3B3_REFUSE: a ZoeBuild workspace already exists' >&2
    return 1
  fi
}
assert_zoebuild_drained
echo 'P3B3_OPERATOR_MAINTENANCE_GATE_PASS'
"${COMPOSE[@]}" stop runner
# Check again after stopping: work may have been admitted between preflight
# and service shutdown. A failed post-stop gate leaves the Runner stopped.
if [[ "$(docker inspect -f '{{.State.Running}}' "$CID")" != false ]]; then
  echo 'P3B3_REFUSE: Runner did not stop cleanly' >&2
  exit 1
fi
assert_zoebuild_drained
echo 'P3B3_OPERATOR_POST_STOP_DRAIN_PASS'
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
