#!/usr/bin/env bash

cd "$(dirname "$0")" || exit 1

if [ ! -f .env ]; then
  echo "Missing .env" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
. ./.env
set +a

RUNNER_PUBLIC_SCHEME="${RUNNER_PUBLIC_SCHEME:-https}"
JUDGE0_PUBLIC_SCHEME="${JUDGE0_PUBLIC_SCHEME:-https}"
EXEC_DOCKER_SOCKET="${RUNNER_DOCKER_SOCKET_HOST:-/run/user/1000/docker.sock}"

if [ ! -S "$EXEC_DOCKER_SOCKET" ]; then
  echo "ERROR: rootless execution Docker socket is unavailable: ${EXEC_DOCKER_SOCKET}" >&2
  exit 1
fi

echo "Checking docker services..."
docker compose ps

echo "Checking runner health internally..."
docker compose exec -T runner node -e "const http=require('http'); const req=http.get('http://127.0.0.1:4001/healthz',res=>process.exit(res.statusCode===200?0:1)); req.on('error',()=>process.exit(1)); req.setTimeout(3000,()=>{req.destroy();process.exit(1)});"

echo "Checking runner public endpoint..."
RUNNER_PUBLIC_URL="${RUNNER_PUBLIC_SCHEME}://${RUNNER_DOMAIN}"
curl -fsSIL "${RUNNER_PUBLIC_URL}/healthz" | head -20

echo "Checking Judge0 public endpoint without token should be 403..."
JUDGE0_PUBLIC_URL="${JUDGE0_PUBLIC_SCHEME}://${JUDGE0_DOMAIN}"
status="$(curl -sS -o /dev/null -w '%{http_code}' "${JUDGE0_PUBLIC_URL}/about")"
if [ "$status" != "403" ]; then
  echo "ERROR: expected ${JUDGE0_PUBLIC_URL}/about without token to return 403, got $status" >&2
  exit 1
fi

echo "Checking Judge0 public endpoint with token..."
curl -fsS -H "${JUDGE0_AUTHN_HEADER:-X-Judge0-Token}: ${JUDGE0_AUTHN_TOKEN}" "${JUDGE0_PUBLIC_URL}/about" >/dev/null

echo "Checking raw runner port is not published by Docker compose..."
runner_published_port="$(docker compose port runner 4001 2>/dev/null || true)"
if [ -n "$runner_published_port" ]; then
  echo "ERROR: runner service has a published host port: ${runner_published_port}" >&2
  echo "It should only be exposed behind Caddy." >&2
  exit 1
fi

echo "Checking raw Judge0 port is not published by Docker compose..."
judge0_published_port="$(docker compose port judge0 2358 2>/dev/null || true)"
if [ -n "$judge0_published_port" ]; then
  echo "ERROR: judge0 service has a published host port: ${judge0_published_port}" >&2
  echo "It should only be exposed behind Caddy." >&2
  exit 1
fi

echo "Checking Docker socket visible to runner..."
docker compose exec -T runner sh -lc 'test -S "${DOCKER_SOCKET:-/docker.sock}" && echo socket-ok'

RUNTIME_IMAGE="ghcr.io/${GHCR_OWNER}/zoeskoul-runtime:${IMAGE_TAG:-prod}"
echo "Checking sandbox runtime image exists in rootless execution Docker daemon: ${RUNTIME_IMAGE}"
DOCKER_HOST="unix://${EXEC_DOCKER_SOCKET}" docker image inspect "$RUNTIME_IMAGE" >/dev/null || exit 1

echo "Checking Caddy logs for leaked websocket tokens..."
if docker compose logs caddy 2>/dev/null | grep -q 'token='; then
  echo "ERROR: found token= in Caddy logs" >&2
  exit 1
fi



echo "Checking canonical /runs Python execution..."
RUNNER_RUNS_RESULT="$(
  docker compose exec -T runner node <<'NODE'
const response = await fetch("http://127.0.0.1:4001/runs", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-runner-secret": process.env.RUNNER_SHARED_SECRET,
    "x-actor-key": "smoke:runner",
  },
  body: JSON.stringify({
    kind: "code",
    language: "python",
    code: "print(42)",
  }),
});

const body = await response.json();
console.log(JSON.stringify({ httpStatus: response.status, ...body }));
NODE
)"

echo "$RUNNER_RUNS_RESULT" | jq

runs_http="$(printf '%s' "$RUNNER_RUNS_RESULT" | jq -r '.httpStatus')"
runs_ok="$(printf '%s' "$RUNNER_RUNS_RESULT" | jq -r '.ok')"
runs_stdout="$(printf '%s' "$RUNNER_RUNS_RESULT" | jq -r '.stdout // empty')"

if [ "$runs_http" != "200" ] || [ "$runs_ok" != "true" ] || [ "$runs_stdout" != "42" ]; then
  echo "ERROR: canonical /runs Python execution failed" >&2
  exit 1
fi

echo "Canonical /runs Python execution OK."

echo "Checking Judge0 Python execution..."
CODE_B64="$(printf 'print(90)\n' | base64 -w0)"

result="$(
  sudo docker compose exec -T -e CODE_B64="$CODE_B64" runner sh -lc '
    timeout 20 curl -fsS -X POST "$JUDGE0_URL/submissions?base64_encoded=true&wait=true" \
      -H "Content-Type: application/json" \
      -H "${JUDGE0_AUTHN_HEADER:-X-Judge0-Token}: ${JUDGE0_AUTHN_TOKEN}" \
      --data-binary "{\"language_id\":71,\"source_code\":\"$CODE_B64\"}"
  '
)"

echo "$result" | jq

status_id="$(printf '%s' "$result" | jq -r '.status.id')"
stdout_decoded="$(printf '%s' "$result" | jq -r '.stdout // empty' | base64 -d)"

if [ "$status_id" != "3" ] || [ "$stdout_decoded" != "90" ]; then
  echo "ERROR: Judge0 Python execution failed" >&2
  exit 1
fi

echo "Judge0 Python execution OK."

echo "Smoke test passed."
