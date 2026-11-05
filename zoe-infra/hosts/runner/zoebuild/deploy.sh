#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd -P)"
POOL_ROOT="$(cd "$HERE/.." && pwd -P)"
ENV_FILE="$HERE/.env"
cd "$HERE"

# --check retains the original read-only Compose/pool configuration check.
if [[ "${1:-}" == '--check' ]]; then
  exec "$POOL_ROOT/shared/deploy-pool.sh" zoebuild --check
fi
if [[ "${1:-}" == '--pinned' && "$#" -eq 1 ]]; then
  echo 'WARNING: deploying existing pins by explicit operator request; not verifying latest' >&2
  exec "$POOL_ROOT/shared/deploy-pool.sh" zoebuild
fi
if [[ "$#" -ne 0 ]]; then
  echo 'Usage: zoebuild/deploy.sh [--check|--pinned]' >&2
  exit 2
fi

# Never deploy an old pinned image silently. The resolver only accepts a
# COMPLETED+SUCCESSFUL *push-to-main* build for the exact current main SHA.
# Any API/build/auth failure aborts before modifying .env or containers.
# shellcheck disable=SC1091
. "$POOL_ROOT/shared/pool-common.sh"
pool_load_env "$HERE"
[[ "${RUNNER_EXECUTION_POOL:-}" == 'zoebuild' ]] || {
  echo 'ERROR: not a ZoeBuild executor pool' >&2; exit 1;
}
pool_require_isolated_executor
"$POOL_ROOT/shared/deploy-pool.sh" zoebuild --check

HELPER="$POOL_ROOT/shared/latest-zoebuild-images.py"
RELEASE_SHA="$(python3 "$HELPER" resolve-main)"
OWNER="${GHCR_OWNER,,}"
[[ "$OWNER" == "jhector1" ]] || {
  echo "ERROR: GHCR_OWNER does not match the trusted Jhector1 repository" >&2
  exit 1
}
RUNNER_REPO="ghcr.io/$OWNER/zoeskoul-runner"
RUNTIME_REPO="ghcr.io/$OWNER/zoeskoul-runtime"
RUNNER_TAG="$RUNNER_REPO:$RELEASE_SHA"
RUNTIME_TAG="$RUNTIME_REPO:$RELEASE_SHA"
echo "ZOEBUILD_LATEST_VERIFIED_MAIN_SHA=$RELEASE_SHA"
echo 'Pulling validated main SHA images (never :latest or :prod)...'

# Pull into the correct, separately isolated Docker daemons first. An image
# absent from GHCR fails before any existing service is replaced.
docker pull "$RUNNER_TAG"
pool_docker pull "$RUNTIME_TAG"

RUNNER_REV="$(docker image inspect "$RUNNER_TAG" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
RUNTIME_REV="$(pool_docker image inspect "$RUNTIME_TAG" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
[[ "$RUNNER_REV" == "$RELEASE_SHA" && "$RUNTIME_REV" == "$RELEASE_SHA" ]] || {
  echo 'ERROR: GHCR image revision labels do not match validated main SHA' >&2
  exit 1
}

RUNNER_DIGEST_JSON="$(docker image inspect "$RUNNER_TAG" --format '{{json .RepoDigests}}')"
RUNTIME_DIGEST_JSON="$(pool_docker image inspect "$RUNTIME_TAG" --format '{{json .RepoDigests}}')"
RUNNER_REF="$(python3 "$HELPER" ref-from-digests "$RUNNER_REPO" "$RUNNER_DIGEST_JSON")"
RUNTIME_REF="$(python3 "$HELPER" ref-from-digests "$RUNTIME_REPO" "$RUNTIME_DIGEST_JSON")"

# If main advanced during either image pull, refuse to pin a superseded build.
LATEST_NOW="$(python3 "$HELPER" resolve-main)"
[[ "$LATEST_NOW" == "$RELEASE_SHA" ]] || {
  echo "ERROR: main advanced during image pull; no pins changed" >&2
  exit 1
}

# Recheck headroom AFTER image pulls. Do not alter the pin file on low disk.
pool_check_headroom "$RUNNER_WORKSPACE_HOST_ROOT" zoebuild-workspace
pool_docker_root="$(pool_docker info --format '{{.DockerRootDir}}')"
pool_check_headroom "$pool_docker_root" zoebuild-executor

# Keep .env (which may contain secrets) private during atomic pin changes.
[[ -f "$ENV_FILE" && ! -L "$ENV_FILE" ]] || {
  echo 'ERROR: ZoeBuild .env missing or symlinked' >&2; exit 1;
}
backup="$(mktemp "$HERE/.env.rollback.XXXXXXXX")"
chmod 600 "$backup"
cp "$ENV_FILE" "$backup"
cleanup() { rm -f -- "$backup"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

python3 "$HELPER" write-pins "$ENV_FILE" "$RUNNER_REF" "$RUNTIME_REF" "$OWNER"
echo 'ZOEBUILD_PIN_REFRESH_PASS'

# The shared deploy continues enforcing digest pins, identity, isolation,
# disk limits and health checks. On failure restore pins and redeploy the old
# verified images (never modify the learning pool or shared gateway).
if "$POOL_ROOT/shared/deploy-pool.sh" zoebuild; then
  echo "ZOEBUILD_LATEST_MAIN_DEPLOY_PASS=$RELEASE_SHA"
else
  echo 'ERROR: latest ZoeBuild deploy failed; attempting pinned rollback' >&2
  cp "$backup" "$ENV_FILE"
  if "$POOL_ROOT/shared/deploy-pool.sh" zoebuild; then
    echo 'ZOEBUILD_ROLLBACK_PASS' >&2
  else
    echo 'ERROR: rollback deploy also failed; investigate ZoeBuild only' >&2
  fi
  exit 1
fi
