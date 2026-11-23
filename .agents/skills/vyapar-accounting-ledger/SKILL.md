---
name: vyapar-accounting-ledger
description: >-
  Use when changing party balances, opening balances, payment recording (cash/bank/UPI/
  split), party passbook or khata, purchase returns, GRN/PO documents, invoice payment
  status, or audit trail logging in Vyapar Books.
---

# Party Ledger & Payments

## Balance rules
- Party balance = signed opening balance + active non-cancelled invoice balances +
  unallocated receipts.
- `TO_RECEIVE` opening is a positive receivable; `TO_PAY` is a liability/advance.
- Linked **and** unlinked payments reduce the balance.
- Sales invoices and purchase returns reduce it; purchase bills increase it.
- Ignore unbilled purchase orders. GRN, CHALLAN and PO documents are non-payable: exclude
  them from cash/bank totals, cash flow and party khata.

## Never drop baseline metadata
`saveParty` must merge partial objects. `openingBalance`, `openingBalanceType` and
`openingBalanceDate` survive unless explicitly cleared via
`db.clearPartyOpeningBalance(partyId)`.

## Payment status (derive, never hardcode)
- `PAID`: `totalPaid >= grandTotal`
- `PARTIAL`: `0 < totalPaid < grandTotal`
- `UNPAID`: `totalPaid === 0` or a single `CREDIT` tender

Record tender splits in `paymentSplits` / notes for auditability.

## Split payments
Resolve the split synchronously in the click handler and pass it into the checkout function.
Never rely on a `useState` setter in the same tick before saving.

## Ordering
Sort user-facing transactions by business `date`, falling back to `createdAt`; use the
`createdAt` time-of-day only as a same-day tie-break. In the passbook, `OPENING` is first in
Oldest order and last in Newest order.

## Audit
Every state-altering write (`saveInvoice`, `deleteInvoice`, `saveParty`, `deleteParty`,
`savePurchase`, `deletePurchase`, `saveVoucher`, `deleteVoucher`, `saveCompany`,
`saveStockAdjustment`) must emit a SHA-256 chained record via `src/services/auditTrail.ts`.

## Checklist
- [ ] balance includes signed opening + active invoices + receipts.
- [ ] payment status derived, not hardcoded.
- [ ] splits passed directly to the save path.
- [ ] GRN/CHALLAN/PO excluded from payable totals.
- [ ] opening balance preserved on partial saves.
- [ ] audit event emitted.
