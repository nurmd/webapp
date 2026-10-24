import React from 'react';
import { formatINR } from '../../../core/utils/formatters.ts';
import { InvoiceType } from '../../../models/invoice.ts';

export interface InvoiceActionDockProps {
  finalGrandTotal: number;
  onSaveAndPrint: () => void;
  onSaveInvoice: () => void;
  onPayAndSave: () => void;
  onSaveDraft?: () => void;
  /** Optional legacy alias for tests */
  onPrintThermal?: () => void;
  invoiceType?: InvoiceType;
}

export const InvoiceActionDock: React.FC<InvoiceActionDockProps> = ({
  finalGrandTotal,
  onSaveAndPrint,
  onSaveInvoice,
  onPayAndSave,
  onSaveDraft,
  onPrintThermal,
  invoiceType,
}) => {
  const isSalesOrder = invoiceType === 'SALES_ORDER';
  const isCreditNote = invoiceType === 'CREDIT_NOTE';
  const isDebitNote = invoiceType === 'DEBIT_NOTE';
  const isQuotation = invoiceType === 'ESTIMATE';
  const isDeliveryChallan = invoiceType === 'DELIVERY_CHALLAN';

  const totalLabel = isSalesOrder
    ? 'Total Order Value'
    : isCreditNote
    ? 'Total Return Value'
    : isDebitNote
    ? 'Total Debit Value'
    : isQuotation
    ? 'Quotation Value'
    : isDeliveryChallan
    ? 'Challan Value'
    : 'Net Payable';

  const saveButtonLabel = isSalesOrder
    ? 'Save Sales Order'
    : isCreditNote
    ? 'Save Credit Note'
    : isDebitNote
    ? 'Save Debit Note'
    : isQuotation
    ? 'Save Quotation'
    : isDeliveryChallan
    ? 'Save Challan'
    : 'Save Invoice';

  const payButtonLabel = isSalesOrder
    ? 'Advance & Save'
    : isCreditNote
    ? 'Refund & Save'
    : isQuotation
    ? 'Accept & Save'
    : 'Pay & Save';

  return (
    <aside
      aria-label="Invoice Actions"
      className="fixed bottom-0 left-0 right-0 z-40 bg-surface-container-lowest/95 backdrop-blur-xl border-t border-outline-variant/30 shadow-lg pb-safe"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 sm:py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 w-full">
        {/* Left: Net Payable + Save & Print */}
        <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-3 w-full sm:w-auto shrink-0">
          <div className="flex flex-col pr-1 sm:pr-2">
            <span className="text-[10px] text-on-surface-variant uppercase font-bold tracking-wider leading-tight">
              {totalLabel}
            </span>
            <span className="font-tabular-data font-black text-sm sm:text-base text-secondary leading-tight mt-0.5">
              {formatINR(finalGrandTotal)}
            </span>
          </div>

          <button
            type="button"
            onClick={onSaveAndPrint || onPrintThermal}
            className="h-10 px-3 sm:px-4 rounded-xl bg-surface-container font-bold text-xs sm:text-sm text-on-surface flex items-center gap-1.5 hover:bg-surface-container-high transition-colors cursor-pointer border border-outline-variant/30 active:scale-95 shrink-0"
            title={isSalesOrder ? 'Save Sales Order and Print Preview' : 'Save bill as Unpaid and Print Thermal Receipt'}
          >
            <span className="material-symbols-outlined text-[18px]">print</span>
            <span>Save &amp; Print</span>
          </button>
        </div>

        {/* Right: Save Draft + Save Invoice (Unpaid/Credit) + Pay & Save */}
        <div className="flex items-center justify-between sm:justify-end gap-1.5 sm:gap-2.5 w-full sm:w-auto shrink-0">
          {onSaveDraft && (
            <button
              type="button"
              onClick={onSaveDraft}
              className="h-10 px-2.5 sm:px-3.5 rounded-xl bg-surface-container font-bold text-xs sm:text-sm text-on-surface flex items-center gap-1.5 hover:bg-surface-container-high transition-colors cursor-pointer border border-outline-variant/30 active:scale-95 shrink-0"
              title="Save current progress as draft"
            >
              <span className="material-symbols-outlined text-[18px]">drafts</span>
              <span className="hidden sm:inline">Save Draft</span>
            </button>
          )}

          <button
            type="button"
            onClick={onSaveInvoice}
            data-testid="invoice-save-btn"
            className="h-10 px-3 sm:px-4 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all cursor-pointer border border-outline-variant/40 active:scale-95 shrink-0"
            title={isSalesOrder ? 'Save Sales Order directly' : isCreditNote ? 'Save Credit Note directly' : 'Save bill as Unpaid directly'}
          >
            <span className="material-symbols-outlined text-[18px]">save</span>
            <span>{saveButtonLabel}</span>
          </button>

          <button
            type="button"
            onClick={onPayAndSave}
            data-testid="invoice-pay-save-btn"
            className="h-10 px-3.5 sm:px-5 rounded-xl bg-secondary text-on-secondary font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-sm hover:bg-secondary/90 active:scale-95 transition-all cursor-pointer shrink-0"
            title={isSalesOrder ? 'Record booking advance and save' : 'Open Payment Modal to settle tender and save'}
          >
            <span className="material-symbols-outlined text-[18px]">payments</span>
            <span>{payButtonLabel}</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
