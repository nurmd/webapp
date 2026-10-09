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
  unitPrice?: number;
  [key: string]: any;
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
 * Pure calculation: Decrements stock by quantity sold, clamped to minimum 0.
 * Ensures stock never drops below zero (non-negative stock constraint).
 */
export function calculateStockDecrement(currentStock: number, quantitySold: number): number {
  const stock = typeof currentStock === 'number' && !isNaN(currentStock) ? currentStock : 0;
  const qty = typeof quantitySold === 'number' && !isNaN(quantitySold) ? Math.max(0, quantitySold) : 0;
  return Math.max(0, stock - qty);
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
 * Stock is clamped to 0 on overselling (never drops below zero).
 * Returns a new array with updated items (pure, immutable).
 */
export function applyInvoiceStockDecrement(
  catalogItems: InventoryItem[],
  invoiceItems: Array<InvoiceItemEntry | StockLineItem>
): InventoryItem[] {
  const itemsList = catalogItems.map((item) => ({ ...item }));
  const now = new Date().toISOString();

  for (const line of invoiceItems) {
    const match = findMatchingItem(itemsList, line);
    if (match) {
      match.currentStock = calculateStockDecrement(match.currentStock, line.quantity);
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
      match.currentStock = calculateStockIncrement(match.currentStock, line.quantity);
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
  newInvoiceItems: Array<InvoiceItemEntry | StockLineItem>
): InventoryItem[] {
  const restored = restoreInvoiceStock(catalogItems, previousInvoiceItems);
  return applyInvoiceStockDecrement(restored, newInvoiceItems);
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
      match.currentStock = calculateStockIncrement(match.currentStock, line.quantity);
      if (typeof line.unitPrice === 'number' && line.unitPrice > 0) {
        match.purchasePrice = line.unitPrice;
      }
      match.updatedAt = now;
    }
  }

  return itemsList;
}

/**
 * Decrements catalog item stock when a purchase bill is deleted or cancelled.
 * Stock is clamped to 0 if decrement exceeds stock.
 * Returns a new array with updated items (pure, immutable).
 */
export function applyPurchaseStockDecrement(
  catalogItems: InventoryItem[],
  purchaseItems: Array<PurchaseItemEntry | InvoiceItemEntry | StockLineItem>
): InventoryItem[] {
  const itemsList = catalogItems.map((item) => ({ ...item }));
  const now = new Date().toISOString();

  for (const line of purchaseItems) {
    const match = findMatchingItem(itemsList, line);
    if (match) {
      match.currentStock = calculateStockDecrement(match.currentStock, line.quantity);
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
  newPurchaseItems: Array<PurchaseItemEntry | InvoiceItemEntry | StockLineItem>
): InventoryItem[] {
  const reverted = applyPurchaseStockDecrement(catalogItems, previousPurchaseItems);
  return applyPurchaseStockIncrement(reverted, newPurchaseItems);
}

/**
 * Applies a manual stock adjustment record (STOCK_IN, STOCK_OUT, WASTAGE, CORRECTION).
 * Returns a new array with updated items (pure, immutable).
 */
export function applyStockAdjustmentRecord(
  catalogItems: InventoryItem[],
  adjustment: StockAdjustment
): InventoryItem[] {
  const itemsList = catalogItems.map((item) => ({ ...item }));
  const match = itemsList.find((i) => i.id === adjustment.itemId);
  if (match) {
    if (adjustment.type === 'STOCK_IN') {
      match.currentStock = calculateStockIncrement(match.currentStock, adjustment.quantity);
    } else {
      match.currentStock = calculateStockDecrement(match.currentStock, adjustment.quantity);
    }
    match.updatedAt = new Date().toISOString();
  }

  return itemsList;
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
