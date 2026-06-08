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

echo "Checking docker services..."
docker compose ps

echo "Checking runner health internally..."
docker compose exec -T runner node -e "const http=require('http'); const req=http.get('http://127.0.0.1:4001/healthz',res=>process.exit(res.statusCode===200?0:1)); req.on('error',()=>process.exit(1)); req.setTimeout(3000,()=>{req.destroy();process.exit(1)});"

echo "Checking runner public HTTPS..."
curl -fsSIL "https://${RUNNER_DOMAIN}/healthz" | head -20

echo "Checking Judge0 public HTTPS without token should be 403..."
status="$(curl -sS -o /dev/null -w '%{http_code}' "https://${JUDGE0_DOMAIN}/about")"
if [ "$status" != "403" ]; then
  echo "ERROR: expected https://${JUDGE0_DOMAIN}/about without token to return 403, got $status" >&2
  exit 1
fi

echo "Checking Judge0 public HTTPS with token..."
curl -fsS -H "${JUDGE0_AUTHN_HEADER:-X-Judge0-Token}: ${JUDGE0_AUTHN_TOKEN}" "https://${JUDGE0_DOMAIN}/about" >/dev/null

echo "Checking raw runner port is not published by Docker compose..."
if docker compose port runner 4001 >/dev/null 2>&1; then
  echo "ERROR: runner service has a published host port. It should only be exposed behind Caddy." >&2
  exit 1
fi

echo "Checking raw Judge0 port is not published by Docker compose..."
if docker compose port judge0 2358 >/dev/null 2>&1; then
  echo "ERROR: judge0 service has a published host port. It should only be exposed behind Caddy." >&2
  exit 1
fi

echo "Checking Docker socket visible to runner..."
docker compose exec -T runner sh -lc 'test -S "${DOCKER_SOCKET:-/docker.sock}" && echo socket-ok'

RUNTIME_IMAGE="ghcr.io/${GHCR_OWNER}/zoeskoul-runtime:${IMAGE_TAG:-prod}"
EXEC_DOCKER_SOCKET="${RUNNER_DOCKER_SOCKET_HOST:-/run/user/1000/docker.sock}"
echo "Checking sandbox runtime image exists in execution Docker daemon: ${RUNTIME_IMAGE}"
if [ -S "$EXEC_DOCKER_SOCKET" ]; then
  DOCKER_HOST="unix://${EXEC_DOCKER_SOCKET}" docker image inspect "$RUNTIME_IMAGE" >/dev/null
else
  docker image inspect "$RUNTIME_IMAGE" >/dev/null
fi

echo "Checking Caddy logs for leaked websocket tokens..."
if docker compose logs caddy 2>/dev/null | grep -q 'token='; then
  echo "ERROR: found token= in Caddy logs" >&2
  exit 1
fi

echo "Smoke test passed."
