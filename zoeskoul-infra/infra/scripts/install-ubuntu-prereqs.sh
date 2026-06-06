#!/usr/bin/env bash
set -euo pipefail

# Ubuntu VM prerequisites for the hardened preview.
# This does not overwrite an existing Docker install.

sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg openssl ufw jq make uidmap dbus-user-session slirp4netns fuse-overlayfs iptables lsof

if ! command -v docker >/dev/null 2>&1; then
  cat >&2 <<'MSG'
Docker is not installed.

Install Docker Engine first, then re-run this script.
For a quick Ubuntu VM preview you can try:
  sudo apt-get install -y docker.io docker-compose-v2

For rootless Docker support, Docker's official Engine packages are usually better than distro packages.
MSG
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 plugin is missing. Install docker-compose-v2 or docker-compose-plugin." >&2
  exit 1
fi

echo "Docker found: $(docker --version)"
echo "Compose found: $(docker compose version)"
echo "Prereqs OK. Next run: ./scripts/install-rootless-docker.sh"
