#!/usr/bin/env bash
set -euo pipefail

echo "Disk before:"
df -h

echo "Docker disk:"
docker system df || true

echo "Prune stopped containers older than 24h"
docker container prune -f --filter "until=24h" || true

echo "Prune dangling images"
docker image prune -f || true

echo "Remove old runner workspaces older than 1 day"
sudo find /var/lib/zoeskoul-runner/workspaces -mindepth 1 -maxdepth 1 -type d -mtime +1 -print -exec rm -rf {} \; || true

echo "Disk after:"
df -h
