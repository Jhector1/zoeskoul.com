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

BACKUP_DIR="${BACKUP_DIR:-/opt/zoeskoul-backups/postgres}"
sudo mkdir -p "$BACKUP_DIR"
sudo chown "$USER":"$USER" "$BACKUP_DIR"

TS="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/zoeskoul-postgres-$TS.sql.gz"

docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$OUT"
chmod 600 "$OUT"

echo "Backup written: $OUT"
find "$BACKUP_DIR" -type f -name 'zoeskoul-postgres-*.sql.gz' -mtime +"${BACKUP_RETENTION_DAYS:-14}" -delete
