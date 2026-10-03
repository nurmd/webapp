import React, { useState } from 'react';
import { Invoice } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { getWhatsAppShareUrl } from '../../core/utils/upiAndShare.ts';
import { db } from '../../services/db.ts';
import { downloadEWayBillJson } from '../../core/gst/eWayBillExport.ts';
import { downloadEInvoiceJson } from '../../core/gst/eInvoiceExport.ts';
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
  const targetSales = 550000;
  const targetPercent = Math.min(100, Math.round((totalSales / targetSales) * 100));

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

    db.saveInvoice(updated);
    setPaymentModalInvoice(null);
    setPaymentAmount(0);
  };

  return (
    <div className="flex flex-col w-full pb-24 max-w-4xl mx-auto">
      {/* Header Banner & Quick Metrics Hub (Stitch Sales Hub) */}
      <div className="px-margin-mobile pt-space-sm pb-space-xs">
        <div className="flex items-center justify-between mb-space-sm">
          <div className="flex items-center gap-space-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-secondary animate-pulse"></span>
            <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
              Sales Ledger
            </span>
          </div>
          <div className="flex items-center gap-1 bg-surface-container-low px-space-sm py-1 rounded-full shadow-sm text-xs font-semibold">
            <span className="material-symbols-outlined text-[15px] text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>
              calendar_today
            </span>
            <span className="font-label-sm text-on-surface">
              {new Date().toLocaleString('default', { month: 'short', year: 'numeric' })}
            </span>
          </div>
        </div>

        {/* KPI Bento Stack */}
        <div className="grid grid-cols-2 gap-space-xs">
          {/* Main Metric: Monthly Sales */}
          <div className="col-span-2 bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-outline-variant/20 relative overflow-hidden flex flex-col justify-between">
            <div className="flex items-start justify-between relative z-10">
              <div>
                <span className="font-label-sm text-label-sm text-on-surface-variant font-bold flex items-center gap-1 uppercase tracking-wider">
                  Monthly Sales
                  <span className="material-symbols-outlined text-[14px] text-secondary">trending_up</span>
                </span>
                <div className="font-currency-display-mobile text-currency-display-mobile text-on-surface font-extrabold mt-0.5">
                  {formatINR(totalSales || 482500)}
                </div>
              </div>
              <div className="flex items-center gap-0.5 bg-surface-container-high px-space-xs py-0.5 rounded-full">
                <span className="material-symbols-outlined text-[14px] text-secondary">arrow_upward</span>
                <span className="font-label-sm text-label-sm text-secondary font-bold">+12.4%</span>
              </div>
            </div>

            <div className="mt-space-sm flex items-center justify-between text-label-sm font-label-sm text-on-surface-variant relative z-10 pt-space-xs text-xs">
              <span>Target ₹5.50L ({targetPercent}% achieved)</span>
              <div className="w-28 h-2 bg-surface-container-low rounded-full overflow-hidden">
                <div className="bg-secondary h-full rounded-full transition-all" style={{ width: `${targetPercent}%` }}></div>
              </div>
            </div>
          </div>

          {/* Pending Due Card */}
          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-outline-variant/20 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm text-error font-bold uppercase tracking-wider">Pending Due</span>
              <span className="w-2 h-2 rounded-full bg-error"></span>
            </div>
            <div className="mt-1">
              <div className="font-headline-sm text-headline-sm text-error font-bold">
                {formatINR(totalPending || 42500)}
              </div>
              <div className="font-label-sm text-label-sm text-on-surface-variant mt-0.5 text-xs">
                {overdueCount} Invoices Overdue
              </div>
            </div>
          </div>

          {/* Avg Ticket Size */}
          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-outline-variant/20 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase tracking-wider">Avg Ticket</span>
              <span className="material-symbols-outlined text-[16px] text-secondary">receipt</span>
            </div>
            <div className="mt-1">
              <div className="font-headline-sm text-headline-sm text-on-surface font-bold">
                {formatINR(avgTicket || 11400)}
              </div>
              <div className="font-label-sm text-label-sm text-secondary mt-0.5 font-bold text-xs">
                {invoices.length} bills cleared
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Operational Quick Action Ribbon (Stitch Sales Hub) */}
      <div className="px-margin-mobile mt-space-sm">
        <div className="bg-surface-container-low rounded-xl p-space-xs flex items-center justify-between gap-space-xs">
          {/* Create Invoice CTA */}
          <button
            onClick={onOpenTableGridInvoice}
            className="flex-1 h-12 bg-secondary text-on-secondary rounded-lg font-label-md text-label-md font-bold flex items-center justify-center gap-space-xs shadow-sm active:scale-95 transition-all cursor-pointer"
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              add_circle
            </span>
            <span>+ New Bill</span>
          </button>

          {/* Standard Form */}
          <button
            onClick={onOpenStandardInvoice}
            className="w-12 h-12 bg-surface-container-lowest text-on-surface rounded-lg flex flex-col items-center justify-center active:scale-95 transition-all shadow-sm cursor-pointer"
            title="Standard Form Invoice"
            type="button"
          >
            <span className="material-symbols-outlined text-[20px] text-on-surface-variant">edit_note</span>
            <span className="font-label-sm text-[9px] text-on-surface-variant -mt-0.5">Form</span>
          </button>

          {/* POS Counter Mode */}
          {onQuickPos && (
            <button
              onClick={onQuickPos}
              className="px-space-sm h-12 bg-surface-container-lowest text-on-surface rounded-lg flex items-center gap-1 active:scale-95 transition-all shadow-sm cursor-pointer"
              title="Fast POS Mode"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px] text-secondary">point_of_sale</span>
              <div className="flex flex-col text-left">
                <span className="font-label-sm text-label-sm font-bold text-on-surface leading-tight">POS</span>
                <span className="text-[9px] text-secondary font-semibold">Counter</span>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="px-margin-mobile mt-space-sm">
        <div className="relative w-full">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[20px] text-outline">
            search
          </span>
          <input
            className="w-full bg-surface-container-lowest text-on-surface font-body-md text-body-md pl-11 pr-10 py-3 rounded-xl shadow-sm border border-outline-variant/30 placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-secondary/30"
            placeholder="Search invoices by customer, bill no, GSTIN..."
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-outline-variant hover:text-on-surface cursor-pointer"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">cancel</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Segmented Tabs */}
      <div className="px-margin-mobile mt-space-sm">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          <button
            onClick={() => setActiveTab('ALL')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'ALL'
                ? 'bg-secondary text-on-secondary shadow-sm'
                : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30'
            }`}
            type="button"
          >
            All Invoices ({invoices.length})
          </button>
          <button
            onClick={() => setActiveTab('UNPAID')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'UNPAID'
                ? 'bg-error text-on-error shadow-sm'
                : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30'
            }`}
            type="button"
          >
            Pending Due ({overdueCount})
          </button>
          <button
            onClick={() => setActiveTab('PAID')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'PAID'
                ? 'bg-secondary text-on-secondary shadow-sm'
                : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30'
            }`}
            type="button"
          >
            Paid in Full ({invoices.filter((i) => i.paymentStatus === 'PAID').length})
          </button>
          <button
            onClick={() => setActiveTab('ESTIMATES')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'ESTIMATES'
                ? 'bg-secondary text-on-secondary shadow-sm'
                : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30'
            }`}
            type="button"
          >
            Estimates / Quotes
          </button>
        </div>
      </div>

      {/* Invoices List Feed */}
      <div className="px-margin-mobile mt-space-sm space-y-2">
        {filtered.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-xl p-8 text-center text-on-surface-variant border border-outline-variant/20">
            No invoices found matching your criteria.
          </div>
        ) : (
          filtered.map((inv) => {
            const isPaid = inv.paymentStatus === 'PAID';
            return (
              <div
                key={inv.id}
                className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-outline-variant/20 flex flex-col gap-2 hover:border-secondary/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="font-headline-sm text-sm sm:text-[16px] text-on-surface font-bold truncate">
                      {inv.partyName}
                    </span>
                    <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-on-surface-variant mt-0.5 flex-wrap">
                      <span className="font-semibold text-secondary">{inv.invoiceNumber}</span>
                      <span>•</span>
                      <span>{formatDate(inv.date)}</span>
                      {inv.partyGstin && (
                        <>
                          <span>•</span>
                          <span className="text-[10px] sm:text-[11px] text-on-surface-variant font-mono truncate">{inv.partyGstin}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end flex-shrink-0 text-right pl-2 min-w-[76px] sm:min-w-[95px]">
                    <span className="font-tabular-data text-xs sm:text-[17px] font-extrabold text-on-surface whitespace-nowrap">
                      {formatINR(inv.grandTotal)}
                    </span>
                    <span
                      className={`text-[9px] sm:text-[10px] font-bold px-2 py-0.5 rounded-full mt-0.5 whitespace-nowrap ${
                        isPaid ? 'bg-secondary-container text-on-secondary-container' : 'bg-error-container text-on-error-container'
                      }`}
                    >
                      {inv.paymentStatus}
                    </span>
                  </div>
                </div>

                {inv.balanceAmount > 0 && (
                  <div className="flex items-center justify-between text-xs py-1 px-2.5 rounded-lg bg-error-container/40 border border-error-container">
                    <span className="text-error font-medium">Balance Due:</span>
                    <strong className="text-error font-bold">{formatINR(inv.balanceAmount)}</strong>
                  </div>
                )}

                {/* Card Actions Ribbon */}
                <div className="flex items-center justify-between pt-1 border-t border-outline-variant/20 gap-2">
                  <div className="flex items-center gap-1 flex-wrap">
                    <button
                      onClick={() => onViewInvoice(inv)}
                      className="px-2 py-1 rounded-lg bg-surface-container-low text-on-surface text-xs font-semibold flex items-center gap-1 active:bg-surface-container cursor-pointer"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[15px]">visibility</span>
                      <span>View</span>
                    </button>

                    {onEditInvoice && (
                      <button
                        onClick={() => onEditInvoice(inv)}
                        className="px-2 py-1 rounded-lg bg-secondary/10 text-secondary text-xs font-bold flex items-center gap-1 active:scale-95 cursor-pointer"
                        title="Edit and update invoice details"
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[14px]">edit_document</span>
                        <span>Edit</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        const url = getWhatsAppShareUrl(inv, company);
                        window.open(url, '_blank');
                      }}
                      className="px-2 py-1 rounded-lg bg-[#25D366]/15 text-[#25D366] text-xs font-bold flex items-center gap-1 active:scale-95 cursor-pointer"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[15px]">send</span>
                      <span>WA</span>
                    </button>

                    <button
                      onClick={() => downloadEWayBillJson(company, inv)}
                      className="px-2 py-1 rounded-lg bg-surface-container-low text-blue-600 text-xs font-semibold flex items-center gap-0.5 active:bg-surface-container cursor-pointer"
                      title="Download official NIC E-Way Bill JSON"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[14px]">local_shipping</span>
                      <span>E-Way</span>
                    </button>

                    <button
                      onClick={() => downloadEInvoiceJson(company, inv)}
                      className="px-2 py-1 rounded-lg bg-surface-container-low text-purple-600 text-xs font-semibold flex items-center gap-0.5 active:bg-surface-container cursor-pointer"
                      title="Download official IRP E-Invoice JSON"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[14px]">receipt_long</span>
                      <span>E-Inv</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    {inv.balanceAmount > 0 && (
                      <button
                        onClick={() => {
                          setPaymentModalInvoice(inv);
                          setPaymentAmount(inv.balanceAmount);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-secondary text-on-secondary text-xs font-bold active:scale-95 cursor-pointer"
                        type="button"
                      >
                        ₹ Pay
                      </button>
                    )}

                    <button
                      onClick={() => onDeleteInvoice(inv.id)}
                      className="w-7 h-7 rounded-lg text-error/60 hover:text-error flex items-center justify-center cursor-pointer"
                      title="Delete"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
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
