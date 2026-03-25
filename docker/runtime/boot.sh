#!/usr/bin/env bash
set -euo pipefail

cd /workspace

if [ -n "${COMPILE_CMD:-}" ]; then
  bash -lc "$COMPILE_CMD"
fi

exec bash -lc "${RUN_CMD:-bash}"