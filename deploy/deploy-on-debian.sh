#!/usr/bin/env bash
# ==============================================================================
# Vyapar Books PRO - Automated PWA Deployment Script for Debian Linux
# Tested on: Debian 11 (Bullseye) & Debian 12 (Bookworm)
# ==============================================================================
set -e

# Default settings
WEB_ROOT="/var/www/vyapar"
NGINX_CONF_AVAILABLE="/etc/nginx/sites-available/vyapar-pwa.conf"
NGINX_CONF_ENABLED="/etc/nginx/sites-enabled/vyapar-pwa.conf"
ARCHIVE_SOURCE="${1:-/tmp/vyapar-pwa.tar.gz}"

echo "=========================================================="
echo "   Vyapar Books PRO - Debian Server PWA Installer"
echo "=========================================================="

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root or with sudo:"
  echo "  sudo bash $0"
  exit 1
fi

if [ ! -f "$ARCHIVE_SOURCE" ]; then
  echo "Error: Archive not found at: $ARCHIVE_SOURCE"
  echo "Usage: sudo bash $0 [/path/to/vyapar-pwa.tar.gz]"
  exit 1
fi

# 1. Install Nginx if not already installed
if ! command -v nginx >/dev/null 2>&1; then
  echo "[1/5] Installing Nginx web server..."
  apt-get update -y
  apt-get install -y nginx certbot python3-certbot-nginx
else
  echo "[1/5] Nginx is already installed."
fi

# 2. Extract PWA files into document root
echo "[2/5] Deploying PWA web assets to $WEB_ROOT..."
mkdir -p "$WEB_ROOT"
rm -rf "${WEB_ROOT:?}/"*
tar -xzf "$ARCHIVE_SOURCE" -C "$WEB_ROOT"

# Set proper ownership and permissions
chown -R www-data:www-data "$WEB_ROOT"
find "$WEB_ROOT" -type d -exec chmod 755 {} \;
find "$WEB_ROOT" -type f -exec chmod 644 {} \;

# 3. Configure Nginx
echo "[3/5] Installing Nginx virtual host configuration..."
if [ -f "$(dirname "$0")/nginx/vyapar-pwa.conf" ]; then
  cp "$(dirname "$0")/nginx/vyapar-pwa.conf" "$NGINX_CONF_AVAILABLE"
else
  cat << 'EOF' > "$NGINX_CONF_AVAILABLE"
server {
    listen 80;
    listen [::]:80;
    server_name _;

    root /var/www/vyapar;
    index index.html;

    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript image/svg+xml font/woff2;

    location = /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires "0";
        access_log off;
    }

    location = /manifest.json {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Content-Type "application/manifest+json";
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
        access_log off;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF
fi

# Enable site
ln -sf "$NGINX_CONF_AVAILABLE" "$NGINX_CONF_ENABLED"

# Remove default nginx site if still present
if [ -f /etc/nginx/sites-enabled/default ]; then
  rm -f /etc/nginx/sites-enabled/default
fi

# 4. Test & Reload Nginx
echo "[4/5] Testing Nginx configuration syntax..."
nginx -t

echo "[5/5] Reloading Nginx service..."
systemctl reload nginx || systemctl restart nginx
systemctl enable nginx

echo ""
echo "=========================================================="
echo "   DEPLOYMENT SUCCESSFUL!"
echo "   Document Root: $WEB_ROOT"
echo "   PWA Assets:    $(find "$WEB_ROOT" -type f | wc -l) files installed"
echo "=========================================================="
echo ""
echo "Next Steps for SSL (Recommended for PWA Install Prompt):"
echo "  sudo certbot --nginx -d your-domain.com"
echo "=========================================================="
