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
 * Filters a list of items to return only active (non-disabled) items.
 */
export function getActiveItems(items: InventoryItem[]): InventoryItem[] {
  return items.filter((i) => !i.isDisabled && i.isActive !== false);
}
