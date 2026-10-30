import React from 'react';
import { formatINR, formatQuantity } from '../../../core/utils/formatters.ts';
import type { ItemPriceMode } from '../../../models/item.ts';
import type { InvoiceItemEntry } from '../../../models/invoice.ts';
import type { PurchaseItemEntry } from '../../../models/purchase.ts';
import { inclusiveFromExclusive } from '../../../core/gst/calculator.ts';

export interface DocumentGridRow {
  itemId: string;
  name: string;
  description?: string;
  hsnSacCode: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  unitPriceInclusive?: number;
  priceMode?: ItemPriceMode;
  mrp?: number;
  discountPercent: number;
  discountAmount?: number;
  gstRate: number;
  cessRate?: number;
  totalAmount?: number;
}

export type DocumentLineItem = DocumentGridRow | InvoiceItemEntry | PurchaseItemEntry;

export interface DocumentLineItemsGridProps {
  mode?: 'interactive' | 'compact';
  kind?: 'invoice' | 'purchase';
  rows?: DocumentLineItem[];
  items?: DocumentLineItem[];
  calcItems?: Array<{
    discountAmount: number;
    taxableAmount: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    cessAmount?: number;
    totalAmount: number;
  }>;
  isGstActive: boolean;
  isCompositionScheme?: boolean;
  onAddItem?: () => void;
  onEditItem?: (index: number) => void;
  onRemoveItem?: (index: number) => void;
  onOpenScanner?: () => void;
}

function getRowTotal(row: DocumentLineItem, calcItem?: { totalAmount: number }): number {
  if (calcItem && typeof calcItem.totalAmount === 'number') {
    return calcItem.totalAmount;
  }
  if (typeof row.totalAmount === 'number') {
    return row.totalAmount;
  }
  const qty = Number(row.quantity) || 0;
  const disc = Math.min(100, Math.max(0, Number(row.discountPercent) || 0));
  const discMultiplier = 1 - disc / 100;
  const gst = Number(row.gstRate) || 0;
  const cess = Number(row.cessRate) || 0;

  if (row.priceMode === 'INCLUSIVE' && row.unitPriceInclusive !== undefined) {
    const incl = Number(row.unitPriceInclusive) || 0;
    const net = qty * incl * discMultiplier;
    const taxable = gst > 0 ? (net * 100) / (100 + gst) : net;
    return net + (taxable * cess) / 100;
  }

  const excl = Number(row.unitPrice) || 0;
  return qty * excl * discMultiplier * (1 + (gst + cess) / 100);
}

export const DocumentLineItemsGrid: React.FC<DocumentLineItemsGridProps> = ({
  mode = 'interactive',
  kind = 'invoice',
  rows: propRows,
  items: propItems,
  calcItems,
  isGstActive,
  isCompositionScheme = false,
  onAddItem,
  onEditItem,
  onRemoveItem,
  onOpenScanner,
}) => {
  const isPurchase = kind === 'purchase';
  const effectiveRows = propRows || propItems || [];

  // Compact table view (used in simplified preview modals)
  if (mode === 'compact') {
    return (
      <div className="rounded-xl border border-outline-variant/30 overflow-hidden bg-surface-container-lowest">
        <div className="overflow-x-hidden">
          <table className="w-full text-left text-[11px] border-collapse table-fixed">
            <thead className="sticky top-0 bg-surface-container-low text-on-surface-variant font-bold border-b border-outline-variant/20 z-10">
              <tr>
                <th className="py-1.5 px-2.5 font-semibold w-[46%] text-left">Item</th>
                <th className="py-1.5 px-2 text-center font-semibold w-[26%]">Qty × Rate</th>
                <th className="py-1.5 px-2.5 text-right font-semibold w-[28%]">
                  <span className="block text-right">Total</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/15 text-on-surface">
              {effectiveRows.length > 0 ? (
                effectiveRows.map((item, idx) => {
                  const isGst = isGstActive && !isCompositionScheme;
                  const priceMode = item.priceMode ?? 'EXCLUSIVE';
                  const storedInclusive = Number(item.unitPriceInclusive);
                  const inclusiveRate =
                    priceMode === 'INCLUSIVE'
                      ? (Number.isFinite(storedInclusive) && storedInclusive > 0
                          ? storedInclusive
                          : inclusiveFromExclusive(item.unitPrice, item.gstRate || 0))
                      : inclusiveFromExclusive(item.unitPrice, item.gstRate || 0);
                  const cess = Number(item.cessRate) || 0;
                  const rowTotal = getRowTotal(item, calcItems?.[idx]);

                  return (
                    <tr key={idx} className="hover:bg-surface-container-low/40">
                      <td className="py-1.5 px-2.5 min-w-0 text-left">
                        <div className="font-bold text-on-surface break-words line-clamp-2" title={item.name}>
                          {item.name}
                        </div>
                        <div className="text-[9px] text-on-surface-variant flex flex-wrap items-center gap-1 font-mono">
                          {isGstActive && item.hsnSacCode && <span>HSN {item.hsnSacCode}</span>}
                          {isGstActive && item.hsnSacCode && <span>•</span>}
                          {isGst && (
                            <span
                              className={`font-semibold ${
                                isPurchase
                                  ? 'text-orange-600 dark:text-orange-400'
                                  : 'text-secondary'
                              }`}
                            >
                              GST {item.gstRate || 0}%
                            </span>
                          )}
                          {isGst && cess > 0 && <span>• CESS {cess}%</span>}
                        </div>
                      </td>
                      <td className="py-1.5 px-2 text-center min-w-0">
                        <div className="font-mono font-medium text-on-surface truncate text-center">
                          {formatQuantity(item.quantity, 4)}{' '}
                          <span className="text-[9px] text-on-surface-variant">
                            {item.unit || 'PCS'}
                          </span>
                        </div>
                        <div className="text-[10px] text-on-surface-variant font-mono truncate text-center">
                          @ {formatINR(item.unitPrice)}
                        </div>
                        {isGst && (
                          <div className="text-[9px] text-on-surface-variant font-mono truncate text-center">
                            Incl. {formatINR(inclusiveRate)}
                          </div>
                        )}
                      </td>
                      <td className="py-1.5 px-2.5 text-right font-mono font-bold text-on-surface whitespace-nowrap tabular-nums">
                        <div className="w-full text-right flex justify-end">
                          <span>{formatINR(rowTotal)}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-on-surface-variant text-xs">
                    {isPurchase ? 'No items recorded in this bill' : 'No items in this invoice'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Interactive mode (workstation table + mobile card)
  const accentTextClass = isPurchase
    ? 'text-orange-600 dark:text-orange-400'
    : 'text-secondary';
  const accentBgClass = isPurchase
    ? 'bg-orange-600 text-white hover:bg-orange-700 shadow-orange-600/20'
    : 'bg-secondary text-on-secondary hover:bg-secondary/90';
  const headerIcon = isPurchase ? 'inventory_2' : 'receipt';
  const headerTitle = isPurchase
    ? `Purchased Items (${effectiveRows.length})`
    : `Line Items (${effectiveRows.length})`;
  const emptyIcon = isPurchase ? 'inventory_2' : 'add_shopping_cart';
  const emptyTitle = isPurchase
    ? 'No purchased items added yet'
    : 'No line items on this invoice';
  const emptyDesc = isPurchase
    ? 'Add purchased stock, scan barcodes, or import vendor bills'
    : 'Add products, scan barcodes, or press "Add Item"';
  const scannerTitle = isPurchase ? 'Scan Product Barcode' : 'Scan Barcode';

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-xs overflow-hidden">
      {/* Title Bar */}
      <div className="px-3 sm:px-4 py-2.5 bg-surface-container-low/60 border-b border-outline-variant/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`material-symbols-outlined text-[18px] ${accentTextClass}`}>
            {headerIcon}
          </span>
          <span className="font-bold text-xs sm:text-sm text-on-surface">
            {headerTitle}
          </span>
          {effectiveRows.length > 0 && (
            <span className="text-xs text-on-surface-variant font-medium">
              ({effectiveRows.reduce((acc, r) => acc + (Number(r.quantity) || 0), 0)} units)
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {onOpenScanner && (
            <button
              type="button"
              onClick={onOpenScanner}
              className="w-8 h-8 rounded-lg bg-surface-container-lowest hover:bg-surface-container text-on-surface flex items-center justify-center transition-colors cursor-pointer border border-outline-variant/30 shadow-2xs active:scale-95"
              title={scannerTitle}
              aria-label={scannerTitle}
            >
              <span className={`material-symbols-outlined text-[18px] ${accentTextClass}`}>
                barcode_scanner
              </span>
            </button>
          )}
          {onAddItem && (
            <button
              type="button"
              onClick={onAddItem}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer shadow-2xs active:scale-95 ${accentBgClass}`}
              title="Add Item"
              aria-label="Add Item"
            >
              <span className="material-symbols-outlined text-[20px]">add</span>
            </button>
          )}
        </div>
      </div>

      {/* If No Items */}
      {effectiveRows.length === 0 ? (
        <div className="py-12 px-4 text-center flex flex-col items-center justify-center gap-2.5">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              isPurchase ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400' : 'bg-surface-container-low text-secondary'
            }`}
          >
            <span className="material-symbols-outlined text-[26px]">{emptyIcon}</span>
          </div>
          <h3 className="font-bold text-sm text-on-surface">{emptyTitle}</h3>
          <p className="text-xs text-on-surface-variant max-w-sm">{emptyDesc}</p>
          <div className="flex items-center gap-2 mt-2">
            {onAddItem && (
              <button
                type="button"
                onClick={onAddItem}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs active:scale-95 flex items-center gap-1.5 ${accentBgClass}`}
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                <span>Add First Item</span>
              </button>
            )}
            {onOpenScanner && (
              <button
                type="button"
                onClick={onOpenScanner}
                className="px-3 py-1.5 rounded-lg border border-outline-variant/50 text-xs font-semibold text-on-surface hover:bg-surface-container-low transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span className={`material-symbols-outlined text-[16px] ${accentTextClass}`}>
                  barcode_scanner
                </span>
                <span>Scan Barcode</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Desktop Table View (>= md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface-container-low/40 border-b border-outline-variant/20 text-on-surface-variant font-bold">
                  <th className="py-2.5 px-3 w-10 text-center">#</th>
                  <th className="py-2.5 px-3 min-w-[200px]">Item / Description</th>
                  {isGstActive && <th className="py-2.5 px-3 w-24">HSN/SAC</th>}
                  <th className="py-2.5 px-3 w-28 text-right">Qty & Unit</th>
                  {isGstActive && <th className="py-2.5 px-3 w-24 text-center">Price Mode</th>}
                  <th className="py-2.5 px-3 w-32 text-right">
                    {isGstActive ? 'Rate (Excl / Incl)' : 'Unit Rate'}
                  </th>
                  <th className="py-2.5 px-3 w-24 text-right">Discount</th>
                  {isGstActive && <th className="py-2.5 px-3 w-24 text-center">GST / Tax</th>}
                  <th className="py-2.5 px-3 w-28 text-right">Amount</th>
                  <th className="py-2.5 px-3 w-14 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/15 text-on-surface font-medium">
                {effectiveRows.map((row, idx) => {
                  const calcItem = calcItems?.[idx];
                  const rowTotal = getRowTotal(row, calcItem);
                  const priceMode = row.priceMode ?? 'EXCLUSIVE';
                  const storedInclusive = Number(row.unitPriceInclusive);
                  const inclusiveRate =
                    priceMode === 'INCLUSIVE'
                      ? (Number.isFinite(storedInclusive) && storedInclusive > 0
                          ? storedInclusive
                          : inclusiveFromExclusive(row.unitPrice, Number(row.gstRate) || 0))
                      : inclusiveFromExclusive(row.unitPrice, Number(row.gstRate) || 0);
                  const discPct = Number(row.discountPercent) || 0;
                  const discAmt = Number(row.discountAmount) || 0;
                  const rowKey = (row as any).itemId ? `${(row as any).itemId}-${idx}` : `row-${idx}`;

                  return (
                    <tr
                      key={rowKey}
                      onClick={() => onEditItem?.(idx)}
                      className="hover:bg-surface-container-low/60 cursor-pointer transition-colors group"
                    >
                      <td className="py-2 px-3 text-center text-outline text-[11px] font-mono">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-3">
                        <div className="font-bold text-on-surface group-hover:text-primary transition-colors">
                          {row.name}
                        </div>
                        {row.description && (
                          <div className="text-[11px] text-on-surface-variant truncate max-w-xs">
                            {row.description}
                          </div>
                        )}
                      </td>
                      {isGstActive && (
                        <td className="py-2 px-3 font-mono text-[11px] text-on-surface-variant">
                          {row.hsnSacCode || '—'}
                        </td>
                      )}
                      <td className="py-2 px-3 text-right font-tabular-data">
                        <span className="font-bold">{formatQuantity(row.quantity, 4)}</span>{' '}
                        <span className="text-on-surface-variant text-[11px]">{row.unit}</span>
                      </td>
                      {isGstActive && (
                        <td className="py-2 px-3 text-center">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              priceMode === 'INCLUSIVE'
                                ? 'bg-secondary/15 text-secondary'
                                : 'bg-surface-container-high text-on-surface-variant'
                            }`}
                          >
                            {priceMode}
                          </span>
                        </td>
                      )}
                      <td className="py-2 px-3 text-right font-tabular-data">
                        {isGstActive ? (
                          <div className="flex flex-col items-end">
                            <span className="font-bold text-on-surface">
                              {formatINR(row.unitPrice)}
                            </span>
                            <span className="text-[10px] text-on-surface-variant font-medium">
                              Incl. {formatINR(inclusiveRate)}
                            </span>
                          </div>
                        ) : (
                          <span className="font-bold text-on-surface">
                            {formatINR(row.unitPrice)}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right font-tabular-data">
                        {discPct > 0 || discAmt > 0 ? (
                          <span className={isPurchase ? 'text-orange-600 dark:text-orange-400 font-semibold' : 'text-secondary font-bold'}>
                            {discPct > 0
                              ? isPurchase ? `-${discPct}%` : `${discPct}%`
                              : isPurchase ? `-₹${discAmt}` : `₹${discAmt}`}
                          </span>
                        ) : (
                          <span className="text-outline">—</span>
                        )}
                      </td>
                      {isGstActive && (
                        <td className="py-2 px-3 text-center font-tabular-data">
                          <span className="px-1.5 py-0.5 rounded bg-surface-container text-[11px] font-bold">
                            {row.gstRate || 0}%
                          </span>
                          {(row.cessRate || 0) > 0 && (
                            <span className="block text-[10px] text-amber-600 font-bold mt-0.5">
                              CESS {row.cessRate}%
                            </span>
                          )}
                        </td>
                      )}
                      <td className="py-2 px-3 text-right font-tabular-data font-bold text-on-surface">
                        {formatINR(rowTotal)}
                      </td>
                      <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => onEditItem?.(idx)}
                            className="w-7 h-7 rounded-lg text-outline hover:text-on-surface hover:bg-surface-container flex items-center justify-center transition-colors cursor-pointer"
                            title="Edit Item"
                            aria-label="Edit Item"
                          >
                            <span className="material-symbols-outlined text-[16px]">edit</span>
                          </button>
                          {onRemoveItem && (
                            <button
                              type="button"
                              onClick={() => onRemoveItem(idx)}
                              className="w-7 h-7 rounded-lg text-outline hover:text-error hover:bg-error/10 flex items-center justify-center transition-colors cursor-pointer"
                              title="Remove Item"
                              aria-label="Remove Item"
                            >
                              <span className="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View (< md) */}
          <div className="block md:hidden divide-y divide-outline-variant/15">
            {effectiveRows.map((row, idx) => {
              const calcItem = calcItems?.[idx];
              const rowTotal = getRowTotal(row, calcItem);
              const priceMode = row.priceMode ?? 'EXCLUSIVE';
              const storedInclusive = Number(row.unitPriceInclusive);
              const inclusiveRate =
                priceMode === 'INCLUSIVE'
                  ? (Number.isFinite(storedInclusive) && storedInclusive > 0
                      ? storedInclusive
                      : inclusiveFromExclusive(row.unitPrice, Number(row.gstRate) || 0))
                  : inclusiveFromExclusive(row.unitPrice, Number(row.gstRate) || 0);
              const discPct = Number(row.discountPercent) || 0;
              const discAmt = Number(row.discountAmount) || 0;
              const rowKey = (row as any).itemId ? `${(row as any).itemId}-${idx}` : `row-${idx}`;

              return (
                <div
                  key={rowKey}
                  onClick={() => onEditItem?.(idx)}
                  className="p-3 hover:bg-surface-container-low/40 cursor-pointer transition-colors active:bg-surface-container-low"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-mono text-outline font-bold">
                          #{idx + 1}
                        </span>
                        <h4 className="font-bold text-xs text-on-surface truncate">
                          {row.name}
                        </h4>
                        {isGstActive && (
                          <span
                            className={`px-1 py-0.2 rounded text-[9px] font-bold ${
                              priceMode === 'INCLUSIVE'
                                ? 'bg-secondary/15 text-secondary'
                                : 'bg-surface-container-high text-on-surface-variant'
                            }`}
                          >
                            {priceMode}
                          </span>
                        )}
                      </div>
                      {row.description && (
                        <p className="text-[11px] text-on-surface-variant line-clamp-1 mt-0.5">
                          {row.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="font-tabular-data font-bold text-xs text-on-surface">
                        {formatINR(rowTotal)}
                      </span>
                      {onRemoveItem && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveItem(idx);
                          }}
                          className="w-6 h-6 rounded text-outline hover:text-error flex items-center justify-center cursor-pointer ml-1"
                          title="Remove item"
                          aria-label="Remove item"
                        >
                          <span className="material-symbols-outlined text-[15px]">delete</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-on-surface-variant mt-1.5 pt-1.5 border-t border-outline-variant/10">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-tabular-data font-bold text-on-surface">
                        {formatQuantity(row.quantity, 4)} {row.unit}
                      </span>
                      <span className="text-outline">×</span>
                      {isGstActive ? (
                        <span className="font-tabular-data font-semibold text-on-surface">
                          Excl. {formatINR(row.unitPrice)} · Incl. {formatINR(inclusiveRate)}
                        </span>
                      ) : (
                        <span className="font-tabular-data font-semibold text-on-surface">
                          {formatINR(row.unitPrice)}
                        </span>
                      )}
                      {(discPct > 0 || discAmt > 0) && (
                        <span
                          className={`px-1 py-0.2 rounded text-[10px] font-bold ${
                            isPurchase
                              ? 'text-orange-600 dark:text-orange-400 font-semibold'
                              : 'bg-secondary/15 text-secondary'
                          }`}
                        >
                          {discPct > 0 ? `${discPct}% off` : `₹${discAmt} off`}
                        </span>
                      )}
                    </div>

                    {isGstActive && (
                      <span className="font-mono text-[10px] text-on-surface-variant">
                        {row.hsnSacCode ? `HSN ${row.hsnSacCode}` : ''}
                        {(row.cessRate || 0) > 0 ? ` · CESS ${row.cessRate}%` : ''}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Add Item Bar */}
          <div className="p-2 sm:p-2.5 bg-surface-container-low/40 border-t border-outline-variant/20 flex items-center justify-between gap-2">
            {onAddItem && (
              <button
                type="button"
                onClick={onAddItem}
                className={`flex-1 py-2 px-3 rounded-lg border border-dashed font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-99 ${
                  isPurchase
                    ? 'border-orange-500/40 hover:border-orange-500 hover:bg-orange-500/10 text-orange-600 dark:text-orange-400'
                    : 'border-secondary/40 hover:border-secondary hover:bg-secondary/10 text-secondary'
                }`}
              >
                <span className="material-symbols-outlined text-[17px]">add_circle</span>
                <span>+ Add Item</span>
              </button>
            )}
            {onOpenScanner && (
              <button
                type="button"
                onClick={onOpenScanner}
                className="py-2 px-3 rounded-lg border border-dashed border-outline-variant/40 hover:border-outline hover:bg-surface-container-low text-on-surface-variant font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                title={scannerTitle}
              >
                <span className={`material-symbols-outlined text-[16px] ${accentTextClass}`}>
                  barcode_scanner
                </span>
                <span className="hidden sm:inline">Scan</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};
