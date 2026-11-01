#!/usr/bin/env bash
set -euo pipefail
POOL="${1:?pool required}"
cd "$(dirname "$0")/../$POOL"
if [ ! -f .env ]; then echo 'Missing pool .env' >&2;exit 1;fi
# No auth tokens or full URLs printed.
docker compose --env-file .env -f compose.yml exec -T runner \
  node -e "const h=require('http');const q=h.get('http://127.0.0.1:4001/healthz',r=>process.exit(r.statusCode===200?0:1));q.on('error',()=>process.exit(1));q.setTimeout(3000,()=>{q.destroy();process.exit(1)})"
CID="$(docker compose --env-file .env -f compose.yml ps -q runner)"
[ -n "$CID" ] || exit 1
BINDINGS="$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$CID")"
case "$BINDINGS" in '{}'|'null'|'') ;; *) echo 'ERROR: runner publishes host ports' >&2;exit 1;; esac
echo "${POOL}_INTERNAL_HEALTH_PASS"
