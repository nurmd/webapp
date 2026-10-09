import React from 'react';
import { Party } from '../../../models/party.ts';
import { Invoice } from '../../../models/invoice.ts';
import { formatINR } from '../../../core/utils/formatters.ts';
import { suggestNextUniqueInvoiceNumber } from '../../../core/utils/invoiceNumber.ts';

export interface InvoiceHeaderMetaProps {
  onClose: () => void;
  initialInvoice?: Invoice | null;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  posStateCode: string;
  isGstActive: boolean;
  isIntraState: boolean;
  selectedParty: Party | null;
  currentConflict: Invoice | null;
  invoiceConflictError: string | null;
  allInvoices: Invoice[];
  onSelectPartyClick: () => void;
  onClearParty: () => void;
  onAddPartyClick: () => void;
  onOpenInvoiceNumberModal: () => void;
  onOpenDueDateModal: () => void;
  onAutoFixConflict: (newNumber: string) => void;
}

function formatDateDisplay(dateStr: string): string {
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0].slice(2)}`;
    }
  } catch {}
  return dateStr;
}

export const InvoiceHeaderMeta: React.FC<InvoiceHeaderMetaProps> = ({
  onClose,
  initialInvoice,
  invoiceNumber,
  invoiceDate,
  dueDate,
  posStateCode,
  isGstActive,
  isIntraState,
  selectedParty,
  currentConflict,
  invoiceConflictError,
  allInvoices,
  onSelectPartyClick,
  onClearParty,
  onAddPartyClick,
  onOpenInvoiceNumberModal,
  onOpenDueDateModal,
  onAutoFixConflict,
}) => {
  return (
    <>
      {/* Fixed Top Shell Header */}
      <header className="fixed top-0 w-full z-40 bg-surface-container-lowest/95 backdrop-blur-xl shadow-xs border-b border-outline-variant/30 pt-safe">
        <div className="h-14 px-3 sm:px-6 flex items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              onClick={onClose}
              aria-label="Go Back"
              type="button"
              className="w-9 h-9 flex items-center justify-center text-on-surface hover:bg-surface-container active:scale-95 rounded-xl transition-all cursor-pointer flex-shrink-0"
            >
              <span className="material-symbols-outlined text-[22px]">arrow_back</span>
            </button>

            <div className="w-8 h-8 rounded-xl bg-secondary text-on-secondary flex items-center justify-center font-black text-sm shadow-xs flex-shrink-0">
              ₹
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <h1 className="font-bold text-sm sm:text-base text-on-surface truncate">
                {initialInvoice ? `Edit Invoice #${invoiceNumber}` : `New Invoice`}
              </h1>
              {isGstActive && (
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-secondary/10 text-secondary border border-secondary/20">
                  {isIntraState ? 'Intra-State GST' : 'Inter-State IGST'}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>
      </header>

      {/* Ultra-Compact Document Header Bar */}
      <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl px-3 py-2 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
        {/* Customer Pill / Selector */}
        <div className="flex items-center justify-between sm:justify-start gap-2 min-w-0">
          <button
            type="button"
            onClick={onSelectPartyClick}
            className="flex items-center gap-2 hover:bg-surface-container-low px-2 py-1 rounded-lg transition-colors cursor-pointer group min-w-0 text-left"
            title="Select or Change Customer"
          >
            <div className="w-7 h-7 rounded-lg bg-secondary/10 text-secondary flex items-center justify-center flex-shrink-0 group-hover:bg-secondary group-hover:text-on-secondary transition-colors">
              <span className="material-symbols-outlined text-[17px]">person</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs sm:text-sm text-on-surface truncate group-hover:text-secondary">
                  {selectedParty ? selectedParty.name : 'Walk-in Customer'}
                </span>
                <span className="material-symbols-outlined text-[14px] text-outline group-hover:text-secondary shrink-0">
                  swap_horiz
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-on-surface-variant truncate">
                {selectedParty?.gstin && isGstActive ? (
                  <span className="font-mono font-semibold text-secondary">
                    GSTIN: {selectedParty.gstin}
                  </span>
                ) : (
                  <span className="text-outline">Cash Sale / Retail</span>
                )}
                {posStateCode && (
                  <span>· PoS: {posStateCode}</span>
                )}
              </div>
            </div>
          </button>

          {selectedParty && (
            <div className="flex items-center gap-1 shrink-0">
              {(selectedParty.currentBalance || 0) > 0 ? (
                <span className="text-[10px] font-bold text-amber-800 bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300 px-2 py-0.5 rounded-full border border-amber-300/60">
                  Due: {formatINR(selectedParty.currentBalance || 0)}
                </span>
              ) : null}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearParty();
                }}
                title="Clear customer (revert to Walk-in)"
                className="w-6 h-6 rounded-md flex items-center justify-center text-outline hover:text-error hover:bg-error-container/30 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </div>
          )}

          {/* Direct Add New Customer Button */}
          <button
            type="button"
            onClick={onAddPartyClick}
            className="px-2 py-1 rounded-lg bg-secondary/10 hover:bg-secondary/20 text-secondary font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer shrink-0 active:scale-95"
            title="Add New Customer Directly"
          >
            <span className="material-symbols-outlined text-[15px]">person_add</span>
            <span className="hidden sm:inline">+ New</span>
          </button>
        </div>

        {/* Invoice Metadata Pills (Invoice No, Dates, Billing Mode) */}
        <div className="flex items-center flex-wrap gap-1.5">
          {/* Invoice Number */}
          <button
            type="button"
            onClick={onOpenInvoiceNumberModal}
            className={`h-7 px-2 rounded-lg font-semibold text-xs flex items-center gap-1 transition-colors cursor-pointer border ${
              currentConflict
                ? 'bg-error/15 text-error border-error/50 hover:bg-error/25 animate-pulse'
                : 'bg-surface-container-low hover:bg-surface-container text-on-surface border-outline-variant/20'
            }`}
            title={
              currentConflict
                ? `Conflicting invoice number! #${invoiceNumber} is already used by ${currentConflict.partyName || 'Customer'}`
                : 'Change Invoice Number'
            }
          >
            <span className="text-[9px] uppercase font-bold text-outline">No:</span>
            <span className="font-bold truncate max-w-[120px]">#{invoiceNumber}</span>
            <span className={`material-symbols-outlined text-[12px] ${currentConflict ? 'text-error font-bold' : 'text-outline'}`}>
              {currentConflict ? 'warning' : 'edit'}
            </span>
          </button>

          {/* Invoice Date */}
          <button
            type="button"
            onClick={onOpenInvoiceNumberModal}
            className="h-7 px-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-medium text-xs flex items-center gap-1 transition-colors cursor-pointer border border-outline-variant/20"
            title="Change Invoice Date"
          >
            <span className="material-symbols-outlined text-[13px] text-outline">calendar_today</span>
            <span>{formatDateDisplay(invoiceDate)}</span>
          </button>

          {/* Due Date */}
          <button
            type="button"
            onClick={onOpenDueDateModal}
            className="h-7 px-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-medium text-xs flex items-center gap-1 transition-colors cursor-pointer border border-outline-variant/20"
            title="Change Due Date"
          >
            <span className="text-[9px] uppercase font-bold text-outline">Due:</span>
            <span>{formatDateDisplay(dueDate)}</span>
            <span className="material-symbols-outlined text-[12px] text-outline">event</span>
          </button>

          {/* Mode & PoS */}
          {isGstActive && (
            <div className="h-7 px-2 rounded-lg bg-secondary/10 text-secondary font-bold text-[11px] flex items-center gap-1 border border-secondary/20">
              <span>GST</span>
              <span className="text-[10px] font-mono opacity-80">({posStateCode})</span>
            </div>
          )}
        </div>
      </div>

      {/* Conflicting Invoice Alert Banner */}
      {(currentConflict || invoiceConflictError) && (
        <div className="bg-error-container/40 border border-error/40 text-error rounded-xl p-2.5 sm:p-3 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-[20px] shrink-0 text-error">warning</span>
            <div className="min-w-0">
              <span className="font-bold block">Conflicting Invoice Number: #{invoiceNumber}</span>
              <span className="text-[11px] opacity-90 truncate block">
                {invoiceConflictError || `Already issued to ${currentConflict?.partyName || 'Customer'} (${currentConflict?.date || 'earlier'}). Only unique invoice numbers are allowed.`}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const autoNext = suggestNextUniqueInvoiceNumber(invoiceNumber, initialInvoice?.id, allInvoices);
              onAutoFixConflict(autoNext);
            }}
            className="shrink-0 px-2.5 py-1.5 rounded-lg bg-error text-on-error font-bold text-xs hover:bg-error/90 active:scale-95 transition-all cursor-pointer flex items-center gap-1 shadow-xs"
          >
            <span className="material-symbols-outlined text-[14px]">auto_fix_high</span>
            <span>Auto-Fix</span>
          </button>
        </div>
      )}
    </>
  );
};
