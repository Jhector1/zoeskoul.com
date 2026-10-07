#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(git -C "$HERE" rev-parse --show-toplevel 2>/dev/null || git rev-parse --show-toplevel)"
VENV="${ZOESKOUL_AGENT_VENV:-$HOME/.venvs/zoeskoul-closure-agent}"

echo "=== ZOESKOUL CLOSURE AGENT V2.3 ==="
echo "repo=$REPO"
echo "auth=Sign in with ChatGPT / ChatGPT plan"

if [ ! -x "$VENV/bin/python" ]; then
  python3 -m venv "$VENV"
fi

"$VENV/bin/python" -m pip install --quiet --upgrade pip
"$VENV/bin/python" -m pip install --quiet --upgrade "openai>=2,<3" "PyJWT[crypto]>=2.10,<3"

exec "$VENV/bin/python" "$HERE/zoeskoul_closure_agent.py" --repo "$REPO" "$@"
