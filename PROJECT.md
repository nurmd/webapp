# Project: GST Billing App Production Hardening & Architectural Remediation

## Architecture
The GST Billing App is undergoing an end-to-end production hardening and architectural remediation program based on the comprehensive audit report.
The architecture encompasses:
1. **Dynamic Code-Splitting & Core Bundle Layout**: Decoupling the monolithic entry bundle by isolating vendor libraries (`vendor-pouchdb`, `vendor-react`) via Vite Rollup `manualChunks` and lazily loading secondary views and modals with `React.lazy()` and `Suspense`, achieving a primary entry chunk < 450 kB (projected ~155 kB) with zero bundle size warnings.
2. **Automated Testing Safety Net (Vitest)**: Fast, modern test infrastructure using `vitest@^2.1.8` and `happy-dom@^15.7.4` covering statutory Indian GST calculation (CGST, SGST, IGST, cess, Section 170 nearest-rupee rounding), double-entry voucher balance with round-off equity (`ACC_ROUND_OFF`), multi-tender split payments, cash/bank running balance invariance, and inventory constraint immutability.
3. **Cryptographic PIN Security (RBAC)**: Hardware/browser native Web Crypto API (`crypto.subtle.digest` with SHA-256) utilizing 16-byte cryptographically random salts per user profile, constant-time verification, transparent startup migration from legacy plaintext PINs with zero lockout, persistent brute-force lockout with progressive backoff (30s, 60s, 300s), and Owner role enforcement for sensitive deletions.
4. **MCA-Compliant Immutable Audit Trail**: Append-only tamper-evident audit logging for financial mutations (invoices, purchases, payments, vouchers, stock adjustments) persisted to PouchDB (`vyapar_fintech_store`) and local cache with SHA-256 hash chaining, paired with a dedicated read-only Audit Log Viewer in Company Settings.
5. **Component Modularization**: Decomposing four monolithic components (`TableGridInvoiceModal`, `InventoryView`, `CompanySettingsView`, `PartyDetailPage`) totaling >7,700 lines into focused, cohesive subcomponents and unified sales/purchase modal dialogs, while strictly preserving 100% of keyboard shortcuts, hardware audio barcode scanning, and Android hardware back-navigation priorities (`useBackNavigation`).

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Vitest Test Runner Infrastructure | Setup `vitest@^2.1.8`, `happy-dom`, `vitest.config.ts`, and `"test": "vitest run"` in `package.json` | M1 | ORIGINAL_REQUEST R2 |
| 2 | Statutory GST Tax Calculation Test Suite | Comprehensive tests for intra-state (CGST+SGST), inter-state (IGST), percentage & per-unit Cess, and Section 170 rounding | M1 | ORIGINAL_REQUEST R2 |
| 3 | Double-Entry Voucher Round-Off Balancing Fix | Correct `createSalesInvoiceVoucher` to balance `roundOff` via `ACC_ROUND_OFF`, ensuring debits == credits | M1 | Survey 2 finding, R2 |
| 4 | Multi-Tender Split Payment Accounting | Double-entry voucher support for split payments across cash, bank, UPI, and customer credit | M1 | ORIGINAL_REQUEST R2 |
| 5 | Cash/Bank Running Balance Integrity Suite | Test suite verifying liquid balance invariance on contra transfers and voucher receipt deduplication | M1 | ORIGINAL_REQUEST R2 |
| 6 | Inventory Constraint & Historical Integrity Suite | Tests verifying `isItemInBills` deletion protection, disable filtering, stock lifecycle hooks, and snapshot immutability | M1 | ORIGINAL_REQUEST R2 |
| 7 | TypeScript Compilation Fix in db.ts | Fix TS2322 error at `src/services/db.ts:1047` (`line.unit as UnitOfMeasurement`) | M1 | Survey 3 finding, AC |
| 8 | Salted SHA-256 PIN Hashing (Web Crypto) | Replace plaintext PIN storage with 16-byte random salt and SHA-256 in `src/services/rbac.ts` | M2 | ORIGINAL_REQUEST R3 |
| 9 | Transparent Startup PIN Migration | Auto-upgrade legacy plaintext PIN profiles to salted hashes on launch with zero user lockout | M2 | ORIGINAL_REQUEST R3 |
| 10 | Persistent Brute-Force Lockout Defense | Track failed attempts in storage with progressive lockout delays (30s, 60s, 300s) and keypad lockdown | M2 | ORIGINAL_REQUEST R3 |
| 11 | Owner Role Enforcement on Sensitive Deletes | Enforce Owner role checks on purchase, expense, party, and settings deletions in `App.tsx` | M2 | Survey 3 finding, R3 |
| 12 | MCA-Compliant Immutable Audit Trail Service | Implement `src/services/auditTrail.ts` with SHA-256 tamper-evident hash chaining and PouchDB storage | M3 | ORIGINAL_REQUEST R4 |
| 13 | Financial Mutation Audit Lifecycle Hooks | Hook audit logging into `saveInvoice`, `deleteInvoice`, `savePurchase`, `deletePurchase`, `saveStockAdjustment`, `saveVoucher` in `db.ts` | M3 | ORIGINAL_REQUEST R4 |
| 14 | Read-Only Audit Log Viewer UI | Embed an `'audit'` tab in `CompanySettingsView` with date/user/action filters, diff view, and CSV/JSON export | M3 | ORIGINAL_REQUEST R4 |
| 15 | Decompose TableGridInvoice & Purchase Modals | Extract shared due date presets, bill discount, tax breakdown, barcode scanner hook, and payment settlement dock | M4 | ORIGINAL_REQUEST R5 |
| 16 | Decompose InventoryView | Extract ItemEditModal, StockAdjustmentModal, FilterSortModal, and ItemLedgerPassbook into modular subcomponents | M4 | ORIGINAL_REQUEST R5 |
| 17 | Decompose CompanySettingsView | Extract BusinessProfileForm, DevicePairingSection, StatutoryDrawers, and PrintConfigSection | M4 | ORIGINAL_REQUEST R5 |
| 18 | Decompose PartyDetailPage | Extract `usePartyPassbook` hook, RecordPaymentModal, VoucherEditorModal, and PartyDetailsDrawer | M4 | ORIGINAL_REQUEST R5 |
| 19 | Dynamic Code-Splitting via React.lazy & Suspense | Lazy-load secondary views and modals in `src/App.tsx` with skeleton/spinner fallbacks | M5 | ORIGINAL_REQUEST R1 |
| 20 | Vite Bundle Optimization & Chunk Splitting | Configure `manualChunks` in `vite.config.ts` (`vendor-pouchdb`, `vendor-react`), primary entry < 450 kB, zero warnings | M5 | ORIGINAL_REQUEST R1 |
| 21 | Android Native APK Build & Package Verification | Run `./scripts/build-apk.sh`, build `GSTBilling-Vyapar.apk`, verify v2/v3 signatures with `apksigner` | M6 | ORIGINAL_REQUEST AC |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Vitest Test Infrastructure & Core Accounting/GST Coverage | Setup Vitest 2.1.8, happy-dom, test scripts, fix db.ts:1047 TS error, implement 7 core test suites (84 tests), fix voucher roundOff balancing | None | IN_PROGRESS |
| M2 | Cryptographic PIN Security Hardening | Salted SHA-256 Web Crypto in `rbac.ts`, transparent migration, lockout backoff, Owner role enforcement | M1 | PLANNED |
| M3 | MCA-Compliant Immutable Audit Trail | `auditTrail.ts` service with SHA-256 chaining, `db.ts` mutation hooks, read-only Audit Log Viewer in Settings | M1, M2 | PLANNED |
| M4 | Component Modularization & Architecture Cleanup | Decompose TableGridInvoiceModal, TableGridPurchaseModal, InventoryView, CompanySettingsView, PartyDetailPage | M1, M3 | PLANNED |
| M5 | Dynamic Code-Splitting & Bundle Optimization | `vite.config.ts` manualChunks, `React.lazy`/`Suspense` in `App.tsx`, entry chunk < 450 kB, zero warnings | M4 | PLANNED |
| M6 | Final Milestone: Full Verification & Android APK Build | 100% Vitest pass, 0 tsc errors, clean vite build, verified Android APK release build | M1, M2, M3, M4, M5 | PLANNED |

---

## Interface Contracts

### 1. Cryptographic RBAC Security Contract (`src/services/rbac.ts`)
```typescript
export interface UserProfile {
  id: string;
  name: string;
  role: UserRole;
  pinHash?: string; // 64-char hex SHA-256 of (salt + pin)
  pinSalt?: string; // 32-char hex (16 cryptographically random bytes)
  createdAt: string;
  lastLogin?: string;
}

export interface LockoutState {
  failedAttempts: number;
  lockedUntil?: number; // timestamp in ms
}

export class RbacService {
  public async verifyPin(userId: string, enteredPin: string): Promise<boolean>;
  public async setPin(userId: string, newPin: string): Promise<void>;
  public isUserLockedOut(userId: string): { isLocked: boolean; remainingSeconds: number };
  public recordFailedAttempt(userId: string): { locked: boolean; lockDurationSeconds: number };
  public resetFailedAttempts(userId: string): void;
  public async migrateLegacyPins(): Promise<void>;
}
```

### 2. MCA-Compliant Immutable Audit Trail Contract (`src/services/auditTrail.ts`)
```typescript
export type AuditActionType =
  | 'INVOICE_CREATE' | 'INVOICE_UPDATE' | 'INVOICE_DELETE' | 'INVOICE_CANCEL'
  | 'PURCHASE_CREATE' | 'PURCHASE_UPDATE' | 'PURCHASE_DELETE'
  | 'PAYMENT_RECORD' | 'STOCK_ADJUSTMENT' | 'VOUCHER_CREATE' | 'VOUCHER_DELETE'
  | 'SETTINGS_UPDATE';

export interface AuditRecord {
  id: string; // "audit_" + timestamp + "_" + randomHex
  sequence: number; // sequential increment
  timestamp: string; // ISO 8601
  userId: string;
  userName: string;
  userRole: UserRole;
  actionType: AuditActionType;
  documentId: string;
  documentType: 'INVOICE' | 'PURCHASE' | 'PAYMENT' | 'ITEM' | 'VOUCHER' | 'SETTINGS';
  previousSnapshot?: Record<string, any>;
  newSnapshot?: Record<string, any>;
  summary: string;
  previousHash: string; // SHA-256 of previous record
  recordHash: string;   // SHA-256 of (previousHash + sequence + timestamp + userId + actionType + documentId + payload)
}

export interface AuditVerificationResult {
  valid: boolean;
  totalRecords: number;
  corruptedRecordId?: string;
  reason?: string;
}

export class AuditTrailService {
  public async logEvent(entry: Omit<AuditRecord, 'id' | 'sequence' | 'previousHash' | 'recordHash'>): Promise<AuditRecord>;
  public async getAuditTrail(filter?: {
    startDate?: string;
    endDate?: string;
    userId?: string;
    actionType?: AuditActionType;
    documentId?: string;
  }): Promise<AuditRecord[]>;
  public async verifyChainIntegrity(): Promise<AuditVerificationResult>;
}
```

### 3. Double-Entry Voucher Round-Off & Split Payment Contract (`src/core/accounting/ledger.ts`)
```typescript
export interface CreateSalesInvoiceVoucherParams {
  invoiceId: string;
  invoiceNumber: string;
  date: string;
  customerId: string;
  customerName: string;
  grandTotal: number;
  taxableAmount: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  cessAmount?: number;
  roundOff?: number; // Section 170 rounding adjustment
  isCashSale?: boolean;
  paymentSplits?: { mode: 'CASH' | 'BANK' | 'UPI' | 'CREDIT'; amount: number }[];
}
```

### 4. Code-Splitting Layout Contract (`src/App.tsx` & `vite.config.ts`)
```typescript
// Lazy Views
const DashboardView = React.lazy(() => import('./components/Dashboard/DashboardView'));
const SalesHubView = React.lazy(() => import('./components/Sales/SalesHubView'));
const PurchasesHubView = React.lazy(() => import('./components/Purchases/PurchasesHubView'));
const InventoryView = React.lazy(() => import('./components/Inventory/InventoryView'));
const PartiesView = React.lazy(() => import('./components/Parties/PartiesView'));
const BusinessReportsView = React.lazy(() => import('./components/Reports/BusinessReportsView'));
const DaybookView = React.lazy(() => import('./components/Accounting/DaybookView'));
const CashBankManagementView = React.lazy(() => import('./components/Accounting/CashBankManagementView'));
const CompanySettingsView = React.lazy(() => import('./components/Settings/CompanySettingsView'));
const PrintSettingsView = React.lazy(() => import('./components/Settings/PrintSettingsView'));

// Lazy Modals
const TableGridInvoiceModal = React.lazy(() => import('./components/Sales/TableGridInvoiceModal'));
const TableGridPurchaseModal = React.lazy(() => import('./components/Purchases/TableGridPurchaseModal'));
const ThermalPrintModal = React.lazy(() => import('./components/ThermalPrintModal'));
const RoleSwitchModal = React.lazy(() => import('./components/Auth/RoleSwitchModal'));
```

---

## Code Layout
- `vitest.config.ts`: Vitest runner configuration with happy-dom environment and path aliases
- `src/__tests__/`: Automated test suites:
  - `gstCalculator.test.ts`: Intra/inter-state, cess, rounding tests
  - `doubleEntryLedger.test.ts`: Balanced debit/credit vouchers, round-off, split payment tests
  - `cashBankRunningBalance.test.ts`: Inflows, outflows, contra transfers, deduplication tests
  - `inventoryConstraints.test.ts`: `isItemInBills`, disable filters, stock rollbacks, snapshots
  - `pinSecurity.test.ts`: Salted SHA-256, migration, brute-force lockout tests
  - `auditTrail.test.ts`: Append-only logging, hash chain integrity verification tests
- `src/services/rbac.ts`: Web Crypto salted SHA-256 PIN authentication & brute-force protection
- `src/services/auditTrail.ts`: Append-only MCA audit trail service with PouchDB & hash chaining
- `src/services/db.ts`: StorageService with fixed TypeScript types and audit logging mutation hooks
- `src/components/Settings/CompanySettingsView.tsx`: Modular settings with embedded `'audit'` tab
- `src/components/Audit/AuditLogView.tsx`: Read-only MCA audit log viewer component
- `src/components/Sales/TableGridInvoiceModal.tsx` & subcomponents: Modular invoice billing modal
- `src/components/Purchases/TableGridPurchaseModal.tsx` & subcomponents: Modular purchase billing modal
- `src/components/Inventory/InventoryView.tsx` & subcomponents: Modular catalog & stock view
- `src/components/Parties/PartyDetailPage.tsx` & subcomponents: Modular party passbook & ledger page
- `src/App.tsx`: Dynamic code-splitting with `React.lazy` and `Suspense` fallbacks
- `vite.config.ts`: Rollup `manualChunks` optimization ensuring primary entry chunk < 450 kB
- `scripts/build-apk.sh`: Android native build toolchain compiling APK
