#!/usr/bin/env bash
set -euo pipefail

# Cloudflare IPs (official)
CF_IPS=(
  173.245.48.0/20
  103.21.244.0/22
  103.22.200.0/22
  103.31.4.0/22
  141.101.64.0/18
  108.162.192.0/18
  190.93.240.0/20
  188.114.96.0/20
  197.234.240.0/22
  198.41.128.0/17
  162.158.0.0/15
  104.16.0.0/13
  104.24.0.0/14
  172.64.0.0/13
  131.0.72.0/22
  2400:cb00::/32
  2606:4700::/32
  2803:f800::/32
  2405:b500::/32
  2405:8100::/32
  2a06:98c0::/29
  2c0f:f248::/32
)

SSH_PORT="${SSH_PORT:-22}"

echo "== Installing UFW if needed =="
sudo apt-get update -y >/dev/null
sudo apt-get install -y ufw >/dev/null

echo "== Resetting UFW rules (careful) =="
sudo ufw --force reset

echo "== Default deny inbound, allow outbound =="
sudo ufw default deny incoming
sudo ufw default allow outgoing

echo "== Allow SSH so you don't lock yourself out =="
sudo ufw allow "${SSH_PORT}/tcp"

echo "== Allow HTTP/HTTPS ONLY from Cloudflare ranges =="
for ip in "${CF_IPS[@]}"; do
  sudo ufw allow from "$ip" to any port 80 proto tcp
  sudo ufw allow from "$ip" to any port 443 proto tcp
done

echo "== Enable firewall =="
sudo ufw --force enable

echo "== Status =="
sudo ufw status verbose
