#!/usr/bin/env bash
# Intentionally fail closed: application deploy relocated to WEB host.
set -euo pipefail
printf '%s\n' \
  'REFUSED: ZoeBuild APP must run beside Zoéskoul WEB, not on the runner/VirtualBox host.' \
  'Use zoe-infra/hosts/web/deploy-zoebuild.sh ON THE WEB HOST after explicit readiness checks.' \
  'ZoeBuild preview/build execution runs in hosts/runner/zoebuild independently from Learning.' >&2
exit 2
