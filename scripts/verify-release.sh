#!/data/data/com.termux/files/usr/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 1. Package & version.json parity
PKG_VERSION=$(node -p "require('$REPO_ROOT/package.json').version")
if [ -z "$PKG_VERSION" ]; then
  echo "ERROR: Could not parse version from $REPO_ROOT/package.json" >&2
  exit 1
fi

EXPECTED_CODE=$(node -e "
  const parts = '$PKG_VERSION'.split('.').map(n => parseInt(n, 10) || 0);
  const code = (parts[0] || 1) * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0);
  console.log(code);
")

if [ ! -f "$REPO_ROOT/public/version.json" ]; then
  echo "ERROR: $REPO_ROOT/public/version.json not found!" >&2
  exit 1
fi

PUBLIC_VERSION=$(node -p "String(require('$REPO_ROOT/public/version.json').version || '').replace(/^v/, '')")
if [ "$PKG_VERSION" != "$PUBLIC_VERSION" ]; then
  echo "ERROR: Version mismatch between package.json ($PKG_VERSION) and public/version.json ($PUBLIC_VERSION)!" >&2
  exit 1
fi

# 2. Artifact directory resolution
ARTIFACT_DIR="${1:-$HOME/release-artifacts/v$PKG_VERSION}"
if [ ! -d "$ARTIFACT_DIR" ]; then
  echo "ERROR: Release artifact directory does not exist: $ARTIFACT_DIR" >&2
  exit 1
fi

echo "=========================================================="
echo "   Verifying Release Artifacts: v$PKG_VERSION ($ARTIFACT_DIR)"
echo "=========================================================="

# 3. APK Existence & SHA-256 Checksum
APK_FILE="$ARTIFACT_DIR/GSTBilling-Vyapar.apk"
APK_SHA="$ARTIFACT_DIR/GSTBilling-Vyapar.apk.sha256"

if [ ! -f "$APK_FILE" ]; then
  echo "ERROR: APK not found at $APK_FILE" >&2
  exit 1
fi

if [ ! -f "$APK_SHA" ]; then
  echo "ERROR: APK checksum file not found at $APK_SHA" >&2
  exit 1
fi

if ! (cd "$ARTIFACT_DIR" && sha256sum -c "GSTBilling-Vyapar.apk.sha256") >/dev/null 2>&1; then
  echo "ERROR: APK SHA-256 checksum verification failed in $ARTIFACT_DIR!" >&2
  exit 1
fi
echo "✓ APK SHA-256 checksum matches."

# 4. aapt2 dump badging verification (versionName and versionCode)
if ! command -v aapt2 >/dev/null 2>&1; then
  echo "ERROR: aapt2 command not found on PATH!" >&2
  exit 1
fi

BADGING=$(aapt2 dump badging "$APK_FILE" 2>/dev/null)
if [ -z "$BADGING" ]; then
  echo "ERROR: Failed to dump badging from $APK_FILE via aapt2!" >&2
  exit 1
fi

DUMP_VERSION_NAME=$(echo "$BADGING" | grep -o "versionName='[^']*'" | head -n1 | cut -d"'" -f2)
DUMP_VERSION_CODE=$(echo "$BADGING" | grep -o "versionCode='[^']*'" | head -n1 | cut -d"'" -f2)

if [ "$DUMP_VERSION_NAME" != "$PKG_VERSION" ]; then
  echo "ERROR: APK versionName mismatch! Expected: $PKG_VERSION, Dumped: $DUMP_VERSION_NAME" >&2
  exit 1
fi

if [ "$DUMP_VERSION_CODE" != "$EXPECTED_CODE" ]; then
  echo "ERROR: APK versionCode mismatch! Expected: $EXPECTED_CODE, Dumped: $DUMP_VERSION_CODE" >&2
  exit 1
fi
echo "✓ APK badging verified: versionName='$DUMP_VERSION_NAME', versionCode='$DUMP_VERSION_CODE'."

# 5. apksigner verification
if ! command -v apksigner >/dev/null 2>&1; then
  echo "ERROR: apksigner command not found on PATH!" >&2
  exit 1
fi

if ! apksigner verify "$APK_FILE" >/dev/null 2>&1; then
  echo "ERROR: apksigner signature verification failed on $APK_FILE!" >&2
  exit 1
fi
echo "✓ APK digital signature verified with apksigner."

# 6. PWA tarball & checksum verification (when present)
PWA_FILE="$ARTIFACT_DIR/vyapar-pwa.tar.gz"
PWA_SHA="$ARTIFACT_DIR/vyapar-pwa.tar.gz.sha256"

if [ -f "$PWA_FILE" ]; then
  if [ ! -f "$PWA_SHA" ]; then
    echo "ERROR: PWA tarball exists but checksum file is missing: $PWA_SHA" >&2
    exit 1
  fi
  if ! (cd "$ARTIFACT_DIR" && sha256sum -c "vyapar-pwa.tar.gz.sha256") >/dev/null 2>&1; then
    echo "ERROR: PWA tarball SHA-256 checksum verification failed in $ARTIFACT_DIR!" >&2
    exit 1
  fi
  echo "✓ PWA tarball and SHA-256 verified."
fi

echo "=========================================================="
echo "   RELEASE VERIFICATION SUCCESSFUL: v$PKG_VERSION"
echo "=========================================================="
exit 0
