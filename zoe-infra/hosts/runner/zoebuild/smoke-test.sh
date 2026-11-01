#!/usr/bin/env bash
set -euo pipefail
exec "$(dirname "$0")/../shared/smoke-pool.sh" zoebuild "$@"
