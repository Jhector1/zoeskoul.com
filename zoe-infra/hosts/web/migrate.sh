#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Missing .env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

CMD="${MIGRATE_COMMAND:-pnpm prisma migrate deploy}"

echo "Running production migration:"
echo "  $CMD"

docker compose run \
  --rm \
  --no-deps \
  web \
  sh -lc "$CMD"
