#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

set -a
# shellcheck disable=SC1091
source "$SCRIPT_DIR/../env/production.env"
set +a

echo "== Compose services =="
"$SCRIPT_DIR/compose.sh" ps

echo
echo "== Required containers =="
required=(
  zoeskoul-redis
  zoeskoul-runner
  zoeskoul-edge-caddy
)

if [[ "${ENABLE_JUDGE0:-0}" == "1" ]]; then
  required+=(
    zoeskoul-judge0-api
    zoeskoul-judge0-worker
    zoeskoul-judge0-postgres
    zoeskoul-judge0-redis
  )
fi

if [[ "${ENABLE_WEB:-0}" == "1" ]]; then
  required+=(
    zoeskoul-postgres
    zoeskoul-web
  )
fi

for name in "${required[@]}"; do
  if ! docker inspect "$name" >/dev/null 2>&1; then
    echo "Missing container: $name" >&2
    exit 1
  fi
  state="$(docker inspect -f '{{.State.Status}}' "$name")"
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$name")"
  echo "$name status=$state health=$health"

  if [[ "$state" != "running" ]]; then
    echo "Container is not running: $name" >&2
    exit 1
  fi

done

echo
echo "== Runner public healthz =="
for i in {1..30}; do
  if docker exec -i zoeskoul-runner node <<'NODE'
const http = require("http");
const req = http.get("http://127.0.0.1:4001/healthz", (res) => {
  console.log("runner healthz status", res.statusCode);
  process.exit(res.statusCode === 200 ? 0 : 1);
});
req.on("error", (err) => {
  console.error(err.message);
  process.exit(1);
});
req.setTimeout(3000, () => {
  req.destroy();
  process.exit(1);
});
NODE
  then
    echo "Runner public healthz OK"
    break
  fi

  if [[ "$i" == "30" ]]; then
    echo "Runner healthz failed. Showing runner logs:"
    docker logs --tail=160 zoeskoul-runner || true
    exit 1
  fi

  sleep 2
done

echo
echo "== Runner authenticated health =="
docker exec -i \
  -e RUNNER_SHARED_SECRET="$RUNNER_SHARED_SECRET" \
  zoeskoul-runner node <<'NODE'
const http = require("http");
const req = http.request({
  method: "GET",
  hostname: "127.0.0.1",
  port: 4001,
  path: "/health",
  headers: {
    "x-runner-secret": process.env.RUNNER_SHARED_SECRET,
    "x-actor-key": "smoke-test",
  },
}, (res) => {
  console.log("runner authenticated health status", res.statusCode);
  process.exit(res.statusCode === 200 ? 0 : 1);
});
req.on("error", (err) => { console.error(err.message); process.exit(1); });
req.end();
NODE

if [[ "${ENABLE_JUDGE0:-0}" == "1" ]]; then
  echo
  echo "== Judge0 health =="
  set -a
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/../env/judge0.env"
  set +a

  if docker exec zoeskoul-judge0-api wget -qO- \
    --header="${JUDGE0_AUTHN_HEADER}: ${JUDGE0_AUTHN_TOKEN}" \
    http://127.0.0.1:2358/about; then
    echo
    echo "Judge0 health OK"
  else
    echo "Judge0 health failed. Showing Judge0 logs:"
    docker logs --tail=120 zoeskoul-judge0-api || true
    exit 1
  fi
fi

echo
echo "Smoke test OK."
