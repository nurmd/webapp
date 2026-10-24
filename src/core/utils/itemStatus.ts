import { Invoice } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { InventoryItem } from '../../models/item.ts';

/**
 * Checks whether an inventory item is referenced in any existing sales invoice or purchase bill.
 * Used to enforce data integrity: items used in bills cannot be deleted, only disabled.
 */
export function isItemInBills(
  itemId: string,
  invoices: Invoice[] = [],
  purchases: PurchaseBill[] = []
): boolean {
  if (!itemId) return false;
  const inInvoice = invoices.some((inv) =>
    Boolean(inv && inv.items && inv.items.some((it) => Boolean(it && it.itemId === itemId)))
  );
  if (inInvoice) return true;
  const inPurchase = purchases.some((pur) =>
    Boolean(pur && pur.items && pur.items.some((it) => Boolean(it && it.itemId === itemId)))
  );
  return inPurchase;
}

/**
 * Checks if an item is active (isDisabled is false, isActive is not false).
 */
export function isItemActive(item: InventoryItem): boolean {
  return !item.isDisabled && item.isActive !== false;
}

/**
 * Filters a list of items to return only active (non-disabled) items.
 */
export function getActiveItems(items: InventoryItem[]): InventoryItem[] {
  return items.filter(isItemActive);
}

/**
 * Checks if an item needs restock (active and currentStock <= (minStockAlert ?? 5)),
 * including zero and negative stock.
 */
export function isItemNeedingRestock(item: InventoryItem): boolean {
  if (!isItemActive(item)) return false;
  const threshold = item.minStockAlert ?? 5;
  return (item.currentStock ?? 0) <= threshold;
}

/**
 * Checks if an item is strictly low stock (active and 0 < currentStock <= (minStockAlert ?? 5)).
 */
export function isItemLowStock(item: InventoryItem): boolean {
  if (!isItemActive(item)) return false;
  const threshold = item.minStockAlert ?? 5;
  const stock = item.currentStock ?? 0;
  return stock > 0 && stock <= threshold;
}

/**
 * Checks if an item is out of stock (active and currentStock <= 0, including negative).
 */
export function isItemOutOfStock(item: InventoryItem): boolean {
  if (!isItemActive(item)) return false;
  return (item.currentStock ?? 0) <= 0;
}

export interface StockAlertCounts {
  needRestock: number;
  lowStock: number;
  outOfStock: number;
}

/**
 * Shared helper that counts items where isDisabled is false, isActive is not false,
 * and currentStock <= (minStockAlert ?? 5), including zero and negative stock.
 * Need Restock = low + out-of-stock.
 */
export function countLowStockItems(items: InventoryItem[] = []): number {
  return items.filter(isItemNeedingRestock).length;
}

/**
 * Returns breakdown of stock alert counts (needRestock = lowStock + outOfStock).
 */
export function getStockAlertCounts(items: InventoryItem[] = []): StockAlertCounts {
  let lowStock = 0;
  let outOfStock = 0;

  for (const item of items) {
    if (!item || !isItemActive(item)) continue;
    const threshold = item.minStockAlert ?? 5;
    const stock = item.currentStock ?? 0;
    if (stock <= 0) {
      outOfStock++;
    } else if (stock <= threshold) {
      lowStock++;
    }
  }

  return {
    needRestock: lowStock + outOfStock,
    lowStock,
    outOfStock,
  };
}

/**
 * Returns all active items that need restock (low stock + out of stock).
 */
export function getItemsNeedingRestock(items: InventoryItem[] = []): InventoryItem[] {
  return items.filter(isItemNeedingRestock);
}
