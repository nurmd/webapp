import React from 'react';
import { Expense } from '../../models/expense.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { safeOpenExternalUrl } from '../../core/utils/upiAndShare.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { printExpenseVoucher } from '../../core/utils/expenseVoucherPrinter.ts';

export interface DashboardExpenseModalProps {
  expense: Expense | null;
  company: CompanyProfile;
  onClose: () => void;
}

export const DashboardExpenseModal: React.FC<DashboardExpenseModalProps> = ({
  expense,
  company,
  onClose,
}) => {
  useBackNavigation(() => {
    onClose();
    return true;
  }, !!expense, 25);

  if (!expense) return null;

  const handleShareWhatsApp = () => {
    const text = `*Expense Voucher - ${company.tradeName || company.businessName}*\n` +
      `--------------------------------\n` +
      `*Expense:* ${expense.title}\n` +
      `*Category:* ${expense.category}\n` +
      `*Date:* ${expense.date}\n` +
      `*Amount:* ${formatINR(expense.amount)}\n` +
      `*Payment Mode:* ${expense.paymentMode}\n` +
      (expense.vendorName ? `*Vendor:* ${expense.vendorName}\n` : '') +
      (expense.voucherNumber ? `*Voucher No:* ${expense.voucherNumber}\n` : '') +
      `--------------------------------\n` +
      `Recorded in GST Billing App`;
    safeOpenExternalUrl(`https://wa.me/?text=${encodeURIComponent(text)}`);
  };

  const handlePrint = () => {
    printExpenseVoucher(company, expense);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-surface-container-lowest rounded-2xl w-full max-w-md shadow-2xl border border-outline-variant/30 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/20 p-3.5 sm:p-4 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[20px]">shopping_cart_checkout</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="font-bold text-sm text-on-surface truncate">
                  {expense.title}
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 truncate">
                  {expense.category}
                </span>
              </div>
              <span className="text-[11px] text-on-surface-variant font-medium">
                {formatDate(expense.date)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low transition-colors cursor-pointer"
            title="Close"
            aria-label="Close expense details"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3.5">
          {/* Total Amount Hero */}
          <div className="p-3.5 rounded-xl bg-surface-container-low/60 border border-outline-variant/20 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[11px] uppercase font-bold text-on-surface-variant tracking-wider">
                Expense Amount
              </span>
              <span className="font-tabular-data text-2xl font-black text-rose-600 dark:text-rose-400 mt-0.5">
                {formatINR(expense.amount)}
              </span>
            </div>
            <div className="px-2.5 py-1 rounded-xl text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px]">north_east</span>
              <span>Money Out</span>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-surface-container-low/40 border border-outline-variant/15 flex flex-col">
              <span className="text-[10px] uppercase font-bold text-on-surface-variant">Payment Mode</span>
              <span className="font-bold text-on-surface mt-0.5">{expense.paymentMode}</span>
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

          {/* Tax Breakdown */}
          {(expense.taxAmount || 0) > 0 && (
            <div className="p-3 rounded-xl bg-surface-container-low/30 border border-outline-variant/20 text-xs">
              <div className="flex items-center justify-between pb-1.5 border-b border-outline-variant/15">
                <span className="font-bold text-on-surface">Tax Breakdown</span>
                <span className="font-bold text-secondary">{expense.gstRate}% GST</span>
              </div>
              <div className="mt-2 space-y-1 text-on-surface-variant">
                <div className="flex justify-between">
                  <span>Taxable Value:</span>
                  <span className="font-tabular-data font-bold text-on-surface">
                    {formatINR(expense.taxableAmount || 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Total Tax (ITC):</span>
                  <span className="font-tabular-data font-bold text-rose-600 dark:text-rose-400">
                    {formatINR(expense.taxAmount || 0)}
                  </span>
                </div>
              </div>
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

        {/* Footer Actions */}
        <div className="p-3 sm:p-4 border-t border-outline-variant/20 bg-surface-container-low/40 flex items-center justify-between gap-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-emerald-700 active:scale-95 transition-all cursor-pointer shadow-xs"
            >
              <span className="material-symbols-outlined text-[16px]">share</span>
              <span>Share</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-surface-container-lowest text-on-surface border border-outline-variant/30 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-surface-container active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">print</span>
              <span>Print</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-secondary text-on-secondary font-bold text-xs active:scale-95 transition-all cursor-pointer shadow-xs flex items-center justify-center"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
