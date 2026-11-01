import React, { useState } from 'react';
import { Expense } from '../../models/expense.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { safeOpenExternalUrl } from '../../core/utils/upiAndShare.ts';
import { printExpenseVoucher } from '../../core/utils/expenseVoucherPrinter.ts';
import { getExpenseCategoryMeta, PAYMENT_MODE_LABELS } from './expenseCategoryMeta.ts';

export interface ExpenseDetailSheetProps {
  expense: Expense | null;
  company: CompanyProfile;
  onClose: () => void;
  onEdit?: (expense: Expense) => void;
  onDelete?: (expenseId: string) => void;
  onShare?: (expense: Expense) => void;
  onPrint?: (expense: Expense) => void;
}

export const ExpenseDetailSheet: React.FC<ExpenseDetailSheetProps> = ({
  expense,
  company,
  onClose,
  onEdit,
  onDelete,
  onShare,
  onPrint,
}) => {
  const [isTaxDetailsOpen, setIsTaxDetailsOpen] = useState(false);

  if (!expense) return null;

  const categoryMeta = getExpenseCategoryMeta(expense.category);

  const handleShare = () => {
    if (onShare) {
      onShare(expense);
      return;
    }
    const text =
      `*Expense Voucher - ${company.tradeName || company.businessName}*\n` +
      `--------------------------------\n` +
      `*Expense:* ${expense.title}\n` +
      `*Category:* ${expense.category}\n` +
      `*Date:* ${formatDate(expense.date)}\n` +
      `*Amount:* ${formatINR(expense.amount)}\n` +
      `*Payment Mode:* ${expense.paymentMode}\n` +
      (expense.vendorName ? `*Vendor:* ${expense.vendorName}\n` : '') +
      (expense.vendorGstin ? `*Vendor GSTIN:* ${expense.vendorGstin}\n` : '') +
      (expense.voucherNumber ? `*Voucher No:* ${expense.voucherNumber}\n` : '') +
      (expense.taxAmount > 0 ? `*Tax:* ${formatINR(expense.taxAmount)} (${expense.gstRate}% GST)\n` : '') +
      (expense.notes ? `*Notes:* ${expense.notes}\n` : '') +
      `--------------------------------\n` +
      `Recorded in GST Billing App`;
    safeOpenExternalUrl(`https://wa.me/?text=${encodeURIComponent(text)}`);
  };

  const handlePrint = () => {
    if (onPrint) {
      onPrint(expense);
    } else {
      printExpenseVoucher(company, expense);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Expense Details"
      className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-surface-container-lowest rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl border border-outline-variant/30 flex flex-col max-h-[92dvh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Drag Handle */}
        <div className="w-12 h-1.5 bg-outline-variant/40 rounded-full mx-auto my-2 sm:hidden shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/20 px-4 py-3 sm:px-5 sm:py-3.5 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${categoryMeta.tint}`}
            >
              <span className="material-symbols-outlined text-[20px]">{categoryMeta.icon}</span>
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm sm:text-base text-on-surface truncate">
                {expense.title}
              </h3>
              <span className="text-[11px] text-on-surface-variant font-medium">
                {formatDate(expense.date)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close expense details"
            className="min-w-[40px] min-h-[40px] w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5">
          {/* Total Amount Hero */}
          <div className="p-3.5 rounded-2xl bg-surface-container-low/60 border border-outline-variant/20 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider">
                Expense Outflow
              </span>
              <span className="font-tabular-data text-2xl font-black text-rose-700 dark:text-rose-400 mt-0.5">
                - {formatINR(expense.amount)}
              </span>
              <div className="mt-1">
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${categoryMeta.tint}`}
                >
                  <span className="material-symbols-outlined text-[12px]">{categoryMeta.icon}</span>
                  <span>{expense.category}</span>
                </span>
              </div>
            </div>

            <div className="px-2.5 py-1 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-900 flex items-center gap-1 self-start">
              <span className="material-symbols-outlined text-[15px]">north_east</span>
              <span>Money Out</span>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-surface-container-low/40 border border-outline-variant/15 flex flex-col">
              <span className="text-[10px] uppercase font-bold text-on-surface-variant">Payment Mode</span>
              <span className="font-bold text-on-surface mt-0.5">
                {PAYMENT_MODE_LABELS[expense.paymentMode] || expense.paymentMode}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-surface-container-low/40 border border-outline-variant/15 flex flex-col">
              <span className="text-[10px] uppercase font-bold text-on-surface-variant">Voucher Number</span>
              <span className="font-mono font-bold text-on-surface mt-0.5 truncate">
                {expense.voucherNumber || 'N/A'}
              </span>
            </div>
          </div>

          {/* Vendor Details */}
          {(expense.vendorName || expense.vendorGstin) && (
            <div className="p-3 rounded-xl bg-surface-container-low/40 border border-outline-variant/15 text-xs">
              <span className="font-bold text-on-surface-variant block text-[10px] uppercase mb-1">
                Vendor Details
              </span>
              <div className="flex flex-col gap-0.5">
                {expense.vendorName && (
                  <span className="font-bold text-on-surface">{expense.vendorName}</span>
                )}
                {expense.vendorGstin && (
                  <span className="font-mono text-[11px] text-on-surface-variant">
                    GSTIN: {expense.vendorGstin}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Tax Breakdown Disclosure */}
          {(expense.taxAmount || 0) > 0 && (
            <div className="rounded-xl bg-surface-container-low/30 border border-outline-variant/20 text-xs overflow-hidden">
              <button
                type="button"
                onClick={() => setIsTaxDetailsOpen(!isTaxDetailsOpen)}
                className="w-full p-3 flex items-center justify-between text-left font-bold text-on-surface hover:bg-surface-container-low transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-secondary">receipt</span>
                  <span>Tax details</span>
                  <span className="text-[11px] font-bold text-secondary ml-1">
                    ({expense.gstRate}% GST)
                  </span>
                </div>
                <div className="flex items-center gap-1 text-on-surface-variant">
                  <span className="font-tabular-data font-bold text-secondary">
                    {formatINR(expense.taxAmount || 0)}
                  </span>
                  <span
                    className={`material-symbols-outlined text-[18px] transition-transform duration-200 ${
                      isTaxDetailsOpen ? 'rotate-180' : ''
                    }`}
                  >
                    expand_more
                  </span>
                </div>
              </button>

              {isTaxDetailsOpen && (
                <div className="p-3 pt-0 border-t border-outline-variant/15 space-y-1.5 text-on-surface-variant">
                  <div className="flex justify-between pt-2">
                    <span>Taxable Base Value:</span>
                    <span className="font-tabular-data font-bold text-on-surface">
                      {formatINR(expense.taxableAmount || 0)}
                    </span>
                  </div>
                  {(expense.cgstAmount || 0) > 0 && (
                    <div className="flex justify-between">
                      <span>CGST:</span>
                      <span className="font-tabular-data font-semibold">
                        {formatINR(expense.cgstAmount || 0)}
                      </span>
                    </div>
                  )}
                  {(expense.sgstAmount || 0) > 0 && (
                    <div className="flex justify-between">
                      <span>SGST:</span>
                      <span className="font-tabular-data font-semibold">
                        {formatINR(expense.sgstAmount || 0)}
                      </span>
                    </div>
                  )}
                  {(expense.igstAmount || 0) > 0 && (
                    <div className="flex justify-between">
                      <span>IGST:</span>
                      <span className="font-tabular-data font-semibold">
                        {formatINR(expense.igstAmount || 0)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between pt-1 border-t border-outline-variant/10 font-bold text-on-surface">
                    <span>Total Tax (ITC):</span>
                    <span className="font-tabular-data text-secondary">
                      {formatINR(expense.taxAmount || 0)}
                    </span>
                  </div>
                  {expense.itcEligible && (
                    <div className="text-[10px] text-secondary font-semibold pt-0.5">
                      ✓ Eligible for ITC Claim in GSTR-3B
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          {expense.notes && (
            <div className="p-3 rounded-xl bg-surface-container-low/40 border border-outline-variant/15 text-xs text-on-surface">
              <span className="font-bold text-on-surface-variant block text-[10px] uppercase mb-0.5">
                Notes
              </span>
              <p className="font-medium leading-relaxed">{expense.notes}</p>
            </div>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="p-3 sm:p-4 border-t border-outline-variant/20 bg-surface-container-low/60 flex items-center justify-between gap-2 shrink-0 pb-safe">
          <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
            <button
              type="button"
              onClick={handleShare}
              aria-label="Share voucher via WhatsApp"
              className="min-h-[40px] min-w-[40px] px-2.5 sm:px-3 rounded-xl bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-1 hover:bg-emerald-700 active:scale-95 transition-all cursor-pointer shadow-xs"
              title="Share voucher via WhatsApp"
            >
              <span className="material-symbols-outlined text-[16px]">share</span>
              <span className="hidden sm:inline">Share</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              aria-label="Print voucher"
              className="min-h-[40px] min-w-[40px] px-2.5 sm:px-3 rounded-xl bg-surface-container-lowest text-on-surface border border-outline-variant/30 font-bold text-xs flex items-center justify-center gap-1 hover:bg-surface-container active:scale-95 transition-all cursor-pointer"
              title="Print voucher"
            >
              <span className="material-symbols-outlined text-[16px]">print</span>
              <span className="hidden sm:inline">Print</span>
            </button>
            {onEdit && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(expense);
                }}
                aria-label="Edit expense"
                className="min-h-[40px] min-w-[40px] px-2.5 sm:px-3 rounded-xl bg-surface-container-lowest text-secondary border border-outline-variant/30 font-bold text-xs flex items-center justify-center gap-1 hover:bg-surface-container active:scale-95 transition-all cursor-pointer"
                title="Edit expense"
              >
                <span className="material-symbols-outlined text-[16px]">edit</span>
                <span className="hidden sm:inline">Edit</span>
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(expense.id)}
                aria-label="Delete expense"
                className="min-h-[40px] min-w-[40px] w-10 h-10 rounded-xl flex items-center justify-center text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-outline-variant/30 transition-colors cursor-pointer"
                title="Delete expense"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="hidden sm:inline-flex min-h-[40px] px-4 rounded-xl bg-surface-container-low text-on-surface font-bold text-xs active:scale-95 transition-all cursor-pointer border border-outline-variant/30 items-center justify-center"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
