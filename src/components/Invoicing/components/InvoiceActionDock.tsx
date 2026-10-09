import React from 'react';
import { formatINR } from '../../../core/utils/formatters.ts';

export interface InvoiceActionDockProps {
  finalGrandTotal: number;
  onPrintThermal: () => void;
  onSaveInvoice: (andShareWhatsApp: boolean) => void;
}

export const InvoiceActionDock: React.FC<InvoiceActionDockProps> = ({
  finalGrandTotal,
  onPrintThermal,
  onSaveInvoice,
}) => {
  return (
    <aside
      aria-label="Invoice Actions"
      className="fixed bottom-0 left-0 right-0 z-40 bg-surface-container-lowest/95 backdrop-blur-xl border-t border-outline-variant/30 shadow-lg pb-safe"
    >
      <div className="px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3 w-full">
        {/* Left Total Info */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrintThermal}
            className="h-10 px-3.5 rounded-xl bg-surface-container font-bold text-xs text-on-surface flex items-center gap-1.5 hover:bg-surface-container-high transition-colors cursor-pointer border border-outline-variant/30 active:scale-95"
            title="Print Thermal POS Receipt"
          >
            <span className="material-symbols-outlined text-[18px]">print</span>
            <span>Print</span>
          </button>
          <div className="hidden sm:flex flex-col pl-2 border-l border-outline-variant/30">
            <span className="text-[10px] text-on-surface-variant uppercase font-bold tracking-wider">Net Payable</span>
            <span className="font-tabular-data font-black text-sm text-secondary">{formatINR(finalGrandTotal)}</span>
          </div>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSaveInvoice(false)}
            className="h-10 px-4 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all cursor-pointer border border-outline-variant/40"
          >
            <span className="material-symbols-outlined text-[18px]">save</span>
            <span>Save Invoice</span>
          </button>

          <button
            type="button"
            onClick={() => onSaveInvoice(true)}
            className="h-10 px-4 sm:px-5 rounded-xl bg-secondary text-on-secondary font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-sm hover:bg-secondary/90 active:scale-95 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">send</span>
            <span>Save &amp; WhatsApp</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
