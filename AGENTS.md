# Vyapar Books Engineering Guardrails & Architectural Invariants

> **Notice for Teamwork Agents:** For complete directory layout, domain engines, state synchronization flows, and component architecture, read [CODEBASE_GUIDE.md](./CODEBASE_GUIDE.md).

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

---

## 7. Pre-Flight Duplicate Validation in Entity Forms
- When creating or editing domain entities (items, parties, categories), form modals must validate name uniqueness in real-time (case-insensitive, trimmed) against existing catalog records.
- If a match is detected:
  - In creation mode: Render an immediate, non-blocking warning badge (e.g. amber badge below the input field) advising the user that an item/party with this name already exists.
  - In edit mode: The entity's own record must be excluded from duplicate checks so that saving unmodified names does not trigger a warning.
- The validation must remain non-blocking so users can proceed if identical names are intentional across different categories or units.

---

## 8. Transaction Histories & Document Preview Interactivity
- Every transaction record displayed within entity detail views (such as `ItemDetailSheet` or party passbooks) must retain a reference to its source document entity (`invoiceId` for sales, `purchaseId` for inward purchases, `voucherId` for payments).
- Transaction list rows must provide clear visual affordances (pointer cursor, subtle hover highlight, document badge) and open the respective document preview modal upon click.
- Manual non-bill entries (e.g., manual inventory stock adjustments) must be handled gracefully without triggering missing document errors.

---

## 9. Catalog Search UI & Scroll Affordances
- In high-volume master lists (Inventory Items, Parties, Invoices), the search bar and filter controls must be sticky/floating (`sticky top-0 z-20` with surface backdrop) so users retain instant search capability without having to scroll back to the top.
- When search input contains text, a 1-tap clear button (`close` icon) must appear inside the search input to reset the query in a single tap.

---

## 10. Living Codebase Documentation Invariant
- The workspace maintains [CODEBASE_GUIDE.md](./CODEBASE_GUIDE.md) as the single source of truth for teamwork multi-agent teams, reviewers, and developers.
- Whenever adding new domain engines, persistence keys, major components, or modifying architecture, agents must update `CODEBASE_GUIDE.md` alongside code changes to keep the guide current and prevent context drift.

