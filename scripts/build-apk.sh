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
  --version-code 1 \
  --version-name "1.0.0" \
  -o build/base.apk \
  build/compiled-res/*.flat \
  --java build/gen \
  --auto-add-overlay

# 5. Compile Kotlin Sources & DEX
echo "[5/6] Compiling Kotlin application sources & DEX bytecode..."
kotlinc -cp "$ANDROID_JAR" \
  app/src/main/java/com/gstbilling/pos/MainActivity.kt \
  -d build/app-classes

d8 --lib "$ANDROID_JAR" \
  --min-api 24 \
  $(find build/app-classes -name "*.class") \
  "$KOTLIN_LIB" \
  --output build/dex/

# 6. Package and Sign APK
echo "[6/6] Packaging and signing Android APK..."
cp build/base.apk build/app-unaligned.apk
(cd build/dex && zip -u ../app-unaligned.apk classes.dex)

mkdir -p "$APP_DIR/dist-android"
FINAL_APK="$APP_DIR/dist-android/GSTBilling-Vyapar.apk"

apksigner sign \
  --ks keystore/app-key.keystore \
  --ks-pass pass:android \
  --key-pass pass:android \
  --out "$FINAL_APK" \
  build/app-unaligned.apk

# Copy to device Downloads if storage access exists
DOWNLOADS_DIR="/data/data/com.termux/files/home/storage/downloads"
if [ -d "$DOWNLOADS_DIR" ]; then
  cp "$FINAL_APK" "$DOWNLOADS_DIR/GSTBilling-Vyapar.apk"
  echo "Copied APK to Downloads: $DOWNLOADS_DIR/GSTBilling-Vyapar.apk"
fi

echo ""
echo "=========================================================="
echo "   APK BUILD COMPLETE & VERIFIED!"
echo "   Artifact: $FINAL_APK"
echo "   Size: $(du -h "$FINAL_APK" | cut -f1)"
echo "=========================================================="
