#!/bin/sh
set -eu

# Rootless ZoeBuild only: the guest keeps UID 1000 but receives the dedicated
# executor's mapped group as GID 0. Shell and trusted one-shot processes inherit
# umask 0007. Legacy and Learning containers retain their existing behavior.
if [ "${RUNNER_WORKSPACE_FS_POLICY:-}" = "shared-group-v1" ]; then
  if [ "$(id -u)" != "1000" ] || [ "$(id -g)" != "0" ]; then
    echo "Unsafe shared-group sandbox identity" >&2
    exit 72
  fi
  umask 0007
fi
exec python3 /opt/runner/pty-runner.py "$@"
