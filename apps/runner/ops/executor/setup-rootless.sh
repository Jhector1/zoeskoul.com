#!/usr/bin/env bash
set -euo pipefail

RUNNER_USER="${1:-runner-exec}"

echo "Create user and install Docker rootless prerequisites manually first if needed."
echo "Expected prerequisites from Docker docs:"
echo "  - uidmap"
echo "  - docker-ce"
echo "  - docker-ce-cli"
echo "  - docker-ce-rootless-extras"
echo "  - dbus-user-session"

sudo useradd -m -s /bin/bash "${RUNNER_USER}" || true

echo "Make sure /etc/subuid and /etc/subgid contain >= 65536 subordinate IDs for ${RUNNER_USER}."
echo "Example format:"
echo "  ${RUNNER_USER}:231072:65536"

sudo -iu "${RUNNER_USER}" bash <<'EOF'
set -euo pipefail
dockerd-rootless-setuptool.sh install
EOF

sudo loginctl enable-linger "${RUNNER_USER}"

echo
echo "Now verify on the executor host:"
echo "  sudo -iu ${RUNNER_USER} bash -lc 'echo \$DOCKER_HOST'"
echo "Expected something like:"
echo "  unix:///run/user/\$(id -u)/docker.sock"