#!/usr/bin/env bash
set -euo pipefail
"$(dirname "$0")/../shared/smoke-pool.sh" zoeskoul-learning "$@"

# Learning alone owns Judge0. Verify a small computation without publishing secrets.
cd "$(dirname "$0")"
if [ -f .env ];then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
  docker compose --env-file .env -f compose.yml exec -T runner sh -c '
    timeout 20 curl -fsS -X POST "$JUDGE0_URL/submissions?base64_encoded=true&wait=true" \
      -H "Content-Type: application/json" \
      -H "${JUDGE0_AUTHN_HEADER:-X-Judge0-Token}: ${JUDGE0_AUTHN_TOKEN}" \
      --data-binary "{\"language_id\":71,\"source_code\":\"cHJpbnQoOTApCg==\"}"
  ' | python3 -c 'import sys,json,base64;x=json.load(sys.stdin);assert x.get("status",{}).get("id")==3 and base64.b64decode(x.get("stdout") or "").strip()==b"90"'
  echo 'LEARNING_JUDGE0_SMOKE_PASS'
fi
