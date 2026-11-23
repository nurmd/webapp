---
name: vyapar-testing-gate
description: >-
  Use before reporting any change complete in Vyapar Books: run the build, type check and
  full test gate, diagnose failures, and report results without weakening assertions.
---

# Testing & Release Gate

## Order
1. `npm run build` — Vite chunk hashes and the OTA fallback tests read `dist/assets`.
2. `npx tsc --noEmit` — must be zero errors.
3. `npm run test:all` — the release gate (UI suites included). `npm test` is **not** the gate.
4. While iterating, run targeted files: `npx vitest run src/__tests__/<file>`.

## Rules
- Never weaken or delete an assertion to make a test pass. If behaviour intentionally changed,
  update the expectation and state the reason in the report.
- Restore generated artifacts after a build:
  ```bash
  git checkout -- android-native/app/src/main/assets android-native/build dist-android public/version.json
  git clean -fdx -- android-native/app/src/main/assets
  ```
- Known flakes (pass in isolation): `paymentUiSeparation`, `auditEpoch`,
  `m2EmpiricalChallenger` under CPU load. Re-run isolated before reporting a failure.
- UI tests: wrap renders in `act()`, unmount in `afterEach`, clear `localStorage` in
  `beforeEach`.

## Report format
- Files changed.
- New / updated tests with their names.
- Any changed expectation plus the reason.
- Command summary (suites/tests passed, tsc status).
- Anything not covered.

## Checklist
- [ ] build
- [ ] tsc 0 errors
- [ ] full suite green, or flakes identified and passing in isolation
- [ ] no weakened assertions
- [ ] `git status` shows only intended changes
