import React from 'react';
import { formatINR } from '../../../core/utils/formatters.ts';

export interface DocumentTaxSummaryProps {
  variant?: 'full' | 'compact';
  title?: string;
  totalGrossAmount?: number;
  totalTax: number;
  totalCgst?: number;
  totalSgst?: number;
  totalUtgst?: number;
  totalIgst?: number;
  totalCess?: number;
  totalTaxableAmount: number;
  isIntraState?: boolean;
  isGstActive: boolean;
  isCompositionScheme?: boolean;
  roundOff?: number;
  shippingAmount?: number;
  onChangeShipping?: (amount: number) => void;
  overallDiscountAmount?: number;
  overallDiscountPercent?: number;
  onOpenDiscountModal?: () => void;
  onRemoveDiscount?: () => void;
  isTaxDetailsOpen?: boolean;
  onToggleTaxDetails?: () => void;
  totalUnits?: number;
  finalGrandTotal: number;
  accentColor?: 'secondary' | 'orange';
}

export const DocumentTaxSummary: React.FC<DocumentTaxSummaryProps> = ({
  variant = 'full',
  title,
  totalGrossAmount = 0,
  totalTax,
  totalCgst = 0,
  totalSgst = 0,
  totalUtgst,
  totalIgst = 0,
  totalCess,
  totalTaxableAmount,
  isIntraState = true,
  isGstActive,
  isCompositionScheme = false,
  roundOff = 0,
  shippingAmount,
  onChangeShipping,
  overallDiscountAmount = 0,
  overallDiscountPercent = 0,
  onOpenDiscountModal,
  onRemoveDiscount,
  isTaxDetailsOpen = false,
  onToggleTaxDetails,
  totalUnits,
  finalGrandTotal,
  accentColor = 'secondary',
}) => {
  const isOrange = accentColor === 'orange';
  const grandTotalTextClass = isOrange ? 'text-orange-600' : 'text-secondary';
  const taxAccentClass = isOrange ? 'text-orange-600 dark:text-orange-400' : 'text-secondary';

  // Compact Variant
  if (variant === 'compact') {
    const isGst = isGstActive && !isCompositionScheme;
    const totalCessAmount = isGst ? (Number(totalCess) || 0) : 0;
    const gstOnly = Math.max(0, (Number(totalTax) || 0) - totalCessAmount);
    const label = title || 'Total Invoice Value';

    return (
      <div className="p-2.5 rounded-xl bg-surface-container-low space-y-1 text-xs">
        {isGst && (
          <>
            <div className="flex justify-between text-on-surface-variant text-[11px]">
              <span>Taxable Amount</span>
              <span className="font-bold text-on-surface">{formatINR(totalTaxableAmount)}</span>
            </div>
            <div className="flex justify-between text-on-surface-variant text-[11px]">
              <span>{totalCessAmount > 0 ? 'GST' : 'Total Tax (GST)'}</span>
              <span className={`font-bold ${taxAccentClass}`}>
                {formatINR(totalCessAmount > 0 ? gstOnly : totalTax)}
              </span>
            </div>
            {totalCessAmount > 0 && (
              <div className="flex justify-between text-on-surface-variant text-[11px]">
                <span>CESS</span>
                <span className={`font-bold ${taxAccentClass}`}>{formatINR(totalCessAmount)}</span>
              </div>
            )}
          </>
        )}
        <div className="flex justify-between pt-1 border-t border-outline-variant/20 font-bold text-sm text-on-surface">
          <span>{label}</span>
          <span className="font-black text-on-surface font-currency-display-mobile">
            {formatINR(finalGrandTotal)}
          </span>
        </div>
      </div>
    );
  }

  // Full Workstation Variant
  const effectiveTitle = title || 'Invoice Summary';

  return (
    <div className="flex justify-end w-full">
      <div className="w-full lg:max-w-md bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-3 sm:p-4 shadow-xs flex flex-col gap-2">
        <div className="flex items-center justify-between pb-1.5 border-b border-outline-variant/20">
          <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
            {effectiveTitle}
          </span>
          {isGstActive && (
            <span className={`text-[11px] font-bold ${grandTotalTextClass}`}>
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
                <span>
                  {isIntraState
                    ? (totalUtgst && totalUtgst > 0)
                      ? 'Taxes (CGST + UTGST)'
                      : 'Taxes (CGST + SGST)'
                    : 'Taxes (IGST)'}
                </span>
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
                    {totalUtgst && totalUtgst > 0 ? (
                      <div className="flex items-center justify-between text-on-surface-variant">
                        <span>Union Territory GST (UTGST)</span>
                        <span className="font-tabular-data font-bold">{formatINR(totalUtgst)}</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-on-surface-variant">
                        <span>State GST (SGST)</span>
                        <span className="font-tabular-data font-bold">{formatINR(totalSgst)}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-between text-on-surface-variant">
                    <span>Integrated GST (IGST)</span>
                    <span className="font-tabular-data font-bold">{formatINR(totalIgst)}</span>
                  </div>
                )}
                {totalCess !== undefined && totalCess > 0 && (
                  <div className="flex items-center justify-between text-on-surface-variant">
                    <span>CESS</span>
                    <span className="font-tabular-data font-bold">{formatINR(totalCess)}</span>
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
              >
              </input>
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
            {overallDiscountAmount > 0 ? (
              <div className="flex items-center gap-1.5">
                <span className={`font-tabular-data font-bold ${grandTotalTextClass}`}>
                  -₹{overallDiscountAmount.toFixed(2)}
                  {overallDiscountPercent > 0 && ` (${overallDiscountPercent}%)`}
                </span>
                {onRemoveDiscount && (
                  <button
                    type="button"
                    onClick={onRemoveDiscount}
                    className="w-5 h-5 rounded hover:bg-error/15 text-outline hover:text-error flex items-center justify-center transition-colors cursor-pointer"
                    title="Remove discount"
                    aria-label="Remove discount"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={onOpenDiscountModal}
                className={`text-xs font-semibold ${grandTotalTextClass} hover:underline cursor-pointer`}
              >
                + Apply Discount
              </button>
            )}
          </div>
        )}

        {/* Total Units */}
        {totalUnits !== undefined && totalUnits > 0 && (
          <div className="flex items-center justify-between text-xs text-on-surface-variant">
            <span>Total Units</span>
            <span className="font-tabular-data font-medium text-on-surface">{totalUnits}</span>
          </div>
        )}

        {/* Grand Total */}
        <div className="pt-2 border-t border-outline-variant/20 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-on-surface block">Grand Total</span>
            <span className="text-[10px] text-on-surface-variant block">Includes all taxes</span>
          </div>
          <span className={`text-xl sm:text-2xl font-black font-tabular-data ${grandTotalTextClass}`}>
            {formatINR(finalGrandTotal)}
          </span>
        </div>
      </div>
    </div>
  );
};
