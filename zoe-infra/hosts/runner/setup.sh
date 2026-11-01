#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [ "${1:-}" = '--check' ]; then
  for p in zoeskoul-learning zoebuild gateway;do
    if [ ! -f "$p/.env" ]; then echo "Missing $p/.env" >&2; exit 1;fi
  done
  # shellcheck disable=SC1091
  . shared/pool-common.sh
  ( pool_load_env "$PWD/zoeskoul-learning";pool_check_not_shared "$PWD/zoebuild/.env" )
  ( pool_load_env "$PWD/zoebuild";pool_check_not_shared "$PWD/zoeskoul-learning/.env" )
  echo 'EXECUTION_POOL_ISOLATION_CONFIG_PASS'
  exit 0
fi
if [ "${1:-}" != '--create-network' ]; then
  echo 'Usage: setup.sh --check | --create-network' >&2;exit 2
fi
NET='zoeskoul-runner-ingress'
docker network inspect "$NET" >/dev/null 2>&1 || docker network create --driver bridge "$NET" >/dev/null
printf 'Shared private ingress network exists: %s\n' "$NET"
