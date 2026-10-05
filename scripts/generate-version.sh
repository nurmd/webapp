#!/usr/bin/env bash
set -e

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION=$(node -p "require('./package.json').version")
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat <<EOF > "$APP_DIR/public/version.json"
{
  "version": "$VERSION",
  "name": "Vyapar Books PRO",
  "buildTime": "$NOW",
  "repository": "nurmd/webapp",
  "channel": "stable"
}
EOF

# Ensure public/sw.js CACHE_VERSION matches package version
sed -i -E "s/const CACHE_VERSION = 'vyapar-pwa-v[^']+';/const CACHE_VERSION = 'vyapar-pwa-v$VERSION';/g" "$APP_DIR/public/sw.js"

echo "Generated public/version.json for v$VERSION at $NOW"
