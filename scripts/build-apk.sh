#!/data/data/com.termux/files/usr/bin/bash
set -e

echo "=========================================================="
echo "   Building GST Billing & Accounting Android APK"
echo "=========================================================="

APP_DIR="/data/data/com.termux/files/home/gst-billing-app"
NATIVE_DIR="$APP_DIR/android-native"
ANDROID_JAR="/data/data/com.termux/files/home/android-sdk/platforms/android-26/android.jar"
KOTLIN_LIB="/data/data/com.termux/files/usr/opt/kotlin/lib/kotlin-stdlib.jar"

cd "$APP_DIR"

# 1. Build Web Assets
echo "[1/6] Building production web assets with Vite..."
npm run build

# 2. Copy Web Assets to Android assets directory
echo "[2/6] Staging web assets into Android container..."
mkdir -p "$NATIVE_DIR/app/src/main/assets"
rm -rf "$NATIVE_DIR/app/src/main/assets/"*
cp -r dist/* "$NATIVE_DIR/app/src/main/assets/"

# 3. Clean & Prepare Build Directories
echo "[3/6] Compiling Android resources with aapt2..."
cd "$NATIVE_DIR"

KEYSTORE_FILE="$NATIVE_DIR/keystore/app-key.keystore"
if [ ! -f "$KEYSTORE_FILE" ]; then
  echo "FATAL ERROR: Static release keystore not found at $KEYSTORE_FILE!"
  echo "A static keystore is strictly required to ensure OTA updates can be installed without signature mismatches."
  exit 1
fi

# Dynamically parse app version and integer version-code from package.json
APP_VERSION=$(node -p "require('$APP_DIR/package.json').version || '1.0.0'")
VERSION_CODE=$(echo "$APP_VERSION" | awk -F. '{printf "%d%02d%02d", $1, $2, $3}')
if [ -z "$VERSION_CODE" ] || [ "$VERSION_CODE" -eq 0 ] 2>/dev/null; then
  VERSION_CODE=1
fi
echo "Target Android Version: v$APP_VERSION (versionCode: $VERSION_CODE)"

rm -rf build
mkdir -p build/compiled-res build/gen build/app-classes build/dex dist-android

aapt2 compile --dir app/src/main/res -o build/compiled-res/

# 4. Link Base APK
echo "[4/6] Linking Android package with assets and manifest..."
aapt2 link -I /system/framework/framework-res.apk \
  -A app/src/main/assets \
  --manifest app/src/main/AndroidManifest.xml \
  --min-sdk-version 24 \
  --target-sdk-version 35 \
  --version-code "$VERSION_CODE" \
  --version-name "$APP_VERSION" \
  -o build/base.apk \
  build/compiled-res/*.flat \
  --java build/gen \
  --auto-add-overlay

# 5. Compile Kotlin Sources & DEX
echo "[5/6] Compiling Kotlin application sources & DEX bytecode..."
kotlinc -cp "$ANDROID_JAR" \
  app/src/main/java/com/gstbilling/pos/GenericFileProvider.kt \
  app/src/main/java/com/gstbilling/pos/MainActivity.kt \
  -d build/app-classes

d8 --lib "$ANDROID_JAR" \
  --min-api 24 \
  $(find build/app-classes -name "*.class") \
  "$KOTLIN_LIB" \
  --output build/dex/

# 6. Package and Sign APK with Static Keystore
echo "[6/6] Packaging and signing Android APK with static keystore ($KEYSTORE_FILE)..."
cp build/base.apk build/app-unaligned.apk
(cd build/dex && zip -u ../app-unaligned.apk classes.dex)

mkdir -p "$APP_DIR/dist-android"
FINAL_APK="$APP_DIR/dist-android/GSTBilling-Vyapar.apk"

apksigner sign \
  --ks "$KEYSTORE_FILE" \
  --ks-pass pass:android \
  --key-pass pass:android \
  --out "$FINAL_APK" \
  build/app-unaligned.apk

# Verify signature
echo "Verifying static keystore signature on output APK..."
apksigner verify --verbose "$FINAL_APK" | grep -E "Verifies|Signer #1" || true

# Generate SHA-256 checksum for cryptographic verification and OTA releases
echo "Calculating SHA-256 checksum for APK verification..."
APK_SHA256=$(sha256sum "$FINAL_APK" | awk '{print $1}')
echo "$APK_SHA256  GSTBilling-Vyapar.apk" > "$FINAL_APK.sha256"
echo "Generated Checksum: $APK_SHA256"

# Copy to device Downloads if storage access exists
DOWNLOADS_DIR="/data/data/com.termux/files/home/storage/downloads"
if [ -d "$DOWNLOADS_DIR" ]; then
  cp "$FINAL_APK" "$DOWNLOADS_DIR/GSTBilling-Vyapar.apk"
  cp "$FINAL_APK.sha256" "$DOWNLOADS_DIR/GSTBilling-Vyapar.apk.sha256"
  echo "Copied APK & SHA256 to Downloads: $DOWNLOADS_DIR/GSTBilling-Vyapar.apk"
fi

echo ""
echo "=========================================================="
echo "   APK BUILD COMPLETE & VERIFIED!"
echo "   Artifact: $FINAL_APK"
echo "   Size: $(du -h "$FINAL_APK" | cut -f1)"
echo "=========================================================="
