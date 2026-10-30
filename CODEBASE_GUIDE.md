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
    │   ├── settings/          # Dashboard quick-action catalog & normalization
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
    │   ├── conflictManifest.ts # Read-only conflict review manifest/backup builder
    │   ├── conflictDiff.ts    # Conflict field diffing and sensitive-value redaction
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
- **`pricing.ts`**: Bidirectional synchronization between GST-exclusive rates and GST-inclusive rates (`exclusiveFromInclusive`, `inclusiveFromExclusive`).
  - Supports `priceMode` (`'EXCLUSIVE' | 'INCLUSIVE'`).
  - Inclusive rate covers GST only; CESS is added on top.
  - Discount base follows the active price mode.
- **`calculator.ts`**: Pure calculation of taxable value, CGST, SGST, IGST, Cess, and Half-Up round-off.
  - Determines **Intra-State vs Inter-State** by comparing company `stateCode` with party/POS `stateCode`.
  - Intra-State: Split equally (50/50) between CGST and SGST.
  - Inter-State: 100% IGST.
- **`validator.ts`**: Validates 15-character Indian GSTIN strings using regex and **Luhn Mod-36 checksum algorithm**.
- **`stateCodes.ts`**: Official master list of all 38 Indian State and Union Territory 2-digit GST codes.

### B. Inventory & Stock Engine (`src/core/inventory/stockEngine.ts`)
- **Centralized Stock Routing**: All stock changes (sales invoices, invoice edits, deletions, purchase bills, stock adjustments) MUST pass through `stockEngine.ts`.
- **Delivery Challan & Non-Sale Documents**: Delivery Challans (Rule 55), Quotations/Estimates, and Sales Orders are strictly non-sale documents. Saving or deleting them bypasses inventory stock adjustments and party ledger postings. Stock decrements and receivable balances are only posted when the document is converted into a Tax Invoice.
- **Purchase Challan (Goods Receipt Note / GRN Mode)**: Inward Purchase Challans (`purchaseType === 'CHALLAN'`) immediately increment physical inventory stock upon goods receipt. They strictly do NOT post accounts payable to the supplier ledger (vendor payable balance remains unchanged). When converted into a Purchase Bill via 1-tap conversion, the resulting bill records the supplier payable liability and double-entry accounting vouchers while skipping duplicate stock incrementation (since stock was already received on the challan). Cancelling or deleting an unconverted Purchase Challan decrements/reverts the received stock without affecting vendor ledger balances. Deleting a converted bill preserves the physical stock brought in by the source challan.
- **Negative Stock Configuration**:
  - Controlled by `db.getAllowNegativeStock()` and `allowNegativeStock` parameter.
  - **When disabled (`false`)**: Decrement operations clamp available stock at `0` to prevent negative quantities.
  - **When enabled (`true`)**: Decrements drop past zero (e.g. `10 - 15 = -5`).

### C. Double-Entry Accounting & Ledger (`src/core/accounting/`, `src/components/Parties/usePartyPassbook.ts`, `src/core/utils/systemParties.ts`)
- **Signed Party Balances**:
  - `TO_RECEIVE` / Customer receivable: Positive balance (`+`).
  - `TO_PAY` / Supplier payable / Customer advance: Negative balance (`-`).
- **Passbook Baseline Invariant**:
  - The `OPENING` transaction entry MUST ALWAYS be anchored at **index 0** as the starting baseline in the passbook ledger statement. Subsequent sales, purchases, and vouchers calculate running balances chronologically from this baseline.
- **System Walk-in Customer Invariant (`systemParties.ts`)**:
  - Canonical system party `SYSTEM_WALK_IN_PARTY_ID = 'CUSTOM_PARTY'`, `name: 'Walk-in Customer'`.
  - Pure virtual balance aggregation (`computeWalkInVirtualBalance`): dynamically aggregates unpaid, non-cancelled retail invoices matching historical walk-in variants without DB migrations.
  - Pinned at index 0 of Customers list with `isSystem: true` and a dedicated `System` badge.
  - Read-only profile: Edit and Delete buttons are strictly hidden; hard-coded deletion guard protects against programmatic deletion.
  - POS Integration: In `SelectPosPartyModal`, selecting the default counter row selects this canonical system party; duplicate walk-in records in the registered customer list are filtered out.

### D. Audit Trail Engine (`src/services/auditTrail.ts`)
- Implements Indian Ministry of Corporate Affairs (MCA) audit trail mandates (Companies (Accounts) Rules, 2014 Rule 3(1)).
- Every create, update, or delete operation on invoices, bills, parties, vouchers, or settings emits an immutable log record.
- **Tamper-Evident Chaining**: Each record computes a SHA-256 hash incorporating the previous record's hash (`previousHash + timestamp + action + documentId + payload`), forming an unbroken cryptographic chain.
- **Audit Epoch Architecture**:
  - **Legacy Archive (`epoch` absent or 1)**: Historical records are permanently preserved byte-for-byte without mutation, deletion, or backfilled epoch tags. Legacy chain diagnostics are isolated via `auditTrail.verifyLegacyChain()`.
  - **Current Epoch (`epoch: 2`)**: All new mutations start cleanly in Epoch 2 at `sequence: 1` anchored to `GENESIS_PREVIOUS_HASH` (64 zeros). Sequencing and previousHash links only consider current epoch records.
  - **Independent Verification**: `auditTrail.verifyCurrentEpoch()` cryptographically verifies Epoch 2 from genesis to sequence $N$ independently of legacy chain defects. `verifyChainIntegrity()` provides backward-compatible dispatch.
  - **UI Scope & Notices**: `AuditLogView` defaults to the **Current Epoch** scope with an amber/neutral notice indicating the preserved legacy record count (`Legacy archive: X records preserved`), while suppressing false-positive integrity banners on legacy records. Scope selector allows toggling between Current, Legacy (with `Legacy` badges), and All.
  - **Statutory Exports**: CSV and JSON statutory exports explicitly include `epoch` and `epochStatus` (`Current` vs `Legacy`) for complete regulatory traceability.

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
- **Remote URL Safety & Persistence**:
  - User-configured CouchDB URLs are never auto-deleted, regardless of host or database name. A sync link must survive app updates and browser-storage resets.
  - The link is stored redundantly in `localStorage`, Android SharedPreferences (`AndroidBridge.get/set/removePreference`), and a local-only PouchDB doc (`_local/sync_remote_url`, never replicated). Full backups also carry an optional `syncRemoteUrl`.
  - The service worker (`public/sw.js`) bypasses cross-origin traffic and CouchDB/PouchDB endpoints (`_changes`, `_all_docs`, `_bulk_docs`, `_bulk_get`, `_revs_diff`, `_local`, `_find`, `_design`, `_session`). Replication responses are never cached, and responses to requests carrying `Authorization` are never persisted.
- **Sync Push Path Hardening & Error Latch Isolation**:
  - `createRemoteDB()` strips inline credentials from the target database URL and passes authentication cleanly via `opts.auth` (with percent-decoded username and password), avoiding Fetch API `Request cannot be constructed from a URL that includes credentials` errors and handling complex special characters (e.g. `:` and `@`) in passwords.
  - Independent `pushError` and `pullError` tracking decouples replication legs. Push permission denials (403/401) or pull failures surface without latching permanently into `status: 'error'`, and transient errors auto-recover to `synced`/`syncing` as soon as healthy replication reaches idle `paused(null)`.
  - Background database writes (`partyStorage`, `itemStorage`, `financialStorage`, `settingsStorage`, `invoicePurchaseStorage`) attach `.catch()` handlers to all asynchronous `putDoc` and `deleteDoc` background promises so disk/quota or put-conflict errors surface in `syncState` without triggering unhandled promise rejections.
  - Initial `PouchService` auto-start is deferred via `setTimeout` to guarantee `StorageService` finishes instantiation and hydration before replication commences.
  - `startSync()` is asynchronous, dedupes concurrent calls from online, visibility, and UI events, and verifies `shouldSync()` before initiating replication.
- **Multi-Database Isolation & Company Switching**:
  - Eliminates single-database cross-contamination by creating dedicated, partitioned local PouchDB databases:
    - Default local store: `vyapar_fintech_store` (active in offline mode or fresh installs).
    - Dedicated demo sandbox: `vyapar_demo` (isolated testing sandbox; sync is strictly disabled).
    - Per-remote databases: `vyapar_remote_<sanitizedPath>_<fnv1aHex>` (e.g. `vyapar_remote_vyapar_prod_4a12bc90`), uniquely mapped via FNV-1a hash to the remote CouchDB endpoint.
  - `determineActiveLocalDbName()` resolves active local database priority at startup:
    1. If `pouch.isDemoMode()` is set -> `vyapar_demo`.
    2. Authoritative `gst_active_local_db` from `localStorage` (if set and non-empty).
    3. Saved remote URL (read synchronously from `localStorage` or fallback to Android SharedPreferences `AndroidBridge.getPreference('couchdb_remote_url')`) -> maps to `vyapar_remote_*`.
    4. Default -> `vyapar_fintech_store`.
  - Persists derived `gst_active_local_db` to `localStorage` at startup.
  - `shouldSync()` enforces that the active DB matches `getPerRemoteDbName(savedUrl)` and is not demo mode, preventing URL/registry mismatch from ever replicating into an unintended database.
  - Multi-DB switching helpers (`activateLocalDatabase()`, `switchToRemoteDb()`, `switchToOfflineDb()`, and `enterDemoMode()`) maintain a registry `gst_local_databases` (`LocalDatabaseEntry[]`) and reload the UI.
  - `SyncStorage` hydration detects DB changes (`if (lastHydratedDb !== activeDb)`) and clears local memory/synced data keys (`STORAGE_KEYS.TOMBSTONES` (`gst_sync_tombstones`), `STORAGE_KEYS.CONFLICTS`, entity collections, and `STORAGE_KEYS.SETTINGS` (`gst_app_settings`, preserving device-local printing and privacy settings)).
  - `loadDemoData()` strictly enforces: `if (!pouch.isDemoMode()) { throw new Error('Demo data can only be loaded in the isolated demo database. Use the demo-mode switch first.'); }` (saved remote URL remains intact while demo mode is active).
- **Replicated Tombstones**:
  - Deletions are persisted across devices using replicated tombstone documents (`_id: 'tombstone:${type}:${id}'`, `docType: 'tombstone'`, `deletedAt: ISOString`).
  - `syncAllFromPouch()` consumes remote tombstones via `getAllTombstones()`, ensuring remote deletions are respected locally and never resurrected during sync handshakes.
  - Local domain stores (`invoicePurchaseStorage`, `partyStorage`, `itemStorage`, `financialStorage`) clear tombstones on save and record tombstones on delete.
- **Read-Only Conflict Manifest & Backup Export (`src/services/conflictManifest.ts`, `scripts/conflict-manifest.ts`)**:
  - `npm run conflict:manifest` reads CouchDB through `COUCHDB_URL` using **GET requests only** (`/`, `/_all_docs?conflicts=true`, and `/{doc}?rev=`). It never PUTs, POSTs, or deletes.
  - Produces a dependency-ordered, credential-redacted manifest, a full-body backup of every winning and conflicting revision, a human summary, and `SHA256SUMS` in `~/conflict-review/<timestamp>/` with directory mode `0700` and files mode `0600`.
  - The shareable manifest redacts password/token/API-key/sync-URL values while preserving field names; the backup intentionally contains full bodies and must be treated as sensitive.
  - `node --experimental-strip-types scripts/conflict-manifest.ts --verify-only FILE` re-hashes every revision, content hash, document index, and root hash before any restore attempt.
  - The exporter fails closed if any conflict revision cannot be fetched: the manifest warns that the bundle is incomplete, backup verification reports the missing revision, and the CLI exits non-zero.
  - Resolution remains manual and per-document in the Data & Sync conflict queue. Use the manifest's dependency warnings (company/settings → catalog → parties → financial documents) before accepting any branch.
  - When the source does not expose all documents, the manifest explicitly warns that dependency counts are limited rather than silently under-reporting references.
  - The Data & Sync conflict queue also provides a read-only, collapsed-by-default detail view (`src/services/conflictDiff.ts`, `src/components/Settings/tabs/DataSyncTab.tsx`). It shows full document/revision IDs, changed fields with Version A/B values, recursive redaction for passwords, tokens, API keys, sync URLs, and credentials, plus explicit unavailable-payload and metadata-only warnings. It never resolves a conflict, merges branches, or writes to PouchDB/CouchDB.

### C. Local-Only Support Diagnostics (`src/core/utils/supportDiagnostics.ts`, `src/services/supportDiagnosticsService.ts`)
- **Schema & Architecture (`SupportDiagnosticsBundle` schemaVersion `1.0.0`)**:
  - Pure, dependency-free builder and defensive collector service (`SupportDiagnosticsService`).
  - Bundle contains:
    - `app`: Application name, version (from `package.json`), build timestamp, and runtime platform (`android` vs `web`).
    - `environment`: Online status, user agent, locale language, and timezone.
    - `database`: Active database reference (privacy-safe: `offline-primary`, `demo`, `remote-db-<hash>`, `custom-db-<hash>`), demo mode indicator, and remote database active indicator. Raw local PouchDB names are never emitted.
    - `sync`: Current status, remote host/database (as non-reversible references `host-<hash>[:port]` and `db-<hash>`, with literal IP addresses and loopback preserved with ports), pending changes count, last synced timestamp, sanitized coarse error string, and conflict summary.
    - `sync.conflictSummary`: Aggregate conflict count (`revisions`), unique conflicted document count (`uniqueDocuments`), and distribution breakdown `byDocType`.
    - `recordCounts`: Defensive record counts across `company`, `parties`, `items`, `invoices`, `purchases`, `expenses`, `vouchers`, `bankAccounts`, and `cashBankTransactions`.
    - `privacyFlags`: Guarantees `localOnly: true`, `noDocumentBodies: true`, `noBusinessIdentifiers: true`, `noCredentials: true`, accompanied by human-readable `redactionList`.
    - `warnings`: Sanitized and length-truncated operational warnings.
- **Privacy & Redaction Guarantees**:
  - Remote URLs & Identifiers: Strips usernames, passwords, auth tokens, query parameters, and URL fragments. Remote hostnames, remote database names, and active database names are represented as non-reversible references (`host-<short-hash>`, `db-<short-hash>`, `remote-db-<short-hash>`, `custom-db-<short-hash>`); readable business hostnames are excluded while literal IP addresses and `localhost` loopback remain readable with ports.
  - Free-Form Error/Warning Sanitization: Recursively redacts basic auth credentials, Bearer tokens, password/secret/token key-value assignments, `file://` URLs, Windows paths (`C:\...`), and local POSIX paths (`/home/...`, `/data/...`, `/sdcard/...`, `/mnt/...`, `/proc/...`, `/run/...`).
  - Strict Exclusion: Document payloads, customer names, vendor names, GSTINs, and revision hashes are strictly excluded from the diagnostics bundle.
  - Zero Mutations: Diagnostics collection is read-only; it never invokes write methods (`putDoc`, `deleteDoc`), conflict resolution (`resolveConflict`), or sync triggers (`syncNow`, `startSync`, `stopSync`).
  - Export: Serializes bundle to an offline JSON `Blob`, initiates browser anchor download with safe filename (`support-diagnostics-YYYY-MM-DDTHH-mm-ss-sssZ.json`), and revokes the object URL after download initiation (intentionally deferred by 1000 ms to avoid cancelling downloads on WebViews/Safari).

### D. Ledger Reversals & Double-Entry Integrity (`src/core/accounting/`, `src/services/db/reconcileAndRepair.ts`)
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

### E. Payment Voucher & Invoice/Bill Linking Architecture (`paymentAllocation.ts`, `voucherTypes.ts`, `invoicePurchaseStorage.ts`)
- **Standalone Payment Vouchers & Upfront Invariant**:
  - Upfront payments made on sales invoices or purchase bills create first-class standalone `RECEIPT` or `PAYMENT` vouchers linked directly to the parent document via `paymentAllocations`, `sourceDocumentId`, and `sourceDocumentNumber`.
  - Upfront/source vouchers are identified strictly by `allocationMode === 'SOURCE_DOCUMENT'` and `sourceDocumentId === document.id`.
  - On editing an existing document: party payment vouchers are never touched or overwritten, no duplicate source vouchers are created, and source vouchers reconcile in-place. If active party payments already cover the paid amount, reducing below that is blocked.
  - Safe deletion: deleting an invoice or purchase bill with active linked payment vouchers is blocked with an explicit error, preventing data corruption of multi-document vouchers.
- **Invoice / Bill Linking (`PaymentAllocation`)**:
  - Payment vouchers record allocated documents via `paymentAllocations: PaymentAllocation[]`, detailing `documentType` (`INVOICE` | `PURCHASE`), `documentId`, `documentNumber`, and allocated `amount`.
  - `allocationMode` tracks whether allocations were `MANUAL`, `AUTO_FIFO`, `UNALLOCATED` (advance), or `SOURCE_DOCUMENT`.
  - Pure allocation engine (`paymentAllocation.ts`):
    - `getOutstandingDocuments()` resolves pending invoices/bills with remaining balances, matching party IDs and names.
    - `allocateOldestFirst()` automatically applies funds chronologically (FIFO).
    - `validateAllocations()` strictly checks against over-allocation, party mismatch, negative amounts, wrong document types, and duplicate document links.
    - `applyAllocations()` and `reverseAllocations()` accurately adjust `paidAmount`, `balanceAmount`, `paymentMode`, and `paymentStatus` while preserving payment split breakdown ratios and actual payment modes (`UPI`, `BANK`, `CASH`, `SPLIT`).
- **Persistent Transactions & Atomic Reversals (`db.savePaymentVoucher`, `db.reversePaymentVoucher`)**:
  - `db.savePaymentVoucher` pre-validates allocations on in-memory projections before state mutations, rejecting invalid allocations without touching existing records.
  - Editing a payment voucher seamlessly reverses previous allocations before applying new allocations, preventing double-counting.
  - `db.reversePaymentVoucher` rejects already reversed or cancelled vouchers and restores document balances.
  - Party ledger balances (`recalculatePartyBalance`) are automatically recomputed on every voucher write/reversal.
- **Pre-Save Guards & Source Voucher Reconciliation (`validateInvoicePreSave`, `validatePurchasePreSave`)**:
  - In `handleSaveInvoice` and `handleSavePurchase`, all guard checks run strictly **BEFORE** `db.saveInvoice` or `db.savePurchase` so a blocked edit cannot save an inconsistent paid amount or balance into the database.
  - When other active payment vouchers exist:
    - Attempting to reduce `paidAmount` below what other vouchers cover is blocked before save.
    - Attempting to change `paidAmount` such that the source voucher amount would change while other vouchers exist is blocked before save, advising the user to edit or reverse the linked vouchers separately.
    - The source voucher is NOT rebuilt with document `paymentSplits` (which include later payments and would overstate cash).
  - When no other active payment vouchers exist, source voucher updates may use the document splits.
- **Payment In/Out Page UI Separation (`PaymentTransactionsView`)**:
  - Distinguishes two explicit modes: `TRANSACTIONS` (default summary cards, filters, search, and transactions list) and `ENTRY` (dedicated entry panel with inline `RecordPaymentModal` `asDialog={false}`).
  - Clean separation: the transaction list is completely unmounted while in `ENTRY` mode (not rendered simultaneously).
  - Top header bar provides a clear "Back to Existing Transactions" button and Cancel button returning to `TRANSACTIONS` mode.
  - Android hardware back navigation (priority 20) exits `ENTRY` mode back to `TRANSACTIONS` mode before any outer navigation.
  - Submitting payment through the central `onRecordPartyPayment` handler automatically returns the user to `TRANSACTIONS` mode.
  - Obsolete direct-settlement fallback blocks in `PartiesView` and `DashboardRecordPaymentModal` were removed to guarantee that all payment recording strictly routes through the central accounting voucher engine.
- **Passbook & Ledger Presentation**:
  - Passbooks and Payment In / Payment Out views display linked document numbers and unallocated advance amounts.
  - Automatic credit offset logic prevents double-counting between upfront vouchers and auto-generated sale ledger rows.
  - Legacy invoices and vouchers without `paymentAllocations` continue to display and compute balances seamlessly without requiring data migrations.
  - `VoucherEditorModal` opens payment vouchers (Payment In / Payment Out) in a clean read-only view by default (`isEditing: false`) displaying doc number, amount hero badge, party info, total balance due, payment mode (with bank or split breakdown), notes, and linked documents. All React hooks within `VoucherEditorModal` are hoisted strictly before conditional guards to preserve hook order invariance during dynamic modal mounting and passbook row selection.
  - Read-only view includes a 1-tap WhatsApp Share button (`data-testid="voucher-share-whatsapp"`) dispatching formatted payment receipts with total balance due, and an Edit button (`data-testid="voucher-edit-button"`) to toggle into editable fields with a Cancel option that reverts uncommitted inputs back to the read-only card.

### F. Split-Bank Architecture & Tender Routing (`paymentSplitUtils.ts`, `ledger.ts`, `cashBankCalculator.ts`)
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

### I. Unified Native Print Bridge, Shared CSS & Modal Unification Phase 1 (`src/core/utils/printBridge.ts`, `src/styles/print.css`, `src/core/utils/whatsAppMessageBuilders.ts`, `src/components/Common/PaymentEntryForm.tsx`)
- **Shared Print Bridge (`printBridge.ts`)**:
  - All printing paths route through a unified abstraction: `printDocument` with `documentType` (`'invoice-current-page' | 'standalone-html'`), `printHtmlNative`, `printCurrentPageNative`, `generatePdfNative`, `printHtmlDocument`, `printCurrentPage`, and `escapeHtml`.
  - Android Native Bridge (`MainActivity.kt` & `android.print.PdfPrint.kt`): When running inside Android, calls `@JavascriptInterface` methods:
    - `generatePdfFromCurrentPage(jobName)`: Direct PDF generation rendering current WebView to ISO A4 PDF in `cacheDir` via `createPrintDocumentAdapter`, opened with `Intent.ACTION_VIEW` using `GenericFileProvider`.
    - `printHtml(html, jobName)`: ISO A4 portrait printing via offscreen WebView.
    - `printHtmlWithPaper(html, jobName, paperSize)`: Supports `"A4"`, `"A4-landscape"`, and `"default"` using explicit `PrintAttributes` (`MediaSize.ISO_A4`, `MediaSize.ISO_A4.asLandscape()`, `COLOR_MODE_COLOR`, `Margins.NO_MARGINS`).
    - `printCurrentPage(jobName)` and `printCurrentPageWithPaper(jobName, paperSize)`: Dispatches `createPrintDocumentAdapter` on the main UI thread.
    - Guarded with `hasStartedPrint` to prevent double-invocations on page finish, and wrapped in try-catch with UI toast feedback.
  - Browser Fallback: Standalone HTML uses hidden iframe or pop-up window printing; current page printing falls back to `window.print()`.
- **Shared Print Stylesheet (`src/styles/print.css`)**:
  - Consolidated `@media print` rules imported at top of `src/index.css`. Includes `@page` geometry, `.no-print`, `.print-modal-overlay`, `.print-modal-container`, `.print-preview-viewport` (ensuring non-clipped print viewports), `.printable-invoice`, and `#invoice-a4-print-root` isolation (`body:has(#invoice-a4-print-root) * { visibility: hidden; }` and `#invoice-a4-print-root * { visibility: visible; }`).
- **Modal Unification & Lazy-Loading Architecture (Phases 1-4)**:
  - **Shared WhatsApp Message Builders (`src/core/utils/whatsAppMessageBuilders.ts`)**: Pure typed message builders `buildInvoiceWhatsAppMessage`, `buildPurchaseWhatsAppMessage`, and `buildPaymentVoucherWhatsAppMessage` consolidating message construction across `InvoicePreviewModal`, `TableGridInvoiceModal`, `CashBankTransactionDetailModal`, `DashboardVoucherModal`, `VoucherEditorModal`, and `DashboardView`.
  - **Lazy-Loaded Modals & Preloading Engine (`src/core/utils/modalPreload.ts`)**: Heavy modal dialogs loaded on demand via `React.lazy` and wrapped in `<React.Suspense fallback={null}>`. Preloading utilities (`preloadAllModalsOnIdle`, `useModalPreloadOnMount`, and button hover/focus listeners) asynchronously warm up modal chunks before user tap. Includes `preloadPartyDetailModal`, `preloadReportPreviewModal`, and dynamic Service Worker `CACHE_URLS` precache support.
  - **Shared Billing Components (`src/components/Common/Billing/`)**:
    - `DocumentLineItemsGrid.tsx`: Unified line items table supporting `DocumentGridRow`, `InvoiceItemEntry`, and `PurchaseItemEntry` with inline price mode badges (Incl./Excl.), HSN/SAC, discounts, and item tax breakdowns.
    - `DocumentTaxSummary.tsx`: Unified tax summary dock computing taxable amounts, SGST/CGST/IGST/UTGST/CESS, discounts, shipping, round-off, and grand totals.
  - **Shared Document Modal Shells (`src/components/Common/DocumentViewModal.tsx`, `InvoiceDocumentModal.tsx`, `PurchaseDocumentModal.tsx`, `ReportPreviewModal.tsx`)**:
    - `DocumentViewModal.tsx`: Generic modal shell providing standardized responsive widths, hardware back navigation, header leading/trailing slots, scrollable viewport, and bottom action bar.
    - `InvoiceDocumentModal.tsx`: Specialized shell for invoice documents with invoice number/status header, format toggle (Mobile, A4 Laser, 3" Thermal, 2" Thermal), zoom controls, print-preview-viewport, and unified action bar (Print, A4/PDF, WhatsApp, Edit, Delete, E-Way, E-Invoice). Consumed by `SimplifiedInvoiceModal`, `InvoicePreviewModal`, and `TableGridInvoiceModal`.
    - `PurchaseDocumentModal.tsx`: Specialized shell for purchase documents with PO/Challan/Bill status header, print-preview-viewport, and action bar (Print, Edit, Delete). Consumed by `SimplifiedPurchaseModal` and `TableGridPurchaseModal`.
    - `ReportPreviewModal.tsx`: Shared report preview shell featuring report name header, date range badge, back button, mobile cards vs A4 sheet mode switch, zoom fit toggle, page count indicator, CSV export action, and direct PDF/print action bar. Consumed by `ReportPdfPreviewModal.tsx`, `BusinessReportsView.tsx`, and `DaybookView.tsx`.
  - **Consolidated Party Detail Architecture (`src/components/Parties/PartyDetailModal.tsx`)**:
    - Single consolidated component supporting `mode: 'page' | 'modal'`. Employs shared subcomponents `PartyInfoCard`, `PartyPassbookTable`, `PartyOrdersTable`, and `PartyWhatsAppReminder`. `PartyDetailPage.tsx` acts as a clean backward-compatible wrapper (`mode="page"`).
  - **Unified Delete Confirmation Pattern (`ConfirmDeleteModal.tsx`)**:
    - Standardized confirmation across all domain deletion actions: invoices, purchases, payments/vouchers, parties, inventory items/categories, bank accounts, and cash/bank ledger transactions. Protects against accidental data loss and preserves statutory warnings.
  - **Unified Party Selector (`src/components/Parties/SelectPartyModal.tsx`)**:
    - Unified component with `mode: 'general' | 'pos'` supporting both full customer/supplier filtering, search, and loop sorting (Recent -> Name -> Amount) and POS-optimized quick-add and system walk-in customer row. `SelectPosPartyModal.tsx` serves as a backward-compatible wrapper.
  - **Shared Payment Entry Form (`src/components/Common/PaymentEntryForm.tsx`)**: Reusable component encapsulating common payment fields (amount, date, discount, mode selector or chip buttons, bank account selection, split tender breakdown with `+Fill` allocation and secondary bank selector, notes) utilized across `RecordPaymentModal`, `DashboardRecordPaymentModal`, `DirectCashBankModal`, and POS `SplitPaymentModal.tsx` (supporting both box and full-width row layouts with multi-tender cash, UPI, card, and credit settlement) while leaving allocation calculations in their respective consumers.
  - **Extended Direct PDF Pipeline**:
    - Reuses `PdfPrint.kt` and `AndroidBridge.generatePdfFromCurrentPage` / `generatePdfFromHtml` to deliver instant, direct A4 PDF generation (opening via `Intent.ACTION_VIEW` and `GenericFileProvider`) across Invoices, Purchases (`SimplifiedPurchaseModal`), Reports (`ReportPreviewModal`), Ledgers (`ledgerStatementPrinter`), Vouchers (`voucherDocumentPrinter`), and Expenses (`expenseVoucherPrinter`) with clean print dialog fallbacks.
- **Standalone A4 Document Generators**:
  - Expense vouchers: `expenseVoucherPrinter.ts` (`generateExpenseVoucherHtml`, `printExpenseVoucher`) with `.no-print` desktop toolbar (`window.print()`, `window.close()`).
  - Accounting vouchers: `voucherDocumentPrinter.ts` (`generateAccountingVoucherHtml`, `printAccountingVoucher`) including entries, debits/credits, narration, signature block, and desktop toolbar.
  - Purchase bills/challans: `purchaseDocumentPrinter.ts` (`generatePurchaseBillHtml`, `printPurchaseBill`) with line items, HSN, taxes, signature block, and desktop toolbar.
  - E-Way bill slips: `eWayBillSlipPrinter.ts` (`generateEWayBillSlipHtml`, `printEWayBillSlip`).
  - Party ledger statements: `ledgerStatementPrinter.ts` (`generatePartyLedgerStatementHtml`, `printPartyLedgerStatement`).
  - Report previews: `reportExportUtils.ts` (`printReportHtmlNative`, `printReportDocumentDirect` choosing `A4-landscape` whenever `config.orientation === 'landscape' || config.headers.length > 7`).
- **Modal Integrations & A4/PDF UX**:
  - `InvoicePreviewModal`: Simplified UI displaying only `Mobile` tab in format selector, direct PDF generation on Print/PDF tap via `generatePdfNative` falling back to `printCurrentPage`, removed Set Default and Export menu, and scoped print CSS targeting `#invoice-a4-print-root`.
  - `BulkPrintModal`: Uses `print-modal-overlay` and `print-modal-container` with scoped `#bulk-print-container` height/overflow resets for multi-page document batches.
  - `BarcodeLabelModal`: Uses `print-modal-overlay` and `print-modal-container` with scoped `#barcode-print-canvas` resets and conditional `@page` size (`A4 portrait` vs `auto`).
  - Global `.print-modal-container` reset in `src/index.css` (`height: auto !important; max-height: none !important; min-height: 0 !important; overflow: visible !important;`).
  - `ThermalPrintModal`: Dedicated `A4 / PDF` action invoking `onPrintA4(invoice)` or falling back to current-page print.
  - `SimplifiedInvoiceModal`: Direct `A4 / PDF` action invoking `onOpenFullA4Preview(invoice)`.
  - `App.tsx`: Full A4 `InvoicePreviewModal` rendering state wired to `onOpenFullA4Preview` and `ThermalPrintModal.onPrintA4`.
- **Cash & Bank Transaction Sharing & Mobile Simplification**:
  - `CashBankTransactionDetailModal.tsx`: Adds WhatsApp sharing (`data-testid="cash-bank-share-whatsapp"`) formatting structured WhatsApp messages with company branding, txn number, amount, date, account/contra route, reference, and narration via `safeOpenExternalUrl`. Includes party `*Total Balance Due:*` for non-transfer records when linked to a customer/supplier. Resolves `linkedParty` via priority fallback (1. `entry.partyId`, 2. `entry.rawVoucherId` → linked voucher `partyId`, 3. `entry.rawInvoiceId` → invoice `partyId` / `partyName`, 4. `entry.rawPurchaseId` → purchase `supplierId` / `supplierName`) so passbook `SALE` and `PURCHASE` ledger entries correctly include the party's total balance due.
  - `DashboardVoucherModal.tsx`: Includes optional `parties?: Party[]` prop; adds `*Total Balance Due:*` after voucher amount when linked to a customer or supplier with outstanding balance.
  - WhatsApp Total Balance Due helper (`getPartyTotalBalanceDue` in `src/core/utils/upiAndShare.ts`): Resolves signed overall party balances (`Math.max(0, currentBalance)` for customers, `Math.max(0, -currentBalance)` for suppliers, or fallback to document balance). Integrated across `buildWhatsAppMessage`, `InvoicePreviewModal`, `TableGridInvoiceModal`, `DashboardView`, `DashboardVoucherModal`, and `CashBankTransactionDetailModal`.
  - In `src/services/whatsappService.ts`: Appends vernacular `📊 *कुल बकाया राशि:*` for Hindi language shares, with duplicate inclusion guards.
  - Horizontally scrollable account card strip on mobile (`w-[175px] shrink-0 sm:w-auto`).
  - Compact 2-line passbook ledger rows with inline direction icon, title, reference, amount, and concise contra route cues (`Cash in Hand → HDFC Current A/C`), with reference and contra badges hidden on smallest screens (`hidden sm:inline-flex`) to prevent 360px viewport overflow.
  - Preserved testids (`cash-bank-reconcile-button`, `account-statement-ACC_CASH`, `account-statement-${acc.id}`), filter pills, and detail modal triggers.
  - Full backups include an optional `syncRemoteUrl` so a restore after reinstall restores the cloud link. Backups containing this field must be stored securely because it may include CouchDB credentials.
- **Reactive State & UI Integration (`src/core/store/useDataStore.ts`, `src/components/Parties/`)**:
  - `usePartyGroups()` and `usePartyCategories()` hooks provide selective reactive updates via `useSyncExternalStore`.
  - `PartiesView`: Includes "Groups & Categories" management launcher, Group and Category filter dropdowns with auto-reset for stale IDs, and search token matching on group/category names.
  - `PartyGroupsCategoriesModal`: Tabbed palette editor for groups and categories with duplicate name validation and RBAC deletion protection (`rbac.canDeleteParty()`).
  - `AddEditPartyModal`: Live group and category assignment dropdowns with "Unassigned" default and "Party Type" classification.

### I. Read-Only Cash/Bank Reconciliation Audit (`cashBankReconciliation.ts`, `CashBankReconciliationPanel.tsx`)
- **What the Report Shows**:
  - Comprehensive per-account audit: configured opening balance, total inflows, total outflows, net movement, computed closing balance, ledger closing balance, and difference.
  - Verification of the fundamental double-entry equation: `Opening + Inflows − Outflows = Closing`.
  - Detailed breakdown of inflows and outflows grouped by transaction source (Sales receipts, Purchase payments, Expenses, Party vouchers, Contra transfers, Direct in/out).
  - Explicit audit signals and issue flagging: negative opening balance, negative closing balance, lack of recorded inflows, unconfigured account IDs found in transactions, ledger mismatch, and candidate duplicate outflows.
- **Why a Negative Balance Can Be Real**:
  - The cash/bank ledger balance can legitimately be negative when opening balances are negative or when recorded outflows (expenses, vendor payments, drawings, bank transfers) exceed opening balance and recorded inflows.
  - A negative total or account balance is a **real ledger position arising from recorded entries, not a calculation error**. Possible real-world causes include unrecorded cash infusions/funding, unrecorded sales/receipts, bank overdraft facilities, or duplicate outflow entries.
- **Strictly Read-Only Guarantee**:
  - The reconciliation engine is a pure, zero-dependency service with no mutations, network calls, or database writes.
  - The UI panel is strictly read-only: it contains no "Fix", "Adjust", "Auto-resolve", "Repair", or "Write" actions.
  - The app will **never** silently auto-adjust or alter account balances or voucher entries. Any adjustments or corrections must be entered manually and explicitly by the user with proper source documents.
- **Duplicate Payment Candidates as Review Signals**:
  - Only non-contra outflow entries sharing the exact account, date, amount (to 2 decimals), and non-empty reference number are flagged.
  - Candidates are surfaced strictly as review signals for manual verification, not proof of error or duplicate payments.
- **Exporting the Reconciliation Report**:
  - Users can export the complete audit via the "Export CSV" button in the Balance Reconciliation panel.
  - Generates RFC 4180-compliant CSV files with UTF-8 BOM and CWE-1236 formula sanitization, including distinct sections for Account Summaries, Source Breakdowns, and Duplicate Candidates. Filename format: `cash_bank_reconciliation_YYYY-MM-DD.csv`.

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
  5. App Preferences (Language, theme, app lock, OTA updates, Dashboard Quick Actions — choose 1–6 shortcuts)
  6. Data & Sync (Cloud sync, multi-device pairing, import/export)
  7. Security & Audit (Immutable SHA-256 MCA audit trail)
- Dashboard Quick Actions are stored in `SyncedSettings.dashboardQuickActions` (max 6, normalized by `src/core/settings/dashboardQuickActions.ts`) and rendered by `DashboardView` using the same navigation/creation handlers as the legacy shortcuts.

### E. WhatsApp Integration & Chooser Architecture (`whatsappIntent.ts`, `whatsappService.ts`)
- **URL Normalization & Phone Validation (`src/core/utils/whatsappIntent.ts`)**:
  - Pure helper with zero dependencies on React, PouchDB, or storage.
  - Normalizes 5 accepted Indian mobile formats (`9876543210`, `+91 98765 43210`, `91-98765-43210`, `09876543210`, `0091 98765 43210`) into standard E.164 (`919876543210`) and national 10-digit formats.
  - Rejects empty input, < 10 digits (`TOO_SHORT`), > 10 digits (`TOO_LONG`), non-6-9 prefix (`INVALID_MOBILE`), and non-+91 country codes (`UNSUPPORTED_COUNTRY_CODE`).
  - Supports deep links via `buildWhatsAppSendUrl`: `channel: 'app'` (`https://wa.me/<e164>?text=...` or `https://wa.me/?text=...`) and `channel: 'api'` (`https://api.whatsapp.com/send?phone=<e164>&text=...` or `https://api.whatsapp.com/send?text=...`).
  - URL text payload is encoded exactly once (`encodeURIComponent`) to preserve newlines, emoji (`🙏`), `&`, `#`, `%`, and spaces without double encoding.
- **JavaScript Bridge & Fallback Routing (`src/core/utils/upiAndShare.ts`)**:
  - `isWhatsAppIntentUrl` matches `https://wa.me/`, `https://api.whatsapp.com/`, and `whatsapp://`.
  - When running inside the native Android WebView, links route via `window.AndroidBridge.openWhatsAppUrl(url)`.
  - The bridge call is wrapped in a `try/catch` block; if the native bridge throws, execution falls through gracefully to `window.open` / anchor click fallback without crashing.
- **Demo Mode Guardrail & Copy Message Fallback**:
  - Modals (`Common/WhatsAppShareModal.tsx` and `WhatsApp/WhatsAppShareModal.tsx`) check `isDemoModeActive()` (`POUCH_PERSIST_KEYS.DEMO_MODE`).
  - When active, a non-blocking warning banner (`whatsapp-demo-warning`) alerts the merchant that sample demo data is being sent and real WhatsApp will be opened without changing production records.
  - Both modals provide a 1-tap **Copy message** action (`whatsapp-copy-button`) with clipboard feedback, serving as the graceful fallback when WhatsApp is not installed.
  - Neither modal accepts or performs production data mutations.
- **Party Phone Prefill & Fallback Hierarchy**:
  - **Folder Share Modal (`src/components/WhatsApp/WhatsAppShareModal.tsx`)**:
    - Initializes the phone input directly with `invoice.partyPhone?.trim() || ''`.
    - Automatically prefills party phone numbers already stored on invoice records for Invoice Preview and Table Grid share workflows.
  - **Common Share Modal (`src/components/Common/WhatsAppShareModal.tsx`)**:
    - Resolves the default phone value using strict priority fallback order:
      1. `initialPhone` (if non-empty / trimmed)
      2. `invoice.partyPhone` (if non-empty / trimmed)
      3. `party.phone` (if non-empty / trimmed)
      4. `''` (empty string)
    - Prevents empty string prop overrides (`initialPhone=""`) from masking pre-existing invoice or party phone numbers.
    - Explicit user clears in the input field remain cleared after mount; the reactive re-synchronization effect only updates state if the resolved `defaultPhone` reference changes.
- **Native Intent Chooser Contract (`MainActivity.kt` & `AndroidManifest.xml`)**:
  - Android manifest declares `<queries>` for both `com.whatsapp` and `com.whatsapp.w4b` (WhatsApp Business).
  - When both packages are installed, `MainActivity.kt` builds `Intent.createChooser` with `EXTRA_INITIAL_INTENTS` to prompt the user.
  - When only one package is installed, it launches that package directly.
  - When neither is installed, it triggers an "Open with" fallback chooser and displays "WhatsApp is not installed".
  - *Note:* Real physical/emulator smoke testing with WhatsApp installed remains pending because no such environment is available on this build host. Static contract testing (`whatsAppNativeContract.test.ts`) guards against native drift.

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
- **Payment In & Payment Out Views (`src/components/Payments/PaymentTransactionsView.tsx`)**:
  - Distinct top-level `payment_in` (Sales group) and `payment_out` (Purchases group) pages with RBAC permissioning (CASHIER has access to `payment_in`; ACCOUNTANT and OWNER have access to both).
  - Uses `computeCashBankSummary` without duplicate math, excluding CONTRA transfers. Defaults to `ALL_TIME` date preset, supports live account filtering, text search, count & sum summary cards, and direct cash/bank modal creation.
  - Cash & Bank Deep-Linking: Statements icon button on cash and bank cards routes directly to Reports -> Bank Statement with `THIS_FY` preselected and period opening balance dynamically calculated.
- **Dynamic Code Splitting & Performance Architecture**:
  - **Lazy Unwrapping Contract in `App.tsx`**: Secondary views and modals are dynamically imported:
    ```typescript
    const TableGridInvoiceModal = React.lazy(() =>
      import('./components/Invoicing/TableGridInvoiceModal.tsx').then((m) => ({ default: m.TableGridInvoiceModal }))
    );
    ```
  - **Modal Preload & Offline Cache Engine (`src/core/utils/modalPreload.ts`)**:
    - `lazyWithPreload`: wraps `React.lazy` with an explicit `.preload()` hook caching the dynamic import promise.
    - `useModalPreloadOnMount`: preloads view-specific modals asynchronously on view entrance without blocking initial render.
    - `preloadAllModalsOnIdle`: schedules non-blocking idle chunk preloads (`requestIdleCallback`) to pre-warm the browser module cache.
    - `public/sw.js` precache handler listens for `CACHE_URLS` messages to store modal chunks in CacheStorage for full offline access.
  - **Unified Document Components (`src/components/Common/Billing/`)**:
    - `DocumentLineItemsGrid.tsx`: consolidated line-item grid supporting interactive workstation mode and compact mobile preview mode with complete GST pricing mode compliance.
    - `DocumentTaxSummary.tsx`: unified tax breakdown supporting `variant="full"` (collapsible tax base breakdown) and `variant="compact"` (streamlined invoice/bill values).
    - `DocumentViewModal.tsx`: shared preview dialog shell with backdrop blur, accessible close button, Android hardware back navigation (`useBackNavigation`), responsive viewport, and sticky action docks.
  - **Direct PDF Generation & Printing Bridge (`src/core/utils/directPdf.ts`, `src/services/printBridge.ts`)**:
    - Direct PDF export generates print-ready documents without requiring print dialog interception.
    - Android native WebView printing bridge (`AndroidBridge.printPdfDirect`, `PdfPrint.kt`) delivers 1-tap PDF generation, file saving, and sharing across sales invoices, delivery challans, purchase bills, and financial reports.
  - **Entry Chunk Ceiling**: Main bundle (`index.js`) must strictly remain under **450 kB** uncompressed. Zero-CLS Suspense fallback skeletons are rendered during chunk loads.

---

## 7. Testing & Quality Assurance

All features must maintain 100% test coverage with zero regressions:
```bash
# Run core Vitest suite (fast)
npm test

# Run heavy UI integration suites
npm run test:ui

# Run the full suite (CI/release gate)
npm run test:all

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
- `auditEpoch.test.tsx`: Audit epoch separation, legacy archive preservation, epoch-2 genesis/sequencing, reloadFromStorage persistence, broken legacy chain isolation, UI scope defaults, and statutory exports.
- `gstr3bAndCogsCalculations.test.ts`: GSTR-3B ITC offset, COGS/margin calculations, aging boundaries, and stock valuation.
- `updateServiceOtaFallback.test.ts`: Signed GitHub release asset selection, checksum parsing, and release-page fallback.
- `conflictManifest.test.ts`: Synthetic 31-document/48-revision conflict inventory, dependency-order warnings, credential redaction, backup round-trip hashes, and tamper detection.
- `supportDiagnostics.test.ts`: Pure support diagnostics builder, URL credential redaction, path sanitization, and conflict aggregation.
- `supportDiagnosticsService.test.ts`: Defensive collector service, zero-mutation guarantee, and local download helper.
- `supportDiagnosticsUI.test.tsx`: Support diagnostics UI card, release gate assertions, truthful sync/conflict verification, and privacy assertions.
- `paymentTransactionsAndSystemParties.test.tsx`: Payment In/Out navigation, RBAC access, CONTRA exclusion, calculation parity, Cash/Bank statement deep linking, Walk-in Customer system invariants, delete guards, and POS customer selection.
- `paymentVoucherInvoiceLink.test.ts`: Payment voucher and invoice/bill link spec (23 scenarios): upfront source vouchers, multi-document allocations, party payment preservation on document edits, stable voucher numbering, storage pre-validation, safe deletion guards, split payment mode consistency, and legacy compatibility.
- `whatsAppModals.test.tsx`: WhatsApp modal phone prefill hierarchy, validation, clipboard fallback, and demo guardrails.
- `granularStateDecoupling.test.tsx`: Fine-grained render isolation and `useSyncExternalStore` reactive stability across domain mutations.
- `scripts/verify-release.sh`: APK badging, versionCode parity, SHA-256, signature, and optional PWA artifact verification.
- `billIntake.test.ts`: GSTR-2B/2A parsing, printed-vs-computed reconciliation, supplier/item/duplicate matching, model-output coercion, and the auto-post confidence gate.

---

## 7A. AI Bill Intake (`src/agent/billIntake/`)

Full design and rollout notes: [docs/AI_BILL_INTAKE.md](./docs/AI_BILL_INTAKE.md).

### Trust boundary
A vision model is used **only to transcribe** a supplier invoice. It never produces a
number that reaches the ledger: every taxable value and tax head is recomputed by
`src/core/gst/calculator.ts` and diffed against the printed totals. A mismatch is a
`BLOCKER`, never a silent correction.

### Pipeline
```
File (PDF/image)  -> server/bill-intake proxy -> RawBillExtraction
GSTR-2B/2A JSON   -> gstr2b.ts (no model)    -> RawBillExtraction
RawBillExtraction -> schema.ts (coerce)      -> matchSupplier / matchItem
                  -> calculateInvoice + reconcile -> scoreDraft -> IntakeDraft
IntakeDraft       -> buildPurchaseBill       -> db.savePurchase (stock + ledger + audit)
```

### Modules
| File | Responsibility |
|---|---|
| `types.ts` | `RawBillExtraction`, `IntakeDraft`, settings contracts |
| `schema.ts` | Defensive coercion of model output (`₹1,180.00`, `03/04/2025`, unit aliases) |
| `matcher.ts` | Supplier (GSTIN → name → tokens), item (SKU → name → HSN → tokens), duplicate detection |
| `reconcile.ts` | Recompute via GST engine; 1-rupee / 0.1% tolerance per head |
| `confidence.ts` | Deterministic 0–1 score + `canAutoPost` gate |
| `toPurchaseBill.ts` | Assembles the exact `PurchaseBill` shape the manual modal produces |
| `gstr2b.ts` | Deterministic GSTR-2B/2A parser (B2B + CDNR; IMPG skipped with warning) |
| `queue.ts` | Review queue in `localStorage` (`gst_bill_intake_queue_v1`), open drafts pinned |
| `settings.ts` | `localStorage` config (`gst_bill_intake_settings_v1`) |
| `visionClient.ts` | Authenticated client for the extraction proxy |
| `agent.ts` | Orchestrator: `ingestFiles`, `ingestGstr2bFile`, `postDraft`, `runAutoPost` |

### Invariants
- **No provider keys in the client.** Extraction goes through `server/bill-intake` (zero-dependency Node proxy, shared-token auth, no document retention).
- **Auto-post requires**: zero `BLOCKER` issues, score ≥ `autoPostThreshold` (default 0.92), a known supplier, and catalog-matched items (both toggleable).
- **Never auto-post a duplicate**; duplicates are detected on supplier GSTIN + normalised document number, independent of date.
- **2B imports have no quantity** — lines are grouped per (HSN, rate) and flagged `QTY_NOT_REPORTED`.
- **Provenance** (source, file, confidence) is written to the bill `notes`; the audit record comes from `db.savePurchase` as usual.
- **UI entry point**: Purchases Hub → `AI Intake` → `BillIntakeView.tsx`, which reuses `TableGridPurchaseModal` for human review.

---

## 8. Release & Deployment Pipeline

Refer to [`.agents/skills/vyapar-release/SKILL.md`](./.agents/skills/vyapar-release/SKILL.md) for detailed execution:
1. Bump version in `package.json` and sync `public/version.json` via `./scripts/generate-version.sh`.
2. Run `./scripts/build-apk.sh` (Vite build, version sync, signed `dist-android/GSTBilling-Vyapar.apk`, SHA-256).
3. Run `npx tsc --noEmit && npm run test:all` after the build so `dist/assets` exists for bundle-integrity tests.
4. Run `./scripts/package-pwa.sh` and copy release artifacts to `~/release-artifacts/vX.Y.Z/`.
5. Run `./scripts/verify-release.sh` (badging, versionCode, checksum, signature).
6. Git commit, create annotated tag `vX.Y.Z`, push the tag first, then `master`.
7. Wait for the GitHub release workflow, upload the signed APK and SHA-256, and include the checksum in the release body.
8. Verify release assets, latest release status, APK badging, and signature.

