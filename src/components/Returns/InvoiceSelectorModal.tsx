import React, { useState, useMemo } from 'react';
import { Invoice } from '../../models/invoice.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { getInvoiceReturnSummary } from '../../core/returns/returnEngine.ts';
import { db } from '../../services/db.ts';

export interface InvoiceSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoices?: Invoice[];
  onSelectInvoice: (invoice: Invoice) => void;
}

export const InvoiceSelectorModal: React.FC<InvoiceSelectorModalProps> = ({
  isOpen,
  onClose,
  invoices,
  onSelectInvoice,
}) => {
  useBackNavigation(() => {
    if (isOpen) {
      onClose();
      return true;
    }
    return false;
  }, isOpen, 25);

  const [search, setSearch] = useState('');

  const allInvoices = invoices || db.getInvoices();

  // Filter only regular sales invoices (exclude credit notes, debit notes, delivery challans, estimates, cancelled)
  const eligibleInvoices = useMemo(() => {
    return allInvoices.filter(
      (inv) =>
        !inv.isCancelled &&
        inv.invoiceType !== 'CREDIT_NOTE' &&
        inv.invoiceType !== 'DEBIT_NOTE' &&
        inv.invoiceType !== 'ESTIMATE' &&
        inv.invoiceType !== 'SALES_ORDER' &&
        inv.invoiceType !== 'DELIVERY_CHALLAN'
    );
  }, [allInvoices]);

  // Search filter
  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return eligibleInvoices;
    return eligibleInvoices.filter(
      (inv) =>
        inv.invoiceNumber.toLowerCase().includes(q) ||
        (inv.partyName && inv.partyName.toLowerCase().includes(q)) ||
        (inv.partyPhone && inv.partyPhone.includes(q))
    );
  }, [eligibleInvoices, search]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-scrim/60 backdrop-blur-xs animate-fade-in"
      data-testid="invoice-selector-modal"
    >
      <div className="bg-surface-container-lowest w-full max-w-2xl rounded-2xl shadow-2xl border border-outline-variant/30 flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 sm:px-6 sm:py-4 bg-surface-container-low border-b border-outline-variant/20 flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-black text-on-surface tracking-tight">
              Select Invoice to Return
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Choose the original sales invoice to issue a Credit Note against
            </p>
          </div>
          <button
            type="button"
            data-testid="close-invoice-selector-btn"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="p-3 sm:p-4 border-b border-outline-variant/15">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
              search
            </span>
            <input
              type="text"
              data-testid="invoice-selector-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by invoice number or customer name..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-outline-variant/40 bg-surface-container-low text-xs font-semibold text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/30"
              autoFocus
            />
          </div>
        </div>

        {/* Invoice List */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2">
          {filteredInvoices.length === 0 ? (
            <div className="p-8 text-center text-on-surface-variant text-xs font-medium">
              No sales invoices found matching your query.
            </div>
          ) : (
            filteredInvoices.map((inv) => {
              const summary = getInvoiceReturnSummary(inv, allInvoices);

              return (
                <div
                  key={inv.id}
                  data-testid={`select-invoice-item-${inv.invoiceNumber}`}
                  onClick={() => {
                    onSelectInvoice(inv);
                    onClose();
                  }}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                    summary.isFullyReturned
                      ? 'border-outline-variant/20 bg-surface-container-low/40 opacity-70 hover:opacity-100 hover:border-secondary/40'
                      : 'border-outline-variant/30 bg-surface-container-lowest hover:border-secondary hover:shadow-xs active:scale-[0.99]'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-xs text-secondary bg-secondary/10 px-1.5 py-0.2 rounded">
                        #{inv.invoiceNumber}
                      </span>
                      <span className="font-bold text-xs sm:text-sm text-on-surface truncate">
                        {inv.partyName || 'Cash Customer'}
                      </span>

                      {summary.isFullyReturned ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                          Fully Returned
                        </span>
                      ) : summary.isPartiallyReturned ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          Partially Returned
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          Eligible
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-on-surface-variant mt-1">
                      <span>{formatDate(inv.date)}</span>
                      <span>•</span>
                      <span>{inv.items?.length || 0} line items</span>
                      {summary.totalReturnedAmount > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-amber-700 dark:text-amber-400 font-semibold">
                            Returned: {formatINR(summary.totalReturnedAmount)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-extrabold text-xs sm:text-sm text-on-surface tabular-nums">
                      {formatINR(inv.grandTotal)}
                    </div>
                    <div className="text-[10px] text-on-surface-variant mt-0.5">
                      Bal: {formatINR(inv.balanceAmount || 0)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
