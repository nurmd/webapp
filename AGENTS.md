# Vyapar Books Engineering Guardrails & Architectural Invariants

This workspace hosts the Vyapar Books GST billing, accounting, and POS platform. All agents and developers must uphold the following invariants across features, refactors, and bug fixes:

---

## 1. Accounting Entity Persistence & Baseline Integrity
- **Non-Destructive Mutations**: When saving entities (`Party`, `InventoryItem`, `CompanyProfile`) via `db.saveParty`, `db.saveItem`, or invoicing workflows, partial objects must **never** overwrite or drop baseline metadata.
  - Specifically for `Party`: `openingBalance`, `openingBalanceType`, and `openingBalanceDate` must remain intact unless explicitly deleted via dedicated methods (e.g., `db.clearPartyOpeningBalance(partyId)`) or set to an explicit zero.
  - Cross-tab synchronizations (`PouchDB`, `BroadcastChannel`) and modal save callbacks must merge incoming partial records with existing stored records.
- **Signed Balance Recalculations**: `recalculatePartyBalance(partyId)` must always incorporate signed opening balances (`TO_RECEIVE` as positive receivable, `TO_PAY` as liability/advance) along with active, non-cancelled invoice balances and unallocated receipts.
- **Passbook Ledger Baseline**: The customer/supplier passbook (`usePartyPassbook`) must always anchor the `OPENING` entry at index 0 as the baseline transaction before subsequent invoices and vouchers.

---

## 2. Split Payments & Tender Handling
- **No Direct Async Race Conditions**: In POS checkout and invoice generation (`QuickBillingView`, `TableGridInvoiceModal`), avoid relying on asynchronous React state updates for tender splits immediately before saving. Always pass the resolved split breakdown directly into the checkout execution handler.
- **Accurate Payment Status**: Invoices with multiple tender modes or partial credit must never have their payment mode arbitrarily hardcoded to `CASH`.
  - Payment status must strictly be derived:
    - `PAID`: `totalPaid >= grandTotal`
    - `PARTIAL`: `totalPaid > 0 && totalPaid < grandTotal`
    - `UNPAID`: `totalPaid === 0` or single `CREDIT` tender.
  - Record the tender breakdown in `notes` or dedicated split structures to maintain ledger auditability.

---

## 3. Search & Catalog Filtering Invariant
- **Word-Level Substring Matching**: Catalog searches (items, parties, barcodes, HSN) must match **all typed tokens/words** against item attributes (`name`, `sku`, `barcode`, `category`, `hsnSacCode`), regardless of token ordering.
  - Never use exact prefix match (`startsWith`) or exact string equality (`===`) for user-facing search inputs.
  - Example: Searching "oil 1l" must match "Fortune Mustard Oil 1L Pouch".

---

## 4. Inventory Stock Accounting & Constraints
- **Centralized Stock Engine**: All inventory decrement paths (`saveInvoice`, `deletePurchase`, `saveStockAdjustment`) must route through `src/core/inventory/stockEngine.ts`.
- **Negative Stock Allowance**: Stock reductions must check `db.getAllowNegativeStock()`:
  - If `false` (default): Stock is clamped to `0`.
  - If `true`: Stock is permitted to drop into negative values (e.g. `5 - 12 = -7`).

---

## 5. Thermal Printing & Receipts
- Ensure thermal roll printer outputs (58mm/80mm) enforce strict line length wrapping (typically 32 chars for 58mm, 48 chars for 80mm).
- Ensure invoice printing honors privacy toggles (e.g., displaying party current running balance or hiding purchase prices).
- Use `break-inside: avoid` on line items to prevent page-break cuts midway through receipts.

---

## 6. Audit Trail & Statutory Compliance
- Every state-altering database operation (`saveInvoice`, `deleteInvoice`, `saveParty`, `deleteParty`, `savePurchase`, `deletePurchase`, `saveVoucher`, `deleteVoucher`, `saveCompany`) must emit an immutable SHA-256 chained audit record via `src/services/auditTrail.ts`.
