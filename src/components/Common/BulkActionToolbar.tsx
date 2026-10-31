import React from 'react';

export interface BulkActionToolbarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkPrint?: () => void;
  onBulkExport?: () => void;
  onBulkMarkPaid?: () => void;
  onBulkDelete?: () => void;
  markPaidLabel?: string;
  isProcessing?: boolean;
}

export const BulkActionToolbar: React.FC<BulkActionToolbarProps> = ({
  selectedCount,
  onClearSelection,
  onBulkPrint,
  onBulkExport,
  onBulkMarkPaid,
  onBulkDelete,
  markPaidLabel = 'Mark as Paid',
  isProcessing = false,
}) => {
  if (selectedCount <= 0) return null;

  return (
    <div className="fixed bottom-16 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-2xl animate-in slide-in-from-bottom duration-200">
      <div className="bg-surface-container-highest/95 backdrop-blur-md text-on-surface border border-outline-variant/40 shadow-2xl rounded-2xl p-2 sm:p-2.5 flex items-center justify-between gap-2">
        {/* Left: Count & Clear */}
        <div className="flex items-center gap-2 pl-1.5 min-w-0">
          <span className="w-6 h-6 rounded-full bg-primary text-on-primary text-[11px] font-bold flex items-center justify-center shrink-0">
            {selectedCount}
          </span>
          <span className="text-xs font-semibold truncate hidden xs:inline">
            Selected
          </span>
          <button
            type="button"
            onClick={onClearSelection}
            disabled={isProcessing}
            className="w-7 h-7 rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-on-surface flex items-center justify-center cursor-pointer transition-colors"
            title="Clear Selection"
            aria-label="Clear selection"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>

        {/* Right: Action Buttons */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 overflow-x-auto no-scrollbar py-0.5 justify-end">
          {onBulkPrint && (
            <button
              type="button"
              onClick={onBulkPrint}
              disabled={isProcessing}
              className="min-h-[36px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-surface-container-lowest hover:bg-surface-container text-on-surface font-semibold text-xs border border-outline-variant/30 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-xs disabled:opacity-50 whitespace-nowrap shrink-0"
              title="Print selected documents"
            >
              <span className="material-symbols-outlined text-[16px]">print</span>
              <span className="hidden sm:inline">Print</span>
            </button>
          )}

          {onBulkExport && (
            <button
              type="button"
              onClick={onBulkExport}
              disabled={isProcessing}
              className="min-h-[36px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-surface-container-lowest hover:bg-surface-container text-on-surface font-semibold text-xs border border-outline-variant/30 flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-xs disabled:opacity-50 whitespace-nowrap shrink-0"
              title="Export selected to Excel / CSV"
            >
              <span className="material-symbols-outlined text-[16px]">file_download</span>
              <span className="hidden sm:inline">Export</span>
            </button>
          )}

          {onBulkMarkPaid && (
            <button
              type="button"
              onClick={onBulkMarkPaid}
              disabled={isProcessing}
              className="min-h-[36px] px-2.5 sm:px-3.5 py-1.5 rounded-xl bg-secondary text-on-secondary font-bold text-xs flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all shadow-xs disabled:opacity-50 whitespace-nowrap shrink-0"
              title={markPaidLabel}
            >
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              <span>{markPaidLabel}</span>
            </button>
          )}

          {onBulkDelete && (
            <button
              type="button"
              onClick={onBulkDelete}
              disabled={isProcessing}
              className="min-h-[36px] px-2.5 py-1.5 rounded-xl bg-error/15 hover:bg-error/25 text-error font-semibold text-xs flex items-center gap-1 cursor-pointer active:scale-95 transition-all disabled:opacity-50 whitespace-nowrap shrink-0"
              title="Delete selected documents"
              aria-label="Delete selected documents"
            >
              <span className="material-symbols-outlined text-[16px]">delete</span>
              <span className="hidden md:inline">Delete</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
