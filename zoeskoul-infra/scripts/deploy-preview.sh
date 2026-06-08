#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$(cd "$SCRIPT_DIR/.." && pwd)/env/production.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  "$SCRIPT_DIR/generate-env.sh"
fi

"$SCRIPT_DIR/preflight.sh"

echo "== Build runtime image in normal Docker daemon =="
"$SCRIPT_DIR/compose.sh" --profile build-only build runtime-image

echo "== Build runtime image in runner/rootless Docker daemon =="
"$SCRIPT_DIR/build-runtime-for-runner.sh"

echo "== Start services =="
"$SCRIPT_DIR/compose.sh" up -d --build

echo "== Current services =="
"$SCRIPT_DIR/compose.sh" ps

echo "== Tip =="
echo "Run ./scripts/smoke-test.sh next."
