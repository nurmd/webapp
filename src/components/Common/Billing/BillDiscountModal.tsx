import React from 'react';
import { formatINR } from '../../../core/utils/formatters.ts';

export interface BillDiscountModalProps {
  isOpen: boolean;
  overallDiscountPercent: number;
  overallDiscountAmount: number;
  taxableBaseAmount: number;
  onApplyDiscountPercent: (percent: number) => void;
  onClose: () => void;
}

export const BillDiscountModal: React.FC<BillDiscountModalProps> = ({
  isOpen,
  overallDiscountPercent,
  overallDiscountAmount,
  taxableBaseAmount,
  onApplyDiscountPercent,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-2xl border border-outline-variant/30 max-w-sm w-full animate-fade-in flex flex-col gap-3">
        <h3 className="font-headline-sm text-base font-bold text-on-surface">
          Overall Bill Discount
        </h3>

        <div className="flex items-center gap-2">
          {[0, 2, 5, 10, 15, 20].map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => onApplyDiscountPercent(pct)}
              className={`flex-1 py-1.5 rounded-xl font-label-md text-xs font-bold cursor-pointer transition-colors ${
                overallDiscountPercent === pct
                  ? 'bg-secondary text-on-secondary'
                  : 'bg-surface-container-low text-on-surface hover:bg-surface-container'
              }`}
            >
              {pct}%
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-bold text-on-surface-variant block mb-1">
              Discount (%):
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={overallDiscountPercent || ''}
                onChange={(e) => onApplyDiscountPercent(Math.min(100, Math.max(0, Number(e.target.value))))}
                className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl pl-3 pr-7 py-2 text-sm text-on-surface font-semibold outline-none focus:ring-2 focus:ring-secondary/40 text-right"
                placeholder="0"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-outline pointer-events-none">
                %
              </span>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-on-surface-variant block mb-1">
              Discount (₹):
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-outline pointer-events-none">
                ₹
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={overallDiscountAmount || ''}
                onChange={(e) => {
                  const amt = Number(e.target.value) || 0;
                  if (taxableBaseAmount > 0) {
                    const pct = Math.min(100, Math.round(((amt / taxableBaseAmount) * 100) * 100) / 100);
                    onApplyDiscountPercent(pct);
                  }
                }}
                className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl pl-7 pr-3 py-2 text-sm text-on-surface font-semibold outline-none focus:ring-2 focus:ring-secondary/40 text-right"
                placeholder="0.00"
              />
            </div>
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-secondary-container/40 text-on-secondary-container text-xs font-semibold flex items-center justify-between">
          <span>Discount Deduction:</span>
          <span className="font-tabular-data font-bold">{formatINR(overallDiscountAmount)}</span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-secondary text-on-secondary font-label-md text-xs font-bold shadow-sm cursor-pointer mt-1"
        >
          Apply Discount
        </button>
      </div>
    </div>
  );
};
