import React from 'react';
import { formatINR } from '../../../core/utils/formatters.ts';

export interface DocumentTotalsSummaryProps {
  title?: string;
  totalGrossAmount: number;
  totalTax: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalTaxableAmount: number;
  isIntraState: boolean;
  isGstActive: boolean;
  roundOff: number;
  shippingAmount?: number;
  onChangeShipping?: (amount: number) => void;
  overallDiscountAmount?: number;
  overallDiscountPercent?: number;
  onOpenDiscountModal?: () => void;
  onRemoveDiscount?: () => void;
  isTaxDetailsOpen: boolean;
  onToggleTaxDetails: () => void;
  totalUnits: number;
  finalGrandTotal: number;
  accentColor?: 'secondary' | 'orange';
}

export const DocumentTotalsSummary: React.FC<DocumentTotalsSummaryProps> = ({
  title = 'Invoice Summary',
  totalGrossAmount,
  totalTax,
  totalCgst,
  totalSgst,
  totalIgst,
  totalTaxableAmount,
  isIntraState,
  isGstActive,
  roundOff,
  shippingAmount,
  onChangeShipping,
  overallDiscountAmount = 0,
  overallDiscountPercent = 0,
  onOpenDiscountModal,
  onRemoveDiscount,
  isTaxDetailsOpen,
  onToggleTaxDetails,
  totalUnits,
  finalGrandTotal,
  accentColor = 'secondary',
}) => {
  const isOrange = accentColor === 'orange';
  const grandTotalTextClass = isOrange ? 'text-orange-600' : 'text-secondary';

  return (
    <div className="flex justify-end w-full">
      <div className="w-full lg:max-w-md bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-3 sm:p-4 shadow-xs flex flex-col gap-2">
        <div className="flex items-center justify-between pb-1.5 border-b border-outline-variant/20">
          <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
            {title}
          </span>
          {isGstActive && (
            <span className={`text-[11px] font-bold ${isOrange ? 'text-orange-600' : 'text-secondary'}`}>
              GST Compliant
            </span>
          )}
        </div>

        {/* Subtotal */}
        <div className="flex items-center justify-between text-xs text-on-surface-variant">
          <span>{isGstActive ? 'Subtotal (Items gross)' : 'Subtotal'}</span>
          <span className="font-tabular-data font-semibold text-on-surface">
            {formatINR(totalGrossAmount)}
          </span>
        </div>

        {/* Taxes */}
        {isGstActive && (
          <>
            <div className="flex items-center justify-between text-xs text-on-surface-variant">
              <button
                type="button"
                onClick={onToggleTaxDetails}
                className="flex items-center gap-1 text-left hover:text-on-surface cursor-pointer"
              >
                <span>{isIntraState ? 'Taxes (CGST + SGST)' : 'Taxes (IGST)'}</span>
                <span className="material-symbols-outlined text-[13px] text-outline">info</span>
              </button>
              <span className="font-tabular-data font-semibold text-on-surface">
                +{formatINR(totalTax)}
              </span>
            </div>

            {isTaxDetailsOpen && (
              <div className="p-2 rounded-lg bg-surface-container-low text-[11px] flex flex-col gap-1 border border-outline-variant/20 animate-fade-in">
                {isIntraState ? (
                  <>
                    <div className="flex items-center justify-between text-on-surface-variant">
                      <span>Central GST (CGST)</span>
                      <span className="font-tabular-data font-bold">{formatINR(totalCgst)}</span>
                    </div>
                    <div className="flex items-center justify-between text-on-surface-variant">
                      <span>State GST (SGST)</span>
                      <span className="font-tabular-data font-bold">{formatINR(totalSgst)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between text-on-surface-variant">
                    <span>Integrated GST (IGST)</span>
                    <span className="font-tabular-data font-bold">{formatINR(totalIgst)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-on-surface-variant pt-1 border-t border-outline-variant/20">
                  <span>Taxable Base</span>
                  <span className="font-tabular-data font-bold">{formatINR(totalTaxableAmount)}</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* Round Off */}
        <div className="flex items-center justify-between text-xs text-on-surface-variant">
          <span>Round Off</span>
          <span className="font-tabular-data font-semibold text-on-surface">
            {roundOff >= 0 ? `+₹${roundOff}` : `-₹${Math.abs(roundOff)}`}
          </span>
        </div>

        {/* Shipping Charges */}
        {onChangeShipping !== undefined && (
          <div className="flex items-center justify-between text-xs text-on-surface-variant py-0.5">
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px] text-outline">local_shipping</span>
              <span>Shipping Charges</span>
            </div>
            <div className="relative w-28 flex items-center">
              <span className="absolute left-2 text-xs font-semibold text-outline pointer-events-none">₹</span>
              <input
                type="number"
                min="0"
                step="any"
                value={shippingAmount || ''}
                onChange={(e) => onChangeShipping(Math.max(0, Number(e.target.value) || 0))}
                placeholder="0.00"
                className="w-full pl-5 pr-2 py-0.5 rounded bg-surface-container-low text-right font-tabular-data text-xs font-bold text-on-surface border border-outline-variant/30 outline-none focus:border-secondary transition-all"
              />
            </div>
          </div>
        )}

        {/* Overall Discount */}
        {onOpenDiscountModal !== undefined && (
          <div className="flex items-center justify-between text-xs text-on-surface-variant py-0.5">
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px] text-outline">percent</span>
              <span>Bill Discount</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onOpenDiscountModal}
                className={`px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1 transition-all cursor-pointer border ${
                  overallDiscountAmount > 0
                    ? isOrange
                      ? 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30'
                      : 'bg-secondary/15 text-secondary border-secondary/30'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container border-outline-variant/30'
                }`}
              >
                {overallDiscountAmount > 0 ? (
                  <>
                    <span>-{formatINR(overallDiscountAmount)}</span>
                    <span className="text-[10px] opacity-80">({overallDiscountPercent}%)</span>
                    <span className="material-symbols-outlined text-[12px]">edit</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[13px]">add</span>
                    <span>Add Discount</span>
                  </>
                )}
              </button>
              {overallDiscountAmount > 0 && onRemoveDiscount && (
                <button
                  type="button"
                  onClick={onRemoveDiscount}
                  title="Remove discount"
                  className="w-5 h-5 rounded flex items-center justify-center text-outline hover:text-error hover:bg-error-container/30 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[13px]">close</span>
                </button>
              )}
            </div>
          </div>
        )}

        <div className="h-px bg-outline-variant/20 my-1"></div>

        {/* Grand Total Ledger Highlight Box */}
        <div className="p-3 rounded-lg bg-surface-container text-on-surface flex items-center justify-between border border-outline-variant/30">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant block">
              Grand Total Amount
            </span>
            <span className="text-[11px] text-on-surface-variant">
              {totalUnits} Total Units
            </span>
          </div>
          <div className="text-right">
            <span className={`font-tabular-data text-xl sm:text-2xl font-black tracking-tight block ${grandTotalTextClass}`}>
              {formatINR(finalGrandTotal)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
