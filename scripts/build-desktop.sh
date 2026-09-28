#!/usr/bin/env bash
set -e

echo "=== Building GST Billing Desktop Application (Linux & Windows) ==="

# 1. Build web distribution
echo "[1/2] Building frontend bundle..."
npm run build

# 2. Package desktop binary with Tauri
echo "[2/2] Running Tauri desktop bundler..."
npx tauri build

echo "=== Desktop binary built successfully! ==="
echo "Artifacts located in: src-tauri/target/release/bundle/"
