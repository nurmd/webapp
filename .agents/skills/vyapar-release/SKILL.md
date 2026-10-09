---
name: vyapar-release
description: >-
  Standard operating procedure for cutting, verifying, and publishing new releases of Vyapar Books PRO, including version bumps, signed Android APK packaging, PWA distribution bundles, and GitHub releases.
---

# Vyapar Books PRO Release Runbook

Follow these steps in strict sequence whenever the user requests a new release:

## Step 1: Version Bump & Verification Sync
1. Determine next semver in `package.json` (e.g. `1.1.16`).
2. Calculate integer Android `versionCode`:
   $$\text{versionCode} = \text{Major} \times 10000 + \text{Minor} \times 100 + \text{Patch}$$
   (e.g., `1.1.16` $\to$ `10116`).
3. Update `src/__tests__/challenger2M5ApkPackageStress.test.ts` to assert the new `versionCode` and `versionName`.
4. Run version synchronization script:
   ```bash
   bash scripts/generate-version.sh
   ```

## Step 2: Build & Sign Release Artifacts
1. Build signed Android native APK (compiles web assets, aapt2 resources, Kotlin DEX, and static keystore signature):
   ```bash
   bash scripts/build-apk.sh
   ```
2. Build and package PWA deployment bundle with SHA-256:
   ```bash
   bash scripts/package-pwa.sh
   ```

## Step 3: Test Suite & Type Verification
Ensure 100% test pass rate and zero TypeScript errors:
```bash
npm test && npx tsc --noEmit
```

## Step 4: Git Commit & Tag
Stage all modified files, release APKs, PWA tarballs, and version metadata:
```bash
git add -A
git commit -m "chore(release): bump version to vX.Y.Z with [release notes]"
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin master && git push origin vX.Y.Z
```

## Step 5: Publish GitHub Release Assets
Ensure all 5 release artifacts are attached:
- `dist-android/GSTBilling-Vyapar.apk`
- `dist-android/GSTBilling-Vyapar.apk.sha256`
- `dist-pwa/vyapar-pwa.tar.gz`
- `dist-pwa/vyapar-pwa.tar.gz.sha256`
- `public/version.json`

Verify or upload via `gh`:
```bash
gh release upload vX.Y.Z dist-android/GSTBilling-Vyapar.apk* dist-pwa/vyapar-pwa.tar.gz* public/version.json --clobber
```
