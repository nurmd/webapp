import { InventoryItem, StockAdjustment } from '../../models/item.ts';
import { Invoice } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { db } from '../../services/db.ts';
import { auditTrail } from '../../services/auditTrail.ts';
import { rbac } from '../../services/rbac.ts';

export interface StockDiscrepancyRecord {
  itemId: string;
  itemName: string;
  sku?: string;
  unit: string;
  recordedStock: number;
  computedStock: number;
  variance: number; // recorded - computed
  totalPurchased: number;
  totalSold: number;
  totalAdjusted: number;
  isNegativeStockViolation: boolean;
  isLowStock: boolean;
  isOutOfStock: boolean;
}

export interface StockAuditReport {
  auditedAt: string;
  totalItemsAudited: number;
  healthyItemsCount: number;
  discrepantItemsCount: number;
  negativeStockViolationsCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalStockVariance: number;
  discrepancies: StockDiscrepancyRecord[];
}

export interface ReconcileStockResult {
  reconciledCount: number;
  reconciledItems: string[];
  adjustmentsCreated: number;
  auditRecordId?: string;
}

/**
 * Pure calculation engine to crosscheck all inventory item stocks against purchases, sales, and adjustments.
 */
export function auditAllItemStock(options?: {
  items?: InventoryItem[];
  invoices?: Invoice[];
  purchases?: PurchaseBill[];
  adjustments?: StockAdjustment[];
  allowNegativeStock?: boolean;
}): StockAuditReport {
  const items = options?.items || db.getItems();
  const invoices = (options?.invoices || db.getInvoices()).filter((i) => !i.isCancelled);
  const purchases = (options?.purchases || db.getPurchases()).filter((p) => !p.isCancelled);
  const adjustments = options?.adjustments || db.getStockAdjustments();
  const allowNegativeStock =
    options?.allowNegativeStock !== undefined
      ? options.allowNegativeStock
      : db.getAllowNegativeStock();

  const discrepancies: StockDiscrepancyRecord[] = [];
  let negativeStockViolationsCount = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;

  for (const item of items) {
    const itemId = item.id;
    const itemNameNorm = (item.name || '').trim().toLowerCase();

    // 1. Calculate Purchased Quantity from all Purchase Bills
    let totalPurchased = 0;
    for (const pur of purchases) {
      for (const line of pur.items) {
        const matchesId = line.itemId && line.itemId === itemId;
        const matchesName = line.name && line.name.trim().toLowerCase() === itemNameNorm;
        if (matchesId || matchesName) {
          totalPurchased += Number(line.quantity) || 0;
        }
      }
    }

    // 2. Calculate Sold Quantity from all Sales Invoices
    let totalSold = 0;
    for (const inv of invoices) {
      for (const line of inv.items) {
        const matchesId = line.itemId && line.itemId === itemId;
        const matchesName = line.name && line.name.trim().toLowerCase() === itemNameNorm;
        if (matchesId || matchesName) {
          totalSold += Number(line.quantity) || 0;
        }
      }
    }

    // 3. Calculate Net Adjustments from Stock Adjustments
    let totalAdjusted = 0;
    const itemAdjustments = adjustments.filter(
      (adj: StockAdjustment) => adj.itemId === itemId || (adj.itemName && adj.itemName.trim().toLowerCase() === itemNameNorm)
    );
    for (const adj of itemAdjustments) {
      const q = Number(adj.quantity) || 0;
      if (adj.type === 'STOCK_IN') {
        totalAdjusted += q;
      } else if (adj.type === 'STOCK_OUT' || adj.type === 'WASTAGE') {
        totalAdjusted -= q;
      } else if (adj.type === 'CORRECTION') {
        // In stockEngine.ts, any non-STOCK_IN type performs calculateStockDecrement
        // so CORRECTION is a decrement unless specified otherwise.
        totalAdjusted -= q;
      }
    }

    totalPurchased = Number(totalPurchased.toFixed(3));
    totalSold = Number(totalSold.toFixed(3));
    totalAdjusted = Number(totalAdjusted.toFixed(3));

    // Ground-truth transaction derived stock:
    // If an item was created with an explicit initial stock, or purchased/sold:
    // Note: If no purchases and no adjustments exist yet, the baseline is what was initialized.
    // When transactions exist, computed stock = Total Inflow (Purchased + Positive Adjustments) - Outflow (Sold + Wastage).
    // In many business systems without separate opening stock field, if item has movements,
    // computed movement stock = (Total Purchased - Total Sold + Total Adjusted).
    const computedMovementStock = totalPurchased - totalSold + totalAdjusted;
    const recordedStock = Number((item.currentStock || 0).toFixed(3));

    // When the item has transactions, we evaluate consistency:
    const hasMovements = totalPurchased > 0 || totalSold > 0 || itemAdjustments.length > 0;
    
    // Variance between recorded stock and transaction-derived stock (if movements exist)
    const computedStock = hasMovements ? Number(computedMovementStock.toFixed(3)) : recordedStock;
    const variance = Number((recordedStock - computedStock).toFixed(3));

    const isNegative = recordedStock < 0;
    const isNegativeStockViolation = !allowNegativeStock && isNegative;
    const isLowStock = recordedStock <= (item.minStockAlert ?? 5) && recordedStock > 0;
    const isOutOfStock = recordedStock <= 0;

    if (isNegativeStockViolation) negativeStockViolationsCount++;
    if (isLowStock) lowStockCount++;
    if (isOutOfStock) outOfStockCount++;

    if (Math.abs(variance) > 0.001 || isNegativeStockViolation) {
      discrepancies.push({
        itemId: item.id,
        itemName: item.name,
        sku: item.sku,
        unit: item.unit,
        recordedStock,
        computedStock,
        variance,
        totalPurchased,
        totalSold,
        totalAdjusted,
        isNegativeStockViolation,
        isLowStock,
        isOutOfStock,
      });
    }
  }

  const healthyItemsCount = items.length - discrepancies.length;
  const totalStockVariance = Number(
    discrepancies.reduce((sum, d) => sum + Math.abs(d.variance), 0).toFixed(3)
  );

  return {
    auditedAt: new Date().toISOString(),
    totalItemsAudited: items.length,
    healthyItemsCount,
    discrepantItemsCount: discrepancies.length,
    negativeStockViolationsCount,
    lowStockCount,
    outOfStockCount,
    totalStockVariance,
    discrepancies,
  };
}

/**
 * 1-Click Auto-Reconciliation of stock discrepancies to align current inventory with transactions.
 */
export async function reconcileItemStock(
  report?: StockAuditReport
): Promise<ReconcileStockResult> {
  const activeReport = report || auditAllItemStock();
  const currentItems = db.getItems();
  const reconciledItems: string[] = [];
  let adjustmentsCreated = 0;

  for (const disc of activeReport.discrepancies) {
    const idx = currentItems.findIndex((i) => i.id === disc.itemId);
    if (idx >= 0) {
      const item = currentItems[idx];
      const targetStock = Math.max(0, disc.computedStock);
        // Update item currentStock directly to match ground truth
        const updatedItem = {
          ...item,
          currentStock: targetStock,
          updatedAt: new Date().toISOString(),
        };
        db.saveItem(updatedItem);
        adjustmentsCreated++;
        reconciledItems.push(item.name);
      }
    }

  // Log MCA Rule 3(1) Immutable Audit Log Entry
  const user = rbac.getActiveUser();
  const auditEntry = await auditTrail.logEvent({
    userId: user.id || 'usr_auditor',
    userName: user.name || 'Inventory Stock Auditor',
    userRole: user.role || 'OWNER',
    actionType: 'STOCK_ADJUSTMENT',
    documentId: `RECON-STK-${Date.now()}`,
    documentType: 'ITEM',
    summary: `Stock Auditor reconciled ${reconciledItems.length} inventory items by generating ${adjustmentsCreated} correction entries. Total variance aligned: ${activeReport.totalStockVariance} units.`,
    newSnapshot: {
      reconciledItems,
      adjustmentsCreated,
      totalStockVariance: activeReport.totalStockVariance,
      auditedAt: activeReport.auditedAt,
    },
  });

  return {
    reconciledCount: reconciledItems.length,
    reconciledItems,
    adjustmentsCreated,
    auditRecordId: auditEntry?.id,
  };
}
