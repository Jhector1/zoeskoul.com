#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
if [[ "${1:-}" != "" && "${1:-}" != "--exercise-cleanup" ]]; then
  echo "Usage: $0 [--exercise-cleanup]" >&2
  exit 2
fi

"$ROOT/deploy.sh" --check

fail() { echo "ISOLATION_FAIL: $*" >&2; exit 1; }

# Private per-pool environment files are the source of truth on both dev and
# production. Do not assume developer-specific Linux accounts (e.g. "jean").
pool_uid() {
  local pool="$1" env_file spec socket uid
  env_file="$ROOT/$pool/.env"
  [[ -r "$env_file" ]] || fail "cannot read private $pool/.env (run with sudo)"
  spec="$(awk -F= '$1 == "RUNNER_CONTAINER_USER" {print $2; exit}' "$env_file")"
  [[ "$spec" =~ ^([0-9]+):([0-9]+)$ ]] || fail "invalid RUNNER_CONTAINER_USER in $pool/.env"
  uid="${BASH_REMATCH[1]}"
  socket="$(awk -F= '$1 == "RUNNER_DOCKER_SOCKET_HOST" {print $2; exit}' "$env_file")"
  [[ "$socket" == "/run/user/$uid/docker.sock" ]] || fail "socket/UID mismatch in $pool/.env"
  printf '%s\n' "$uid"
}

pool_user() {
  local uid="$1" entry
  entry="$(getent passwd "$uid")" || fail "no Linux account for UID $uid"
  [[ -n "$entry" ]] || fail "no Linux account for UID $uid"
  printf '%s\n' "${entry%%:*}"
}

LEARNING_UID="$(pool_uid zoeskoul-learning)"
ZOE_UID="$(pool_uid zoebuild)"
[[ "$LEARNING_UID" != "$ZOE_UID" ]] || fail 'same executor UID'
LEARNING_USER="$(pool_user "$LEARNING_UID")"
ZOE_USER="$(pool_user "$ZOE_UID")"

learning_docker() {
  sudo -u "$LEARNING_USER" env XDG_RUNTIME_DIR="/run/user/$LEARNING_UID" \
    DOCKER_HOST="unix:///run/user/$LEARNING_UID/docker.sock" docker "$@"
}
zoebuild_docker() {
  sudo -u "$ZOE_USER" env XDG_RUNTIME_DIR="/run/user/$ZOE_UID" \
    DOCKER_HOST="unix:///run/user/$ZOE_UID/docker.sock" docker "$@"
}

learning_root="$(learning_docker info --format '{{.DockerRootDir}}')"
zoebuild_root="$(zoebuild_docker info --format '{{.DockerRootDir}}')"
[[ "$learning_root" != "$zoebuild_root" ]] || fail 'same Docker data root'
for ctl in learning_docker zoebuild_docker; do
  [[ "$("$ctl" info --format '{{.CgroupVersion}}')" == 2 ]] || {
    fail 'cgroup v2 not active';
  }
done

printf 'Learning executor: %s (UID %s)\n' "$LEARNING_USER" "$LEARNING_UID"
printf 'ZoeBuild executor: %s (UID %s)\n' "$ZOE_USER" "$ZOE_UID"
printf 'Learning Docker root: %s\n' "$learning_root"
printf 'ZoeBuild Docker root: %s\n' "$zoebuild_root"
echo 'TWO_POOL_EXECUTOR_ISOLATION_PASS'

if [[ "${1:-}" == "--exercise-cleanup" ]]; then
  # These cleanup scripts remove ONLY eligible stopped artifacts from their own
  # executor. Compare the other executor's container inventory before/after.
  before_learning="$(learning_docker ps -aq | sort)"
  "$ROOT/zoebuild/cleanup.sh"
  after_learning="$(learning_docker ps -aq | sort)"
  [[ "$before_learning" == "$after_learning" ]] || {
    echo 'ISOLATION_FAIL: ZoeBuild cleanup modified Learning container inventory' >&2; exit 1;
  }
  before_zoebuild="$(zoebuild_docker ps -aq | sort)"
  "$ROOT/zoeskoul-learning/cleanup.sh"
  after_zoebuild="$(zoebuild_docker ps -aq | sort)"
  [[ "$before_zoebuild" == "$after_zoebuild" ]] || {
    echo 'ISOLATION_FAIL: Learning cleanup modified ZoeBuild container inventory' >&2; exit 1;
  }
  echo 'TWO_POOL_CLEANUP_ISOLATION_PASS'
fi
