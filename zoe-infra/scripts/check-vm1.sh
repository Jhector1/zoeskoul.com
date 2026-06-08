#!/usr/bin/env bash
set -euo pipefail
: "${VM2_PRIVATE_IP:=10.10.0.3}"

echo "Testing private runner from VM1..."
curl -fsS "http://${VM2_PRIVATE_IP}:4001/healthz"
echo

echo "Checking local open ports..."
ss -lntp
