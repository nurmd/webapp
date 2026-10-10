# Vyapar Books PRO — Comprehensive Codebase & Architecture Guide

> **Target Audience:** Teamwork Multi-Agent Teams, SWE Implementers, Reviewers, and Auditors.  
> **Purpose:** Rapid onboarding, comprehensive mental model of system architecture, data flows, and non-negotiable invariants.

---

## 1. High-Level Overview & Tech Stack

**Vyapar Books PRO** is an offline-first GST billing, inventory management, point-of-sale (POS), and double-entry accounting application built for Indian SMEs, retail counters, and distributors.

### Technology Stack
- **Frontend / Runtime:** React 18, TypeScript 5.5, Vite 5.4, Tailwind CSS 3.4.
- **Persistence:** LocalStorage (fast key-value cache), IndexedDB (browser storage), and PouchDB 9.0 (CouchDB 2-way continuous cloud synchronization).
- **Security & Compliance:** Web Crypto API (SHA-256 chained MCA audit logs, PBKDF2 PIN hashing) and Role-Based Access Control (RBAC).
- **Cross-Platform Delivery:**
  - **Android:** Native WebView shell compiled via standalone Android build tools (`aapt2`, `kotlinc`, `d8`, `apksigner` with static keystore).
  - **PWA:** ServiceWorker offline caching, Web App Manifest, and Debian Nginx tarball distribution.
  - **Desktop (Planned / Scaffolding):** Tauri (Rust webview).

---

## 2. Directory Structure & Module Map

```
gst-billing-app/
├── AGENTS.md                  # Critical project invariants & engineering guardrails
├── CODEBASE_GUIDE.md          # This comprehensive guide
├── package.json               # Dependencies, scripts, and semver
├── public/                    # Static web assets (icons, manifest.json, sw.js, version.json)
├── android-native/            # Android native app shell & build tools
│   ├── app/src/main/assets/   # Bundled web assets synced for native offline runtime
│   ├── app/src/main/res/      # Android resource definitions & drawables
│   ├── keystore/              # Static release keystore (app-key.keystore)
│   └── build/                 # Staged compilation outputs
├── dist-android/              # Signed release APK (GSTBilling-Vyapar.apk) & SHA-256
├── dist-pwa/                  # Packaged PWA distribution archive (vyapar-pwa.tar.gz)
├── scripts/                   # Build, test, and release automation scripts
│   ├── build-apk.sh           # Standalone Android APK compilation and signing
│   ├── package-pwa.sh         # Production PWA packaging with checksums
│   └── generate-version.sh    # Syncs version.json & sw.js with package.json
└── src/
    ├── main.tsx               # Application bootstrap & DOM mount
    ├── App.tsx                # Master container, tab routing, lazy imports, modals
    ├── core/                  # Pure, zero-dependency domain engines
    │   ├── gst/               # GST calculator, validator (Luhn Mod-36), state codes
    │   ├── inventory/         # Stock decrement/increment engine & constraints
    │   ├── accounting/        # Double-entry ledger vouchers & daybook rules
    │   ├── security/          # RBAC roles & access permissions
    │   └── utils/             # Formatters (INR ₹, dates), number-to-words (Lakhs/Crores)
    ├── models/                # TypeScript data schemas & entity contracts
    │   ├── invoice.ts         # Invoice, InvoiceItemEntry, PaymentMode, PaymentStatus
    │   ├── party.ts           # Party (Customer/Supplier), balances, contact details
    │   ├── item.ts            # InventoryItem, StockAdjustment, units, pricing
    │   ├── purchase.ts        # PurchaseBill, PurchaseItemEntry, ITC eligibility
    │   ├── voucher.ts         # Voucher (Receipt, Payment, Journal, Contra), entries
    │   └── company.ts         # CompanyProfile, GSTIN, bank details, thermal settings
    ├── services/              # Stateful platform services & persistence
    │   ├── db.ts              # Primary storage coordinator & repository layer
    │   ├── pouchdb.ts         # PouchDB / CouchDB continuous 2-way sync
    │   ├── auditTrail.ts      # MCA-compliant SHA-256 tamper-evident audit logger
    │   ├── pinSecurity.ts     # Salted PIN hashing & user verification
    │   └── updateService.ts   # OTA updater & version checker
    ├── components/            # UI Views & Modal components
    │   ├── Dashboard/         # Executive metrics & quick-action cards
    │   ├── POS/               # QuickBillingView (1-tap POS counter & split payments)
    │   ├── Invoicing/         # TableGridInvoiceModal, CreateInvoiceModal, InvoicePrintModal
    │   ├── Inventory/         # InventoryView, ItemDetailSheet, ItemFormModal, adjustments
    │   ├── Parties/           # PartiesView, AddEditPartyModal, usePartyPassbook, VoucherEditorModal
    │   ├── Purchases/         # PurchasesHubView, TableGridPurchaseModal, SimplifiedPurchaseModal
    │   ├── Accounting/        # DaybookView, CashBankManagementView
    │   ├── Reports/           # BusinessReportsView, GSTR-1, GSTR-3B, Stock Summary
    │   ├── Settings/          # CompanySettingsView, ItemSettingsTab, PrintSettingsView
    │   └── Navigation/        # NavigationMenuHubView, BottomNav, TopHeader
    └── __tests__/             # Comprehensive Vitest integration & stress suites
```

---

## 3. Core Business Engines (`src/core/`)

### A. GST Engine (`src/core/gst/`)
- **`calculator.ts`**: Pure calculation of taxable value, CGST, SGST, IGST, Cess, and Half-Up round-off.
  - Determines **Intra-State vs Inter-State** by comparing company `stateCode` with party/POS `stateCode`.
  - Intra-State: Split equally (50/50) between CGST and SGST.
  - Inter-State: 100% IGST.
- **`validator.ts`**: Validates 15-character Indian GSTIN strings using regex and **Luhn Mod-36 checksum algorithm**.
- **`stateCodes.ts`**: Official master list of all 38 Indian State and Union Territory 2-digit GST codes.

### B. Inventory & Stock Engine (`src/core/inventory/stockEngine.ts`)
- **Centralized Stock Routing**: All stock changes (sales invoices, invoice edits, deletions, purchase bills, stock adjustments) MUST pass through `stockEngine.ts`.
- **Negative Stock Configuration**:
  - Controlled by `db.getAllowNegativeStock()` and `allowNegativeStock` parameter.
  - **When disabled (`false`)**: Decrement operations clamp available stock at `0` to prevent negative quantities.
  - **When enabled (`true`)**: Decrements drop past zero (e.g. `10 - 15 = -5`).

### C. Double-Entry Accounting & Ledger (`src/core/accounting/`, `src/components/Parties/usePartyPassbook.ts`)
- **Signed Party Balances**:
  - `TO_RECEIVE` / Customer receivable: Positive balance (`+`).
  - `TO_PAY` / Supplier payable / Customer advance: Negative balance (`-`).
- **Passbook Baseline Invariant**:
  - The `OPENING` transaction entry MUST ALWAYS be anchored at **index 0** as the starting baseline in the passbook ledger statement. Subsequent sales, purchases, and vouchers calculate running balances chronologically from this baseline.

### D. Audit Trail Engine (`src/services/auditTrail.ts`)
- Implements Indian Ministry of Corporate Affairs (MCA) audit trail mandates.
- Every create, update, or delete operation on invoices, bills, parties, vouchers, or settings emits an immutable log record.
- **Tamper-Evident Chaining**: Each record computes a SHA-256 hash incorporating the previous record's hash (`previousHash + timestamp + action + documentId + payload`), forming an unbroken cryptographic chain verifiable via `auditTrailService.verifyChainIntegrity()`.

### E. PIN Security & RBAC (`src/services/pinSecurity.ts`, `src/core/security/rbac.ts`)
- PBKDF2/SHA-256 salting for 4-digit staff PINs.
- Roles: `OWNER` (full access), `CASHIER` (sales POS, view items), `ACCOUNTANT` / `CA` (ledgers, reports, audit logs).

---

## 4. Data Persistence & Synchronization (`src/services/`)

### A. The Storage Service (`src/services/db.ts`)
The `StorageService` class (`db`) is the unified database facade:
- **Keys**: `invoices`, `parties`, `items`, `purchases`, `vouchers`, `expenses`, `bank_accounts`, `cash_bank_transactions`, `company_profile`, `synced_settings`.
- **Reactive Subscriptions**:
  - Components subscribe to changes via `db.subscribe(callback)`.
  - DB mutations broadcast changes across browser tabs via `BroadcastChannel('gst_billing_sync')`.
  - PouchDB changes from remote CouchDB instances trigger `db.applyRemoteDoc()`.

### B. Non-Destructive Entity Persistence Rule
> **CRITICAL INVARIANT:** Calling `db.saveParty(party)` or `db.saveItem(item)` with a partial record must **NEVER** strip existing baseline metadata.
- If incoming party omits `openingBalance`, `openingBalanceType`, or `openingBalanceDate`, existing values are strictly preserved.
- To intentionally remove an opening balance, call `db.clearPartyOpeningBalance(partyId)` or pass explicit `0`.

---

## 5. Key Presentation Flows & Navigation

### A. Invoice Generation
- **`TableGridInvoiceModal.tsx`**: Full-featured desktop/tablet tax invoicing with multi-item grid, tax breakdowns, HSN picker, and payment splits.
- **`QuickBillingView.tsx`**: High-speed retail POS counter mode with barcode scanning, quick cash tender calculator, dynamic UPI QR, and multi-tender splits.
- **Split Payments**: Pass resolved tender breakdown directly into checkout handlers to prevent asynchronous React state race conditions. Derive status as `PAID` (`totalPaid >= grandTotal`), `PARTIAL`, or `UNPAID`.

### B. Inventory Management
- **`InventoryView.tsx`**: Searchable, filterable stock catalog.
  - Search bar is **sticky / floating** (`sticky top-0 z-20`) for seamless search while scrolling.
  - Tokenized search: searches every word across name, SKU, barcode, and HSN.
  - Quick 1-tap **'X'** clear button on non-empty search.
- **`ItemDetailSheet.tsx`**: Displays live stock, pricing, and full transaction history.
  - Each sales transaction row links to `invoiceId` and opens the sales invoice preview.
  - Each purchase transaction row links to `purchaseId` and opens the purchase bill preview.
- **`ItemFormModal.tsx`**: Add/Edit item modal. Displays a real-time warning banner if the typed name already exists in the catalog (excluding the current item in edit mode).

---

## 6. Dynamic Code Splitting & Performance Architecture

To maintain instant boot times and meet APK memory constraints:
- **Lazy Unwrapping Contract in `App.tsx`**: Secondary views and modals are dynamically imported:
  ```typescript
  const TableGridInvoiceModal = React.lazy(() =>
    import('./components/Invoicing/TableGridInvoiceModal.tsx').then((m) => ({ default: m.TableGridInvoiceModal }))
  );
  ```
- **Entry Chunk Ceiling**: Main bundle (`index.js`) must strictly remain under **450 kB** uncompressed. Zero-CLS Suspense fallback skeletons are rendered during chunk loads.

---

## 7. Testing & Quality Assurance

All features must maintain 100% test coverage with zero regressions:
```bash
# Run full Vitest suite
npm test

# Run TypeScript compilation check
npx tsc --noEmit

# Run production build & verify bundle chunks
npm run build
```

### Key Test Suites (`src/__tests__/`)
- `gstCalculator.test.ts`: Tax calculation, interstate vs intrastate, round-off.
- `inventoryConstraints.test.ts`: Stock decrement, overselling clamping, `allowNegativeStock`.
- `customerOpeningBalanceLedger.test.tsx`: Opening balance preservation across invoice lifecycles.
- `itemEnhancements.test.tsx`: Duplicate item warning, transaction bill previews, floating search bar.
- `auditTrail.test.ts`: MCA audit log hashing, chain verification, tamper detection.
- `challenger2M5ApkPackageStress.test.ts`: APK signature, Android manifest, badging, version code.
- `challengerM5DynamicSplittingStress.test.tsx`: Chunk architecture & lazy unwrapping validation.

---

## 8. Release & Deployment Pipeline

Refer to [`.agents/skills/vyapar-release/SKILL.md`](file:///data/data/com.termux/files/home/gst-billing-app/.agents/skills/vyapar-release/SKILL.md) for detailed execution:
1. Bump version in `package.json` (e.g. `1.1.16`).
2. Update `challenger2M5ApkPackageStress.test.ts` versionCode (`X*10000 + Y*100 + Z`).
3. Run `bash scripts/generate-version.sh`.
4. Run `bash scripts/build-apk.sh` (produces signed `dist-android/GSTBilling-Vyapar.apk`).
5. Run `bash scripts/package-pwa.sh` (produces `dist-pwa/vyapar-pwa.tar.gz`).
6. Run `npm test && npx tsc --noEmit`.
7. Git commit, tag `vX.Y.Z`, push `master` and tag.
8. Upload release assets via `gh release`.
