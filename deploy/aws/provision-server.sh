#!/usr/bin/env bash
# One-time ON-BOX provisioning (Amazon Linux 2023, t3.small). Idempotent.
# Installs the JRE, nginx + certbot, creates dirs + the systemd unit. No IaC by design
# (mirrors Chhaon / Smart Gurukul). Run as a user with sudo on a fresh box, with this
# repo's deploy/aws directory copied to the box (or run via SSM from launch-account.sh).
set -euo pipefail

sudo dnf update -y
# NOTE: do not add "curl" — AL2023 ships curl-minimal, and the full curl package conflicts with it.
sudo dnf install -y java-21-amazon-corretto-headless nginx certbot python3-certbot-nginx

# /opt/swadesi must be world-readable: deploys write it as root, the service reads it as ec2-user.
sudo install -d -m 755 /opt/swadesi
sudo install -d -m 750 /etc/swadesi
[ -f /etc/swadesi/backend.env ] || { sudo touch /etc/swadesi/backend.env; sudo chmod 640 /etc/swadesi/backend.env; }

sudo cp "$(dirname "$0")/swadesi-backend.service" /etc/systemd/system/swadesi-backend.service
sudo systemctl daemon-reload
sudo systemctl enable swadesi-backend

sudo cp "$(dirname "$0")/nginx-swadesi.conf" /etc/nginx/conf.d/swadesi.conf
sudo systemctl enable --now nginx
sudo nginx -t && sudo systemctl reload nginx

echo "Provisioned. Next: set /etc/swadesi/backend.env, deploy a JAR, then (once DNS exists)"
echo "run: sudo certbot --nginx -d <api-domain>"
