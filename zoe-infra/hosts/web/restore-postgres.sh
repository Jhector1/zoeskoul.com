#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 /path/to/backup.sql.gz" >&2
  exit 2
fi

if [ ! -f .env ]; then
  echo "Missing .env" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
. ./.env
set +a

BACKUP="$1"
if [ ! -f "$BACKUP" ]; then
  echo "Backup not found: $BACKUP" >&2
  exit 1
fi

echo "This will restore into database: $POSTGRES_DB"
echo "Press Ctrl+C now to abort, or Enter to continue."
read -r _

gunzip -c "$BACKUP" | docker compose exec -T postgres psql -U "$POSTGRES_USER" "$POSTGRES_DB"

echo "Restore completed."
