---
name: vyapar-inventory-units
description: >-
  Use when changing item units, sub-units, conversion factors, stock quantities, stock
  adjustments, purchase/sales stock movement, low-stock alerts, stock valuation, or any
  screen or report that displays stock in Vyapar Books.
---

# Inventory Units & Stock Quantities

## Data model (must hold)
- `item.unit` — billing / primary unit (BAG, DOZEN, BOX).
- `item.subUnit` — stock unit, the smallest unit transacted (KG, PCS).
- `item.subUnitFactor` — stock units per primary unit (1 BAG = 40 KG -> 40, must be > 1).
- `item.currentStock` and `item.minStockAlert` are stored in the **stock unit**.
- `salePrice`, `purchasePrice`, `semiWholesalePrice`, `wholesalePrice` are per **primary unit**.
- A transaction line's `quantity` is in the line's own `unit`; `subUnitQuantity` is its
  stock-unit snapshot.

## Conversion helpers (`src/core/inventory/stockEngine.ts`)
- `convertQuantityToBase(qty, fromUnit, item)` -> stock unit.
- `convertQuantityFromBase(qty, toUnit, item)` -> primary unit.
- `getLineBaseQuantity(line, item)` -> stock-unit quantity of a transaction line.

## Rules
1. **Display** in the primary unit with the stock unit as a secondary hint:
   `2.5 BAG (100 KG)`. The stock unit must never be the headline.
2. **Input** in the primary unit; convert with `convertQuantityToBase` before persisting.
3. **Aggregations** (reconcile, audit, COGS, stock value, sold/purchased totals) must use
   `getLineBaseQuantity` for lines and `convertQuantityToBase` for adjustments. Never mix a
   raw `line.quantity` with `currentStock`.
4. **Stock value** = `convertQuantityFromBase(currentStock, unit, item) * purchasePrice`
   (price per primary unit).
5. **Stock adjustments**: `StockAdjustment.quantity` is in the primary unit; the stock engine
   converts it.
6. **Purchase price update**: normalise the line price to the primary unit (multiply by the
   factor when the line unit is the sub-unit).
7. **Format** every displayed quantity with `formatQuantity(value, 4)`; never interpolate a
   raw JS number.
8. **Sale-price update from a purchase line**: keep the field in the active line unit,
   recompute it when the line unit changes, and compare with a tolerance (< 0.005) to avoid
   floating-point rewrite loops.
9. **Low stock** compares stock unit to stock unit (`currentStock <= minStockAlert`).

## Checklist before touching stock code
- [ ] grep `currentStock` and confirm each read is converted or compared in stock units.
- [ ] grep `line.quantity` in aggregation code; route through `getLineBaseQuantity`.
- [ ] every display shows the primary unit plus the stock hint.
- [ ] no raw number interpolation in labels.
- [ ] targeted tests:
  `npx vitest run src/__tests__/subUnitAndMultiTierPricing.test.ts src/__tests__/subUnitAndMultiTierPricingUI.test.tsx src/__tests__/subUnitRegressionFixes.test.tsx`

## Known pitfalls
- A stale sale-price field after a unit change rewrites the catalog price by the factor.
- `100 / 12` renders as `8.333333333333334` without `formatQuantity`.
- Changing `subUnit`/`subUnitFactor` on an item with movements reinterprets stored stock.
- GST needs a UQC per unit before e-invoice/export work (DOZEN->DOZ, PKT->PAC,
  HOURS/DAYS->OTH).
