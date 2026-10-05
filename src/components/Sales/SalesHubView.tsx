import React, { useState, useMemo } from 'react';
import { Invoice } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { getWhatsAppShareUrl } from '../../core/utils/upiAndShare.ts';
import { db } from '../../services/db.ts';
import { downloadEWayBillJson } from '../../core/gst/eWayBillExport.ts';
import { downloadEInvoiceJson } from '../../core/gst/eInvoiceExport.ts';
import { createPaymentReceiptVoucher } from '../../core/accounting/ledger.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import {
  DatePreset,
  getDateFilterBounds,
  isDateInRange,
  LedgerSortOption,
  LEDGER_SORT_LABELS,
} from '../../core/utils/dateFilters.ts';
import { DateFilterModal } from '../Common/DateFilterModal.tsx';

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

  // Sorting state - Defaults to NEWEST first as requested
  const [sortBy, setSortBy] = useState<LedgerSortOption>('NEWEST');
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);

  // Date Range Filter state - Interactive selectable date picker
  const [datePreset, setDatePreset] = useState<DatePreset>('ALL_TIME');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);

  useBackNavigation(() => {
    if (isDateModalOpen) {
      setIsDateModalOpen(false);
      return true;
    }
    if (isSortDropdownOpen) {
      setIsSortDropdownOpen(false);
      return true;
    }
    setPaymentModalInvoice(null);
    return true;
  }, isDateModalOpen || isSortDropdownOpen || !!paymentModalInvoice, 20);

  // Active Date Bounds
  const dateRange = useMemo(() => {
    return getDateFilterBounds(datePreset, customStart, customEnd);
  }, [datePreset, customStart, customEnd]);

  // 1. Date Filter
  const dateFilteredInvoices = useMemo(() => {
    if (!dateRange.start && !dateRange.end) return invoices;
    return invoices.filter((inv) => isDateInRange(inv.date, dateRange.start, dateRange.end));
  }, [invoices, dateRange]);

  // Metrics dynamically calculated on active date period
  const totalSales = dateFilteredInvoices.reduce((s, i) => s + i.grandTotal, 0);
  const totalPaid = dateFilteredInvoices.reduce((s, i) => s + i.paidAmount, 0);
  const totalPending = dateFilteredInvoices.reduce((s, i) => s + i.balanceAmount, 0);
  const overdueCount = dateFilteredInvoices.filter((i) => i.balanceAmount > 0).length;
  const avgTicket = dateFilteredInvoices.length > 0 ? Math.round(totalSales / dateFilteredInvoices.length) : 0;

  // 2. Search & Tab Filter
  const statusFiltered = useMemo(() => {
    return dateFilteredInvoices.filter((inv) => {
      const q = search.trim().toLowerCase();
      const matchesSearch = !q ||
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.partyName.toLowerCase().includes(q) ||
        (inv.partyGstin && inv.partyGstin.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (activeTab === 'UNPAID') return inv.balanceAmount > 0;
      if (activeTab === 'PAID') return inv.paymentStatus === 'PAID';
      if (activeTab === 'ESTIMATES') return inv.invoiceType === 'ESTIMATE';
      if (activeTab === 'CHALLANS') return inv.invoiceType === 'DELIVERY_CHALLAN';
      return true;
    });
  }, [dateFilteredInvoices, search, activeTab]);

  // 3. Sort - Defaults to NEWEST first
  const sortedInvoices = useMemo(() => {
    return [...statusFiltered].sort((a, b) => {
      switch (sortBy) {
        case 'NEWEST': {
          const tA = new Date(a.date).getTime() || 0;
          const tB = new Date(b.date).getTime() || 0;
          if (tB !== tA) return tB - tA;
          return (b.id || '').localeCompare(a.id || '');
        }
        case 'OLDEST': {
          const tA = new Date(a.date).getTime() || 0;
          const tB = new Date(b.date).getTime() || 0;
          if (tA !== tB) return tA - tB;
          return (a.id || '').localeCompare(b.id || '');
        }
        case 'AMOUNT_HIGH':
          return b.grandTotal - a.grandTotal;
        case 'AMOUNT_LOW':
          return a.grandTotal - b.grandTotal;
        case 'NAME_AZ':
          return (a.partyName || '').localeCompare(b.partyName || '');
        case 'NAME_ZA':
          return (b.partyName || '').localeCompare(a.partyName || '');
        case 'DOC_NUM':
          return (b.invoiceNumber || '').localeCompare(a.invoiceNumber || '', undefined, { numeric: true });
        default:
          return 0;
      }
    });
  }, [statusFiltered, sortBy]);

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
      {/* Header, Metrics & Controls Strip */}
      <div className="px-margin-mobile pt-1.5 pb-1 flex flex-col gap-2">
        {/* Row 1: Title + Date Range Selector Pill */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
            <span className="text-sm font-bold text-on-surface">Sales Ledger</span>
          </div>

          {/* Date Range Selector Pill */}
          <button
            type="button"
            onClick={() => setIsDateModalOpen(true)}
            className={`h-7 flex items-center gap-1 px-2.5 rounded-lg shadow-xs text-[11px] font-bold cursor-pointer border transition-all shrink-0 ${
              datePreset !== 'ALL_TIME'
                ? 'bg-secondary/15 text-secondary border-secondary/30'
                : 'bg-surface-container-lowest text-on-surface-variant border-outline-variant/25 hover:bg-surface-container-low'
            }`}
            title="Filter by date range"
          >
            <span className="material-symbols-outlined text-[13px]">calendar_month</span>
            <span className="truncate max-w-[100px] sm:max-w-[150px]">{dateRange.label}</span>
            {datePreset !== 'ALL_TIME' ? (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setDatePreset('ALL_TIME');
                  setCustomStart('');
                  setCustomEnd('');
                }}
                className="material-symbols-outlined text-[12px] hover:text-error ml-0.5"
                title="Reset to All Time"
              >
                close
              </span>
            ) : (
              <span className="material-symbols-outlined text-[13px] text-outline">arrow_drop_down</span>
            )}
          </button>
        </div>

        {/* Row 2: 2-Card Summary Grid for Total & Due */}
        <div className="grid grid-cols-2 gap-2">
          {/* Sales Total Card */}
          <div className="bg-surface-container-lowest rounded-xl p-2.5 sm:p-3 border border-outline-variant/20 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-outline text-[11px] font-bold">
              <span className="uppercase tracking-wider">Sales Total</span>
              <span className="text-[10px] bg-surface-container-low px-1.5 py-0.2 rounded font-semibold text-on-surface-variant">
                {dateFilteredInvoices.length} {dateFilteredInvoices.length === 1 ? 'bill' : 'bills'}
              </span>
            </div>
            <div className="mt-1 text-base sm:text-lg font-black text-on-surface tabular-nums tracking-tight">
              {formatINR(totalSales)}
            </div>
          </div>

          {/* Total Due Card */}
          <div className="bg-surface-container-lowest rounded-xl p-2.5 sm:p-3 border border-outline-variant/20 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-error text-[11px] font-bold">
              <span className="uppercase tracking-wider">Total Due</span>
              {overdueCount > 0 ? (
                <span className="text-[10px] bg-error/10 px-1.5 py-0.2 rounded font-bold text-error">
                  {overdueCount} due
                </span>
              ) : (
                <span className="text-[10px] bg-secondary/10 px-1.5 py-0.2 rounded font-bold text-secondary">
                  All Clear
                </span>
              )}
            </div>
            <div className={`mt-1 text-base sm:text-lg font-black tabular-nums tracking-tight ${totalPending > 0 ? 'text-error' : 'text-on-surface'}`}>
              {formatINR(totalPending)}
            </div>
          </div>
        </div>

        {/* Row 3: Search + Sort Selector */}
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 min-w-[120px]">
            <span className="material-symbols-outlined absolute left-2.5 top-1.5 text-on-surface-variant text-[16px]">
              search
            </span>
            <input
              className="w-full h-7 pl-7 pr-6 bg-surface-container-lowest text-on-surface text-xs rounded-lg shadow-xs border border-outline-variant/25 placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-secondary/40"
              placeholder={company.isGstEnabled !== false ? "Search customer, bill, GSTIN..." : "Search customer, bill..."}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-1.5 top-1.5 text-outline hover:text-on-surface"
                type="button"
              >
                <span className="material-symbols-outlined text-[13px]">close</span>
              </button>
            )}
          </div>

          {/* Sort Selector Dropdown Button */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
              className="h-7 flex items-center gap-0.5 px-2 rounded-lg text-[11px] font-bold bg-surface-container-lowest text-on-surface-variant border border-outline-variant/25 hover:bg-surface-container-low cursor-pointer transition-all shadow-xs"
              title={`Sort: ${LEDGER_SORT_LABELS[sortBy]}`}
            >
              <span className="material-symbols-outlined text-[14px] text-secondary">sort</span>
              <span className="material-symbols-outlined text-[13px] text-outline">arrow_drop_down</span>
            </button>

            {isSortDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsSortDropdownOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-surface-container-lowest rounded-xl shadow-xl border border-outline-variant/30 py-1 overflow-hidden animate-fade-in">
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-outline border-b border-outline-variant/15">
                    Sort Sales Ledger
                  </div>
                  {(Object.keys(LEDGER_SORT_LABELS) as LedgerSortOption[]).map((key) => {
                    const isSelected = sortBy === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setSortBy(key);
                          setIsSortDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-1.5 text-left text-xs font-semibold flex items-center justify-between hover:bg-surface-container-low cursor-pointer transition-colors ${
                          isSelected ? 'text-secondary font-bold bg-secondary/5' : 'text-on-surface'
                        }`}
                      >
                        <span>{LEDGER_SORT_LABELS[key]}</span>
                        {isSelected && (
                          <span className="material-symbols-outlined text-[15px] text-secondary">
                            check
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Row 4: Status Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
          <button
            onClick={() => setActiveTab('ALL')}
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
              activeTab === 'ALL'
                ? 'bg-secondary text-on-secondary shadow-xs'
                : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/25'
            }`}
            type="button"
          >
            <span>All</span>
            <span className="text-[10px] opacity-80">({dateFilteredInvoices.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('UNPAID')}
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
              activeTab === 'UNPAID'
                ? 'bg-error text-on-error shadow-xs'
                : 'bg-surface-container-lowest text-error border border-outline-variant/25'
            }`}
            type="button"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-error" />
            <span>Due</span>
            <span className="text-[10px] opacity-90 font-bold">({overdueCount})</span>
          </button>

          <button
            onClick={() => setActiveTab('PAID')}
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
              activeTab === 'PAID'
                ? 'bg-secondary text-on-secondary shadow-xs'
                : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/25'
            }`}
            type="button"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
            <span>Paid</span>
            <span className="text-[10px] opacity-80">({dateFilteredInvoices.filter((i) => i.paymentStatus === 'PAID').length})</span>
          </button>

          <button
            onClick={() => setActiveTab('ESTIMATES')}
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'ESTIMATES'
                ? 'bg-secondary text-on-secondary shadow-xs'
                : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/25'
            }`}
            type="button"
          >
            Estimates
          </button>
        </div>
      </div>

      {/* Invoices List Feed (Slim Passbook Cards) */}
      <div className="px-margin-mobile md:px-0 mt-1 grid grid-cols-1 md:grid-cols-2 gap-2">
        {sortedInvoices.length === 0 ? (
          <div className="md:col-span-2 bg-surface-container-lowest rounded-2xl p-8 text-center text-on-surface-variant border border-outline-variant/20 shadow-xs">
            No invoices found matching your criteria.
          </div>
        ) : (
          sortedInvoices.map((inv) => {
            const isPaid = inv.paymentStatus === 'PAID';

            return (
              <div
                key={inv.id}
                onClick={() => onViewInvoice(inv)}
                className="bg-surface-container-lowest rounded-xl p-2.5 sm:p-3 shadow-xs border border-outline-variant/20 flex flex-col gap-1.5 hover:border-secondary/40 active:scale-[0.99] transition-all cursor-pointer"
              >
                {/* Line 1: Party Name & Invoice # (left) | Grand Total (right) */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="font-bold text-xs sm:text-sm text-on-surface truncate">
                      {inv.partyName || 'Cash Customer'}
                    </span>
                    <span className="text-[10px] font-semibold text-secondary shrink-0 bg-secondary/10 px-1.5 py-0.2 rounded">
                      #{inv.invoiceNumber}
                    </span>
                  </div>
                  <span className="font-extrabold text-xs sm:text-sm text-on-surface whitespace-nowrap tabular-nums shrink-0">
                    {formatINR(inv.grandTotal)}
                  </span>
                </div>

                {/* Line 2: Date & Items count (left) | Due amount + Record Pay button on a single line (right) */}
                <div className="flex items-center justify-between gap-2 text-[11px] text-on-surface-variant">
                  <div className="flex items-center gap-1.5 min-w-0 truncate text-[11px]">
                    <span>{formatDate(inv.date)}</span>
                    <span>•</span>
                    <span className="truncate">{inv.items?.length || 0} {inv.items?.length === 1 ? 'item' : 'items'}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {inv.balanceAmount > 0 ? (
                      <>
                        <span className="text-[11px] font-bold text-error whitespace-nowrap tabular-nums">
                          Due {formatINR(inv.balanceAmount)}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPaymentModalInvoice(inv);
                            setPaymentAmount(inv.balanceAmount);
                          }}
                          className="h-6 px-2 rounded-md bg-secondary/15 hover:bg-secondary/25 text-secondary font-bold text-[10px] cursor-pointer active:scale-95 transition-all flex items-center gap-0.5"
                        >
                          <span className="material-symbols-outlined text-[12px]">payments</span>
                          <span>Pay</span>
                        </button>
                      </>
                    ) : (
                      <span className="text-[10px] font-bold text-secondary flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-[13px]">check_circle</span>
                        <span>Paid</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Floating Action Button for New Bill */}
      <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40">
        <button
          onClick={onOpenTableGridInvoice}
          className="h-11 px-4 rounded-full bg-secondary text-on-secondary font-bold text-xs shadow-lg flex items-center gap-1.5 active:scale-95 transition-transform cursor-pointer border border-white/10"
          type="button"
          title="Create New Bill"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          <span>+ Bill</span>
        </button>
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

      {/* Date Filter Modal */}
      <DateFilterModal
        isOpen={isDateModalOpen}
        activePreset={datePreset}
        customStartDate={customStart}
        customEndDate={customEnd}
        onClose={() => setIsDateModalOpen(false)}
        onSelectRange={(preset, start, end) => {
          setDatePreset(preset);
          setCustomStart(start || '');
          setCustomEnd(end || '');
        }}
        accentColor="secondary"
      />
    </div>
  );
};
