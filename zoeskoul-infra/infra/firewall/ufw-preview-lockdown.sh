#!/usr/bin/env bash
set -euo pipefail

# Hardened single-VM preview firewall.
# Allows SSH, HTTP, HTTPS. Blocks accidental public Judge0/runner ports.

SSH_PORT="${SSH_PORT:-22}"

sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow "${SSH_PORT}/tcp" comment "SSH"
sudo ufw allow 80/tcp comment "HTTP/Caddy"
sudo ufw allow 443/tcp comment "HTTPS/Caddy"

# Explicitly deny common accidental exposure ports.
sudo ufw deny 2358/tcp comment "Deny public Judge0"
sudo ufw deny 4001/tcp comment "Deny public runner"
sudo ufw deny 5432/tcp comment "Deny public Postgres"
sudo ufw deny 6379/tcp comment "Deny public Redis"

sudo ufw --force enable
sudo ufw status verbose
