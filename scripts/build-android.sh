#!/usr/bin/env bash
set -e

echo "=== Building GST Billing App for Android ==="

# 1. Build the web distribution
echo "[1/4] Building production web assets with Vite..."
npm run build

# 2. Add Android platform if not already added
if [ ! -d "android" ]; then
    echo "[2/4] Adding Capacitor Android platform..."
    npx cap add android
fi

# 3. Sync web assets and plugins to Android project
echo "[3/4] Syncing assets to native Android container..."
npx cap sync android

# 4. Build native APK using Gradle
echo "[4/4] Compiling debug APK via Gradle..."
cd android && ./gradlew assembleDebug

echo "=== Android APK build finished! ==="
echo "APK location: android/app/build/outputs/apk/debug/app-debug.apk"
