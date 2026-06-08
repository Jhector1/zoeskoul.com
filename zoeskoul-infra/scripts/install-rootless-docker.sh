#!/usr/bin/env bash
set -euo pipefail

# Installs/enables Docker rootless mode for the current Linux user when Docker's rootless helper is available.
# This is best-effort because Ubuntu packages differ. It never disables your normal rootful Docker service.

uid_now="$(id -u)"
rootless_socket="/run/user/${uid_now}/docker.sock"

sudo apt-get update -y
sudo apt-get install -y uidmap dbus-user-session slirp4netns fuse-overlayfs iptables || true

if [[ -S "$rootless_socket" ]]; then
  echo "Rootless Docker socket already exists: $rootless_socket"
  docker --host "unix://$rootless_socket" info >/dev/null
  echo "Rootless Docker OK."
  exit 0
fi

if ! command -v dockerd-rootless-setuptool.sh >/dev/null 2>&1; then
  echo "dockerd-rootless-setuptool.sh was not found."
  echo "Install Docker Engine from Docker's official repository, then re-run this script."
  echo "For preview only, you may set ALLOW_ROOT_DOCKER_SOCKET=1 in env/production.env, but that is intentionally blocked by default."
  exit 1
fi

export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$uid_now}"
mkdir -p "$XDG_RUNTIME_DIR"

# Enable user services after logout/reboot.
sudo loginctl enable-linger "$(id -un)" || true

dockerd-rootless-setuptool.sh install || true

systemctl --user enable docker || true
systemctl --user start docker || true

if [[ ! -S "$rootless_socket" ]]; then
  echo "Rootless Docker socket still missing: $rootless_socket" >&2
  echo "Try logging out and back in, or run: systemctl --user status docker" >&2
  exit 1
fi

docker --host "unix://$rootless_socket" info >/dev/null
echo "Rootless Docker OK at $rootless_socket"
echo "Re-run ./scripts/generate-env.sh if production.env was created before rootless Docker was enabled."
