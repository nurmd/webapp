import React from 'react';
import { formatINR } from '../../../core/utils/formatters.ts';

export interface PurchaseGridRow {
  itemId: string;
  name: string;
  description?: string;
  hsnSacCode: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  mrp?: number;
  discountPercent: number;
  gstRate: number;
}

export interface PurchaseLineItemsGridProps {
  rows: PurchaseGridRow[];
  calcItems: Array<{
    discountAmount: number;
    taxableAmount: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    cessAmount?: number;
    totalAmount: number;
  }>;
  isGstActive: boolean;
  onAddItem: () => void;
  onEditItem: (index: number) => void;
  onRemoveItem: (index: number) => void;
  onOpenScanner: () => void;
}

export const PurchaseLineItemsGrid: React.FC<PurchaseLineItemsGridProps> = ({
  rows,
  calcItems,
  isGstActive,
  onAddItem,
  onEditItem,
  onRemoveItem,
  onOpenScanner,
}) => {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-xs overflow-hidden">
      <div className="px-3 sm:px-4 py-2.5 bg-surface-container-low/60 border-b border-outline-variant/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-orange-600 dark:text-orange-400">inventory_2</span>
          <span className="font-bold text-xs sm:text-sm text-on-surface">
            Purchased Items ({rows.length})
          </span>
          {rows.length > 0 && (
            <span className="text-xs text-on-surface-variant font-medium">
              · {rows.reduce((sum, r) => sum + (Number(r.quantity) || 1), 0)} units total
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenScanner}
            className="w-8 h-8 rounded-lg bg-surface-container-lowest hover:bg-surface-container text-on-surface flex items-center justify-center transition-colors cursor-pointer border border-outline-variant/30 shadow-2xs active:scale-95"
            title="Scan Product Barcode"
            aria-label="Scan Product Barcode"
          >
            <span className="material-symbols-outlined text-[18px] text-orange-600 dark:text-orange-400">barcode_scanner</span>
          </button>
          <button
            type="button"
            onClick={onAddItem}
            className="w-8 h-8 rounded-lg bg-orange-600 text-white flex items-center justify-center hover:bg-orange-700 transition-all cursor-pointer shadow-2xs shadow-orange-600/20 active:scale-95"
            title="Add Item"
            aria-label="Add Item"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
          </button>
        </div>
      </div>

      {/* If No Items */}
      {rows.length === 0 ? (
        <div className="py-12 px-4 text-center flex flex-col items-center justify-center gap-2.5">
          <div className="w-12 h-12 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center">
            <span className="material-symbols-outlined text-[26px]">inventory_2</span>
          </div>
          <h3 className="font-bold text-sm text-on-surface">No purchased items added yet</h3>
          <p className="text-xs text-on-surface-variant max-w-sm">
            Add products to inward stock from your catalog or enter custom supplier items.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={onAddItem}
              className="px-4 py-2 rounded-xl bg-orange-600 text-white font-bold text-xs shadow-xs hover:bg-orange-700 transition-all cursor-pointer flex items-center gap-1.5 shadow-orange-600/20"
            >
              <span className="material-symbols-outlined text-[16px]">add_circle</span>
              <span>+ Add First Item</span>
            </button>
            <button
              type="button"
              onClick={onOpenScanner}
              className="px-3.5 py-2 rounded-xl bg-surface-container text-on-surface font-bold text-xs hover:bg-surface-container-high transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px] text-orange-600 dark:text-orange-400">barcode_scanner</span>
              <span>Scan Barcode</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Desktop / Tablet Ledger Table (sm & up) */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low text-on-surface-variant text-[11px] font-bold uppercase tracking-wider border-b border-outline-variant/20">
                  <th className="py-2.5 px-3 w-10 text-center">#</th>
                  <th className="py-2.5 px-3">Item &amp; Description</th>
                  {isGstActive && <th className="py-2.5 px-3 w-28">HSN/SAC</th>}
                  <th className="py-2.5 px-3 w-28 text-center">Qty / Unit</th>
                  <th className="py-2.5 px-3 w-28 text-right">Purchase Rate (₹)</th>
                  <th className="py-2.5 px-3 w-24 text-right">Discount</th>
                  {isGstActive && <th className="py-2.5 px-3 w-24 text-right">GST Rate</th>}
                  <th className="py-2.5 px-4 w-32 text-right">Amount (₹)</th>
                  <th className="py-2.5 px-2 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/15 text-xs">
                {rows.map((row, idx) => {
                  const itemCalc = calcItems[idx];
                  const rowTotal = itemCalc?.totalAmount || (row.quantity * row.unitPrice * (1 - (row.discountPercent || 0) / 100));
                  return (
                    <tr
                      key={idx}
                      onClick={() => onEditItem(idx)}
                      className="hover:bg-surface-container-low/40 active:bg-surface-container-low cursor-pointer transition-colors group"
                    >
                      <td className="py-2.5 px-3 text-center text-on-surface-variant font-mono font-medium">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 min-w-48">
                        <span className="font-bold text-on-surface block group-hover:text-orange-600 transition-colors">
                          {row.name}
                        </span>
                        {row.description && (
                          <span className="text-[11px] text-on-surface-variant block mt-0.5 truncate max-w-md">
                            {row.description}
                          </span>
                        )}
                      </td>
                      {isGstActive && (
                        <td className="py-2.5 px-3 font-mono text-[11px] text-on-surface-variant">
                          {row.hsnSacCode || '-'}
                        </td>
                      )}
                      <td className="py-2.5 px-3 text-center font-tabular-data font-bold text-on-surface">
                        {row.quantity} <span className="text-[10px] font-normal uppercase text-on-surface-variant">{row.unit}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-tabular-data font-semibold text-on-surface">
                        {formatINR(row.unitPrice)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-tabular-data">
                        {row.discountPercent > 0 ? (
                          <span className="text-orange-600 dark:text-orange-400 font-bold">
                            {row.discountPercent}%
                          </span>
                        ) : (
                          <span className="text-outline">-</span>
                        )}
                      </td>
                      {isGstActive && (
                        <td className="py-2.5 px-3 text-right font-tabular-data text-on-surface-variant font-medium">
                          {row.gstRate}%
                        </td>
                      )}
                      <td className="py-2.5 px-4 text-right font-tabular-data font-bold text-on-surface text-sm">
                        {formatINR(rowTotal)}
                      </td>
                      <td className="py-2.5 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => onRemoveItem(idx)}
                          title="Remove item"
                          className="w-7 h-7 rounded flex items-center justify-center text-outline hover:text-error hover:bg-error-container/30 transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile High-Density Sheet List (sm:hidden) */}
          <div className="sm:hidden divide-y divide-outline-variant/15">
            {rows.map((row, idx) => {
              const itemCalc = calcItems[idx];
              const rowTotal = itemCalc?.totalAmount || (row.quantity * row.unitPrice * (1 - (row.discountPercent || 0) / 100));
              return (
                <div
                  key={idx}
                  onClick={() => onEditItem(idx)}
                  className="p-3 hover:bg-surface-container-low/50 active:bg-surface-container-low cursor-pointer transition-colors group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-xs sm:text-sm text-on-surface block leading-snug group-hover:text-orange-600 transition-colors">
                        {idx + 1}. {row.name}
                      </span>
                      {row.description && (
                        <p className="text-[11px] text-on-surface-variant mt-0.5 line-clamp-1">
                          {row.description}
                        </p>
                      )}
                    </div>
                    <span className="font-tabular-data font-black text-sm text-orange-600 dark:text-orange-400 shrink-0">
                      {formatINR(rowTotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-on-surface-variant mt-2 pt-1.5 border-t border-outline-variant/10">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-on-surface">
                        {row.quantity} {row.unit}
                      </span>
                      <span>×</span>
                      <span>{formatINR(row.unitPrice)}</span>
                      {row.discountPercent > 0 && (
                        <span className="text-orange-600 dark:text-orange-400 font-semibold">(-{row.discountPercent}%)</span>
                      )}
                    </div>
                    {isGstActive && (
                      <span className="font-medium">
                        GST {row.gstRate}% {row.hsnSacCode ? `· HSN ${row.hsnSacCode}` : ''}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Add Item Bar */}
          <div className="p-2 sm:p-2.5 bg-surface-container-low/40 border-t border-outline-variant/20 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onAddItem}
              className="flex-1 py-2 px-3 rounded-lg border border-dashed border-orange-500/40 hover:border-orange-500 hover:bg-orange-500/10 text-orange-600 dark:text-orange-400 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-99"
            >
              <span className="material-symbols-outlined text-[17px]">add_circle</span>
              <span>+ Add Item</span>
            </button>
            <button
              type="button"
              onClick={onOpenScanner}
              className="py-2 px-3 rounded-lg border border-dashed border-outline-variant/40 hover:border-outline hover:bg-surface-container-low text-on-surface-variant font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              title="Scan Product Barcode"
            >
              <span className="material-symbols-outlined text-[16px] text-orange-600 dark:text-orange-400">barcode_scanner</span>
              <span className="hidden sm:inline">Scan</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};
