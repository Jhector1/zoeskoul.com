#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -ne 1 ]; then
  echo "Usage: $0 VM2_PUBLIC_IP" >&2
  exit 2
fi
IP="$1"

for port in 4001 2358 5432 6379; do
  echo "Testing public $IP:$port should fail..."
  if timeout 4 bash -lc "</dev/tcp/$IP/$port" 2>/dev/null; then
    echo "ERROR: $IP:$port is reachable publicly" >&2
    exit 1
  fi
  echo "ok: $port not reachable"
done
