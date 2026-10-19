import React from 'react';
import { formatINR } from '../../../core/utils/formatters.ts';

export interface PurchaseActionDockProps {
  finalGrandTotal: number;
  isSubmitting?: boolean;
  onClose: () => void;
  onSaveBill: () => void;
  onSaveDraft?: () => void;
  purchaseType?: 'BILL' | 'PO' | 'RETURN';
}

export const PurchaseActionDock: React.FC<PurchaseActionDockProps> = ({
  finalGrandTotal,
  isSubmitting = false,
  onClose,
  onSaveBill,
  onSaveDraft,
  purchaseType = 'BILL',
}) => {
  const isPo = purchaseType === 'PO';
  const isReturn = purchaseType === 'RETURN';

  const totalLabel = isPo
    ? 'Total Order Value'
    : isReturn
    ? 'Total Return Value'
    : 'Total Inward Payable';

  const amountColor = isPo
    ? 'text-indigo-600 dark:text-indigo-400'
    : isReturn
    ? 'text-amber-700 dark:text-amber-400'
    : 'text-orange-600 dark:text-orange-400';

  const saveBtnBg = isPo
    ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/30'
    : isReturn
    ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/30'
    : 'bg-orange-600 hover:bg-orange-700 shadow-orange-600/30';

  const saveBtnText = isPo
    ? isSubmitting
      ? 'Saving PO...'
      : 'Save Purchase Order'
    : isReturn
    ? isSubmitting
      ? 'Saving Debit Note...'
      : 'Save Debit Note'
    : isSubmitting
    ? 'Saving Bill...'
    : 'Save Purchase Bill';

  return (
    <aside
      aria-label="Purchase Actions"
      className="fixed bottom-0 left-0 right-0 z-40 bg-surface-container-lowest/95 backdrop-blur-xl border-t border-outline-variant/30 shadow-lg pb-safe"
    >
      <div className="px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3 w-full">
        <div className="flex flex-col">
          <span className="text-[10px] text-on-surface-variant uppercase font-bold tracking-wider">
            {totalLabel}
          </span>
          <span className={`font-tabular-data font-black text-base sm:text-lg ${amountColor}`}>
            {formatINR(finalGrandTotal)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onSaveDraft && (
            <button
              type="button"
              onClick={onSaveDraft}
              className="h-10 px-3.5 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all cursor-pointer border border-outline-variant/40 active:scale-95"
              title="Save current progress as draft"
            >
              <span className="material-symbols-outlined text-[18px]">drafts</span>
              <span>Save Draft</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-4 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all cursor-pointer border border-outline-variant/40 active:scale-95"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onSaveBill}
            data-testid="purchase-save-btn"
            className={`h-10 px-5 rounded-xl ${saveBtnBg} text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-sm transition-all ${
              isSubmitting ? 'opacity-60 cursor-not-allowed' : 'active:scale-95 cursor-pointer'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {isSubmitting ? 'hourglass_top' : 'save'}
            </span>
            <span>{saveBtnText}</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
