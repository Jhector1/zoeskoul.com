#!/usr/bin/env bash
set -euo pipefail

echo "== Listening ports =="
sudo ss -lntup || true

echo "== Docker socket permissions =="
ls -l /var/run/docker.sock 2>/dev/null || true
uid_now="$(id -u)"
ls -l "/run/user/${uid_now}/docker.sock" 2>/dev/null || true

echo "== UFW status =="
sudo ufw status verbose || true

echo "== Containers with privileged=true =="
docker ps --format '{{.Names}}' | while read -r c; do
  [[ -z "$c" ]] && continue
  privileged="$(docker inspect -f '{{.HostConfig.Privileged}}' "$c" 2>/dev/null || echo unknown)"
  if [[ "$privileged" == "true" ]]; then
    echo "PRIVILEGED: $c"
  fi
done

echo "== Public port warning =="
if sudo ss -lntup | grep -E ':(2358|4001|5432|6379)\b'; then
  echo "WARN: one or more sensitive ports may be listening on the host." >&2
else
  echo "No sensitive preview ports found listening publicly."
fi
