#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"
CID=zoeskoul-postgres17
NET=zoeskoul_db_private
cmp db17-compose.yml "$HOME/.local/share/zoeskoul-db17-hotfix/compose.yml"
test "$(docker inspect "$CID" --format '{{.State.Health.Status}}')" = healthy
test -z "$(docker port "$CID")"
test "$(docker network inspect "$NET" --format '{{.Internal}}')" = true
test "$(docker inspect "$CID" --format '{{if index .NetworkSettings.Networks "zoeskoul_db_private"}}yes{{end}}')" = yes
test "$(docker exec -u postgres "$CID" psql -X -w -d zoeskoul -At -v ON_ERROR_STOP=1 -c "SELECT current_database()='zoeskoul' AND current_setting('server_version_num')::int BETWEEN 170000 AND 179999 AND to_regclass('public._prisma_migrations') IS NOT NULL" </dev/null)" = t
docker compose config --format json | python3 -c '
import json,sys,urllib.parse
c=json.load(sys.stdin)
assert "postgres" not in c["services"]
assert c["networks"]["database_private"]["name"]=="zoeskoul_db_private"
for n in ("web","social-challenge-scheduler"):
    s=c["services"][n]; e=s["environment"]
    u=urllib.parse.urlsplit(e["DATABASE_URL"])
    assert (u.scheme,u.hostname,u.port,u.path,u.username)==("postgresql","zoeskoul-postgres17",5432,"/zoeskoul","zoeskoul_app")
    assert "database_private" in s["networks"]
    assert not any("neon.tech" in str(v).lower() for v in e.values())
    assert not any(k in e for k in ("ADMIN_DATABASE_URL","WEB_DATABASE_URL","DIRECT_URL","MIGRATION_DATABASE_URL"))
'
echo DB17_GUARD_PASS
