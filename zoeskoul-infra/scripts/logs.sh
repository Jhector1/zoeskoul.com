#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE="${1:-}"
if [[ -n "$SERVICE" ]]; then
  exec "$SCRIPT_DIR/compose.sh" logs -f --tail=200 "$SERVICE"
fi
exec "$SCRIPT_DIR/compose.sh" logs -f --tail=200
