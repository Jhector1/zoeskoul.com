#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /path/to/backup.sql.gz" >&2
  exit 1
fi

BACKUP="$1"
if [[ ! -f "$BACKUP" ]]; then
  echo "Backup not found: $BACKUP" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$INFRA_DIR/env/production.env}"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

echo "About to restore $BACKUP into database '$POSTGRES_DB'."
echo "This is destructive. Type RESTORE to continue:"
read -r confirm
if [[ "$confirm" != "RESTORE" ]]; then
  echo "Aborted."
  exit 1
fi

gunzip -c "$BACKUP" | docker exec -i zoeskoul-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
echo "Restore complete."
