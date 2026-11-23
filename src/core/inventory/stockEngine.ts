import type { InventoryItem, StockAdjustment } from '../../models/item.ts';
import type { InvoiceItemEntry } from '../../models/invoice.ts';
import type { PurchaseItemEntry } from '../../models/purchase.ts';

/**
 * Minimal structural interface for an item line capable of adjusting stock.
 * Both InvoiceItemEntry and PurchaseItemEntry conform to this interface.
 */
export interface StockLineItem {
  itemId?: string;
  name: string;
  quantity: number;
  unit?: string;
  subUnit?: string;
  subUnitQuantity?: number;
  unitPrice?: number;
  [key: string]: unknown;
}

/**
 * Converts a given quantity from a specified unit to the item's base unit.
 * If 1 unit = factor subUnits (e.g. 1 DOZEN = 12 PCS, 1 BAG = 40 KG):
 * - If fromUnit is main unit (DOZEN / BAG): baseQty = quantity * factor (2 DOZEN -> 24 PCS)
 * - If fromUnit is sub-unit (PCS / KG): baseQty = quantity (24 PCS -> 24 PCS)
 * If no sub-unit configured or factor <= 0, returns quantity directly.
 */
export function convertQuantityToBase(
  quantity: number,
  fromUnit: string | undefined,
  item: Pick<InventoryItem, 'unit' | 'subUnit' | 'subUnitFactor'>
): number {
  const qty = typeof quantity === 'number' && !isNaN(quantity) ? quantity : 0;
  const factor = item.subUnitFactor;
  if (!item.subUnit || typeof factor !== 'number' || factor <= 0) {
    return qty;
  }

  const cleanFrom = String(fromUnit || item.unit || '').trim().toUpperCase();
  const cleanMain = String(item.unit || '').trim().toUpperCase();
  const cleanSub = String(item.subUnit || '').trim().toUpperCase();

  if (cleanFrom === cleanMain) {
    return qty * factor;
  }
  if (cleanFrom === cleanSub) {
    return qty;
  }
  return qty;
}

/**
 * Converts a base quantity to a target unit.
 * - If toUnit is main unit (DOZEN / BAG): targetQty = baseQty / factor (24 PCS -> 2 DOZEN)
 * - If toUnit is sub-unit (PCS / KG): targetQty = baseQty (24 PCS -> 24 PCS)
 */
export function convertQuantityFromBase(
  baseQuantity: number,
  toUnit: string | undefined,
  item: Pick<InventoryItem, 'unit' | 'subUnit' | 'subUnitFactor'>
): number {
  const baseQty = typeof baseQuantity === 'number' && !isNaN(baseQuantity) ? baseQuantity : 0;
  const factor = item.subUnitFactor;
  if (!item.subUnit || typeof factor !== 'number' || factor <= 0) {
    return baseQty;
  }

  const cleanTo = String(toUnit || item.unit || '').trim().toUpperCase();
  const cleanMain = String(item.unit || '').trim().toUpperCase();
  const cleanSub = String(item.subUnit || '').trim().toUpperCase();

  if (cleanTo === cleanMain) {
    return baseQty / factor;
  }
  if (cleanTo === cleanSub) {
    return baseQty;
  }
  return baseQty;
}

/**
 * Resolves the effective base inventory quantity for a stock-moving line item.
 * Always resolves in base units (e.g. PCS, KG).
 *
 * Snapshot priority:
 * A recorded line snapshot (`subUnitQuantity` > 0) takes precedence over current item
 * configuration. This guarantees historical transactions retain their exact base quantity
 * even if the catalog item's subUnit or subUnitFactor is later modified or removed.
 */
export function getLineBaseQuantity(
  line: { quantity: number; unit?: string; subUnit?: string; subUnitQuantity?: number },
  matchedItem?: InventoryItem
): number {
  const rawQty = typeof line.quantity === 'number' && Number.isFinite(line.quantity) ? line.quantity : 0;

  // 1. Snapshot priority: valid finite subUnitQuantity > 0 takes absolute precedence
  if (typeof line.subUnitQuantity === 'number' && Number.isFinite(line.subUnitQuantity) && line.subUnitQuantity > 0) {
    return line.subUnitQuantity;
  }

  // 2. Fall back to converting via matched item if available and subUnit configured
  if (!matchedItem) return rawQty;

  const factor = matchedItem.subUnitFactor;
  const subUnit = matchedItem.subUnit;
  if (!subUnit || typeof factor !== 'number' || factor <= 0) {
    return rawQty;
  }

  return convertQuantityToBase(rawQty, line.unit, matchedItem);
}

/**
 * Matches an invoice or purchase line to a catalog item by itemId or trimmed case-insensitive name.
 */
export function findMatchingItem(
  catalogItems: InventoryItem[],
  line: { itemId?: string; name?: string }
): InventoryItem | undefined {
  if (line.itemId) {
    const byId = catalogItems.find((itm) => itm.id === line.itemId);
    if (byId) return byId;
  }
  if (line.name && line.name.trim()) {
    const normalizedName = line.name.trim().toLowerCase();
    return catalogItems.find(
      (itm) => itm.name && itm.name.trim().toLowerCase() === normalizedName
    );
  }
  return undefined;
}

/**
 * Pure calculation: Decrements stock by quantity sold.
 * When allowNegativeStock is false (default), clamped to minimum 0 (non-negative constraint).
 * When allowNegativeStock is true, stock can drop below zero (recording negative inventory balances).
 */
export function calculateStockDecrement(
  currentStock: number,
  quantitySold: number,
  allowNegativeStock: boolean = false
): number {
  const stock = typeof currentStock === 'number' && !isNaN(currentStock) ? currentStock : 0;
  const qty = typeof quantitySold === 'number' && !isNaN(quantitySold) ? Math.max(0, quantitySold) : 0;
  return allowNegativeStock ? stock - qty : Math.max(0, stock - qty);
}

/**
 * Pure calculation: Increments stock by quantity purchased or restored.
 */
export function calculateStockIncrement(currentStock: number, quantityAdded: number): number {
  const stock = typeof currentStock === 'number' && !isNaN(currentStock) ? currentStock : 0;
  const qty = typeof quantityAdded === 'number' && !isNaN(quantityAdded) ? Math.max(0, quantityAdded) : 0;
  return stock + qty;
}

/**
 * Pure check: Returns true if item's currentStock is less than or equal to minStockAlert.
 */
export function isLowStock(item: Pick<InventoryItem, 'currentStock' | 'minStockAlert'>): boolean {
  const stock = typeof item.currentStock === 'number' && !isNaN(item.currentStock) ? item.currentStock : 0;
  const threshold = typeof item.minStockAlert === 'number' && !isNaN(item.minStockAlert) ? item.minStockAlert : 0;
  return stock <= threshold;
}

/**
 * Decrements catalog item stock for each line item in a sales invoice.
 * When allowNegativeStock is false (default), stock is clamped to 0.
 * When allowNegativeStock is true, negative inventory balances are permitted.
 * Returns a new array with updated items (pure, immutable).
 */
export function applyInvoiceStockDecrement(
  catalogItems: InventoryItem[],
  invoiceItems: Array<InvoiceItemEntry | StockLineItem>,
  allowNegativeStock: boolean = false
): InventoryItem[] {
  const itemsList = catalogItems.map((item) => ({ ...item }));
  const now = new Date().toISOString();

  for (const line of invoiceItems) {
    const match = findMatchingItem(itemsList, line);
    if (match) {
      const baseQty = getLineBaseQuantity(line, match);
      match.currentStock = calculateStockDecrement(match.currentStock, baseQty, allowNegativeStock);
      match.updatedAt = now;
    }
  }

  return itemsList;
}

/**
 * Restores catalog item stock when an invoice is deleted or cancelled.
 * Increments stock by the line item quantities.
 * Returns a new array with updated items (pure, immutable).
 */
export function restoreInvoiceStock(
  catalogItems: InventoryItem[],
  invoiceItems: Array<InvoiceItemEntry | StockLineItem>
): InventoryItem[] {
  const itemsList = catalogItems.map((item) => ({ ...item }));
  const now = new Date().toISOString();

  for (const line of invoiceItems) {
    const match = findMatchingItem(itemsList, line);
    if (match) {
      const baseQty = getLineBaseQuantity(line, match);
      match.currentStock = calculateStockIncrement(match.currentStock, baseQty);
      match.updatedAt = now;
    }
  }

  return itemsList;
}

/**
 * Handles editing an existing invoice:
 * 1. Restores the quantities from previous invoice items.
 * 2. Decrements the quantities from new invoice items.
 * Returns a new array with updated items (pure, immutable).
 */
export function revertInvoiceStockAdjustment(
  catalogItems: InventoryItem[],
  previousInvoiceItems: Array<InvoiceItemEntry | StockLineItem>,
  newInvoiceItems: Array<InvoiceItemEntry | StockLineItem>,
  allowNegativeStock: boolean = false
): InventoryItem[] {
  const restored = restoreInvoiceStock(catalogItems, previousInvoiceItems);
  return applyInvoiceStockDecrement(restored, newInvoiceItems, allowNegativeStock);
}

/**
 * Increments catalog item stock when a purchase bill is saved.
 * Also updates latest purchase price if unitPrice > 0.
 * Returns a new array with updated items (pure, immutable).
 */
export function applyPurchaseStockIncrement(
  catalogItems: InventoryItem[],
  purchaseItems: Array<PurchaseItemEntry | InvoiceItemEntry | StockLineItem>
): InventoryItem[] {
  const itemsList = catalogItems.map((item) => ({ ...item }));
  const now = new Date().toISOString();

  for (const line of purchaseItems) {
    const match = findMatchingItem(itemsList, line);
    if (match) {
      const baseQty = getLineBaseQuantity(line, match);
      match.currentStock = calculateStockIncrement(match.currentStock, baseQty);
      if (typeof line.unitPrice === 'number' && line.unitPrice > 0) {
        const factor = match.subUnitFactor;
        const hasSubUnit = match.subUnit && typeof factor === 'number' && factor > 0;
        const cleanLineUnit = String(line.unit || '').trim().toUpperCase();
        const cleanSubUnit = String(match.subUnit || '').trim().toUpperCase();
        const unitPricePrimary =
          hasSubUnit && cleanLineUnit === cleanSubUnit
            ? line.unitPrice * (factor as number)
            : line.unitPrice;
        match.purchasePrice = unitPricePrimary;
      }
      match.updatedAt = now;
    }
  }

  return itemsList;
}

/**
 * Decrements catalog item stock when a purchase bill is deleted or cancelled.
 * When allowNegativeStock is false (default), stock is clamped to 0.
 * Returns a new array with updated items (pure, immutable).
 */
export function applyPurchaseStockDecrement(
  catalogItems: InventoryItem[],
  purchaseItems: Array<PurchaseItemEntry | InvoiceItemEntry | StockLineItem>,
  allowNegativeStock: boolean = false
): InventoryItem[] {
  const itemsList = catalogItems.map((item) => ({ ...item }));
  const now = new Date().toISOString();

  for (const line of purchaseItems) {
    const match = findMatchingItem(itemsList, line);
    if (match) {
      const baseQty = getLineBaseQuantity(line, match);
      match.currentStock = calculateStockDecrement(match.currentStock, baseQty, allowNegativeStock);
      match.updatedAt = now;
    }
  }

  return itemsList;
}

/**
 * Handles editing an existing purchase bill:
 * 1. Decrements previous quantities that were added by the old bill.
 * 2. Increments new quantities added by the updated bill.
 * Returns a new array with updated items (pure, immutable).
 */
export function revertPurchaseStockAdjustment(
  catalogItems: InventoryItem[],
  previousPurchaseItems: Array<PurchaseItemEntry | InvoiceItemEntry | StockLineItem>,
  newPurchaseItems: Array<PurchaseItemEntry | InvoiceItemEntry | StockLineItem>,
  allowNegativeStock: boolean = false
): InventoryItem[] {
  const reverted = applyPurchaseStockDecrement(catalogItems, previousPurchaseItems, allowNegativeStock);
  return applyPurchaseStockIncrement(reverted, newPurchaseItems);
}

/**
 * Applies a manual stock adjustment record (STOCK_IN, STOCK_OUT, WASTAGE, CORRECTION).
 * Returns a new array with updated items (pure, immutable).
 * Prefers adjustment.baseQuantity snapshot when present and finite.
 */
export function applyStockAdjustmentRecord(
  catalogItems: InventoryItem[],
  adjustment: StockAdjustment,
  allowNegativeStock: boolean = false
): InventoryItem[] {
  const itemsList = catalogItems.map((item) => ({ ...item }));
  const match = itemsList.find((i) => i.id === adjustment.itemId);
  if (match) {
    const baseQty =
      typeof adjustment.baseQuantity === 'number' && Number.isFinite(adjustment.baseQuantity)
        ? adjustment.baseQuantity
        : convertQuantityToBase(adjustment.quantity, match.unit, match);
    if (adjustment.type === 'STOCK_IN') {
      match.currentStock = calculateStockIncrement(match.currentStock, baseQty);
    } else {
      match.currentStock = calculateStockDecrement(match.currentStock, baseQty, allowNegativeStock);
    }
    match.updatedAt = new Date().toISOString();
  }

  return itemsList;
}

function matchesMovementItem(
  line: { itemId?: string; name?: string },
  targetId: string,
  targetNormName: string
): boolean {
  if (line.itemId && line.itemId === targetId) return true;
  if (line.name) {
    const lineNorm = line.name.normalize('NFC').trim().toLowerCase();
    if (lineNorm && lineNorm === targetNormName) return true;
  }
  return false;
}

/**
 * Checks whether an item has any historical stock movements.
 * Returns true if any non-cancelled sales invoice line, purchase line (including CHALLAN/GRN),
 * or stock adjustment matches the item's ID or NFC-normalized case-insensitive name.
 */
export function itemHasStockMovements(
  item: { id: string; name: string },
  invoices: Array<{ isCancelled?: boolean; orderStatus?: string; challanStatus?: string; items?: Array<{ itemId?: string; name?: string }> }>,
  purchases: Array<{ isCancelled?: boolean; challanStatus?: string; items?: Array<{ itemId?: string; name?: string }> }>,
  adjustments: Array<{ itemId?: string; itemName?: string }>
): boolean {
  if (!item || !item.id) return false;
  const targetId = item.id;
  const targetNormName = (item.name || '').normalize('NFC').trim().toLowerCase();

  // 1. Invoices (exclude cancelled sales documents)
  for (const inv of invoices || []) {
    if (inv.isCancelled || inv.orderStatus === 'CANCELLED' || inv.challanStatus === 'CANCELLED') continue;
    for (const line of inv.items || []) {
      if (matchesMovementItem(line, targetId, targetNormName)) return true;
    }
  }

  // 2. Purchases (including CHALLAN / GRN, exclude cancelled)
  for (const pur of purchases || []) {
    if (pur.isCancelled || pur.challanStatus === 'CANCELLED') continue;
    for (const line of pur.items || []) {
      if (matchesMovementItem(line, targetId, targetNormName)) return true;
    }
  }

  // 3. Stock adjustments
  for (const adj of adjustments || []) {
    if (adj.itemId === targetId) return true;
    if (adj.itemName) {
      const adjNorm = adj.itemName.normalize('NFC').trim().toLowerCase();
      if (adjNorm && adjNorm === targetNormName) return true;
    }
  }

  return false;
}

/**
 * Determines whether an item's primary unit may be renamed.
 * Allowed when:
 * 1. The item has no sub-unit configured, OR
 * 2. Every matched movement line carries a valid subUnitQuantity snapshot (and adjustments have finite baseQuantity).
 */
export function canRenameItemUnit(
  item: { id: string; name: string; subUnit?: string; subUnitFactor?: number },
  invoices: Array<{ isCancelled?: boolean; orderStatus?: string; challanStatus?: string; items?: Array<{ itemId?: string; name?: string; subUnitQuantity?: number }> }>,
  purchases: Array<{ isCancelled?: boolean; challanStatus?: string; items?: Array<{ itemId?: string; name?: string; subUnitQuantity?: number }> }>,
  adjustments?: Array<{ itemId?: string; itemName?: string; baseQuantity?: number }>
): boolean {
  if (!item || !item.id) return true;
  // If item has no sub-unit, renaming primary unit is always allowed
  if (!item.subUnit || !item.subUnitFactor || item.subUnitFactor <= 0) {
    return true;
  }

  const targetId = item.id;
  const targetNormName = (item.name || '').normalize('NFC').trim().toLowerCase();

  for (const inv of invoices || []) {
    if (inv.isCancelled || inv.orderStatus === 'CANCELLED' || inv.challanStatus === 'CANCELLED') continue;
    for (const line of inv.items || []) {
      if (matchesMovementItem(line, targetId, targetNormName)) {
        if (typeof line.subUnitQuantity !== 'number' || !Number.isFinite(line.subUnitQuantity) || line.subUnitQuantity <= 0) {
          return false;
        }
      }
    }
  }

  for (const pur of purchases || []) {
    if (pur.isCancelled || pur.challanStatus === 'CANCELLED') continue;
    for (const line of pur.items || []) {
      if (matchesMovementItem(line, targetId, targetNormName)) {
        if (typeof line.subUnitQuantity !== 'number' || !Number.isFinite(line.subUnitQuantity) || line.subUnitQuantity <= 0) {
          return false;
        }
      }
    }
  }

  for (const adj of adjustments || []) {
    if (adj.itemId === targetId || (adj.itemName && adj.itemName.normalize('NFC').trim().toLowerCase() === targetNormName)) {
      if (typeof adj.baseQuantity !== 'number' || !Number.isFinite(adj.baseQuantity)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Creates an immutable snapshot invoice line item from a catalog item.
 * Guarantees that subsequent mutations or updates to the master catalog item
 * (e.g. price change, tax rate change) do not mutate historical invoice lines.
 */
export function createInvoiceLineSnapshot(
  item: InventoryItem,
  quantity: number = 1,
  overrides?: Partial<InvoiceItemEntry>
): InvoiceItemEntry {
  const taxable = (item.salePrice || 0) * quantity;
  const gstRate = item.gstRate || 0;
  const halfTax = (taxable * (gstRate / 2)) / 100;
  return {
    itemId: item.id,
    name: item.name,
    hsnSacCode: item.hsnSacCode || '844332',
    unit: item.unit || 'PCS',
    quantity,
    unitPrice: item.salePrice,
    taxableAmount: taxable,
    gstRate: item.gstRate,
    cgstAmount: halfTax,
    sgstAmount: halfTax,
    igstAmount: 0,
    cessAmount: 0,
    totalAmount: taxable + halfTax * 2,
    ...overrides,
  };
}
