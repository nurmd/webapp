# Hosting Vyapar Books PWA on a Debian Linux Server

Complete production hosting guide for deploying **Vyapar Books PRO** as an installable, offline-first Progressive Web App (PWA) on **Debian 11 (Bullseye)** or **Debian 12 (Bookworm)**.

---

## 🚀 Quick Start (1-Command Transfer & Deploy)

### Step 1: Transfer Archive to Your Debian Server
From this device, copy the pre-packaged archive directly to your server:
```bash
scp /data/data/com.termux/files/home/gst-billing-app/dist-pwa/vyapar-pwa.tar.gz user@your-debian-server:/tmp/
scp /data/data/com.termux/files/home/gst-billing-app/deploy/deploy-on-debian.sh user@your-debian-server:/tmp/
```

### Step 2: Run Installer on Debian Server
SSH into your Debian server and run the automated deployment script:
```bash
ssh user@your-debian-server
sudo bash /tmp/deploy-on-debian.sh /tmp/vyapar-pwa.tar.gz
```

---

## 🌐 Production Server Configurations

### Option A: Nginx (Recommended)

1. **Install Nginx & Certbot on Debian**:
   ```bash
   sudo apt update
   sudo apt install -y nginx certbot python3-certbot-nginx
   ```

2. **Extract PWA Files**:
   ```bash
   sudo mkdir -p /var/www/vyapar
   sudo tar -xzf /tmp/vyapar-pwa.tar.gz -C /var/www/vyapar
   sudo chown -R www-data:www-data /var/www/vyapar
   sudo chmod -R 755 /var/www/vyapar
   ```

3. **Configure Nginx**:
   Create `/etc/nginx/sites-available/vyapar-pwa.conf`:
   ```nginx
   server {
       listen 80;
       listen [::]:80;
       server_name billing.yourdomain.com; # Replace with your domain or IP

       root /var/www/vyapar;
       index index.html;

       # Security Headers
       add_header X-Content-Type-Options "nosniff" always;
       add_header X-Frame-Options "SAMEORIGIN" always;
       add_header X-XSS-Protection "1; mode=block" always;
       add_header Referrer-Policy "strict-origin-when-cross-origin" always;

       # Compression
       gzip on;
       gzip_vary on;
       gzip_proxied any;
       gzip_comp_level 6;
       gzip_types text/plain text/css text/xml application/json application/javascript image/svg+xml font/woff2;

       # 1. PWA Service Worker & Manifest (Never cache permanently)
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

       # 2. Hashed static bundle assets (Cache for 1 year)
       location /assets/ {
           expires 1y;
           add_header Cache-Control "public, max-age=31536000, immutable";
           access_log off;
       }

       # 3. Static icons
       location ~* \.(?:svg|png|jpg|jpeg|gif|ico|webp)$ {
           expires 30d;
           add_header Cache-Control "public, max-age=2592000";
           access_log off;
       }

       # 4. SPA Fallback
       location / {
           try_files $uri $uri/ /index.html;
       }
   }
   ```

4. **Enable & Reload**:
   ```bash
   sudo ln -sf /etc/nginx/sites-available/vyapar-pwa.conf /etc/nginx/sites-enabled/
   sudo rm -f /etc/nginx/sites-enabled/default
   sudo nginx -t
   sudo systemctl reload nginx
   ```

5. **Enable HTTPS (Required for PWA Install Prompt)**:
   ```bash
   sudo certbot --nginx -d billing.yourdomain.com
   ```

---

### Option B: Caddy Server (Automatic HTTPS)

If you prefer Caddy on Debian:

1. **Install Caddy**:
   ```bash
   sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
   sudo apt update
   sudo apt install -y caddy
   ```

2. **Configure `/etc/caddy/Caddyfile`**:
   ```caddy
   billing.yourdomain.com {
       root * /var/www/vyapar
       encode gzip zstd
       file_server

       # PWA cache policy
       @pwaFiles path /sw.js /manifest.json
       header @pwaFiles Cache-Control "no-cache, no-store, must-revalidate"

       @staticHashed path /assets/*
       header @staticHashed Cache-Control "public, max-age=31536000, immutable"

       try_files {path} /index.html
   }
   ```

3. **Reload Caddy**:
   ```bash
   sudo systemctl reload caddy
   ```

---

### Option C: Docker & Docker Compose

If your Debian server runs Docker:

1. **Transfer the project or Docker configs**:
   ```bash
   scp -r deploy/docker/ docker-compose.yml user@your-debian-server:~/vyapar/
   scp dist-pwa/vyapar-pwa.tar.gz user@your-debian-server:~/vyapar/
   ```

2. **Run on Debian**:
   ```bash
   cd ~/vyapar
   mkdir -p dist && tar -xzf vyapar-pwa.tar.gz -C dist
   docker compose up -d
   ```
   The app will be accessible at `http://your-server-ip:8080`.

---

## 📱 Verifying PWA Installation

1. Open your domain (`https://billing.yourdomain.com`) in **Google Chrome**, **Microsoft Edge**, or **Brave**.
2. Look for the **"Install App"** icon in the address bar (or menu > **"Install Vyapar Books"**).
3. On Android Chrome: Tap the 3-dot menu > **"Add to Home Screen"** or **"Install App"**.
4. On iOS Safari: Tap the Share button > **"Add to Home Screen"**.
5. Once installed, the app opens full-screen like a native app and works **100% offline** via `sw.js`!

---

## 🔄 Updating to a Newer PWA Version through GitHub

### Method 1: Automated 1-Command Update from GitHub on Debian (Recommended)
You can update your Debian server directly from the `nurmd/webapp` GitHub repository:

```bash
# Run the automated updater script directly on Debian:
sudo bash /var/www/vyapar/deploy/update-from-github.sh
```

Or install it as a system command:
```bash
sudo ln -sf /var/www/vyapar/deploy/update-from-github.sh /usr/local/bin/vyapar-update
sudo chmod +x /usr/local/bin/vyapar-update

# Then whenever you push changes to GitHub, just run:
sudo vyapar-update
```

This script:
1. Queries the GitHub repository and downloads the latest release bundle.
2. Extracts assets cleanly into `/var/www/vyapar`.
3. Sets `www-data` ownership and correct permissions.
4. Reloads Nginx.
5. All connected PWA clients and mobile devices will automatically receive an update toast prompt and hot-reload to the latest version!

---

### Method 2: In-App PWA Update (For Users & Cashiers)
Inside the PWA running at `https://billing.brahmaputrahw.store`:
1. The app automatically checks GitHub and the Service Worker in the background.
2. When a newer version is deployed, a notification prompt appears: **"PWA Update Available from GitHub (vX.X.X)"**.
3. Tap **"Update & Reload Now"** — the Service Worker activates immediately, purges obsolete caches, and reloads with the fresh code. All local offline billing data remains intact.

