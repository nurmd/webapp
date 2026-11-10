import React from 'react';
import { OutstandingDocument } from '../../../core/accounting/paymentAllocation.ts';
import { formatDate, formatINR } from '../../../core/utils/formatters.ts';

export interface VoucherAllocationRowProps {
  doc: OutstandingDocument;
  allocVal: number;
  isChecked: boolean;
  isExceedsDocBal: boolean;
  isOpeningBal: boolean;
  onToggle: () => void;
  onAmountChange: (value: string) => void;
}

export const VoucherAllocationRow: React.FC<VoucherAllocationRowProps> = ({
  doc,
  allocVal,
  isChecked,
  isExceedsDocBal,
  isOpeningBal,
  onToggle,
  onAmountChange,
}) => {
  return (
    <div
      className={`pt-1 pb-1 flex items-center justify-between gap-2 text-xs transition-colors ${
        isChecked ? 'bg-secondary/5 -mx-1 px-1 rounded' : ''
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <input
          type="checkbox"
          checked={isChecked}
          onChange={onToggle}
          className="rounded accent-secondary cursor-pointer"
        />
        <div className="min-w-0 flex flex-col">
          <span className="font-bold text-on-surface truncate text-[11px]">
            {isOpeningBal ? (doc.documentNumber || 'Opening Balance') : `#${doc.documentNumber}`}
          </span>
          <div className="text-[10px] text-on-surface-variant flex flex-wrap items-center gap-x-1">
            <span>{formatDate(doc.date)}</span>
            <span>•</span>
            <span>Bal: {formatINR(doc.balanceAmount)}</span>
            <span>•</span>
            <span className="font-semibold text-secondary">
              Available (Remaining): {formatINR(Math.max(0, Number((doc.balanceAmount - allocVal).toFixed(2))))}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <div className="relative flex items-center">
          <span className="absolute left-1.5 text-[10px] text-on-surface-variant font-bold">₹</span>
          <input
            type="number"
            step="0.01"
            min="0"
            max={doc.balanceAmount}
            value={allocVal > 0 ? allocVal : ''}
            placeholder="0.00"
            onChange={(e) => onAmountChange(e.target.value)}
            className={`w-20 pl-4 pr-1 py-0.5 bg-surface rounded text-right font-bold text-xs border ${
              isExceedsDocBal
                ? 'border-error text-error'
                : isChecked
                ? 'border-secondary text-secondary'
                : 'border-outline-variant/30 text-on-surface'
            } focus:outline-none`}
          />
        </div>
      </div>
    </div>
  );
};
