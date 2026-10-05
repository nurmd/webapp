#!/data/data/com.termux/files/usr/bin/bash
set -e

echo "=========================================================="
echo "   Building & Packaging Vyapar Books PWA for Deployment"
echo "=========================================================="

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

# 1. Compile production assets with Vite
echo "[1/4] Compiling production web bundle with Vite..."
npm run build

# 2. Verify PWA critical assets
echo "[2/4] Verifying PWA assets in dist/..."
REQUIRED_FILES=(
  "dist/index.html"
  "dist/sw.js"
  "dist/manifest.json"
  "dist/favicon.svg"
  "dist/icon-192.png"
  "dist/icon-512.png"
  "dist/apple-touch-icon.png"
)

for file in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    echo "ERROR: Missing required PWA file: $file"
    exit 1
  fi
  echo "  ✓ $file found"
done

# 3. Create deployment archive
echo "[3/4] Creating compressed tarball for Debian server..."
mkdir -p "$APP_DIR/dist-pwa"
ARCHIVE_PATH="$APP_DIR/dist-pwa/vyapar-pwa.tar.gz"

tar -czf "$ARCHIVE_PATH" -C "$APP_DIR/dist" .

# 4. Generate Checksum
SHA256=$(sha256sum "$ARCHIVE_PATH" | awk '{print $1}')
echo "$SHA256  vyapar-pwa.tar.gz" > "$ARCHIVE_PATH.sha256"

# Also copy to Android storage/downloads if available
DOWNLOADS_DIR="/data/data/com.termux/files/home/storage/downloads"
if [ -d "$DOWNLOADS_DIR" ]; then
  cp "$ARCHIVE_PATH" "$DOWNLOADS_DIR/vyapar-pwa.tar.gz"
  cp "$ARCHIVE_PATH.sha256" "$DOWNLOADS_DIR/vyapar-pwa.tar.gz.sha256"
  echo "Copied archive to device Downloads folder: $DOWNLOADS_DIR/vyapar-pwa.tar.gz"
fi

echo ""
echo "=========================================================="
echo "   PWA ARCHIVE READY FOR DEBIAN SERVER!"
echo "   Archive: $ARCHIVE_PATH"
echo "   Size:    $(du -h "$ARCHIVE_PATH" | cut -f1)"
echo "   SHA256:  $SHA256"
echo "=========================================================="
echo ""
echo "Deploy to your Debian server with 1 command:"
echo "  scp $ARCHIVE_PATH user@your-debian-server:/tmp/"
echo ""
echo "Then on your Debian server:"
echo "  sudo mkdir -p /var/www/vyapar"
echo "  sudo tar -xzf /tmp/vyapar-pwa.tar.gz -C /var/www/vyapar"
echo "  sudo chown -R www-data:www-data /var/www/vyapar"
echo "=========================================================="
