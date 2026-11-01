#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
case "${1:-}" in
  zoeskoul-learning|zoebuild|gateway) exec "./$1/deploy.sh" "${@:2}" ;;
  --check) ./setup.sh --check; ./zoeskoul-learning/deploy.sh --check; ./zoebuild/deploy.sh --check; ./gateway/deploy.sh --check; ;;
  all) ./setup.sh --check; ./setup.sh --create-network; ./zoeskoul-learning/deploy.sh; ./zoebuild/deploy.sh; ./gateway/deploy.sh; ;;
  *) echo 'Usage: deploy.sh {--check|zoeskoul-learning|zoebuild|gateway|all}' >&2;exit 2;;
esac
