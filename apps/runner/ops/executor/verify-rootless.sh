#!/usr/bin/env bash
set -euo pipefail

REMOTE="${1:-runner-exec@executor-host}"

ssh "${REMOTE}" 'echo "DOCKER_HOST=$DOCKER_HOST"; docker info >/dev/null && echo ok'
docker -H "ssh://${REMOTE}" version