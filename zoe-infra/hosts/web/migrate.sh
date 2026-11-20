#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
cd "$(dirname "$0")"
./db17-guard.sh
TAG=${IMAGE_TAG:-prod}
[[ "$TAG" =~ ^[A-Za-z0-9_.-]+$ ]]
# Compose resolves the same image selection used by deploy.sh.
IMAGE=$(IMAGE_TAG="$TAG" docker compose config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["services"]["web"]["image"])')
IMAGE=$(docker image inspect "$IMAGE" --format '{{.Id}}')
SECRET="$HOME/.local/share/zoeskoul-db17-hotfix/db5a-stage/migration-url"
test -s "$SECRET"
python3 - "$SECRET" <<'PYSECRET'
import sys,urllib.parse
from pathlib import Path
u=urllib.parse.urlsplit(Path(sys.argv[1]).read_text().strip())
assert (u.scheme,u.hostname,u.port,u.path,u.username)==('postgresql','zoeskoul-postgres17',5432,'/zoeskoul','zoeskoul_migrate')
PYSECRET
# No app environment, no public or Internet-facing network, no migration password in Docker arguments.
docker run --rm -i --pull never --no-healthcheck --network zoeskoul_db_private --entrypoint sh --cap-drop ALL --security-opt no-new-privileges "$IMAGE" -c '
 set -eu
 IFS= read -r DATABASE_URL
 export DATABASE_URL
 unset ADMIN_DATABASE_URL WEB_DATABASE_URL DIRECT_URL
 exec pnpm --filter @zoeskoul/web exec prisma migrate deploy --schema ../../packages/db/prisma/schema.prisma
' < "$SECRET"
