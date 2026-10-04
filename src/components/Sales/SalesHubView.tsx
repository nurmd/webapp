import React, { useState } from 'react';
import { Invoice } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { getWhatsAppShareUrl } from '../../core/utils/upiAndShare.ts';
import { db } from '../../services/db.ts';
import { downloadEWayBillJson } from '../../core/gst/eWayBillExport.ts';
import { downloadEInvoiceJson } from '../../core/gst/eInvoiceExport.ts';
import { createPaymentReceiptVoucher } from '../../core/accounting/ledger.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';

interface SalesHubViewProps {
  company: CompanyProfile;
  invoices: Invoice[];
  onOpenStandardInvoice: () => void;
  onOpenTableGridInvoice: () => void;
  onViewInvoice: (invoice: Invoice) => void;
  onEditInvoice?: (invoice: Invoice) => void;
  onDeleteInvoice: (id: string) => void;
  onQuickPos?: () => void;
}

export const SalesHubView: React.FC<SalesHubViewProps> = ({
  company,
  invoices,
  onOpenStandardInvoice,
  onOpenTableGridInvoice,
  onViewInvoice,
  onEditInvoice,
  onDeleteInvoice,
  onQuickPos,
}) => {
  const [activeTab, setActiveTab] = useState<'ALL' | 'UNPAID' | 'PAID' | 'ESTIMATES' | 'CHALLANS'>('ALL');
  const [search, setSearch] = useState('');
  const [paymentModalInvoice, setPaymentModalInvoice] = useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);

  useBackNavigation(() => {
    setPaymentModalInvoice(null);
    return true;
  }, !!paymentModalInvoice, 20);

  // Metrics
  const totalSales = invoices.reduce((s, i) => s + i.grandTotal, 0);
  const totalPaid = invoices.reduce((s, i) => s + i.paidAmount, 0);
  const totalPending = invoices.reduce((s, i) => s + i.balanceAmount, 0);
  const overdueCount = invoices.filter((i) => i.balanceAmount > 0).length;
  const avgTicket = invoices.length > 0 ? Math.round(totalSales / invoices.length) : 0;

  const filtered = invoices.filter((inv) => {
    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      inv.partyName.toLowerCase().includes(search.toLowerCase()) ||
      (inv.partyGstin && inv.partyGstin.toLowerCase().includes(search.toLowerCase()));

    if (activeTab === 'UNPAID') return matchesSearch && inv.balanceAmount > 0;
    if (activeTab === 'PAID') return matchesSearch && inv.paymentStatus === 'PAID';
    if (activeTab === 'ESTIMATES') return matchesSearch && inv.invoiceType === 'ESTIMATE';
    if (activeTab === 'CHALLANS') return matchesSearch && inv.invoiceType === 'DELIVERY_CHALLAN';
    return matchesSearch;
  });

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalInvoice || paymentAmount <= 0) return;

    const newPaid = Math.min(paymentModalInvoice.grandTotal, paymentModalInvoice.paidAmount + paymentAmount);
    const newBal = Math.max(0, paymentModalInvoice.grandTotal - newPaid);
    const updated: Invoice = {
      ...paymentModalInvoice,
      paidAmount: newPaid,
      balanceAmount: newBal,
      paymentStatus: newBal === 0 ? 'PAID' : 'PARTIAL',
      updatedAt: new Date().toISOString(),
    };

    const docId = Date.now().toString().slice(-6);
    const voucher = createPaymentReceiptVoucher({
      receiptNumber: `RCPT-${docId}`,
      date: new Date().toISOString().split('T')[0],
      customerName: paymentModalInvoice.partyName,
      customerId: paymentModalInvoice.partyId || 'ACC_CASH',
      amount: paymentAmount,
      paymentMode: paymentModalInvoice.paymentMode === 'CREDIT' ? 'CASH' : (paymentModalInvoice.paymentMode || 'CASH'),
      referenceNo: paymentModalInvoice.invoiceNumber,
      narration: `Payment received against invoice #${paymentModalInvoice.invoiceNumber}`,
    });
    db.saveVoucher(voucher);

    db.saveInvoice(updated);
    setPaymentModalInvoice(null);
    setPaymentAmount(0);
  };

  return (
    <div className="flex flex-col w-full pb-24 max-w-7xl mx-auto md:px-6">
      {/* Header Banner */}
      <div className="px-margin-mobile pt-space-xs pb-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-secondary animate-pulse" />
            <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
              Sales Ledger
            </span>
          </div>
          <div className="flex items-center gap-1 bg-surface-container-low px-2.5 py-1 rounded-full shadow-xs text-xs font-semibold">
            <span className="material-symbols-outlined text-[14px] text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>
              calendar_today
            </span>
            <span className="text-on-surface font-medium text-[11px]">
              {new Date().toLocaleString('default', { month: 'short', year: 'numeric' })}
            </span>
          </div>
        </div>

        {/* Compact 3-Column Financial Summary Strip */}
        <div className="grid grid-cols-3 gap-2 mt-2">
          <div className="bg-surface-container-lowest rounded-xl p-2.5 border border-outline-variant/25 shadow-xs flex flex-col">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider truncate">
              Total Sales
            </span>
            <span className="font-extrabold text-xs sm:text-sm text-on-surface mt-0.5 truncate">
              {formatINR(totalSales)}
            </span>
            <span className="text-[10px] text-on-surface-variant truncate">
              {invoices.length} Bills
            </span>
          </div>

          <div className="bg-surface-container-lowest rounded-xl p-2.5 border border-outline-variant/25 shadow-xs flex flex-col">
            <span className="text-[10px] font-bold text-error uppercase tracking-wider truncate">
              To Collect
            </span>
            <span className="font-extrabold text-xs sm:text-sm text-error mt-0.5 truncate">
              {formatINR(totalPending)}
            </span>
            <span className="text-[10px] text-error font-medium truncate">
              {overdueCount} Overdue
            </span>
          </div>

          <div className="bg-surface-container-lowest rounded-xl p-2.5 border border-outline-variant/25 shadow-xs flex flex-col">
            <span className="text-[10px] font-bold text-secondary uppercase tracking-wider truncate">
              Received
            </span>
            <span className="font-extrabold text-xs sm:text-sm text-secondary mt-0.5 truncate">
              {formatINR(totalPaid)}
            </span>
            <span className="text-[10px] text-secondary font-medium truncate">
              {invoices.filter((i) => i.paymentStatus === 'PAID').length} Settled
            </span>
          </div>
        </div>

        {/* Search & Action Row */}
        <div className="flex items-center gap-2 mt-2.5">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-on-surface-variant text-[18px]">
              search
            </span>
            <input
              className="w-full h-10 pl-9 pr-8 bg-surface-container-lowest text-on-surface text-xs rounded-xl shadow-xs border border-outline-variant/30 placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-secondary/40"
              placeholder="Search by customer, bill no, GSTIN..."
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2.5 text-outline hover:text-on-surface"
                type="button"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>

          <button
            onClick={onOpenTableGridInvoice}
            className="h-10 px-3.5 bg-secondary text-on-secondary rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs active:scale-95 transition-all flex-shrink-0 cursor-pointer"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>Sale Bill</span>
          </button>
        </div>

        {/* Filter Segmented Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 mt-1.5">
          <button
            onClick={() => setActiveTab('ALL')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
              activeTab === 'ALL'
                ? 'bg-secondary text-on-secondary shadow-xs'
                : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30'
            }`}
            type="button"
          >
            <span>All</span>
            <span className="text-[10px] opacity-80">({invoices.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('UNPAID')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
              activeTab === 'UNPAID'
                ? 'bg-error text-on-error shadow-xs'
                : 'bg-surface-container-lowest text-error border border-outline-variant/30'
            }`}
            type="button"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-error" />
            <span>Due</span>
            <span className="text-[10px] opacity-90 font-bold">({overdueCount})</span>
          </button>

          <button
            onClick={() => setActiveTab('PAID')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
              activeTab === 'PAID'
                ? 'bg-secondary text-on-secondary shadow-xs'
                : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30'
            }`}
            type="button"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
            <span>Paid</span>
            <span className="text-[10px] opacity-80">({invoices.filter((i) => i.paymentStatus === 'PAID').length})</span>
          </button>

          <button
            onClick={() => setActiveTab('ESTIMATES')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'ESTIMATES'
                ? 'bg-secondary text-on-secondary shadow-xs'
                : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30'
            }`}
            type="button"
          >
            Estimates
          </button>
        </div>
      </div>

      {/* Invoices List Feed (Clean Passbook Row Cards) */}
      <div className="px-margin-mobile md:px-0 mt-1 grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {filtered.length === 0 ? (
          <div className="md:col-span-2 bg-surface-container-lowest rounded-2xl p-8 text-center text-on-surface-variant border border-outline-variant/20 shadow-xs">
            No invoices found matching your criteria.
          </div>
        ) : (
          filtered.map((inv) => {
            const isPaid = inv.paymentStatus === 'PAID';
            const isPartial = inv.paymentStatus === 'PARTIAL';
            const itemDesc = inv.items && inv.items.length > 0
              ? inv.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')
              : null;

            return (
              <div
                key={inv.id}
                onClick={() => onViewInvoice(inv)}
                className="bg-surface-container-lowest rounded-2xl p-3 sm:p-3.5 shadow-xs border border-outline-variant/20 flex flex-col gap-1.5 hover:border-secondary/40 active:scale-[0.99] transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center font-bold text-xs flex-shrink-0">
                      {(inv.partyName || 'C').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-bold text-xs sm:text-sm text-on-surface truncate">
                        {inv.partyName || 'Cash Customer'}
                      </span>
                      <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant mt-0.5">
                        <span className="font-semibold text-secondary">{inv.invoiceNumber}</span>
                        <span>•</span>
                        <span>{formatDate(inv.date)}</span>
                        {inv.partyGstin && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-[10px] text-outline truncate max-w-[80px] sm:max-w-none">
                              {inv.partyGstin}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end flex-shrink-0 text-right pl-2">
                    <span className="font-extrabold text-xs sm:text-base text-on-surface whitespace-nowrap tabular-nums">
                      {formatINR(inv.grandTotal)}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full mt-0.5 whitespace-nowrap flex items-center gap-0.5 ${
                        isPaid
                          ? 'bg-secondary/15 text-secondary'
                          : isPartial
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          : 'bg-error/15 text-error'
                      }`}
                    >
                      {isPaid ? (
                        <>
                          <span className="material-symbols-outlined text-[12px]">check_circle</span>
                          <span>Paid</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[12px]">schedule</span>
                          <span>Due {formatINR(inv.balanceAmount)}</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>

                {/* Subtitle items line & quick collect */}
                <div className="flex items-center justify-between text-[10px] text-on-surface-variant pt-1 border-t border-outline-variant/15 gap-2">
                  <span className="truncate text-on-surface-variant font-medium">
                    {itemDesc || `${inv.items?.length || 0} items`}
                  </span>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-mono text-[9px] text-outline">
                      {inv.paymentMode || 'CASH'}
                    </span>

                    {inv.balanceAmount > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPaymentModalInvoice(inv);
                          setPaymentAmount(inv.balanceAmount);
                        }}
                        className="px-2 py-0.5 rounded-lg bg-secondary/15 hover:bg-secondary/25 text-secondary font-bold text-[10px] cursor-pointer active:scale-95 transition-all flex items-center gap-0.5"
                      >
                        <span className="material-symbols-outlined text-[12px]">payments</span>
                        <span>Record Pay</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Record Payment Modal */}
      {paymentModalInvoice && (
        <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl p-6 w-full max-w-sm shadow-xl border border-outline-variant/30 flex flex-col gap-4">
            <h3 className="font-headline-sm text-lg font-bold text-on-surface">Record Payment In</h3>
            <div className="text-xs text-on-surface-variant">
              Invoice <strong>{paymentModalInvoice.invoiceNumber}</strong> • {paymentModalInvoice.partyName}
            </div>

            <form onSubmit={handleRecordPayment} className="flex flex-col gap-3">
              <div className="p-3 rounded-xl bg-surface-container-low text-xs space-y-1">
                <div className="flex justify-between">
                  <span>Grand Total:</span>
                  <span className="font-bold">{formatINR(paymentModalInvoice.grandTotal)}</span>
                </div>
                <div className="flex justify-between text-secondary">
                  <span>Already Paid:</span>
                  <span className="font-bold">{formatINR(paymentModalInvoice.paidAmount)}</span>
                </div>
                <div className="flex justify-between text-error font-bold">
                  <span>Balance Due:</span>
                  <span>{formatINR(paymentModalInvoice.balanceAmount)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1">
                  Amount Received (₹)
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  max={paymentModalInvoice.balanceAmount}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2.5 rounded-xl border border-outline-variant bg-surface text-on-surface font-extrabold text-lg focus:outline-none focus:ring-2 focus:ring-secondary/40"
                />
              </div>

              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setPaymentModalInvoice(null)}
                  className="px-4 py-2 rounded-xl text-on-surface-variant text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-secondary text-on-secondary text-xs font-bold shadow-sm cursor-pointer"
                >
                  Save Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
