import React from 'react';
import { formatINR } from '../../../core/utils/formatters.ts';

export interface PurchaseActionDockProps {
  finalGrandTotal: number;
  isSubmitting?: boolean;
  onClose: () => void;
  onSaveBill: () => void;
}

export const PurchaseActionDock: React.FC<PurchaseActionDockProps> = ({
  finalGrandTotal,
  isSubmitting = false,
  onClose,
  onSaveBill,
}) => {
  return (
    <aside
      aria-label="Purchase Actions"
      className="fixed bottom-0 left-0 right-0 z-40 bg-surface-container-lowest/95 backdrop-blur-xl border-t border-outline-variant/30 shadow-lg pb-safe"
    >
      <div className="px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3 w-full">
        <div className="flex flex-col">
          <span className="text-[10px] text-on-surface-variant uppercase font-bold tracking-wider">
            Total Inward Payable
          </span>
          <span className="font-tabular-data font-black text-base sm:text-lg text-orange-600 dark:text-orange-400">
            {formatINR(finalGrandTotal)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-4 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all cursor-pointer border border-outline-variant/40"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onSaveBill}
            className={`h-10 px-5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-sm shadow-orange-600/30 transition-all ${
              isSubmitting ? 'opacity-60 cursor-not-allowed' : 'active:scale-95 cursor-pointer'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {isSubmitting ? 'hourglass_top' : 'save'}
            </span>
            <span>{isSubmitting ? 'Saving Bill...' : 'Save Purchase Bill'}</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
