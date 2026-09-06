#!/usr/bin/env bash
# Shared storage ownership/cleanup helpers for the dedicated ZoeSkoul runner host.
# Source this file after .env has been loaded.

runner_storage_exec_socket() {
  printf '%s\n' "${RUNNER_DOCKER_SOCKET_HOST:-/run/user/1000/docker.sock}"
}

runner_storage_docker() {
  local socket="${1:-}"
  shift || true

  if [ -n "$socket" ]; then
    DOCKER_HOST="unix://${socket}" docker "$@"
  else
    docker "$@"
  fi
}

runner_storage_require_exec_socket() {
  local socket
  socket="$(runner_storage_exec_socket)"

  if [ ! -S "$socket" ]; then
    echo "ERROR: rootless execution Docker socket is missing: $socket" >&2
    echo "Refusing to fall back to the system Docker daemon." >&2
    return 1
  fi
}

runner_storage_docker_root() {
  local socket="${1:-}"
  runner_storage_docker "$socket" info --format '{{.DockerRootDir}}'
}

runner_storage_check_path() {
  local label="$1"
  local path="$2"
  local min_bytes="$3"
  local min_percent="$4"
  local available total percent_floor required

  if [ ! -e "$path" ]; then
    echo "ERROR: storage path does not exist for ${label}: ${path}" >&2
    return 1
  fi

  read -r total available < <(df -PB1 "$path" | awk 'NR==2 {print $2, $4}')

  if ! [[ "$total" =~ ^[0-9]+$ && "$available" =~ ^[0-9]+$ ]]; then
    echo "ERROR: could not read filesystem capacity for ${label}: ${path}" >&2
    return 1
  fi

  percent_floor=$(( total * min_percent / 100 ))
  required="$min_bytes"
  if [ "$percent_floor" -gt "$required" ]; then
    required="$percent_floor"
  fi

  printf 'Storage headroom %-18s path=%s free=%.2fGiB required=%.2fGiB (%s%% floor)\n' \
    "$label" "$path" \
    "$(awk -v b="$available" 'BEGIN {print b/1024/1024/1024}')" \
    "$(awk -v b="$required" 'BEGIN {print b/1024/1024/1024}')" \
    "$min_percent"

  if [ "$available" -lt "$required" ]; then
    echo "ERROR: ${label} storage is below the production safety floor." >&2
    return 1
  fi
}

runner_storage_assert_deploy_headroom() {
  local min_bytes="${RUNNER_DEPLOY_MIN_FREE_BYTES:-12884901888}"
  local min_percent="${RUNNER_DEPLOY_MIN_FREE_PERCENT:-15}"
  local exec_socket system_root exec_root

  runner_storage_require_exec_socket
  exec_socket="$(runner_storage_exec_socket)"
  system_root="$(runner_storage_docker_root '')"
  exec_root="$(runner_storage_docker_root "$exec_socket")"

  runner_storage_check_path "system-docker" "$system_root" "$min_bytes" "$min_percent"
  runner_storage_check_path "executor-docker" "$exec_root" "$min_bytes" "$min_percent"
}

runner_storage_prune_system_daemon() {
  echo "Pruning unused objects from system Docker daemon..."
  runner_storage_docker "" container prune -f >/dev/null || true

  # Every production service image is referenced by a Compose container. The
  # registry is the rollback source of truth, so system Docker does not need to
  # retain historical images once no container references them. Volumes are
  # deliberately never pruned.
  if [ "${RUNNER_PRUNE_UNUSED_IMAGES:-true}" = "true" ]; then
    runner_storage_docker "" image prune -a -f >/dev/null || true
  else
    runner_storage_docker "" image prune -f >/dev/null || true
  fi

  runner_storage_docker "" builder prune -a -f >/dev/null || true
}

runner_storage_running_runtime_image() {
  local runner_container
  runner_container="$(docker compose ps -q runner 2>/dev/null || true)"
  [ -n "$runner_container" ] || return 0

  docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' \
    "$runner_container" 2>/dev/null \
    | sed -n 's/^RUNNER_IMAGE=//p' \
    | head -n 1
}

runner_storage_prune_executor_daemon() {
  local socket runtime_repo target_runtime running_runtime image_ref image_id keep_ids
  socket="$(runner_storage_exec_socket)"
  runtime_repo="ghcr.io/${GHCR_OWNER:?required}/zoeskoul-runtime"
  target_runtime="${runtime_repo}:${IMAGE_TAG:-prod}"
  running_runtime="$(runner_storage_running_runtime_image || true)"
  keep_ids=""

  echo "Pruning unused objects from rootless executor Docker daemon..."
  runner_storage_docker "$socket" container prune -f >/dev/null || true

  # Unlike the system daemon, the executor's current runtime image may have no
  # container referencing it while the runner is idle. Never use `image prune
  # -a` here: that would delete the image needed by the next learner session.
  # Preserve both the currently-running runner's configured runtime (important
  # for pinned rollbacks) and the target deployment image, then remove older
  # ZoeSkoul runtime images plus dangling layers.
  for image_ref in "$running_runtime" "$target_runtime"; do
    [ -n "$image_ref" ] || continue
    image_id="$(runner_storage_docker "$socket" image inspect \
      --format '{{.Id}}' "$image_ref" 2>/dev/null || true)"
    if [ -n "$image_id" ]; then
      keep_ids+="$image_id"$'\n'
    fi
  done

  if [ "${RUNNER_PRUNE_UNUSED_IMAGES:-true}" = "true" ]; then
    while IFS= read -r image_id; do
      [ -n "$image_id" ] || continue
      if printf '%s' "$keep_ids" | grep -Fxq "$image_id"; then
        continue
      fi
      runner_storage_docker "$socket" image rm "$image_id" >/dev/null 2>&1 || true
    done < <(
      runner_storage_docker "$socket" image ls "$runtime_repo" \
        --no-trunc --format '{{.ID}}' | sort -u
    )
  fi

  runner_storage_docker "$socket" image prune -f >/dev/null || true
  runner_storage_docker "$socket" builder prune -a -f >/dev/null || true
}

runner_storage_prune_unused() {
  runner_storage_require_exec_socket
  runner_storage_prune_system_daemon
  runner_storage_prune_executor_daemon
}

runner_storage_show_docker_usage() {
  local exec_socket
  runner_storage_require_exec_socket
  exec_socket="$(runner_storage_exec_socket)"

  echo "System Docker disk usage:"
  runner_storage_docker "" system df || true
  echo
  echo "Rootless executor Docker disk usage:"
  runner_storage_docker "$exec_socket" system df || true
}

runner_storage_assert_single_compose_owner() {
  local current_project="${COMPOSE_PROJECT_NAME:-runner}"
  local offenders=""
  local id image name project relevant

  while IFS=$'\t' read -r id image name project; do
    [ -n "$id" ] || continue
    relevant="false"

    case "$image" in
      *zoeskoul-runner*|judge0/judge0:*) relevant="true" ;;
    esac
    case "$name" in
      zoeskoul-judge0-*|infra-runner-*) relevant="true" ;;
    esac

    if [ "$relevant" = "true" ] && [ "$project" != "$current_project" ]; then
      offenders+="${id}\t${image}\t${name}\tcompose_project=${project:-none}"$'\n'
    fi
  done < <(docker ps -a --format '{{.ID}}\t{{.Image}}\t{{.Names}}\t{{.Label "com.docker.compose.project"}}')

  if [ -n "$offenders" ]; then
    echo "ERROR: another/legacy ZoeSkoul runner stack still owns containers on this host:" >&2
    printf '%b' "$offenders" >&2
    echo "Refusing to deploy a second stack. Decommission the legacy stack first." >&2
    return 1
  fi
}

runner_storage_cleanup_stale_workspaces() {
  local root="${RUNNER_WORKSPACE_HOST_ROOT:-/var/lib/zoeskoul-runner/workspaces}"
  local max_age_minutes="${RUNNER_STALE_WORKSPACE_MAX_AGE_MINUTES:-1440}"
  local candidate

  sudo mkdir -p "$root"

  # `/workspaces` was the former host path. Keep a guarded legacy sweep so a
  # path migration cannot strand old runner-owned directories forever.
  for candidate in "$root" /workspaces; do
    [ -d "$candidate" ] || continue
    if [ "$candidate" = "/workspaces" ] && [ "$root" = "/workspaces" ]; then
      continue
    fi

    echo "Removing runner workspaces older than ${max_age_minutes} minutes from ${candidate}..."
    sudo find "$candidate" \
      -mindepth 1 \
      -maxdepth 1 \
      -type d \
      -name 'zoeskoul-run-*' \
      -mmin "+${max_age_minutes}" \
      -print \
      -exec rm -rf -- {} \; || true
  done
}

runner_storage_vacuum_journal() {
  local max_size="${RUNNER_JOURNAL_VACUUM_SIZE:-512M}"
  if command -v journalctl >/dev/null 2>&1; then
    echo "Vacuuming system journal to ${max_size}..."
    sudo journalctl --vacuum-size="$max_size" >/dev/null || true
  fi
}
