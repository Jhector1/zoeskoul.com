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

check_container_port_not_published() {
  service="$1"
  container_port="$2"

  container_id="$(docker compose ps -q "$service" 2>/dev/null || true)"
  if [ -z "$container_id" ]; then
    echo "ERROR: could not resolve running container for service: ${service}" >&2
    return 1
  fi

  host_bindings="$(
    docker inspect "$container_id"       --format "{{with index .HostConfig.PortBindings "${container_port}/tcp"}}{{json .}}{{else}}[]{{end}}"       2>/dev/null || true
  )"

  if [ -z "$host_bindings" ]; then
    echo "ERROR: could not inspect host port bindings for ${service}:${container_port}" >&2
    return 1
  fi

  if [ "$host_bindings" != "[]" ]; then
    echo "ERROR: ${service}:${container_port} is published to the host: ${host_bindings}" >&2
    echo "It should only be reachable behind Caddy." >&2
    return 1
  fi

  echo "PASS: ${service}:${container_port} has no host binding."
  return 0
}

echo "Checking raw runner port is not published by Docker..."
if ! check_container_port_not_published runner 4001; then
  exit 1
fi

echo "Checking raw Judge0 port is not published by Docker..."
if ! check_container_port_not_published judge0 2358; then
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
if ! docker compose exec -T runner node <<'NODE'
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
console.log(JSON.stringify({ httpStatus: response.status, ...body }, null, 2));

if (
  response.status !== 200 ||
  body.ok !== true ||
  body.status !== "Accepted" ||
  body.stdout !== "42\n" ||
  body.exitCode !== 0
) {
  process.exitCode = 1;
}
NODE
then
  echo "ERROR: canonical /runs Python execution failed" >&2
  exit 1
fi

echo "Canonical /runs Python execution OK."

echo "Checking Judge0 Python execution..."
if ! docker compose exec -T runner node <<'NODE'
const judge0Url = process.env.JUDGE0_URL;
const authHeader = process.env.JUDGE0_AUTHN_HEADER || "X-Judge0-Token";
const authToken = process.env.JUDGE0_AUTHN_TOKEN;

if (!judge0Url || !authToken) {
  console.error("ERROR: Judge0 URL/auth environment is missing inside runner");
  process.exit(1);
}

const sourceCode = Buffer.from("print(90)\n", "utf8").toString("base64");

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 20_000);

try {
  const response = await fetch(
    `${judge0Url}/submissions?base64_encoded=true&wait=true`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [authHeader]: authToken,
      },
      body: JSON.stringify({
        language_id: 71,
        source_code: sourceCode,
      }),
      signal: controller.signal,
    },
  );

  const body = await response.json();
  const stdoutDecoded =
    typeof body.stdout === "string"
      ? Buffer.from(body.stdout, "base64").toString("utf8")
      : "";

  console.log(
    JSON.stringify(
      {
        httpStatus: response.status,
        statusId: body?.status?.id ?? null,
        stdout: stdoutDecoded,
      },
      null,
      2,
    ),
  );

  if (
    !response.ok ||
    body?.status?.id !== 3 ||
    stdoutDecoded.trim() !== "90"
  ) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(
    "ERROR: Judge0 Python execution request failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
}
NODE
then
  echo "ERROR: Judge0 Python execution failed" >&2
  exit 1
fi

echo "Judge0 Python execution OK."

echo "Smoke test passed."
