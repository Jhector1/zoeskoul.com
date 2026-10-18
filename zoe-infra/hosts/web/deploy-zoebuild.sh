#!/usr/bin/env bash
# Opt-in ZoeBuild APP on existing Web host. Never deploy on runner/VirtualBox.
# No database migrations, image pruning, Caddy edits, or changes to the student runner.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
DEPLOY_DIR="$PWD"
CHECK_ONLY=0
case "${1:-}" in
  -h|--help) echo 'Usage: ./deploy-zoebuild.sh [--check] [immutable-40-char-commit-sha]'; exit 0 ;;
  --check) CHECK_ONLY=1; shift ;;
esac
(( $# <= 1 )) || { echo 'Usage: ./deploy-zoebuild.sh [--check] [40-char-sha]' >&2; exit 2; }
EXPLICIT_SHA="${1:-}"

for tool in python3 docker; do
  command -v "$tool" >/dev/null || { echo "Missing $tool" >&2; exit 1; }
done
for f in .env .env.zoebuild .env.zoebuild.app docker-compose.yml docker-compose.zoebuild.yml; do
  [[ -f "$f" && ! -L "$f" ]] || { echo "Missing regular $f on WEB host (or symlink)." >&2; exit 1; }
done
python3 - <<'PYSEC'
from pathlib import Path
import re,stat,sys

def read_env(name):
    p=Path(name)
    mode=stat.S_IMODE(p.stat().st_mode)
    if mode & 0o077:
        raise ValueError(f'{name} must be readable only by owner (chmod 600)')
    d={}
    for line in p.read_text().splitlines():
        line=line.strip()
        if not line or line.startswith('#'): continue
        if '=' not in line: raise ValueError(f'malformed {name} line')
        k,v=line.split('=',1)
        if not re.fullmatch(r'[A-Za-z_][A-Za-z_0-9]*',k): raise ValueError(f'malformed {name} key')
        d[k]=v.strip().strip('"').strip("'")
    return d
try:
    conf=read_env('.env.zoebuild')
    app=read_env('.env.zoebuild.app')
    for k in ('ZOEBUILD_EDGE_SHARED_SECRET','ZOEBUILD_BUYER_IP_SIGNING_KEY'):
        v=conf.get(k,'')
        if len(v.encode())<32 or 'replace-' in v.lower() or any(c.isspace() for c in v):
            raise ValueError(f'{k} must be securely configured (>=32 bytes, no whitespace)')
    if conf['ZOEBUILD_EDGE_SHARED_SECRET']==conf['ZOEBUILD_BUYER_IP_SIGNING_KEY']:
        raise ValueError('signer HMAC key must differ from edge auth secret')
    for k in ('ZOEBUILD_WEB_HOST_DB_AUTH_CONFIRMED','ZOEBUILD_EDGE_CLIENT_IP_CHAIN_CONFIRMED','ZOEBUILD_CADDY_INGRESS_INSTALLED_CONFIRMED'):
        if conf.get(k,'').lower()!='yes': raise ValueError(f'{k} must be verified and set to yes')
    for k in ('DATABASE_URL','AUTH_SECRET'):
        v=app.get(k,'')
        if not v or 'replace-' in v.lower() or 'WEB_DB_USER' in v or 'WEB_DB_PASSWORD' in v:
            raise ValueError(f'{k} has no verified real values')
    if not app['DATABASE_URL'].startswith(('postgresql://','postgres://')):
        raise ValueError('DATABASE_URL must be PostgreSQL')
    if not re.search(r'@postgres:5432/',app['DATABASE_URL']):
        raise ValueError('DATABASE_URL must point to existing private web Compose PostgreSQL service')
    web=read_env('.env')
    if app.get('DATABASE_URL') != web.get('DATABASE_URL'):
        raise ValueError('ZoeBuild DATABASE_URL must match the existing Zoéskoul Web DATABASE_URL')
    if app.get('AUTH_SECRET') not in (web.get('AUTH_SECRET'),web.get('NEXTAUTH_SECRET')):
        raise ValueError('ZoeBuild AUTH_SECRET must match existing Web shared-auth secret')
    print('preflight_secrets=VALID_VALUES_REDACTED')
except (ValueError, OSError) as e:
    print('PREFLIGHT_FAILED:',e,file=sys.stderr)
    sys.exit(1)
PYSEC

# Verify WEB Compose ownership. We must never spin up a second standalone
# stack pointing at another DB. This does not inspect/print environment secrets.
WEB_PROJECT="$(docker inspect zoeskoul-web --format '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null || true)"
[[ -n "$WEB_PROJECT" && "$WEB_PROJECT" != '<no value>' ]] || {
  echo 'Cannot prove this machine has existing zoeskoul-web Compose project; REFUSED (runner host?).' >&2; exit 1;
}
[[ "$(docker inspect zoeskoul-web --format '{{.State.Running}}' 2>/dev/null || true)" == 'true' ]] || {
  echo 'zoeskoul-web not running; refusing web-side activation.' >&2; exit 1;
}
EDGE_CONTAINER="$(python3 - <<'PYEDGE'
from pathlib import Path
for line in Path('.env').read_text().splitlines():
    if line.startswith('EDGE_CADDY_CONTAINER='):
        value=line.split('=',1)[1].strip().strip('"').strip("'")
        print(value)
        break
else: print('edge-caddy')
PYEDGE
)"
[[ "$(docker inspect "$EDGE_CONTAINER" --format '{{.State.Running}}' 2>/dev/null || true)" == 'true' ]] || {
  echo 'Configured Web edge Caddy is not running; refusing.' >&2; exit 1;
}
# Caddy must be able to resolve the signer through the same external public network.
if ! docker network inspect public >/dev/null 2>&1; then
  echo 'Missing existing Web public network; refusing.' >&2; exit 1;
fi
if ! docker inspect "$EDGE_CONTAINER" --format '{{json .NetworkSettings.Networks}}'   | python3 -c 'import json,sys;sys.exit(0 if "public" in json.load(sys.stdin) else 1)'; then
  echo 'Edge Caddy is not connected to Docker network public; refusing.' >&2; exit 1;
fi
RESOLVED="$(python3 "$DEPLOY_DIR/resolve-latest-zoebuild-image.py" "$DEPLOY_DIR/.env.zoebuild" "$EXPLICIT_SHA")" || exit 1
read -r GHCR_OWNER ZOEBUILD_IMAGE_TAG <<< "$RESOLVED"
[[ "$ZOEBUILD_IMAGE_TAG" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid resolved image tag.' >&2; exit 1; }
export GHCR_OWNER ZOEBUILD_IMAGE_TAG
COMPOSE=(docker compose --project-name "$WEB_PROJECT" --env-file "$DEPLOY_DIR/.env"   --env-file "$DEPLOY_DIR/.env.zoebuild" -f "$DEPLOY_DIR/docker-compose.yml"   -f "$DEPLOY_DIR/docker-compose.zoebuild.yml")
"${COMPOSE[@]}" config --quiet
printf '=== ZOEBUILD APP WEB-HOST %s ===
' "$( (( CHECK_ONLY )) && echo CHECK_ONLY || echo DEPLOY)"
printf 'web_compose_project=%s image_sha=%s
' "$WEB_PROJECT" "$ZOEBUILD_IMAGE_TAG"
echo 'application=WEB_HOST_ONLY runner=UNCHANGED caddy=UNCHANGED shopify=OFF publish=OFF migrations=NO'
if (( CHECK_ONLY )); then
  echo 'result=CHECK_PASS docker_changes=NO'
  exit 0
fi
# Pull both exact images BEFORE Compose changes so partial pull failure never
# recreates existing containers. No Docker prune or other service operations.
for name in zoeskoul-zoebuild zoeskoul-zoebuild-ingress-signer; do
  image="ghcr.io/${GHCR_OWNER}/${name}:${ZOEBUILD_IMAGE_TAG}"
  echo "pull=$image"
  docker pull "$image" || { echo "Pull failed. No Compose up executed." >&2; exit 1; }
done
"${COMPOSE[@]}" up -d --no-deps --no-build --pull never --wait --wait-timeout 180   zoebuild zoebuild-ingress-signer
"${COMPOSE[@]}" ps zoebuild zoebuild-ingress-signer
printf 'zoebuild_web_host_deploy=PASS image_sha=%s
' "$ZOEBUILD_IMAGE_TAG"
