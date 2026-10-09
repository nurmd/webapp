import React from 'react';
import { PaymentMode, PaymentStatus, PaymentSplit } from '../../../models/invoice.ts';
import { formatINR } from '../../../core/utils/formatters.ts';

export interface PaymentSettlementDockProps {
  paymentSplits: PaymentSplit[];
  autoPaymentStatus: PaymentStatus;
  balanceDue: number;
  onUpdateSplitMode: (id: string, mode: PaymentMode) => void;
  onUpdateSplitAmount: (id: string, amount: number) => void;
  onAddSplitMode: () => void;
  onRemoveSplit: (id: string) => void;
  paymentModes?: { value: PaymentMode; label: string }[];
}

const DEFAULT_PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI / QR' },
  { value: 'NET_BANKING', label: 'Bank Transfer' },
  { value: 'CARD', label: 'Card' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'CREDIT', label: 'Credit (Udhaar)' },
];

export const PaymentSettlementDock: React.FC<PaymentSettlementDockProps> = ({
  paymentSplits,
  autoPaymentStatus,
  balanceDue,
  onUpdateSplitMode,
  onUpdateSplitAmount,
  onAddSplitMode,
  onRemoveSplit,
  paymentModes = DEFAULT_PAYMENT_MODES,
}) => {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-2.5 sm:p-3 shadow-2xs flex flex-col gap-2">
      {/* Header with Title and Auto-Identified Status */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[16px] text-secondary">payments</span>
          <span className="font-bold text-xs text-on-surface">Payment Settlement</span>
        </div>

        {/* Auto-identified Payment Status Badge */}
        <div>
          {autoPaymentStatus === 'PAID' && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-secondary/15 text-secondary border border-secondary/30 flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">check_circle</span>
              <span>Paid</span>
            </span>
          )}
          {autoPaymentStatus === 'PARTIAL' && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">timelapse</span>
              <span>Partial · Due: {formatINR(balanceDue)}</span>
            </span>
          )}
          {autoPaymentStatus === 'UNPAID' && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-error/15 text-error border border-error/30 flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">schedule</span>
              <span>Unpaid · Due: {formatINR(balanceDue)}</span>
            </span>
          )}
        </div>
      </div>

      {/* Payment Splits */}
      <div className="flex flex-col gap-2 pt-1 border-t border-outline-variant/15">
        {paymentSplits.map((split, index) => (
          <div key={split.id} className="flex items-center gap-2">
            {/* Payment Type Selector */}
            <div className="relative flex-1 sm:max-w-[170px]">
              <select
                value={split.mode}
                onChange={(e) => onUpdateSplitMode(split.id, e.target.value as PaymentMode)}
                className="w-full h-8 pl-2 pr-6 rounded-lg bg-surface-container-low text-xs font-bold text-on-surface border border-outline-variant/30 outline-none focus:border-secondary transition-colors cursor-pointer appearance-none"
              >
                {paymentModes.map((pm) => (
                  <option key={pm.value} value={pm.value}>
                    {pm.label}
                  </option>
                ))}
              </select>
              <span className="material-symbols-outlined text-[16px] text-outline absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
                arrow_drop_down
              </span>
            </div>

            {/* Amount Input (or ledger banner if Credit) */}
            {split.mode !== 'CREDIT' ? (
              <div className="relative flex-1 flex items-center">
                <span className="absolute left-2 text-xs font-semibold text-outline pointer-events-none">₹</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={split.amount === 0 ? '' : split.amount}
                  onChange={(e) => onUpdateSplitAmount(split.id, e.target.value === '' ? 0 : Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full h-8 pl-5 pr-2 rounded-lg bg-surface-container-low text-right font-tabular-data text-xs font-bold text-on-surface border border-outline-variant/30 outline-none focus:border-secondary transition-all"
                />
              </div>
            ) : (
              <div className="flex-1 h-8 px-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-800 dark:text-amber-300 font-medium flex items-center justify-between">
                <span className="truncate">Ledger Balance (Udhaar)</span>
                <span className="font-tabular-data font-bold shrink-0">{formatINR(balanceDue)}</span>
              </div>
            )}

            {/* Plus button next to it for split payment modes */}
            {index === 0 && (
              <button
                type="button"
                onClick={onAddSplitMode}
                title="Add split payment mode"
                className="h-8 px-2 sm:px-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-bold text-xs flex items-center gap-1 border border-outline-variant/30 transition-all cursor-pointer shrink-0"
              >
                <span className="material-symbols-outlined text-[16px] text-secondary">add</span>
                <span className="hidden sm:inline">Split</span>
              </button>
            )}

            {/* Remove button for secondary splits */}
            {index > 0 && (
              <button
                type="button"
                onClick={() => onRemoveSplit(split.id)}
                title="Remove split"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-outline hover:text-error hover:bg-error-container/30 transition-colors cursor-pointer shrink-0"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>
        ))}
        {paymentSplits.length > 1 && paymentSplits.length < 5 && (
          <div className="flex justify-end pt-0.5">
            <button
              type="button"
              onClick={onAddSplitMode}
              className="text-[11px] font-bold text-secondary hover:text-secondary/80 flex items-center gap-1 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[14px]">add_circle</span>
              <span>Add another tender mode</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
