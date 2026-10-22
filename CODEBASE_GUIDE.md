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
    │   ├── party.ts           # Party (Customer/Supplier), balances, contact details, PartyGroup, PartyCategory
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
    │   ├── Challans/          # DeliveryChallansView (Rule 55 goods transport & 1-tap conversion)
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
- **Delivery Challan & Non-Sale Documents**: Delivery Challans (Rule 55), Quotations/Estimates, and Sales Orders are strictly non-sale documents. Saving or deleting them bypasses inventory stock adjustments and party ledger postings. Stock decrements and receivable balances are only posted when the document is converted into a Tax Invoice.
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
The `StorageService` class (`db`) is the unified database facade composing focused domain storages:
- **Keys**: `invoices`, `parties`, `items`, `purchases`, `vouchers`, `expenses`, `bank_accounts`, `cash_bank_transactions`, `company_profile`, `synced_settings`.
- **Reactive Subscriptions**:
  - Components subscribe to changes via `db.subscribe(callback)`.
  - DB mutations broadcast changes across browser tabs via `BroadcastChannel('gst_billing_sync')`.
  - PouchDB changes from remote CouchDB instances trigger `db.applyRemoteDoc()`.

### B. Distributed Sync & Revision Handling (`src/services/pouchdb.ts`, `src/services/db/syncStorage.ts`)
- **PouchDB `_rev` Conflict Detection**:
  - Abolished clock-skewed last-write-wins (`updatedAt` comparison) for financial documents.
  - Financial records (`invoice`, `purchase`, `voucher`, `expense`, `bank_account`, `cash_bank_txn`, `loan`, `loan_txn`) that undergo concurrent mutations on multiple devices are preserved and enqueued in an operator-visible **Revision Conflict Queue** instead of silently overwriting local unsynced edits.
  - HTTP 409 Put Conflicts: `putDoc()` compares content divergence (`isDocDivergent`); if divergent, it captures both revisions into explicit conflict state rather than performing blind overwrites.
- **Replicated Tombstones**:
  - Deletions are persisted across devices using replicated tombstone documents (`_id: 'tombstone:${type}:${id}'`, `docType: 'tombstone'`, `deletedAt: ISOString`).
  - `syncAllFromPouch()` consumes remote tombstones via `getAllTombstones()`, ensuring remote deletions are respected locally and never resurrected during sync handshakes.
  - Local domain stores (`invoicePurchaseStorage`, `partyStorage`, `itemStorage`, `financialStorage`) clear tombstones on save and record tombstones on delete.

### C. Ledger Reversals & Double-Entry Integrity (`src/core/accounting/`, `src/services/db/reconcileAndRepair.ts`)
- **No Hard-Deletes of Posted Vouchers**:
  - Deleting an invoice or purchase bill NEVER purges historical accounting vouchers.
  - Instead, the system posts an automated Contra/Reversal Journal Voucher (`VCH-REV-SAL-*` / `VCH-REV-PUR-*`) with debits and credits exactly swapped, referencing the original voucher ID, and marks the original voucher `isReversed: true`.
  - The books net out to exactly zero while preserving an unbroken statutory CARO 2020 / MCA audit trail.
- **Quote & Order Accounting Isolation**:
  - Documents of type `ESTIMATE`, `SALES_ORDER`, `DELIVERY_CHALLAN`, and purchase orders (`PO`) are purely commercial/operational records and are strictly isolated from accounting voucher generation.
- **Passbook Single-Engine Stock Routing**:
  - Passbook and ledger deletion flows delegate exclusively to `db.deleteInvoice()` and `db.deletePurchase()`, preventing double-decrement/increment bugs.
- **Idempotent Reconciliation & Repair Tool (`reconcileAndRepair.ts`)**:
  - Gated by mandatory restorable pre-migration backup snapshot (`preMigrationBackup.ts`). Aborts immediately if the backup cannot be cryptographically verified.
  - Scans and consolidates duplicate vouchers from repeat edits, reverses orphan vouchers referencing deleted documents, prunes invalid estimate vouchers, realigns stock discrepancies, and resynchronizes party balances.
  - Strictly idempotent across repeated executions.

### D. Split-Bank Architecture & Tender Routing (`paymentSplitUtils.ts`, `ledger.ts`, `cashBankCalculator.ts`)
- **Multi-Bank Account Allocation**:
  - `PaymentSplit` supports optional `accountId`, `accountName`, `reference`, and `referenceNo` metadata.
  - Multi-tender splits (UPI, CARD, BANK, CHEQUE, NET_BANKING) route directly to the designated bank account selected by the user, rather than defaulting globally to `ACC_BANK`.
  - Cash portions route to `ACC_CASH` (`Cash-in-hand`).
  - `resolveAccountForSplit()` provides pure domain account resolution with default bank fallback.
- **Centralized Payment Status & Settlement Invariant (`derivePaymentSettlement`)**:
  - Derives payment status and amounts synchronously in `saveInvoice()` and `savePurchase()`:
    - `PAID`: `totalPaid >= grandTotal`
    - `PARTIAL`: `0 < totalPaid < grandTotal`
    - `UNPAID`: `totalPaid <= 0` or single `CREDIT` tender.
  - Never trusts caller-supplied `CASH` mode if payment is unpaid.
  - Clamps overpayment so `paidAmount <= grandTotal` and deducts excess from cash splits to prevent business cash inflation by returned customer change.
  - Preserves tender breakdown in `paymentSplits` and audit notes.

### E. Idempotent Legacy Payment Split Migration (`migrateLegacySplits.ts`)
- **Safe & Gated Migration**:
  - Gated by mandatory pre-migration backup snapshot (`preMigrationBackup.ts`).
  - Scans legacy invoices and purchase bills containing old notes-based splits or single-tender records.
  - Fills missing `accountId` and `accountName` using the active primary bank account for bank tenders and `ACC_CASH` for cash.
  - Strictly idempotent: does not rewrite or duplicate splits that already have `accountId`.
  - Integrated into `reconcileAndRepairLedgerAndInventory()`.

### F. Non-Destructive Entity Persistence Rule
> **CRITICAL INVARIANT:** Calling `db.saveParty(party)` or `db.saveItem(item)` with a partial record must **NEVER** strip existing baseline metadata.
- If incoming party omits `openingBalance`, `openingBalanceType`, or `openingBalanceDate`, existing values are strictly preserved.
- To intentionally remove an opening balance, call `db.clearPartyOpeningBalance(partyId)` or pass explicit `0`.

### G. Permissionless Backup & Disaster Recovery Architecture (`backupRestoreStorage.ts`, `preMigrationBackup.ts`, `DatabaseBackupModal.tsx`)
- **Android Permissionless Storage Operations**:
  - Zero storage permissions declared or requested: no `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `MANAGE_EXTERNAL_STORAGE`, or legacy storage flags.
  - Export on Android 10+ (API 29+) writes directly to `Download/GSTBilling` via compile-safe reflection on `MediaStore.Downloads` without storage permissions; falls back to SAF `ACTION_CREATE_DOCUMENT` on earlier versions or upon error. Completely permissionless.
  - Import / restore uses native WebView `<input type="file">` triggering `WebChromeClient.onShowFileChooser` (SAF), requiring zero permissions.
  - Web & PWA environments leverage `showSaveFilePicker` / `showOpenFilePicker` with standard blob download fallbacks.
- **PouchDB Durability & Strict Write Invariant**:
  - `restoreDatabaseBackup()` guarantees durability against offline PouchDB sync resurrection:
    - In `REPLACE` mode, reads all existing docs in PouchDB per entity type and executes `deleteDocStrict()` with tombstone generation for every stale ID not present in the incoming bundle.
    - All final documents, company profile, and settings are written with strict awaited PouchDB operations (`putDocStrict()`).
    - 409 conflict resolution: explicitly re-reads latest `_rev` and overwrites it so restore state always wins.
    - If any PouchDB write rejects, the operation rolls back local storage and PouchDB to the pre-restore snapshot and rethrows. Never reports false success.
- **Pre-Restore Safety Snapshot & Rollback**:
  - Before mutating any data during restore, `DatabaseBackupModal` executes `createAndVerifyPreMigrationBackup(snapshotId)`.
  - If restore encounters an error, the UI displays an actionable Rollback button to instantly revert via `restorePreMigrationBackup(snapshotId)`.
  - Immutable audit trail is preserved on device: restore appends an audit event recording the restore mode, timestamp, and entity counts without clobbering existing local audit history.
- **Dynamic App Versioning**:
  - Backups dynamically resolve `appVersion` from `package.json` rather than hardcoding version strings.

### H. Party Groups & Categories Domain Architecture
- **Data Models (`src/models/party.ts`)**:
  - `PartyGroup` & `PartyCategory`: User-defined classification entities (`id`, `name`, `color`, `description`, `createdAt`, `updatedAt`).
  - `Party`: Includes optional `groupId?: string` and `categoryId?: string` references.
- **Persistence & Storage Keys (`src/services/db/storageEngine.ts`, `src/services/db/partyStorage.ts`)**:
  - Stored under `gst_party_groups` (`STORAGE_KEYS.PARTY_GROUPS`) and `gst_party_categories` (`STORAGE_KEYS.PARTY_CATEGORIES`).
  - `PartyStorage` provides validated CRUD (`savePartyGroup`, `deletePartyGroup`, `savePartyCategory`, `deletePartyCategory`) enforcing trimmed non-empty names and case-insensitive uniqueness.
  - Partial updates via `db.saveParty` merge and strictly preserve existing `groupId` and `categoryId` unless explicitly passed.
  - Deleting a group or category unassigns references from affected parties (`groupId: undefined` / `categoryId: undefined`) with updated timestamp; parties are never deleted.
- **Sync & Backup Resilience (`src/services/db/syncStorage.ts`, `src/services/db/backupRestoreStorage.ts`)**:
  - Included in PouchDB sync reconciliation, real-time incoming changes (`applyIncomingChange`), and cross-tab BroadcastChannel mutations (`applyLocalEntityMutation`).
  - Centralized dangling reference pruning (`pruneDanglingPartyReferences`) cleans unassigned references during local deletion, incoming changes, and full sync reconciliation.
  - Full round-trip backup/restore with backward compatibility for legacy backups omitting group/category collections.
- **Reactive State & UI Integration (`src/core/store/useDataStore.ts`, `src/components/Parties/`)**:
  - `usePartyGroups()` and `usePartyCategories()` hooks provide selective reactive updates via `useSyncExternalStore`.
  - `PartiesView`: Includes "Groups & Categories" management launcher, Group and Category filter dropdowns with auto-reset for stale IDs, and search token matching on group/category names.
  - `PartyGroupsCategoriesModal`: Tabbed palette editor for groups and categories with duplicate name validation and RBAC deletion protection (`rbac.canDeleteParty()`).
  - `AddEditPartyModal`: Live group and category assignment dropdowns with "Unassigned" default and "Party Type" classification.

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

### C. Parties & Ledger Architecture (`PartyDetailPage.tsx`)
- **Responsive Layout**:
  - **Tablet & Wide (`md:` and above)**: Split into non-scrolling Left Column (fixed Party Info Card, Record Payment, New Invoice / New Bill) and Right Column (Transaction Ledger table).
  - **Mobile (`< md`)**:
    - Full Party Info Card in natural document flow.
    - Sticky party name topbar automatically slides out of view on scroll (`-translate-y-full opacity-0 pointer-events-none`).
    - Floating compact card (with back button, party avatar, name, and live balance) slides down into `top-1.5` (`z-30`) to replace the topbar.
    - Zero-height anchor wrapper (`h-0 overflow-visible pointer-events-none`) prevents ghost vertical spacing above the balance card.
    - Scroll hysteresis: activates at `scrollTop > 80px`, deactivates only when scrolling back to `< 40px`.
    - Bound to `#main-content-scroll` scroll events.

### D. Settings Hub & Overhaul (`CompanySettingsView.tsx`)
- Responsive split-pane Hub with vertical navigation sidebar on desktop (`md:`) and stacked view on mobile:
  1. Business Profile (Company details, GST & Tax compliance, Composition scheme toggle)
  2. Billing & Invoices (Prefixes, numbering, payment QR, default print format)
  3. Inventory & Items (Negative stock allow toggle, buy price visibility)
  4. Hardware & Printing (Thermal 58mm/80mm, margins, auto-cut)
  5. App Preferences (Language, theme, app lock, OTA updates)
  6. Data & Sync (Cloud sync, multi-device pairing, import/export)
  7. Security & Audit (Immutable SHA-256 MCA audit trail)

---

## 6. App Shell & Detached Scroll Architecture

To prevent sticky headers and modal backdrops from scrolling behind the topbar:
- **Detached Shell in `App.tsx`**:
  - Root container: `h-screen h-[100dvh] overflow-hidden flex flex-row`.
  - Global `<Header />`: Fixed outside the scroll hierarchy (`flex-shrink-0 z-30`).
  - Scroll container: `<main id="main-content-scroll" className="flex-1 min-h-0 w-full overflow-y-auto pb-24 md:pb-8 overscroll-contain">`.
- **Responsive Dual-Tier Navigation Shell**:
  - Tablet & Desktop (`md:` and above) mount the persistent, collapsible `<TabletSidebar />` providing direct 1-tap access to all primary domain hubs (Dashboard, Sales, Purchases, Orders, Returns, Parties, Inventory, Finance, Reports, Print Settings, and Settings).
  - Mobile viewports utilize `<BottomNav />` paired with the primary `<NavigationMenuHubView />` (More hub).
  - The legacy mobile slide-out `<Drawer />` is **no longer mounted** in the application shell.
  - **POS & Create Sale Bill Isolation**: To avoid duplication and preserve intentional workflow hierarchy, inline POS and Create Sale Bill shortcuts are omitted from both `TabletSidebar` and `NavigationMenuHubView`; creation flows remain anchored to Dashboard quick actions, Header controls, and mobile BottomNav.
  - `<Header />` provides always-visible `grid_view` (More hub) and `settings` (Settings gear) shortcuts, enabling instant 1-tap navigation across all form factors.
  - Quick action controls (`+ New Bill`, `qr_code_scanner`, Search `⌘K`, User Profile) remain in `<Header />`.
  - **More Hub (`NavigationMenuHubView`) Redesign**:
    - Acts as the primary navigational directory for all core business hubs (Overview/Dashboard, Sales, Purchases, Parties, Inventory, Accounting, Reports, Settings, Print Settings).
    - Features a dedicated Overview category pill and direct Dashboard card.
    - Features a Settings gear shortcut on the merchant card and categorized Settings links.
- **Dynamic Code Splitting & Performance Architecture**:
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
- `splitBankArchitectureAndMigration.test.ts`: Split-bank tender routing, metadata persistence, overpayment clamping, legacy migration idempotency.
- `ledgerReversalsAndRepair.test.ts`: Double-entry reversals, repair engine, non-hard-delete RCM vouchers, pre-migration backup verification.
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
1. Bump version in `package.json` (e.g. `1.1.27`).
2. Update `challenger2M5ApkPackageStress.test.ts` versionCode (`X*10000 + Y*100 + Z`).
3. Run `./scripts/generate-version.sh` (extracts recent git commit subjects into `public/version.json`).
4. Run `./scripts/build-apk.sh` (produces signed `dist-android/GSTBilling-Vyapar.apk` and mirrors to `~/storage/downloads/`).
5. Run `./scripts/package-pwa.sh` (produces `dist-pwa/vyapar-pwa.tar.gz`).
6. Run `npx tsc --noEmit && npm test` (all 25 suites must pass 100% green).
   > **Note**: Building the APK before testing ensures that all Vite code-split chunks in `dist/assets/` match the packaged APK archive for `challenger2M5ApkPackageStress.test.ts`.
7. Git commit, tag `vX.Y.Z`, push `master` and tag.
8. Upload release assets via `gh release upload`.

