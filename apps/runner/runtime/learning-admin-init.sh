#!/bin/sh
# Initializes one isolated lab; does not contain shared account credentials.
set -eu
if [ "$(id -u)" -ne 0 ]; then
  echo "Administrative lab bootstrap requires container root" >&2
  exit 1
fi
if [ ! -d /workspace ]; then
  echo "Administrative lab workspace missing" >&2
  exit 1
fi
# Never write credentials to a host bind or the writable image layer.
if [ "$(stat -f -c %T /workspace)" != "tmpfs" ]; then
  echo "Administrative lab requires a disposable tmpfs workspace" >&2
  exit 1
fi
umask 077
# This password belongs exclusively to this disposable lab.
lab_root_password="$(python3 -c 'import secrets; print(secrets.token_urlsafe(24))')"
printf 'root:%s\n' "$lab_root_password" | chpasswd
printf '%s\n' "$lab_root_password" > /workspace/.lab-root-password
chown 1000:1000 /workspace/.lab-root-password
chmod 0600 /workspace/.lab-root-password
unset lab_root_password
exec "$@"
