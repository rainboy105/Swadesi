#!/usr/bin/env bash
# Install the WA-AKG WhatsApp gateway on the EC2 box (Amazon Linux 2023). Idempotent.
# The gateway source is expected at /opt/whatsapp-gateway (uploaded from S3), and
# /opt/whatsapp-gateway/.env must be filled from whatsapp-gateway.env.example.
# Baileys speaks the WhatsApp Web protocol directly — no Chromium needed.
set -euo pipefail

# Node 22 (NodeSource).
if ! node --version 2>/dev/null | grep -q '^v22'; then
  curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
  sudo dnf install -y nodejs
fi

cd /opt/whatsapp-gateway
npm ci
# Next.js needs a production build (the service refuses to start without .next).
# On the t3.small, add swap first and stop the backend during the build to avoid OOM.
NODE_OPTIONS=--max-old-space-size=1024 npm run build
npx prisma generate
# Create the gateway's tables in the wa_akg schema (DATABASE_URL from .env).
set -a; . ./.env; set +a
npx prisma db push

sudo cp "$(dirname "$0")/swadesi-wa.service" /etc/systemd/system/swadesi-wa.service 2>/dev/null || true
sudo systemctl daemon-reload
sudo systemctl enable --now swadesi-wa

sudo cp "$(dirname "$0")/nginx-wa.conf" /etc/nginx/conf.d/wa.conf 2>/dev/null || true
sudo nginx -t && sudo systemctl reload nginx || true

echo "Gateway installed. Next: certbot --nginx -d wa.swaadesi.org, open https://wa.swaadesi.org,"
echo "create a session named 'Swadesi', scan the QR with the dedicated WhatsApp number, then mint a"
echo "wag_ API key and set WHATSAPP_GATEWAY_URL/TOKEN on the backend."
