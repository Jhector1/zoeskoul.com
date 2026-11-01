#!/usr/bin/env bash
set -euo pipefail

pool_load_env() {
  local pool_dir="$1"
  if [ ! -f "$pool_dir/.env" ]; then
    echo "ERROR: missing $pool_dir/.env (start with .env.example)" >&2
    return 1
  fi
  set -a
  # shellcheck disable=SC1090
  . "$pool_dir/.env"
  set +a
  : "${GHCR_OWNER:?required}"
  : "${RUNNER_WORKSPACE_HOST_ROOT:?required}"
  : "${RUNNER_DOCKER_SOCKET_HOST:?required}"
  : "${RUNNER_CONTAINER_USER:?required}"
  : "${RUNNER_EXECUTION_POOL:?required}"
  case "$RUNNER_EXECUTION_POOL" in zoebuild|zoeskoul-learning) ;; *) echo 'Invalid runner pool' >&2; return 1;; esac
  if [ "$RUNNER_DOCKER_SOCKET_HOST" = '/var/run/docker.sock' ] || [ "$RUNNER_DOCKER_SOCKET_HOST" = '/run/docker.sock' ]; then
    echo 'ERROR: system Docker socket cannot be an executor' >&2; return 1
  fi
  if ! [[ "$RUNNER_WORKSPACE_HOST_ROOT" = /* && "$RUNNER_DOCKER_SOCKET_HOST" = /* ]]; then
    echo 'ERROR: executor paths must be absolute' >&2; return 1
  fi
  if [[ "$RUNNER_WORKSPACE_HOST_ROOT" = /var/lib/zoeskoul-runner/workspaces && "$RUNNER_EXECUTION_POOL" = zoebuild ]] || [[ "$RUNNER_WORKSPACE_HOST_ROOT" = /var/lib/zoebuild-runner/workspaces && "$RUNNER_EXECUTION_POOL" = zoeskoul-learning ]]; then
    echo 'ERROR: cross-pool workspace root' >&2; return 1
  fi
  case "$RUNNER_CONTAINER_USER" in *:*) ;; *) echo 'ERROR: runner uid:gid required' >&2;return 1;; esac
}

# Inspect each private rootless socket as its owning account, not as jean.
# /run/user/<uid> is deliberately inaccessible to other users (0700).
pool_require_isolated_executor() {
  local socket="$RUNNER_DOCKER_SOCKET_HOST"
  local uid="${RUNNER_CONTAINER_USER%%:*}"
  [[ "$uid" =~ ^[0-9]+$ ]] || { echo 'ERROR: executor UID must be numeric' >&2; return 1; }
  [ "$socket" = "/run/user/$uid/docker.sock" ] || {
    echo 'ERROR: executor socket must match dedicated rootless UID path' >&2; return 1;
  }
  # V4: inspect the rootless socket as its owning execution account.
  # Other users cannot traverse /run/user/<uid> (0700); do not relax permissions.
  if ! sudo -u "#$uid" test -S "$socket"; then
    echo 'ERROR: dedicated executor socket is missing or inaccessible to its owner' >&2
    return 1
  fi
  local owner
  owner="$(sudo -u "#$uid" stat -c %u "$socket")" || return 1
  [ "$owner" = "$uid" ] || {
    echo 'ERROR: executor socket owner does not match configured UID' >&2; return 1;
  }
  pool_docker info --format '{{json .SecurityOptions}}' | grep -qi rootless || {
    echo 'ERROR: executor Docker is not rootless; refusing system Docker fallback' >&2
    return 1
  }
}
pool_docker() {
  # Use the explicit, validated pool UID. `jean` cannot stat ZoeBuild's socket
  # because /run/user/<uid> is intentionally private to that Linux user.
  local uid="${RUNNER_CONTAINER_USER%%:*}"
  [[ "$uid" =~ ^[0-9]+$ ]] || { echo 'ERROR: executor UID must be numeric' >&2; return 1; }
  [ "$RUNNER_DOCKER_SOCKET_HOST" = "/run/user/$uid/docker.sock" ] || {
    echo 'ERROR: invalid executor socket path' >&2; return 1;
  }
  if [ "$(id -u)" = "$uid" ]; then
    DOCKER_HOST="unix://${RUNNER_DOCKER_SOCKET_HOST}" docker "$@"
  else
    sudo -u "#$uid" env       DOCKER_HOST="unix://${RUNNER_DOCKER_SOCKET_HOST}"       XDG_RUNTIME_DIR="/run/user/$uid" docker "$@"
  fi
}
pool_check_not_shared() {
  local other_env="$1" key other
  [ -f "$other_env" ] || return 0
  for key in RUNNER_DOCKER_SOCKET_HOST RUNNER_WORKSPACE_HOST_ROOT; do
    other="$(sed -n "s/^${key}=//p" "$other_env" | tail -1)"
    if [ -n "$other" ] && [ "${!key}" = "$other" ]; then
      echo "ERROR: ${key} is shared across pools; isolation required" >&2
      return 1
    fi
  done
}

pool_check_headroom() {
  local path="$1" label="$2" bytes="${RUNNER_DEPLOY_MIN_FREE_BYTES:-12884901888}" pct="${RUNNER_DEPLOY_MIN_FREE_PERCENT:-15}"
  local total free required fraction uid raw
  uid="${RUNNER_CONTAINER_USER%%:*}"
  [[ "$uid" =~ ^[0-9]+$ ]] || { echo 'ERROR: executor UID must be numeric' >&2; return 1; }
  # Private rootless Docker data roots cannot be traversed by other users.
  if [ "$(id -u)" = "$uid" ]; then
    raw="$(df -PB1 "$path")" || return 1
  else
    raw="$(sudo -u "#$uid" df -PB1 "$path")" || return 1
  fi
  read -r total free < <(printf '%s\n' "$raw" | awk 'NR==2{print $2,$4}')
  [[ "$total" =~ ^[0-9]+$ && "$free" =~ ^[0-9]+$ ]] || return 1
  fraction=$((total*pct/100)); required="$bytes"
  if (( fraction > required )); then required="$fraction";fi
  printf '%s free=%s required=%s\n' "$label" "$free" "$required"
  if (( free < required )); then echo "ERROR: $label below safe headroom" >&2;return 1;fi
}
