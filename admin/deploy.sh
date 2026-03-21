#!/bin/bash
set -euo pipefail

echo "=== Growleads Admin Dashboard Deployer ==="
echo ""

# ---- 1. Install Docker if missing ----
if ! command -v docker &>/dev/null; then
    echo "[1/4] Installing Docker..."
    sudo apt-get update -qq
    sudo apt-get install -y -qq ca-certificates curl gnupg
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update -qq
    sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
    sudo usermod -aG docker "$USER"
    echo "Docker installed. You may need to log out and back in for group changes."
else
    echo "[1/4] Docker already installed."
fi

# ---- 2. Open firewall ports (Oracle Cloud iptables) ----
echo "[2/4] Configuring firewall..."
# Oracle Cloud Ubuntu images have iptables rules that block 80/443 by default.
# These must be opened IN ADDITION to the VCN security list in the Oracle console.
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT 2>/dev/null || true
sudo iptables -I INPUT 6 -m state --state NEW -p udp --dport 443 -j ACCEPT 2>/dev/null || true
sudo netfilter-persistent save 2>/dev/null || sudo iptables-save | sudo tee /etc/iptables/rules.v4 > /dev/null
echo "Ports 80, 443 (TCP+UDP) opened in iptables."

# ---- 3. Prompt for config ----
echo "[3/4] Configuration..."
read -rp "Domain (e.g. admin.growleads.io): " DOMAIN
read -rp "API Key (random string, leave blank to generate): " API_KEY

if [ -z "$API_KEY" ]; then
    API_KEY=$(openssl rand -hex 24)
    echo "Generated API key: $API_KEY"
fi

cat > .env <<EOL
ADMIN_PORT=4000
ADMIN_API_KEY=${API_KEY}
INACTIVE_HOURS=48
DOMAIN=${DOMAIN}
EOL

echo ".env written."

# ---- 4. Launch ----
echo "[4/4] Starting services..."
sudo docker compose up -d --build

echo ""
echo "=== DONE ==="
echo "Dashboard: https://${DOMAIN}"
echo "API Key:   ${API_KEY}"
echo ""
echo "IMPORTANT: Make sure you have:"
echo "  1. Pointed ${DOMAIN} A record to this VM's public IP"
echo "  2. Added ingress rules in Oracle Cloud VCN Security List for ports 80 and 443"
echo ""
echo "Useful commands:"
echo "  sudo docker compose logs -f        # watch logs"
echo "  sudo docker compose down            # stop"
echo "  sudo docker compose up -d --build   # rebuild after code changes"
