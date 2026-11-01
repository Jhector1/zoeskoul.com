#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Disable obsolete global-prune timer before enabling per-pool cleanup.
if systemctl is-active --quiet zoeskoul-runner-storage-maintenance.timer;then
  echo 'ERROR: legacy global-prune maintenance timer is active.' >&2
  echo 'Explicitly disable it first: sudo systemctl disable --now zoeskoul-runner-storage-maintenance.timer' >&2
  exit 1
fi
./zoeskoul-learning/install-maintenance.sh
./zoebuild/install-maintenance.sh
