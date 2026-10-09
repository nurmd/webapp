import React, { useState, useEffect } from 'react';
import { Invoice } from '../../../models/invoice.ts';
import { getStateList } from '../../../core/gst/stateCodes.ts';
import { findConflictingInvoice, suggestNextUniqueInvoiceNumber } from '../../../core/utils/invoiceNumber.ts';

export interface InvoiceNumberDateModalProps {
  isOpen: boolean;
  invoiceNumber: string;
  invoiceDate: string;
  posStateCode: string;
  allInvoices: Invoice[];
  initialInvoiceId?: string;
  onApply: (params: { invoiceNumber: string; invoiceDate: string; posStateCode: string }) => void;
  onClose: () => void;
}

export const InvoiceNumberDateModal: React.FC<InvoiceNumberDateModalProps> = ({
  isOpen,
  invoiceNumber,
  invoiceDate,
  posStateCode,
  allInvoices,
  initialInvoiceId,
  onApply,
  onClose,
}) => {
  const [customInvoiceNumberInput, setCustomInvoiceNumberInput] = useState(invoiceNumber);
  const [currentDateInput, setCurrentDateInput] = useState(invoiceDate);
  const [currentPosStateCode, setCurrentPosStateCode] = useState(posStateCode);

  useEffect(() => {
    if (isOpen) {
      setCustomInvoiceNumberInput(invoiceNumber);
      setCurrentDateInput(invoiceDate);
      setCurrentPosStateCode(posStateCode);
    }
  }, [isOpen, invoiceNumber, invoiceDate, posStateCode]);

  if (!isOpen) return null;

  const dialogConflict = findConflictingInvoice(
    customInvoiceNumberInput,
    initialInvoiceId,
    allInvoices
  );

  return (
    <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-2xl border border-outline-variant/30 max-w-sm w-full animate-fade-in flex flex-col gap-3.5">
        <h3 className="font-headline-sm text-base font-bold text-on-surface">
          Edit Invoice Number &amp; Date
        </h3>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-bold text-on-surface-variant block">
              Invoice Number Series
            </label>
            {dialogConflict ? (
              <span className="text-[10px] font-bold text-error flex items-center gap-0.5">
                <span className="material-symbols-outlined text-[13px]">cancel</span>
                Number in use
              </span>
            ) : (
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                <span className="material-symbols-outlined text-[13px]">check_circle</span>
                Available
              </span>
            )}
          </div>
          <input
            type="text"
            value={customInvoiceNumberInput}
            onChange={(e) => setCustomInvoiceNumberInput(e.target.value)}
            placeholder="e.g. INV-2024-001"
            className={`w-full bg-surface-container-low border rounded-xl px-3 py-2 text-sm font-semibold outline-none transition-colors ${
              dialogConflict
                ? 'border-error text-error focus:ring-2 focus:ring-error/40'
                : 'border-outline-variant/40 text-on-surface focus:ring-2 focus:ring-secondary/40'
            }`}
          />

          {dialogConflict && (
            <div className="mt-1.5 p-2.5 rounded-lg bg-error-container/30 border border-error/40 text-error text-[11px] flex flex-col gap-1.5 animate-shake">
              <div className="flex items-start gap-1.5">
                <span className="material-symbols-outlined text-[16px] shrink-0 text-error mt-0.5">error</span>
                <span>
                  <strong>#{customInvoiceNumberInput.trim()}</strong> is already issued to <strong>{dialogConflict.partyName || 'Customer'}</strong> ({dialogConflict.date || 'prior bill'}). Duplicate invoice numbers are not allowed under GST compliance.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const nextUnique = suggestNextUniqueInvoiceNumber(customInvoiceNumberInput, initialInvoiceId, allInvoices);
                  setCustomInvoiceNumberInput(nextUnique);
                }}
                className="self-start px-2 py-1 rounded bg-error text-on-error font-bold text-[10px] hover:bg-error/90 active:scale-95 transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
              >
                <span className="material-symbols-outlined text-[13px]">auto_fix_high</span>
                <span>Use Next Available Unique ({suggestNextUniqueInvoiceNumber(customInvoiceNumberInput, initialInvoiceId, allInvoices)})</span>
              </button>
            </div>
          )}
        </div>

        <div>
          <label className="text-[11px] font-bold text-on-surface-variant block mb-1">
            Invoice Issue Date
          </label>
          <input
            type="date"
            value={currentDateInput}
            onChange={(e) => setCurrentDateInput(e.target.value)}
            className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-sm text-on-surface font-semibold outline-none focus:ring-2 focus:ring-secondary/40"
          />
        </div>

        <div>
          <label className="text-[11px] font-bold text-on-surface-variant block mb-1">
            Place of Supply State
          </label>
          <select
            value={currentPosStateCode}
            onChange={(e) => setCurrentPosStateCode(e.target.value)}
            className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-sm text-on-surface font-semibold outline-none focus:ring-2 focus:ring-secondary/40"
          >
            {getStateList().map((s) => (
              <option key={s.code} value={s.code}>
                {s.code} - {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-xl border border-outline-variant/40 text-on-surface font-label-md text-xs font-semibold cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={Boolean(dialogConflict) || !customInvoiceNumberInput.trim()}
            onClick={() => {
              if (dialogConflict || !customInvoiceNumberInput.trim()) return;
              onApply({
                invoiceNumber: customInvoiceNumberInput.trim(),
                invoiceDate: currentDateInput,
                posStateCode: currentPosStateCode,
              });
              onClose();
            }}
            className={`flex-1 py-2 rounded-xl font-label-md text-xs font-bold shadow-sm cursor-pointer transition-all ${
              dialogConflict || !customInvoiceNumberInput.trim()
                ? 'bg-outline-variant/30 text-outline cursor-not-allowed'
                : 'bg-secondary text-on-secondary hover:bg-secondary/90'
            }`}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};
