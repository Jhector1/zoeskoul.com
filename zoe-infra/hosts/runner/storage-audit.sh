#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
for pool in zoeskoul-learning zoebuild;do
  echo "=== $pool ==="
  ( . ./shared/pool-common.sh
    pool_load_env "$(pwd -P)/$pool"
    pool_require_isolated_executor
    pool_docker system df
    if [ -d "$RUNNER_WORKSPACE_HOST_ROOT" ]; then
      sudo du -sh "$RUNNER_WORKSPACE_HOST_ROOT"
    fi
  )
done
echo '=== system Docker (read only) ==='
docker system df
