#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
cd "$(dirname "$0")"
./db17-guard.sh
DIR="${BACKUP_DIR:-$HOME/.local/share/zoeskoul-db17-hotfix/backups}"
mkdir -p -m 700 "$DIR"
test ! -L "$DIR"
test "$(stat -c %a "$DIR")" = 700
OUT="$DIR/zoeskoul-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
trap 'rm -f -- "$OUT.partial"' EXIT
docker exec -u postgres zoeskoul-postgres17 pg_dump -w -U postgres -Fc -d zoeskoul </dev/null > "$OUT.partial"
test -s "$OUT.partial"
docker exec -i zoeskoul-postgres17 pg_restore --list < "$OUT.partial" >/dev/null
mv "$OUT.partial" "$OUT"
(cd "$DIR"; sha256sum "$(basename "$OUT")" > "$(basename "$OUT").sha256")
echo "BACKUP=$OUT"
echo 'DB17_LOCAL_BACKUP_PASS (off-site replication and retention are separate)'
