import React from 'react';
import { formatINR } from '../../../core/utils/formatters.ts';

export interface GridRow {
  itemId: string;
  name: string;
  description?: string;
  hsnSacCode: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  mrp?: number;
  discountPercent: number;
  discountAmount?: number;
  gstRate: number;
}

export interface InvoiceLineItemsGridProps {
  rows: GridRow[];
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
  onOpenScanner: () => void;
}

export const InvoiceLineItemsGrid: React.FC<InvoiceLineItemsGridProps> = ({
  rows,
  calcItems,
  isGstActive,
  onAddItem,
  onEditItem,
  onOpenScanner,
}) => {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-xs overflow-hidden">
      {/* Sheet Title Bar */}
      <div className="px-3 sm:px-4 py-2.5 bg-surface-container-low/60 border-b border-outline-variant/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-secondary">receipt</span>
          <span className="font-bold text-xs sm:text-sm text-on-surface">
            Line Items ({rows.length})
          </span>
          {rows.length > 0 && (
            <span className="text-xs text-on-surface-variant font-medium">
              · {Number(rows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0).toFixed(3))} units total
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenScanner}
            className="w-8 h-8 rounded-lg bg-surface-container-lowest hover:bg-surface-container text-on-surface flex items-center justify-center transition-colors cursor-pointer border border-outline-variant/30 shadow-2xs active:scale-95"
            title="Scan Barcode"
            aria-label="Scan Barcode"
          >
            <span className="material-symbols-outlined text-[18px] text-secondary">barcode_scanner</span>
          </button>
          <button
            type="button"
            onClick={onAddItem}
            className="w-8 h-8 rounded-lg bg-secondary text-on-secondary flex items-center justify-center hover:bg-secondary/90 transition-all cursor-pointer shadow-2xs active:scale-95"
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
          <div className="w-12 h-12 rounded-xl bg-surface-container-low text-secondary flex items-center justify-center">
            <span className="material-symbols-outlined text-[26px]">add_shopping_cart</span>
          </div>
          <h3 className="font-bold text-sm text-on-surface">No line items on this invoice</h3>
          <p className="text-xs text-on-surface-variant max-w-sm">
            Add products or services from your catalog or create custom billed items.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <button
              type="button"
              onClick={onAddItem}
              className="px-4 py-2 rounded-xl bg-secondary text-on-secondary font-bold text-xs shadow-xs hover:bg-secondary/90 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">add_circle</span>
              <span>+ Add First Item</span>
            </button>
            <button
              type="button"
              onClick={onOpenScanner}
              className="px-3.5 py-2 rounded-xl bg-surface-container text-on-surface font-bold text-xs hover:bg-surface-container-high transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px] text-secondary">barcode_scanner</span>
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
                  <th className="py-2.5 px-3 w-28 text-right">Rate (₹)</th>
                  <th className="py-2.5 px-3 w-24 text-right">Discount</th>
                  {isGstActive && <th className="py-2.5 px-3 w-24 text-right">GST Rate</th>}
                  <th className="py-2.5 px-4 w-32 text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/15 text-xs">
                {rows.map((row, idx) => {
                  const itemCalc = calcItems[idx];
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
                        <span className="font-bold text-on-surface block group-hover:text-secondary transition-colors">
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
                        {row.discountPercent > 0 || (row.discountAmount && row.discountAmount > 0) ? (
                          <span className="text-secondary font-bold">
                            {row.discountPercent > 0 ? `${row.discountPercent}%` : `₹${row.discountAmount}`}
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
                        {formatINR(itemCalc?.totalAmount || 0)}
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
              return (
                <div
                  key={idx}
                  onClick={() => onEditItem(idx)}
                  className="p-3 hover:bg-surface-container-low/50 active:bg-surface-container-low cursor-pointer transition-colors group"
                >
                  {/* Top Line: Name & Total Amount */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-xs sm:text-sm text-on-surface block leading-snug group-hover:text-secondary transition-colors">
                        {idx + 1}. {row.name}
                      </span>
                      {row.description && (
                        <p className="text-[11px] text-on-surface-variant mt-0.5 line-clamp-1">
                          {row.description}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-tabular-data text-sm font-black text-on-surface block">
                        {formatINR(itemCalc?.totalAmount || 0)}
                      </span>
                      {isGstActive && (
                        <span className="text-[10px] text-outline block">
                          incl. {row.gstRate}% tax
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Bottom Line: Qty, Rate, Discount, HSN */}
                  <div className="flex items-center justify-between gap-2 mt-1.5 pt-1.5 border-t border-outline-variant/10 text-xs text-on-surface-variant">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-tabular-data font-bold text-on-surface">
                        {row.quantity} {row.unit}
                      </span>
                      <span className="text-outline">×</span>
                      <span className="font-tabular-data font-semibold text-on-surface">
                        {formatINR(row.unitPrice)}
                      </span>
                      {(row.discountPercent > 0 || (row.discountAmount && row.discountAmount > 0)) && (
                        <span className="px-1 py-0.2 rounded bg-secondary/15 text-secondary text-[10px] font-bold">
                          {row.discountPercent > 0 ? `${row.discountPercent}% off` : `₹${row.discountAmount} off`}
                        </span>
                      )}
                    </div>

                    {isGstActive && row.hsnSacCode && (
                      <span className="font-mono text-[10px] text-on-surface-variant">
                        HSN {row.hsnSacCode}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Add Item Bar (Visible when items are present) */}
          <div className="p-2 sm:p-2.5 bg-surface-container-low/40 border-t border-outline-variant/20 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onAddItem}
              className="flex-1 py-2 px-3 rounded-lg border border-dashed border-secondary/40 hover:border-secondary hover:bg-secondary/10 text-secondary font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-99"
            >
              <span className="material-symbols-outlined text-[17px]">add_circle</span>
              <span>+ Add Item</span>
            </button>
            <button
              type="button"
              onClick={onOpenScanner}
              className="py-2 px-3 rounded-lg border border-dashed border-outline-variant/40 hover:border-outline hover:bg-surface-container-low text-on-surface-variant font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              title="Camera Barcode Scanner"
            >
              <span className="material-symbols-outlined text-[16px] text-secondary">barcode_scanner</span>
              <span className="hidden sm:inline">Scan</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};
