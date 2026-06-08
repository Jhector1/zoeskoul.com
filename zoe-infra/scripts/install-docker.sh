#!/usr/bin/env bash
set -euo pipefail
sudo apt update
sudo apt install -y ca-certificates curl gnupg git jq htop unzip ufw
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
echo "Docker installed. Log out and back in so group membership applies."
