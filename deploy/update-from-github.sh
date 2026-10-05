#!/usr/bin/env bash
# ==============================================================================
# Vyapar Books PRO - Automated PWA Updater from GitHub
# Deploys the latest build from https://github.com/nurmd/webapp directly to /var/www/vyapar
# ==============================================================================
set -e

REPO="nurmd/webapp"
BRANCH="master"
WEB_ROOT="/var/www/vyapar"
TEMP_DIR="/tmp/vyapar-update-$$"

echo "=========================================================="
echo "   Vyapar Books PRO - PWA GitHub Updater"
echo "   Target Repository: https://github.com/$REPO"
echo "   Target Web Root:   $WEB_ROOT"
echo "=========================================================="

if [ "$EUID" -ne 0 ]; then
  echo "Error: This update script must be run as root or with sudo:"
  echo "  sudo bash $0"
  exit 1
fi

mkdir -p "$TEMP_DIR"
cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

# 1. Fetch latest release info from GitHub API
echo "[1/4] Checking GitHub for latest release..."
API_URL="https://api.github.com/repos/$REPO/releases/latest"
RELEASE_JSON="$TEMP_DIR/release.json"

HTTP_CODE=$(curl -sSL -w "%{http_code}" -o "$RELEASE_JSON" -H "Accept: application/vnd.github.v3+json" "$API_URL" || true)

TARBALL_URL=""
LATEST_TAG=""

if [ "$HTTP_CODE" = "200" ] && [ -f "$RELEASE_JSON" ]; then
  LATEST_TAG=$(grep -Po '"tag_name":\s*"\K[^"]+' "$RELEASE_JSON" || true)
  TARBALL_URL=$(grep -Po '"browser_download_url":\s*"\Khttps://[^"]*vyapar-pwa\.tar\.gz' "$RELEASE_JSON" || true)
fi

# 2. Download the update archive
ARCHIVE_PATH="$TEMP_DIR/vyapar-pwa.tar.gz"

if [ -n "$TARBALL_URL" ]; then
  echo "[2/4] Downloading release asset $LATEST_TAG from GitHub..."
  echo "  Source: $TARBALL_URL"
  curl -sSL -o "$ARCHIVE_PATH" "$TARBALL_URL"
else
  echo "[2/4] No pre-packaged tarball found in GitHub Releases."
  echo "  Checking for direct repository build archive or raw files..."
  
  # Check if git repository is present in WEB_ROOT or build locally
  RAW_ARCHIVE_URL="https://raw.githubusercontent.com/$REPO/$BRANCH/dist-pwa/vyapar-pwa.tar.gz"
  HTTP_RAW=$(curl -sSL -w "%{http_code}" -o "$ARCHIVE_PATH" "$RAW_ARCHIVE_URL" || true)
  
  if [ "$HTTP_RAW" != "200" ] || [ ! -s "$ARCHIVE_PATH" ]; then
    echo "  Notice: Raw archive not available. Fetching repository directly..."
    
    # If Node.js and Git are installed, do git pull and build
    if command -v git >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
      SRC_DIR="$TEMP_DIR/repo"
      echo "  Cloning latest $BRANCH branch and building..."
      git clone --depth 1 "https://github.com/$REPO.git" "$SRC_DIR"
      cd "$SRC_DIR"
      npm ci --prefer-offline --no-audit || npm install
      npm run build
      tar -czf "$ARCHIVE_PATH" -C "$SRC_DIR/dist" .
    else
      echo "Error: Could not locate a compiled PWA release asset from GitHub ($REPO)."
      echo "Please ensure a GitHub release with vyapar-pwa.tar.gz is published,"
      echo "or install nodejs & npm on Debian to build directly from git source."
      exit 1
    fi
  fi
fi

# 3. Extract to /var/www/vyapar
echo "[3/4] Deploying updated PWA assets to $WEB_ROOT..."
mkdir -p "$WEB_ROOT"
# Backup version.json if exists
if [ -f "$WEB_ROOT/version.json" ]; then
  cp "$WEB_ROOT/version.json" "$TEMP_DIR/version.json.bak" || true
fi

# Unpack clean
tar -xzf "$ARCHIVE_PATH" -C "$WEB_ROOT"

# Ensure proper permissions for Nginx www-data
chown -R www-data:www-data "$WEB_ROOT"
find "$WEB_ROOT" -type d -exec chmod 755 {} \;
find "$WEB_ROOT" -type f -exec chmod 644 {} \;

# 4. Reload Nginx
echo "[4/4] Reloading web server..."
if command -v nginx >/dev/null 2>&1; then
  nginx -t && (systemctl reload nginx || systemctl restart nginx)
fi

NEW_VERSION="Latest"
if [ -f "$WEB_ROOT/version.json" ]; then
  NEW_VERSION=$(grep -Po '"version":\s*"\K[^"]+' "$WEB_ROOT/version.json" || echo "Latest")
fi

echo ""
echo "=========================================================="
echo "   PWA SUCCESSFULLY UPDATED FROM GITHUB!"
echo "   Deployed Version: $NEW_VERSION"
echo "   Domain / URL:     https://billing.brahmaputrahw.store"
echo "   Timestamp:        $(date)"
echo "=========================================================="
echo "Clients and PWAs will auto-refresh to this version seamlessly."
echo ""
