#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
cd "$(dirname "$0")"
test "$(docker inspect zoeskoul-postgres17 --format '{{.State.Health.Status}}')" = healthy
test -z "$(docker port zoeskoul-postgres17)"
if [ "$#" != 2 ]; then echo 'Usage: restore-postgres.sh /absolute/path/backup.dump zoeskoul_recovery_NAME' >&2; exit 2; fi
DUMP=$(realpath "$1"); DB=$2
[[ "$DB" =~ ^zoeskoul_recovery_[a-z0-9_]{1,32}$ ]]
test -s "$DUMP"
(cd "$(dirname "$DUMP")"; sha256sum -c "$(basename "$DUMP").sha256")
docker exec -i zoeskoul-postgres17 pg_restore --list < "$DUMP" >/dev/null
sql() { docker exec -u postgres zoeskoul-postgres17 psql -X -w -U postgres -v ON_ERROR_STOP=1 "$@" </dev/null; }
test "$(sql -d postgres -Atc "SELECT count(*) FROM pg_database WHERE datname='$DB'")" = 0
sql -d postgres -c "CREATE DATABASE $DB OWNER zoeskoul_owner TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin LOCALE 'C.UTF-8'"
sql -d postgres -c "REVOKE CONNECT,TEMPORARY ON DATABASE $DB FROM PUBLIC"
docker exec -i -u postgres zoeskoul-postgres17 pg_restore -U postgres -d "$DB" --role=zoeskoul_owner --no-owner --no-privileges --exit-on-error --single-transaction < "$DUMP"
sql -d "$DB" -c 'SELECT count(*) AS public_tables FROM pg_tables WHERE schemaname= '\''public'\''; SELECT count(*) AS migrations FROM public._prisma_migrations;'
echo "RECOVERY_DATABASE=$DB (not promoted; runtime access not granted)"
