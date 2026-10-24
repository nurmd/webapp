---
name: vyapar-release
description: >-
  Standard operating procedure for cutting, verifying, and publishing new releases of Vyapar Books PRO, including version bumps, signed Android APK packaging, PWA distribution bundles, and GitHub releases.
---

# Vyapar Books PRO Release Runbook

Follow these steps in strict sequence whenever cutting a new release:

## Step 1: Version Bump & Verification Sync
1. Determine next semver in `package.json` (e.g. `1.2.31`).
2. Confirm the derived Android `versionCode`:
   $$\text{versionCode} = \text{Major} \times 10000 + \text{Minor} \times 100 + \text{Patch}$$
   (e.g., `1.2.31` $\to$ `10231`). The version code is derived automatically; no test file needs a manual version edit.
3. Generate release metadata from recent non-merge commit subjects:
   ```bash
   ./scripts/generate-version.sh
   ```

## Step 2: Build & Sign Release Artifacts
1. Build the signed Android APK:
   ```bash
   ./scripts/build-apk.sh
   ```
   This runs `generate-version.sh`, builds Vite assets, stages them into the Android container, derives `versionName`/`versionCode`, signs with the static keystore, and writes `dist-android/GSTBilling-Vyapar.apk` plus its SHA-256.
2. Build and package the PWA deployment bundle:
   ```bash
   ./scripts/package-pwa.sh
   ```
3. Copy the signed APK, checksum, and PWA artifacts to `~/release-artifacts/vX.Y.Z/`.

## Step 3: Test Suite & Type Verification
Build before testing so `dist/assets` is current, then run the full release gate:
```bash
npx tsc --noEmit
npm run test:all
```
- `npm run test:all` is the release gate and includes the UI suites.
- `npm test` is the faster default suite and excludes the two heavy UI suites; do not use it as the release gate.
- Vite chunk hashes change whenever frontend code changes, so always rebuild before running tests and building the release APK.

## Step 4: Verify Release Artifacts
```bash
./scripts/verify-release.sh ~/release-artifacts/vX.Y.Z
```
The script verifies:
- `package.json` and `public/version.json` version parity.
- APK SHA-256 checksum.
- APK `versionName` and derived `versionCode` via `aapt2`.
- APK signature via `apksigner`.
- PWA bundle checksum when present.

## Step 5: Git Commit & Tag
Stage only source, tests, scripts, docs, and release metadata. Never commit keystores, signing passwords, or generated Android build output.
```bash
git add -A
git commit -m "chore(release): vX.Y.Z [release notes]"
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
git push origin master
```
Push the annotated tag first, then `master`, so the GitHub workflow does not create a lightweight tag.

## Step 6: Publish GitHub Release Assets
Use the signed APK as the authoritative OTA asset. Android updates only consume signed APK assets from GitHub releases; there is no raw `dist-android` fallback.
```bash
gh release upload vX.Y.Z \
  ~/release-artifacts/vX.Y.Z/GSTBilling-Vyapar.apk \
  ~/release-artifacts/vX.Y.Z/GSTBilling-Vyapar.apk.sha256 --clobber
```
Update the release body to include the APK SHA-256. `formatReleaseData` parses it for OTA checksum verification. If a release has no APK asset, the app opens the GitHub release page instead of attempting an update.

## Step 7: Post-Publish Verification
Verify:
- Release assets are present and the latest release is `vX.Y.Z`.
- APK badging reports `versionName='X.Y.Z'` and the expected `versionCode`.
- APK signature matches the established certificate.
- Release body contains the same SHA-256 as `GSTBilling-Vyapar.apk.sha256`.
- OTA update path points to the signed GitHub release asset.
