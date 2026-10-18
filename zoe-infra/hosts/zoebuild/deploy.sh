#!/usr/bin/env bash
# ZoeBuild-only staging deploy. No runner/Contabo/Caddy edits or Docker pruning.
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
DEPLOY_DIR="$PWD"
ENV_FILE="$DEPLOY_DIR/.env"
APP_ENV_FILE="$DEPLOY_DIR/.env.app"
STAGING_DIR="$DEPLOY_DIR/staging"

usage() {
  printf '%s\n' 'Usage: ./deploy.sh [40-character-commit-sha]' '       ./deploy.sh --check [40-character-commit-sha]' '' 'Default: use latest successful MANUAL main-branch ZoeBuild image build.' 'Explicit SHA: pin/rollback to already-published app and signer images.' 'This deploys only the isolated VirtualBox HTTP staging project.'
}
CHECK_ONLY=0
case "${1:-}" in
  --help|-h) usage; exit 0 ;;
  --check) CHECK_ONLY=1; shift ;;
esac
if (( $# > 1 )); then usage >&2; exit 2; fi
EXPLICIT_SHA="${1:-}"

for tool in docker python3 curl; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing executable: $tool" >&2; exit 1; }
done
if [[ ! -f "$ENV_FILE" || ! -f "$APP_ENV_FILE" ]]; then
  echo 'Missing secure environment files. First create .env and .env.app from their .example files (chmod 600) and configure staging credentials.' >&2
  exit 1
fi
# Secrets must be private files on the VM, not world-readable or symlinks.
python3 - "$ENV_FILE" "$APP_ENV_FILE" <<'PYMODE'
import os, stat, sys
from pathlib import Path
for path in map(Path, sys.argv[1:]):
    if path.is_symlink() or not path.is_file():
        print(f"Unsafe environment file: {path.name}",file=sys.stderr)
        sys.exit(1)
    mode = stat.S_IMODE(path.stat().st_mode)
    if mode & 0o077:
        print(f"Environment file {path.name} is readable by group/others; run chmod 600 .env .env.app",file=sys.stderr)
        sys.exit(1)
PYMODE
if [[ ! -f "$STAGING_DIR/docker-compose.http.yml" || ! -f "$STAGING_DIR/Caddyfile.http" || ! -f "$DEPLOY_DIR/docker-compose.yml" ]]; then
  echo 'Missing staging Compose/Caddy files; install the complete scoped ZoeBuild staging patch first.' >&2
  exit 1
fi

# Avoid exposing secrets in terminal output; never source .env as executable shell.
validate_local_env() {
  python3 - "$ENV_FILE" "$APP_ENV_FILE" <<'PY'
import re, sys
from pathlib import Path

def env(path):
    vars = {}
    for raw in Path(path).read_text().splitlines():
        raw = raw.strip()
        if not raw or raw.startswith('#'):
            continue
        if '=' not in raw:
            raise ValueError('invalid environment file line')
        k,v = raw.split('=',1)
        vars[k.strip()] = v.strip().strip('"').strip("'")
    return vars

try:
    compose, app = env(Path(sys.argv[1])), env(Path(sys.argv[2]))
    keys = ('ZOEBUILD_EDGE_SHARED_SECRET','ZOEBUILD_BUYER_IP_SIGNING_KEY')
    for key in keys:
        value = compose.get(key,'')
        if len(value.encode('utf-8')) < 32 or 'replace-' in value.lower() or any(c.isspace() for c in value):
            raise ValueError(f'{key} must be a real >=32-byte secret without whitespace')
    if compose[keys[0]] == compose[keys[1]]:
        raise ValueError('edge secret and HMAC key must be different')
    if compose.get('ZOEBUILD_STAGE_DB_CONFIRMED','').lower() != 'yes':
        raise ValueError('set ZOEBUILD_STAGE_DB_CONFIRMED=yes in .env after verifying staging-only database and shared-auth configuration')
    for key in ('DATABASE_URL','AUTH_SECRET'):
        v = app.get(key,'')
        if not v or 'replace-' in v.lower() or 'PRIVATE_DB_HOST' in v or 'USER:PASS' in v:
            raise ValueError(f'configure actual STAGING {key} in .env.app')
    if not app['DATABASE_URL'].startswith(('postgresql://','postgres://')):
        raise ValueError('DATABASE_URL must be a PostgreSQL connection string')
    print('staging_credentials=CONFIGURED_VALUES_REDACTED')
except ValueError as exc:
    print('PREFLIGHT_FAILED:',exc,file=sys.stderr)
    sys.exit(1)
PY
}
validate_local_env

RESOLUTION="$(python3 "$DEPLOY_DIR/resolve-latest-image.py" "$ENV_FILE" "$EXPLICIT_SHA")" || exit 1
read -r OWNER SELECTED_SHA <<< "$RESOLUTION"
[[ "$SELECTED_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid SHA selected; refusing.' >&2; exit 1; }
export GHCR_OWNER="$OWNER"
export IMAGE_TAG="$SELECTED_SHA"
export ZOEBUILD_STAGE_CADDYFILE="$STAGING_DIR/Caddyfile.http"
# VM staging budget based on available 3.82 GiB RAM (override .env defaults).
export ZOEBUILD_APP_MEM_LIMIT='768m'
export ZOEBUILD_APP_CPUS='0.5'
COMPOSE=(docker compose --project-name zoebuild-stage \
    -f "$DEPLOY_DIR/docker-compose.yml" \
    -f "$STAGING_DIR/docker-compose.http.yml" \
    --env-file "$ENV_FILE")

printf '=== ZOEBUILD VIRTUALBOX HTTP STAGING DEPLOY ===\n'
printf 'mode=%s image_sha=%s owner=%s\n' "$([[ "$CHECK_ONLY" == 1 ]] && echo CHECK_ONLY || echo DEPLOY)" "$IMAGE_TAG" "$GHCR_OWNER"
printf 'compose_project=zoebuild-stage app_mem=768m app_cpus=0.5 http_bind=127.0.0.1:13004\n'
printf 'learning_runner=UNCHANGED contabo=UNCHANGED worker_execution=DISABLED shopify=OFF\n'

# Validate full merged Compose before changing any Docker state. Never dump config with secrets.
"${COMPOSE[@]}" config --quiet
printf 'compose_validation=PASS\n'

if (( CHECK_ONLY )); then
  echo 'result=CHECK_ONLY_PASS no_pulls=YES no_docker_changes=YES'
  exit 0
fi

docker info --format '{{.ServerVersion}}' >/dev/null
# Use separate bridge; do NOT attach to the runner network or modify runner Caddy.
if ! docker network inspect zoebuild-stage-public >/dev/null 2>&1; then
  docker network create --driver bridge zoebuild-stage-public >/dev/null
  echo 'staging_network=CREATED'
else
  echo 'staging_network=EXISTS'
fi

# Pull exact same immutable build SHA for app and signer; do not deploy if either is missing.
for image in "ghcr.io/$OWNER/zoeskoul-zoebuild:$IMAGE_TAG" \
             "ghcr.io/$OWNER/zoeskoul-zoebuild-ingress-signer:$IMAGE_TAG" \
             'caddy:2-alpine'; do
  echo "pulling=$image"
  ok=0
  for attempt in 1 2 3; do
    if docker pull "$image"; then ok=1; break; fi
    if (( attempt < 3 )); then sleep "$((attempt * 4))"; fi
  done
  if (( ! ok )); then
    echo "PULL_FAILED: $image; existing containers were not recreated." >&2
    exit 1
  fi
done

"${COMPOSE[@]}" up -d --no-build --pull never --wait --wait-timeout 180 \
  zoebuild zoebuild-ingress-signer zoebuild-http-test
"${COMPOSE[@]}" ps

# Reachability smoke test; 2xx/3xx and auth 401/403 prove HTTP is routed.
HTTP_STATUS="$(curl --silent --show-error --output /dev/null \
  --write-out '%{http_code}' --connect-timeout 3 --max-time 12 \
  http://127.0.0.1:13004/ || true)"
case "$HTTP_STATUS" in
  2??|3??|401|403) echo "http_smoke=RESPONDED status=$HTTP_STATUS" ;;
  *) echo "http_smoke=FAILED status=$HTTP_STATUS; inspect zoebuild-stage logs; no runner changes were made." >&2; exit 1 ;;
esac
printf 'result=PASS image_sha=%s vm_http=http://127.0.0.1:13004/\n' "$IMAGE_TAG"
