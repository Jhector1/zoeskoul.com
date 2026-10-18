#!/usr/bin/env bash
# Intentionally fail closed: application deploy relocated to WEB host.
set -euo pipefail
printf '%s\n' \
  'REFUSED: ZoeBuild APP must run beside Zoéskoul WEB, not on the runner/VirtualBox host.' \
  'Use zoe-infra/hosts/web/deploy-zoebuild.sh ON THE WEB HOST after explicit readiness checks.' \
  'Learning Runner and ZoeBuild preview/build execution stay on the RUNNER host.' >&2
exit 2
