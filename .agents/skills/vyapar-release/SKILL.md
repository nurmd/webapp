---
name: vyapar-release
description: >-
  Standard operating procedure for preparing a Vyapar Books PRO release: version bump,
  signed APK build, test gate, artifact verification, and hand-off. Use when preparing a
  release or verifying release artifacts.
---

# Vyapar Books Release Preparation

Run these steps in order. **Agy must not bump versions on its own initiative, sign for
release, install apps, commit, tag, push, or publish.** The assistant performs the push and
GitHub release after explicit user permission.

## Step 1 — Confirm authorisation
A release starts only when the user asks. Do not start one proactively.

## Step 2 — Version bump (assistant-owned)
The assistant updates `package.json` and `public/version.json`.
`versionCode = major * 10000 + minor * 100 + patch` (e.g. `1.2.91` -> `10291`).

## Step 3 — Build
```bash
./scripts/build-apk.sh
```
Runs `generate-version.sh`, builds the Vite assets, stages them into the Android container,
derives `versionName`/`versionCode`, signs with the static keystore, and writes
`dist-android/GSTBilling-Vyapar.apk` plus `.sha256`.

## Step 4 — Gate
```bash
npx tsc --noEmit
npm run build
npm run test:all
```

## Step 5 — Verify
```bash
./scripts/verify-release.sh ~/release-artifacts/vX.Y.Z
```
Checks version parity, APK SHA-256, badging, signature, and the PWA checksum when present.

## Step 6 — Restore generated artifacts
```bash
git checkout -- android-native/app/src/main/assets android-native/build dist-android public/version.json
git clean -fdx -- android-native/app/src/main/assets
```

## Step 7 — Hand off
Report the APK path, SHA-256, versionName/versionCode, tsc/test results, and changed files.
Do **not** commit, tag, push, or create the GitHub release.

## Policy notes
- Release from `payments-work`, not `master`.
- PWA packaging/deployment is paused; skip `package-pwa.sh` unless the user resumes it.
- Publish only signed GitHub APK assets; never a raw `dist-android` APK.
- Never commit keystores, signing passwords, lineage proofs, or secrets.
- Keep only the last 10 GitHub releases; leave tags intact.
- Ask the user for explicit permission before the final push.
