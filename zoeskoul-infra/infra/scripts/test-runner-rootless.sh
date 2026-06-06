#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$INFRA_DIR/env/production.env}"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

socket="${RUNNER_DOCKER_SOCKET_HOST:?required}"

echo "Testing Docker API through runner socket: $socket"
docker --host "unix://$socket" version >/dev/null
docker --host "unix://$socket" run --rm --network none --memory 64m --pids-limit 64 hello-world >/tmp/zoeskoul-rootless-test.log 2>&1 || {
  cat /tmp/zoeskoul-rootless-test.log >&2
  exit 1
}
cat /tmp/zoeskoul-rootless-test.log

echo "Rootless runner Docker test OK."
