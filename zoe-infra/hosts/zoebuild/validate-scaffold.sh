#!/usr/bin/env bash
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
node --test zoe-infra/hosts/zoebuild/ingress-signer/signer-core.test.mjs
node --check zoe-infra/hosts/zoebuild/ingress-signer/server.mjs
node --check zoe-infra/hosts/zoebuild/ingress-signer/signer-core.mjs
# No deployment or sensitive `docker compose config` output. The real Docker
# compose parser is tested separately AFTER provisioning secure .env files.
echo 'shared_host_scaffold=LOCAL_SIGNER_TESTS_PASS'
echo 'docker_compose_unvalidated_until_env_and_docker_available=YES'
echo 'real_ingress_unsigned=YES deployment=NO'
