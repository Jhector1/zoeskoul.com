#!/usr/bin/env bash
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
RUNTIME_IMAGE="${RUNTIME_IMAGE:-ghcr.io/jhector1/zoeskoul-runtime:prod}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script as root."
  exit 1
fi

if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  echo "User $DEPLOY_USER does not exist."
  exit 1
fi

DEPLOY_UID="$(id -u "$DEPLOY_USER")"
RUNTIME_DIR="/run/user/$DEPLOY_UID"
SOCKET="$RUNTIME_DIR/docker.sock"

echo "Installing rootless Docker dependencies..."
apt update
apt install -y uidmap dbus-user-session slirp4netns fuse-overlayfs docker-ce-rootless-extras

echo "Stopping old manual rootless Docker processes..."
pkill -u "$DEPLOY_USER" -f dockerd-rootless.sh 2>/dev/null || true
pkill -u "$DEPLOY_USER" -f rootlesskit 2>/dev/null || true

echo "Enabling lingering for $DEPLOY_USER..."
loginctl enable-linger "$DEPLOY_USER"

echo "Starting user manager for UID $DEPLOY_UID..."
systemctl start "user@$DEPLOY_UID.service"

echo "Waiting for user runtime..."
for i in $(seq 1 20); do
  if [ -S "$RUNTIME_DIR/bus" ]; then
    break
  fi
  sleep 1
done

if [ ! -S "$RUNTIME_DIR/bus" ]; then
  echo "User bus not found at $RUNTIME_DIR/bus"
  echo "Try logging out/in or rebooting the server, then run this again."
  exit 1
fi

echo "Installing rootless Docker service for $DEPLOY_USER..."
sudo -u "$DEPLOY_USER" \
  XDG_RUNTIME_DIR="$RUNTIME_DIR" \
  DBUS_SESSION_BUS_ADDRESS="unix:path=$RUNTIME_DIR/bus" \
  dockerd-rootless-setuptool.sh install --force

echo "Enabling and starting rootless Docker..."
sudo -u "$DEPLOY_USER" \
  XDG_RUNTIME_DIR="$RUNTIME_DIR" \
  DBUS_SESSION_BUS_ADDRESS="unix:path=$RUNTIME_DIR/bus" \
  systemctl --user daemon-reload

sudo -u "$DEPLOY_USER" \
  XDG_RUNTIME_DIR="$RUNTIME_DIR" \
  DBUS_SESSION_BUS_ADDRESS="unix:path=$RUNTIME_DIR/bus" \
  systemctl --user enable docker

sudo -u "$DEPLOY_USER" \
  XDG_RUNTIME_DIR="$RUNTIME_DIR" \
  DBUS_SESSION_BUS_ADDRESS="unix:path=$RUNTIME_DIR/bus" \
  systemctl --user restart docker

echo "Waiting for rootless Docker socket..."
for i in $(seq 1 30); do
  if [ -S "$SOCKET" ]; then
    break
  fi
  sleep 1
done

if [ ! -S "$SOCKET" ]; then
  echo "Rootless Docker socket not found: $SOCKET"
  sudo -u "$DEPLOY_USER" \
    XDG_RUNTIME_DIR="$RUNTIME_DIR" \
    DBUS_SESSION_BUS_ADDRESS="unix:path=$RUNTIME_DIR/bus" \
    systemctl --user status docker --no-pager || true
  exit 1
fi

echo "Rootless Docker socket:"
ls -l "$SOCKET"

echo "Rootless Docker info:"
sudo -u "$DEPLOY_USER" \
  XDG_RUNTIME_DIR="$RUNTIME_DIR" \
  DOCKER_HOST="unix://$SOCKET" \
  docker info | grep -Ei "rootless|cgroup driver" || true

echo
echo "Rootless Docker is ready."
echo
echo "Use these values in /opt/zoeskoul/zoe-infra/hosts/runner/.env:"
echo "RUNNER_DOCKER_SOCKET_HOST=$SOCKET"
echo "RUNNER_DOCKER_SOCKET_IN_CONTAINER=/docker.sock"
echo "RUNNER_CONTAINER_USER=$DEPLOY_UID:$DEPLOY_UID"
echo "RUNNER_IMAGE=$RUNTIME_IMAGE"
