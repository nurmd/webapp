import React, { useState, useMemo } from 'react';
import { InventoryItem, StockAdjustment, isItemDisabled } from '../../models/item.ts';
import { Invoice } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { isItemInBills } from '../../core/utils/itemStatus.ts';

export type ItemTransactionType = 'SALE' | 'PURCHASE' | 'STOCK_IN' | 'STOCK_OUT' | 'WASTAGE' | 'CORRECTION';

export interface ItemTransactionRecord {
  id: string;
  type: ItemTransactionType;
  date: string;
  referenceNo: string;
  partyName?: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
  totalAmount?: number;
  notes?: string;
  isInward: boolean;
}

export interface ItemDetailSheetProps {
  item: InventoryItem | null;
  onClose: () => void;
  isGstActive: boolean;
  allInvoices: Invoice[];
  allPurchases: PurchaseBill[];
  allAdjustments: StockAdjustment[];
  isBuyPriceVisible: (itemId: string) => boolean;
  toggleBuyPrice: (itemId: string, e?: React.MouseEvent) => void;
  onOpenEdit: (item: InventoryItem) => void;
  onOpenAdjustment: (item: InventoryItem, type: 'STOCK_IN' | 'STOCK_OUT') => void;
  onToggleItemStatus: (item: InventoryItem) => void;
  onDeleteItem: (itemId: string) => void;
  onReconcileItemStock: (item: InventoryItem, targetStock: number) => void;
}

export const ItemDetailSheet: React.FC<ItemDetailSheetProps> = ({
  item,
  onClose,
  isGstActive,
  allInvoices,
  allPurchases,
  allAdjustments,
  isBuyPriceVisible,
  toggleBuyPrice,
  onOpenEdit,
  onOpenAdjustment,
  onToggleItemStatus,
  onDeleteItem,
  onReconcileItemStock,
}) => {
  const [txnFilter, setTxnFilter] = useState<'ALL' | 'SALES' | 'PURCHASES' | 'ADJUSTMENTS'>('ALL');

  const itemTransactions = useMemo(() => {
    if (!item) return [];
    const list: ItemTransactionRecord[] = [];

    // 1. Sales from Invoices
    for (const inv of allInvoices) {
      if (!inv.items) continue;
      for (const it of inv.items) {
        if (
          it.itemId === item.id ||
          (it.name && it.name.trim().toLowerCase() === item.name.trim().toLowerCase())
        ) {
          list.push({
            id: `inv-${inv.id}-${it.itemId || it.name}`,
            type: 'SALE',
            date: inv.date,
            referenceNo: inv.invoiceNumber || 'INV',
            partyName: inv.partyName || 'Cash / Retail Customer',
            quantity: it.quantity,
            unit: it.unit || item.unit,
            unitPrice: it.unitPrice,
            totalAmount: it.totalAmount,
            notes: inv.invoiceType === 'B2B' ? 'B2B Tax Invoice' : 'Retail Sale',
            isInward: false,
          });
        }
      }
    }

    // 2. Purchases from Purchase Bills
    for (const bill of allPurchases) {
      if (!bill.items) continue;
      for (const it of bill.items) {
        if (
          it.itemId === item.id ||
          (it.name && it.name.trim().toLowerCase() === item.name.trim().toLowerCase())
        ) {
          list.push({
            id: `pur-${bill.id}-${it.itemId || it.name}`,
            type: 'PURCHASE',
            date: bill.date,
            referenceNo: bill.billNumber || 'BILL',
            partyName: bill.supplierName || 'Vendor / Supplier',
            quantity: it.quantity,
            unit: it.unit || item.unit,
            unitPrice: it.unitPrice,
            totalAmount: it.totalAmount,
            notes: 'Inward Purchase Bill',
            isInward: true,
          });
        }
      }
    }

    // 3. Stock Adjustments
    for (const adj of allAdjustments) {
      if (
        adj.itemId === item.id ||
        (adj.itemName && adj.itemName.trim().toLowerCase() === item.name.trim().toLowerCase())
      ) {
        const isInward = adj.type === 'STOCK_IN';
        list.push({
          id: `adj-${adj.id}`,
          type: adj.type,
          date: adj.date,
          referenceNo: `ADJ-${adj.id.substring(Math.max(0, adj.id.length - 4))}`,
          partyName: adj.adjustedBy || 'Inventory Manager',
          quantity: adj.quantity,
          unit: item.unit,
          unitPrice: item.purchasePrice,
          totalAmount: adj.quantity * item.purchasePrice,
          notes: adj.reason || (isInward ? 'Manual Stock In' : 'Manual Stock Out'),
          isInward,
        });
      }
    }

    // Sort chronologically (newest first)
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return list;
  }, [item, allInvoices, allPurchases, allAdjustments]);

  // Filtered transactions according to selected tab
  const filteredItemTransactions = useMemo(() => {
    if (txnFilter === 'ALL') return itemTransactions;
    if (txnFilter === 'SALES') return itemTransactions.filter((t) => t.type === 'SALE');
    if (txnFilter === 'PURCHASES') return itemTransactions.filter((t) => t.type === 'PURCHASE');
    if (txnFilter === 'ADJUSTMENTS') return itemTransactions.filter((t) => !['SALE', 'PURCHASE'].includes(t.type));
    return itemTransactions;
  }, [itemTransactions, txnFilter]);

  // Summary totals for item transactions
  const itemTxnSummary = useMemo(() => {
    let totalSoldQty = 0;
    let totalSoldAmount = 0;
    let totalPurchasedQty = 0;
    let totalPurchasedAmount = 0;
    let totalAdjustedQty = 0;

    for (const t of itemTransactions) {
      if (t.type === 'SALE') {
        totalSoldQty += t.quantity;
        totalSoldAmount += t.totalAmount || 0;
      } else if (t.type === 'PURCHASE') {
        totalPurchasedQty += t.quantity;
        totalPurchasedAmount += t.totalAmount || 0;
      } else if (t.isInward) {
        totalAdjustedQty += t.quantity;
      } else {
        totalAdjustedQty -= t.quantity;
      }
    }

    return {
      totalSoldQty,
      totalSoldAmount,
      totalPurchasedQty,
      totalPurchasedAmount,
      totalAdjustedQty,
      totalTransactions: itemTransactions.length,
    };
  }, [itemTransactions]);

  if (!item) return null;

  const netTxnStock = Math.max(
    0,
    itemTxnSummary.totalPurchasedQty + itemTxnSummary.totalAdjustedQty - itemTxnSummary.totalSoldQty
  );
  const hasTxnDiscrepancy =
    itemTxnSummary.totalPurchasedQty > 0 &&
    itemTxnSummary.totalTransactions > 0 &&
    item.currentStock > netTxnStock;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="bg-surface-container-lowest rounded-t-3xl sm:rounded-2xl p-4 sm:p-5 w-full max-w-lg max-h-[85vh] shadow-2xl border border-outline-variant/30 flex flex-col gap-3.5 overflow-hidden animate-in slide-in-from-bottom">
        {/* Header: Title + Stock Status + Close */}
        <div className="flex items-center justify-between pb-2.5 border-b border-outline-variant/20 flex-shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-headline-sm text-base font-bold text-on-surface truncate">
                {item.name}
              </h3>
              <span className={`px-2 py-0.5 rounded-full font-label-sm text-[10px] font-bold flex-shrink-0 ${
                item.currentStock <= 0
                  ? 'bg-error/15 text-error'
                  : item.currentStock <= item.minStockAlert
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  : 'bg-secondary-container text-on-secondary-container'
              }`}>
                {item.currentStock} {item.unit}
              </span>
            </div>
            <p className="text-[11px] text-on-surface-variant font-mono mt-0.5">
              {item.category}
              {isGstActive && item.hsnSacCode ? ` • HSN: ${item.hsnSacCode}` : ''}
              {item.sku ? ` • SKU: ${item.sku}` : ''}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer flex-shrink-0"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Disabled Item Banner */}
        {isItemDisabled(item) && (
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined text-amber-600 text-[18px] flex-shrink-0">block</span>
              <span className="font-semibold truncate">Item is disabled (hidden from billing)</span>
            </div>
            <button
              type="button"
              onClick={() => onToggleItemStatus(item)}
              className="px-3 py-1 rounded-lg bg-secondary text-on-secondary font-bold text-xs cursor-pointer shadow-xs active:scale-95 flex-shrink-0"
            >
              Enable
            </button>
          </div>
        )}

        {/* Historical Bills Reference Banner */}
        {isItemInBills(item.id, allInvoices, allPurchases) && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-container-low text-[11px] text-outline flex-shrink-0">
            <span className="material-symbols-outlined text-[16px] text-secondary flex-shrink-0">verified_user</span>
            <span>Referenced in historical bills. Cannot be deleted to preserve accounting records.</span>
          </div>
        )}

        {/* Stock Discrepancy Alert & 1-Tap Reconciliation */}
        {hasTxnDiscrepancy && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2.5 text-xs flex-shrink-0 animate-fade-in">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[18px]">published_with_changes</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-amber-900 dark:text-amber-200 truncate">
                    Stock Discrepancy
                  </span>
                  {item.currentStock === netTxnStock * 2 && (
                    <span className="text-[10px] bg-amber-500/25 text-amber-700 dark:text-amber-300 font-bold px-1.5 py-0.5 rounded">
                      Double Counted (2x)
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-on-surface-variant block mt-0.5 truncate">
                  Catalog: <strong className="text-on-surface">{item.currentStock}</strong> • Transactions: <strong className="text-on-surface">{netTxnStock} {item.unit}</strong>
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onReconcileItemStock(item, netTxnStock)}
              className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1 cursor-pointer active:scale-95 shadow-xs flex-shrink-0 transition-all"
              title="Correct stock to match transaction total"
            >
              <span className="material-symbols-outlined text-[15px]">done_all</span>
              <span>Sync to {netTxnStock}</span>
            </button>
          </div>
        )}

        {/* Compact Pricing Bar */}
        <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-surface-container-low text-xs flex-shrink-0">
          <div>
            <span className="text-[10px] text-outline font-semibold uppercase block">Sale Price</span>
            <span className="font-bold text-on-surface text-sm">{formatINR(item.salePrice)}</span>
          </div>
          <div>
            <span className="text-[10px] text-outline font-semibold uppercase block">Buy Price</span>
            <button
              type="button"
              onClick={(e) => toggleBuyPrice(item.id, e)}
              className="font-bold text-on-surface text-sm flex items-center gap-1 cursor-pointer hover:text-secondary transition-colors"
              title={isBuyPriceVisible(item.id) ? 'Click to hide purchase price' : 'Click to view purchase price'}
            >
              <span className="font-mono">
                {isBuyPriceVisible(item.id)
                  ? formatINR(item.purchasePrice)
                  : '***'}
              </span>
              <span className="material-symbols-outlined text-[13px] text-outline">
                {isBuyPriceVisible(item.id) ? 'visibility' : 'visibility_off'}
              </span>
            </button>
          </div>
          <div>
            <span className="text-[10px] text-outline font-semibold uppercase block">Stock Value</span>
            <span className="font-bold text-on-surface text-sm">
              {isBuyPriceVisible(item.id)
                ? formatINR(item.currentStock * item.purchasePrice)
                : '***'}
            </span>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center justify-between gap-1 flex-shrink-0">
          <span className="text-xs font-bold text-on-surface">Transactions</span>
          <div className="inline-flex rounded-lg bg-surface-container p-0.5 text-[11px] font-semibold">
            {(['ALL', 'SALES', 'PURCHASES', 'ADJUSTMENTS'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setTxnFilter(tab)}
                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer capitalize ${
                  txnFilter === tab
                    ? 'bg-surface-container-lowest text-on-surface shadow-xs font-bold'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {tab === 'ALL' ? 'All' : tab.toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Transaction List */}
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 text-xs min-h-[160px] max-h-[360px]">
          {filteredItemTransactions.length === 0 ? (
            <div className="py-8 text-center text-on-surface-variant flex flex-col items-center gap-1">
              <span className="material-symbols-outlined text-[24px] text-outline">receipt_long</span>
              <p className="text-xs">No transactions recorded</p>
            </div>
          ) : (
            filteredItemTransactions.map((txn) => {
              const isSale = txn.type === 'SALE';
              const isPurchase = txn.type === 'PURCHASE';

              return (
                <div
                  key={txn.id}
                  className="p-2.5 rounded-xl bg-surface-container-low/60 hover:bg-surface-container-low transition-colors flex items-center justify-between gap-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      txn.isInward
                        ? 'bg-secondary/15 text-secondary'
                        : 'bg-error/15 text-error'
                    }`}>
                      <span className="material-symbols-outlined text-[18px]">
                        {txn.isInward ? 'arrow_downward' : 'arrow_upward'}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-on-surface truncate text-xs">
                          {isSale ? 'Sale' : isPurchase ? 'Purchase' : txn.type.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] text-outline font-mono truncate">
                          #{txn.referenceNo}
                        </span>
                      </div>
                      <p className="text-[11px] text-on-surface-variant truncate">
                        {txn.partyName || txn.notes} • <span className="text-[10px] text-outline">{txn.date}</span>
                      </p>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <span className={`text-xs font-bold font-tabular-data block ${
                      txn.isInward ? 'text-secondary' : 'text-error'
                    }`}>
                      {txn.isInward ? '+' : '-'}{txn.quantity} {txn.unit}
                    </span>
                    {txn.totalAmount !== undefined && (
                      <span className="text-[11px] text-on-surface-variant font-medium font-tabular-data block">
                        {formatINR(txn.totalAmount)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Actions: Stock In, Stock Out, Edit, Toggle Enable/Disable, Delete */}
        <div className="pt-2 border-t border-outline-variant/20 flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => onOpenAdjustment(item, 'STOCK_IN')}
            className="flex-1 py-2 px-2.5 rounded-xl bg-secondary text-on-secondary font-label-md text-xs font-bold flex items-center justify-center gap-1 active:scale-95 cursor-pointer shadow-xs"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <span>Stock In</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenAdjustment(item, 'STOCK_OUT')}
            className="flex-1 py-2 px-2.5 rounded-xl bg-surface-container text-on-surface font-label-md text-xs font-bold flex items-center justify-center gap-1 active:scale-95 cursor-pointer hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined text-[16px]">remove</span>
            <span>Stock Out</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenEdit(item)}
            className="w-9 h-9 rounded-xl bg-surface-container text-on-surface flex items-center justify-center active:scale-95 cursor-pointer hover:bg-surface-container-high transition-colors"
            title="Edit Item"
          >
            <span className="material-symbols-outlined text-[18px]">edit</span>
          </button>

          {/* Disable / Enable Toggle Button */}
          <button
            type="button"
            onClick={() => onToggleItemStatus(item)}
            className={`h-9 px-2.5 rounded-xl font-label-md text-xs font-bold flex items-center justify-center gap-1 active:scale-95 cursor-pointer transition-colors ${
              isItemDisabled(item)
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
            }`}
            title={isItemDisabled(item) ? 'Enable this item' : 'Disable this item'}
          >
            <span className="material-symbols-outlined text-[18px]">
              {isItemDisabled(item) ? 'check_circle' : 'block'}
            </span>
            <span className="hidden sm:inline">
              {isItemDisabled(item) ? 'Enable' : 'Disable'}
            </span>
          </button>

          {/* Delete Button with Protection for Items in Bills */}
          <button
            type="button"
            onClick={() => {
              const inBills = isItemInBills(item.id, allInvoices, allPurchases);
              if (inBills) {
                if (window.confirm('This item is referenced in existing bills and CANNOT be deleted to preserve financial records.\n\nWould you like to DISABLE this item instead to hide it from billing?')) {
                  onToggleItemStatus(item);
                }
                return;
              }
              if (window.confirm(`Delete item "${item.name}"?`)) {
                onDeleteItem(item.id);
                onClose();
              }
            }}
            className={`w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 cursor-pointer transition-colors ${
              isItemInBills(item.id, allInvoices, allPurchases)
                ? 'bg-surface-container text-outline hover:text-error'
                : 'bg-error/10 text-error hover:bg-error/20'
            }`}
            title={
              isItemInBills(item.id, allInvoices, allPurchases)
                ? 'Item is in bills (Cannot delete - Click to disable)'
                : 'Delete Item'
            }
          >
            <span className="material-symbols-outlined text-[18px]">
              {isItemInBills(item.id, allInvoices, allPurchases) ? 'lock' : 'delete'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
