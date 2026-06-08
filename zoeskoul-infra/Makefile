SHELL := /usr/bin/env bash

.PHONY: prereqs rootless env preflight up up-web up-judge0 smoke logs ps down backup check-secrets hardening-check rootless-test firewall

prereqs:
	./scripts/install-ubuntu-prereqs.sh

rootless:
	./scripts/install-rootless-docker.sh

env:
	./scripts/generate-env.sh

preflight:
	./scripts/preflight.sh

up:
	./scripts/deploy-preview.sh

up-web:
	ENABLE_WEB=1 ./scripts/deploy-preview.sh

up-judge0:
	ENABLE_JUDGE0=1 ./scripts/deploy-preview.sh

smoke:
	./scripts/smoke-test.sh

logs:
	./scripts/logs.sh

ps:
	./scripts/compose.sh ps

down:
	./scripts/stop-preview.sh

backup:
	./scripts/backup-postgres.sh

check-secrets:
	./scripts/check-secrets.sh

hardening-check:
	./scripts/host-hardening-check.sh

rootless-test:
	./scripts/test-runner-rootless.sh

firewall:
	./firewall/ufw-preview-lockdown.sh
