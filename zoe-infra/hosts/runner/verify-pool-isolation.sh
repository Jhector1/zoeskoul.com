#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
if [[ "${1:-}" != "" && "${1:-}" != "--exercise-cleanup" ]]; then
  echo "Usage: $0 [--exercise-cleanup]" >&2
  exit 2
fi

"$ROOT/deploy.sh" --check
LEARNING_UID="$(id -u jean)"
ZOE_UID="$(id -u zoebuild-exec)"
[[ "$LEARNING_UID" != "$ZOE_UID" ]] || { echo 'ISOLATION_FAIL: same executor UID' >&2; exit 1; }

learning_docker() {
  sudo -u jean env XDG_RUNTIME_DIR="/run/user/$LEARNING_UID" \
    DOCKER_HOST="unix:///run/user/$LEARNING_UID/docker.sock" docker "$@"
}
zoebuild_docker() {
  sudo -u zoebuild-exec env XDG_RUNTIME_DIR="/run/user/$ZOE_UID" \
    DOCKER_HOST="unix:///run/user/$ZOE_UID/docker.sock" docker "$@"
}

learning_root="$(learning_docker info --format '{{.DockerRootDir}}')"
zoebuild_root="$(zoebuild_docker info --format '{{.DockerRootDir}}')"
[[ "$learning_root" != "$zoebuild_root" ]] || { echo 'ISOLATION_FAIL: same Docker data root' >&2; exit 1; }
for ctl in learning_docker zoebuild_docker; do
  [[ "$("$ctl" info --format '{{.CgroupVersion}}')" == 2 ]] || {
    echo 'ISOLATION_FAIL: cgroup v2 not active' >&2; exit 1;
  }
done

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
