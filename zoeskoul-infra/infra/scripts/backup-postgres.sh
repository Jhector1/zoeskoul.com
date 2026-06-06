#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$INFRA_DIR/env/production.env}"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

BACKUP_DIR="${BACKUP_DIR:-/var/backups/zoeskoul/postgres}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/zoeskoul-postgres-$STAMP.sql.gz"

sudo mkdir -p "$BACKUP_DIR"
sudo chown "$(id -u):$(id -g)" "$BACKUP_DIR"

echo "Writing $OUT"
docker exec zoeskoul-postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists | gzip -9 > "$OUT"
chmod 600 "$OUT"

find "$BACKUP_DIR" -type f -name 'zoeskoul-postgres-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete

echo "Backup complete: $OUT"
