#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ "${1:-}" != '--install' ]; then
  echo 'Usage: setup-zoebuild-executor.sh --install' >&2
  echo 'Provisions a separate zoebuild-exec Linux user and rootless Docker daemon.' >&2
  exit 2
fi
if ! id zoebuild-exec >/dev/null 2>&1;then
  sudo useradd --create-home --shell /bin/bash zoebuild-exec
fi
sudo env DEPLOY_USER=zoebuild-exec \
  bash "$(pwd -P)/scripts/setup-rootless-runner-docker.sh"
UID_ZOE="$(id -u zoebuild-exec)"
printf 'ZoeBuild executor UID=%s; rootless socket=/run/user/%s/docker.sock\n' "$UID_ZOE" "$UID_ZOE"
