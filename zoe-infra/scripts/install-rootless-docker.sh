#!/usr/bin/env bash
set -euo pipefail

sudo apt update
sudo apt install -y uidmap dbus-user-session slirp4netns fuse-overlayfs docker-ce-rootless-extras || true

if ! command -v dockerd-rootless-setuptool.sh >/dev/null 2>&1; then
  echo "dockerd-rootless-setuptool.sh not found. Install Docker first with infra/scripts/install-docker.sh." >&2
  exit 1
fi

dockerd-rootless-setuptool.sh install

loginctl enable-linger "$USER"

mkdir -p "$HOME/.config/systemd/user"
systemctl --user daemon-reload
systemctl --user enable docker
systemctl --user restart docker

export DOCKER_HOST="unix:///run/user/$(id -u)/docker.sock"
docker version

echo "Rootless Docker is ready. Use this in runner .env:"
echo "RUNNER_DOCKER_SOCKET_HOST=/run/user/$(id -u)/docker.sock"
echo "RUNNER_CONTAINER_USER=$(id -u):$(id -g)"
