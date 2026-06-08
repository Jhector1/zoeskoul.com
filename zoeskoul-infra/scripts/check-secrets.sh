#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$INFRA_DIR/env/production.env}"
JUDGE0_ENV_FILE="${JUDGE0_ENV_FILE:-$INFRA_DIR/env/judge0.env}"

files=("$ENV_FILE")
[[ -f "$JUDGE0_ENV_FILE" ]] && files+=("$JUDGE0_ENV_FILE")

bad=0
patterns=(
  'password=postgres'
  'POSTGRES_PASSWORD=postgres'
  'REDIS_PASSWORD=redis'
  'REDIS_URL=redis://redis:6379'
  'generate-with-scripts-generate-env'
  'replace-with'
  'change-me'
  'local-runner-secret'
  'local-pty-attach-secret'
  'AUTH_SECRET=secret'
  'JUDGE0_AUTHN_TOKEN=$'
  'JUDGE0_REDIS_PASSWORD=$'
)

for file in "${files[@]}"; do
  for pat in "${patterns[@]}"; do
    if grep -Eiq "$pat" "$file"; then
      echo "Weak/default secret pattern found in $file: $pat" >&2
      bad=1
    fi
  done
  mode="$(stat -c '%a' "$file" 2>/dev/null || echo unknown)"
  if [[ "$mode" != "600" ]]; then
    echo "WARN: $file mode is $mode; recommended 600. Run: chmod 600 $file" >&2
  fi
done

if [[ "$bad" -ne 0 ]]; then
  exit 1
fi

echo "Secret sanity OK."
