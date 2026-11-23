---
name: vyapar-gst-billing
description: >-
  Use when changing GST/tax calculations, price modes (inclusive/exclusive), HSN/UQC
  fields, invoice or purchase tax amounts, composition scheme handling, or GST report
  aggregation in Vyapar Books.
---

# GST Billing Rules

## Price modes
- `EXCLUSIVE`: stored price excludes GST; `unitPrice` is the exclusive rate.
- `INCLUSIVE`: stored price includes GST; `unitPriceInclusive` is authoritative and the
  exclusive rate is derived.
- Tier prices (`semiWholesalePrice`, `wholesalePrice`) inherit the item/transaction
  `priceMode`.
- Use `exclusiveFromInclusive` / `inclusiveFromExclusive` from `src/core/gst/pricing.ts`;
  never re-derive tax by hand.

## Composition scheme
- Outward (sales) tax is zeroed under composition.
- Inward (purchases) keep GST — a composition dealer still pays input GST but cannot claim
  ITC.
This asymmetry is intentional. Do not "fix" it.

## UQC (Unit Quantity Code)
Every invoice item unit needs a NIC UQC for e-invoice, e-way bill and GSTR-1:
`PCS NOS KGS GMS LTR MLT MTR BOX PAC SET BAG DOZ CTN PRS QTL TON`.
Map `DOZEN->DOZ`, `PKT->PAC`, `HOURS/DAYS->OTH`. `OTH` is a last resort, not a default.

## Never
- Change a tax calculation without a test and a cited rule.
- Round intermediate tax values differently on different paths (use `round2` consistently).
- Assume GST is active — gate on `isGstActive` and the composition flags.

## Checklist
- [ ] mode-aware rate derivation.
- [ ] composition gating correct per direction.
- [ ] HSN + UQC present when GST is active.
- [ ] totals reconcile: taxable + CGST + SGST + IGST + cess = total.
- [ ] test expectations changed only with evidence.
