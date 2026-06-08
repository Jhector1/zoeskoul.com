#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# Set MIGRATE_COMMAND in .env if your repo uses a different migration command.
# Examples:
# MIGRATE_COMMAND="pnpm prisma migrate deploy"
# MIGRATE_COMMAND="pnpm --filter @zoeskoul/db prisma migrate deploy"

if [ ! -f .env ]; then
  echo "Missing .env" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
. ./.env
set +a

CMD="${MIGRATE_COMMAND:-pnpm prisma migrate deploy}"
echo "Running migration command inside web container: $CMD"
docker compose exec web sh -lc "$CMD"
