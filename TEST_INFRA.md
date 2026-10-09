# E2E Test Infra: GST Billing App Hardening

## Test Philosophy
- Requirement-driven, automated verification utilizing Vitest 2.1.8 configured for Vite 5 and TypeScript with `happy-dom`.
- Coverage spanning statutory Indian GST calculations, double-entry ledger vouchers, multi-tender split payment accounting, cash/bank running balances, and inventory constraint invariants.
- Cryptographic and compliance verification: Web Crypto API salted SHA-256 PIN hashing, non-destructive migration, persistent brute-force lockout, and MCA-compliant tamper-evident hash chaining.
- Build and mobile verification: zero TypeScript compiler errors, dynamic code-split bundle verification (< 450 kB primary chunk), and signed Android APK package verification.

---

## Test Architecture
- **Framework**: Vitest 2.1.8 (`vitest run`), `happy-dom` 15.7.4
- **Config**: `vitest.config.ts`
- **Location**: `src/__tests__/`
- **Test Suites**:
  1. `gstCalculator.test.ts`: Statutory Indian GST calculations (intra/inter-state, cess percent & per-unit, nearest rupee rounding)
  2. `doubleEntryLedger.test.ts`: Balanced debit/credit vouchers, Section 170 round-off balancing (`ACC_ROUND_OFF`), split tender payments
  3. `cashBankRunningBalance.test.ts`: Running liquid balance invariance on contra transfers, voucher receipt deduplication
  4. `inventoryConstraints.test.ts`: `isItemInBills` deletion protection, disable filtering, stock lifecycle hooks, snapshot immutability
  5. `pinSecurity.test.ts`: Web Crypto salted SHA-256 PIN hashing, startup migration, persistent brute-force lockout
  6. `auditTrail.test.ts`: Append-only audit logging, financial mutation lifecycle hooks, SHA-256 hash chain verification

---

## Acceptance Thresholds
- **Vitest**: 100% tests passing, 0 failures across all 6 test suites
- **TypeScript**: `npx tsc --noEmit` exits with code 0
- **Vite Build**: `npm run build` succeeds with zero bundle size warnings (>500 kB eliminated) and primary entry chunk < 450 kB
- **Android APK**: `./scripts/build-apk.sh` produces `dist-android/GSTBilling-Vyapar.apk` with verified v2/v3 signatures
