import React, { useState, useMemo } from 'react';
import { Invoice, PaymentMode, PaymentSplit } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { getWhatsAppShareUrl } from '../../core/utils/upiAndShare.ts';
import { db } from '../../services/db.ts';
import { downloadEWayBillJson } from '../../core/gst/eWayBillExport.ts';
import { downloadEInvoiceJson } from '../../core/gst/eInvoiceExport.ts';
import { createPaymentReceiptVoucher } from '../../core/accounting/ledger.ts';
import { getOverdueDays } from '../../core/accounting/aging.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import {
  DatePreset,
  getDateFilterBounds,
  isDateInRange,
  LedgerSortOption,
  LEDGER_SORT_LABELS,
} from '../../core/utils/dateFilters.ts';
import { DateFilterModal } from '../Common/DateFilterModal.tsx';
import { EWayBillModal } from '../Invoicing/EWayBillModal.tsx';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal.tsx';
import { canConvertToInvoice, convertDocumentToTaxInvoice } from '../../core/utils/documentConversion.ts';
import { showAppToast } from '../../services/toast.ts';
import { useBulkSelection } from '../../core/utils/useBulkSelection.ts';
import { BulkActionToolbar } from '../Common/BulkActionToolbar.tsx';
import { BulkPrintModal } from '../Printing/BulkPrintModal.tsx';

interface SalesHubViewProps {
  company: CompanyProfile;
  invoices: Invoice[];
  onOpenStandardInvoice: () => void;
  onOpenTableGridInvoice: () => void;
  onViewInvoice: (invoice: Invoice) => void;
  onEditInvoice?: (invoice: Invoice) => void;
  onDeleteInvoice: (id: string) => void;
  onQuickPos?: () => void;
  onRefresh?: () => void;
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
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'ALL' | 'UNPAID' | 'PAID' | 'ESTIMATES' | 'CHALLANS'>('ALL');
  const [search, setSearch] = useState('');
  const [paymentModalInvoice, setPaymentModalInvoice] = useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [splitCash, setSplitCash] = useState<string>('');
  const [splitUPI, setSplitUPI] = useState<string>('');
  const [splitBank, setSplitBank] = useState<string>('');

  // E-Way Bill Modal state
  const [selectedEwayInvoice, setSelectedEwayInvoice] = useState<Invoice | null>(null);

  // Document Conversion state
  const [confirmConvertDoc, setConfirmConvertDoc] = useState<Invoice | null>(null);

  // Sorting state - Defaults to NEWEST first as requested
  const [sortBy, setSortBy] = useState<LedgerSortOption>('NEWEST');
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);

  // Date Range Filter state - Interactive selectable date picker
  const [datePreset, setDatePreset] = useState<DatePreset>('ALL_TIME');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);

  useBackNavigation(() => {
    if (confirmConvertDoc) {
      setConfirmConvertDoc(null);
      return true;
    }
    if (selectedEwayInvoice) {
      setSelectedEwayInvoice(null);
      return true;
    }
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
  }, isDateModalOpen || isSortDropdownOpen || !!paymentModalInvoice || !!selectedEwayInvoice || !!confirmConvertDoc, 20);

  // Active Date Bounds
  const dateRange = useMemo(() => {
    return getDateFilterBounds(datePreset, customStart, customEnd);
  }, [datePreset, customStart, customEnd]);

  // 1-Tap Document Conversion
  const handleConvertDocument = async (doc: Invoice) => {
    try {
      const newInv = await convertDocumentToTaxInvoice(doc, company);
      showAppToast(
        `${doc.invoiceType === 'ESTIMATE' ? 'Quotation' : 'Challan'} #${doc.invoiceNumber} converted to Tax Invoice #${newInv.invoiceNumber}`
      );
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error('Failed to convert document:', err);
      showAppToast(err.message || 'Failed to convert document.');
    }
  };

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

  // Bulk selection and batch operations
  const {
    selectedIds,
    selectedCount,
    isSelected,
    toggleSelect,
    selectAll,
    clearSelection,
    isAllSelected,
    isIndeterminate,
  } = useBulkSelection();

  const [isBulkPrintOpen, setIsBulkPrintOpen] = useState(false);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);

  const selectedInvoices = useMemo(() => {
    return invoices.filter((i) => selectedIds.has(i.id));
  }, [invoices, selectedIds]);

  const handleBulkExport = () => {
    if (selectedInvoices.length === 0) return;
    const headers = [
      'Invoice Number',
      'Date',
      'Due Date',
      'Type',
      'Party Name',
      'Party Phone',
      'Party GSTIN',
      'Taxable Amount',
      'CGST',
      'SGST',
      'IGST',
      'Grand Total',
      'Paid Amount',
      'Balance Due',
      'Payment Status',
    ];
    const rows = selectedInvoices.map((inv) => [
      `"${inv.invoiceNumber || ''}"`,
      `"${inv.date || ''}"`,
      `"${inv.dueDate || ''}"`,
      `"${inv.invoiceType || 'TAX_INVOICE'}"`,
      `"${(inv.partyName || 'Cash Customer').replace(/"/g, '""')}"`,
      `"${inv.partyPhone || ''}"`,
      `"${inv.partyGstin || ''}"`,
      (inv.totalTaxableAmount || 0).toFixed(2),
      (inv.totalCgst || 0).toFixed(2),
      (inv.totalSgst || 0).toFixed(2),
      (inv.totalIgst || 0).toFixed(2),
      (inv.grandTotal || 0).toFixed(2),
      (inv.paidAmount || 0).toFixed(2),
      (inv.balanceAmount || 0).toFixed(2),
      `"${inv.paymentStatus || 'UNPAID'}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Sales_Invoices_Export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showAppToast(`Exported ${selectedInvoices.length} invoices to CSV.`);
  };

  const handleBulkMarkPaid = async () => {
    const unpaid = selectedInvoices.filter((i) => i.balanceAmount > 0);
    if (unpaid.length === 0) {
      showAppToast('All selected invoices are already fully paid.');
      return;
    }
    for (const inv of unpaid) {
      const unpaidBal = inv.balanceAmount;
      const updatedInv: Invoice = {
        ...inv,
        paidAmount: inv.grandTotal,
        balanceAmount: 0,
        paymentStatus: 'PAID',
        updatedAt: new Date().toISOString(),
      };
      db.saveInvoice(updatedInv);

      if (inv.partyId) {
        const partyList = db.getParties();
        const p = partyList.find((party) => party.id === inv.partyId);
        if (p) {
          p.currentBalance -= unpaidBal;
          p.updatedAt = new Date().toISOString();
          db.saveParty(p);
        }
      }
    }
    clearSelection();
    onRefresh?.();
    showAppToast(`Marked ${unpaid.length} invoices as fully paid.`);
  };

  const handleConfirmBulkDelete = () => {
    for (const inv of selectedInvoices) {
      onDeleteInvoice(inv.id);
    }
    clearSelection();
    setIsBulkDeleteModalOpen(false);
    onRefresh?.();
    showAppToast(`Deleted ${selectedInvoices.length} invoices.`);
  };

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalInvoice) return;

    let payAmt = paymentAmount;
    let splitsToAdd: PaymentSplit[] = [];
    const defaultBank = db.getBankAccounts().find((b) => b.isDefault && b.accountType === 'BANK') || db.getBankAccounts().find((b) => b.accountType === 'BANK');

    if (paymentMode === 'SPLIT') {
      const c = parseFloat(splitCash) || 0;
      const u = parseFloat(splitUPI) || 0;
      const b = parseFloat(splitBank) || 0;
      const totalSplit = Number((c + u + b).toFixed(2));
      if (totalSplit <= 0) {
        alert('Please enter at least one split tender amount (Cash, UPI, or Bank).');
        return;
      }
      payAmt = totalSplit;
      if (c > 0) splitsToAdd.push({ id: `rcpt-c-${Date.now()}`, mode: 'CASH', amount: c, accountId: 'ACC_CASH', accountName: 'Cash-in-hand' });
      if (u > 0) splitsToAdd.push({ id: `rcpt-u-${Date.now()}`, mode: 'UPI', amount: u, accountId: defaultBank?.id, accountName: defaultBank?.accountName });
      if (b > 0) splitsToAdd.push({ id: `rcpt-b-${Date.now()}`, mode: 'BANK', amount: b, accountId: defaultBank?.id, accountName: defaultBank?.accountName });
    } else {
      if (payAmt <= 0) return;
      const isCash = paymentMode === 'CASH';
      splitsToAdd.push({
        id: `rcpt-${Date.now()}`,
        mode: paymentMode,
        amount: payAmt,
        accountId: isCash ? 'ACC_CASH' : defaultBank?.id,
        accountName: isCash ? 'Cash-in-hand' : defaultBank?.accountName,
      });
    }

    if (payAmt <= 0) return;

    const discAmt = Number(discountAmount || 0);
    const totalSettled = Number((payAmt + discAmt).toFixed(2));
    const newPaid = Math.min(paymentModalInvoice.grandTotal, paymentModalInvoice.paidAmount + totalSettled);
    const newBal = Math.max(0, paymentModalInvoice.grandTotal - newPaid);

    // Maintain updated payment splits
    const existingSplits = (paymentModalInvoice.paymentSplits?.filter((s) => s.mode !== 'CREDIT') || []).map((s) => ({ ...s }));
    if (existingSplits.length === 0 && paymentModalInvoice.paidAmount > 0) {
      existingSplits.push({ id: 'split-prev', mode: paymentModalInvoice.paymentMode || 'CASH', amount: paymentModalInvoice.paidAmount });
    }
    existingSplits.push(...splitsToAdd);
    if (newBal > 0) {
      existingSplits.push({ id: `split-bal-${Date.now()}`, mode: 'CREDIT', amount: newBal });
    }

    const nonCredit = existingSplits.filter((s) => s.mode !== 'CREDIT');
    const resolvedMode: PaymentMode = nonCredit.length > 1 ? 'SPLIT' : (nonCredit[0]?.mode || 'CASH');

    const updated: Invoice = {
      ...paymentModalInvoice,
      paidAmount: newPaid,
      balanceAmount: newBal,
      paymentMode: resolvedMode,
      paymentStatus: newBal === 0 ? 'PAID' : 'PARTIAL',
      paymentSplits: existingSplits,
      updatedAt: new Date().toISOString(),
    };

    const docId = Date.now().toString().slice(-6);
    const voucher = createPaymentReceiptVoucher({
      receiptNumber: `RCPT-${docId}`,
      date: new Date().toISOString().split('T')[0],
      customerName: paymentModalInvoice.partyName,
      customerId: paymentModalInvoice.partyId || 'ACC_CASH',
      amount: payAmt,
      discount: discAmt,
      paymentMode: paymentMode,
      bankAccountId: defaultBank?.id,
      bankAccountName: defaultBank?.accountName,
      paymentSplits: splitsToAdd,
      referenceNo: paymentModalInvoice.invoiceNumber,
      narration: `Payment received against invoice #${paymentModalInvoice.invoiceNumber}${discAmt > 0 ? ` (Discount: ${formatINR(discAmt)})` : ''}`,
    });
    db.saveVoucher(voucher);
    db.saveInvoice(updated);

    if (paymentModalInvoice.partyId) {
      db.recalculatePartyBalance(paymentModalInvoice.partyId);
    }

    setPaymentModalInvoice(null);
    setPaymentAmount(0);
    setDiscountAmount(0);
    setSplitCash('');
    setSplitUPI('');
    setSplitBank('');
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
            className={`min-h-[36px] sm:min-h-[40px] h-9 sm:h-10 flex items-center gap-1.5 px-3 rounded-xl shadow-xs text-xs font-bold cursor-pointer border transition-all shrink-0 active:scale-95 ${
              datePreset !== 'ALL_TIME'
                ? 'bg-secondary/15 text-secondary border-secondary/30'
                : 'bg-surface-container-lowest text-on-surface-variant border-outline-variant/25 hover:bg-surface-container-low'
            }`}
            title="Filter by date range"
            aria-label="Filter by date range"
          >
            <span className="material-symbols-outlined text-[15px]">calendar_month</span>
            <span className="truncate max-w-[100px] sm:max-w-[150px]">{dateRange.label}</span>
            {datePreset !== 'ALL_TIME' ? (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setDatePreset('ALL_TIME');
                  setCustomStart('');
                  setCustomEnd('');
                }}
                className="material-symbols-outlined text-[13px] hover:text-error ml-0.5"
                title="Reset to All Time"
                aria-label="Reset date filter"
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
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[16px]">
              search
            </span>
            <input
              className="w-full min-h-[38px] sm:min-h-[40px] h-9 sm:h-10 pl-8 pr-7 bg-surface-container-lowest text-on-surface text-xs sm:text-sm rounded-xl shadow-xs border border-outline-variant/25 placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-secondary/40"
              placeholder={company.isGstEnabled !== false ? "Search customer, bill, GSTIN..." : "Search customer, bill..."}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface cursor-pointer"
                type="button"
                title="Clear search"
                aria-label="Clear search"
              >
                <span className="material-symbols-outlined text-[15px]">close</span>
              </button>
            )}
          </div>

          {/* Sort Selector Dropdown Button */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
              className="min-h-[38px] sm:min-h-[40px] h-9 sm:h-10 flex items-center gap-1 px-2.5 rounded-xl text-xs font-bold bg-surface-container-lowest text-on-surface-variant border border-outline-variant/25 hover:bg-surface-container-low cursor-pointer transition-all shadow-xs active:scale-95"
              title={`Sort: ${LEDGER_SORT_LABELS[sortBy]}`}
              aria-label="Sort sales ledger"
            >
              <span className="material-symbols-outlined text-[15px] text-secondary">sort</span>
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

        {/* Row 4: Status Filter Pills (Harmonized to min-h-[36px]) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
          <button
            onClick={() => setActiveTab('ALL')}
            className={`min-h-[36px] sm:min-h-[38px] px-3.5 sm:px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 active:scale-95 ${
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
            className={`min-h-[36px] sm:min-h-[38px] px-3.5 sm:px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 active:scale-95 ${
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
            className={`min-h-[36px] sm:min-h-[38px] px-3.5 sm:px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 active:scale-95 ${
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
            className={`min-h-[36px] sm:min-h-[38px] px-3.5 sm:px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
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

      {/* Select All & Multi-Selection Bar */}
      {sortedInvoices.length > 0 && (
        <div className="px-margin-mobile md:px-0 mt-2 flex items-center justify-between py-1 text-xs text-on-surface-variant">
          <label className="flex items-center gap-2 cursor-pointer select-none font-semibold">
            <input
              type="checkbox"
              checked={isAllSelected(sortedInvoices.map((i) => i.id))}
              ref={(el) => {
                if (el) el.indeterminate = isIndeterminate(sortedInvoices.map((i) => i.id));
              }}
              onChange={() => selectAll(sortedInvoices.map((i) => i.id))}
              className="w-4 h-4 rounded text-secondary accent-secondary cursor-pointer"
            />
            <span>Select All ({sortedInvoices.length})</span>
          </label>
          {selectedCount > 0 && (
            <button
              type="button"
              onClick={clearSelection}
              className="text-[11px] font-bold text-secondary hover:underline cursor-pointer"
            >
              Clear selection ({selectedCount})
            </button>
          )}
        </div>
      )}

      {/* Invoices List Feed (Slim Passbook Cards) */}
      <div className="px-margin-mobile md:px-0 mt-1 grid grid-cols-1 md:grid-cols-2 gap-2">
        {sortedInvoices.length === 0 ? (
          <div
            data-testid="sales-hub-empty-state"
            className="md:col-span-2 bg-surface-container-lowest rounded-2xl p-8 sm:p-12 text-center flex flex-col items-center justify-center gap-3 border border-outline-variant/20 shadow-xs animate-fade-in"
          >
            {invoices.length === 0 ? (
              /* Case 1: Total Empty State - No invoices recorded yet */
              <>
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-secondary/10 text-secondary flex items-center justify-center mb-1 shadow-inner ring-8 ring-secondary/5">
                  <span className="material-symbols-outlined text-[36px] sm:text-[42px]">receipt_long</span>
                </div>
                <h3 className="text-base sm:text-lg font-extrabold text-on-surface tracking-tight">
                  No Sales Bills Yet
                </h3>
                <p className="text-xs sm:text-sm text-on-surface-variant max-w-sm mx-auto leading-relaxed">
                  Create your first GST-compliant tax invoice or cash bill to start tracking sales, payments, and customer balances.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2.5 mt-2">
                  <button
                    type="button"
                    onClick={onOpenTableGridInvoice}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-secondary text-on-secondary font-bold text-xs sm:text-sm shadow-md hover:bg-secondary/90 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
                    aria-label="Create Sale Bill"
                    data-testid="empty-create-bill-btn"
                  >
                    <span className="material-symbols-outlined text-[20px]">add</span>
                    <span>+ Create Sale Bill</span>
                  </button>
                  {onQuickPos && (
                    <button
                      type="button"
                      onClick={onQuickPos}
                      className="min-h-[44px] px-4 py-2.5 rounded-xl bg-surface-container-low text-on-surface font-semibold text-xs border border-outline-variant/30 hover:bg-surface-container active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                      aria-label="Quick POS Billing"
                    >
                      <span className="material-symbols-outlined text-[18px] text-secondary">point_of_sale</span>
                      <span>Quick POS</span>
                    </button>
                  )}
                </div>
              </>
            ) : (
              /* Case 2: Filter/Search Mismatch - Invoices exist but 0 matches */
              <>
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-surface-container-low text-outline flex items-center justify-center mb-1">
                  <span className="material-symbols-outlined text-[28px] sm:text-[32px]">filter_list_off</span>
                </div>
                <h3 className="text-sm sm:text-base font-bold text-on-surface">
                  No Invoices Found
                </h3>
                <p className="text-xs text-on-surface-variant max-w-sm mx-auto leading-relaxed">
                  {search
                    ? `No invoices match "${search}" with current filters.`
                    : activeTab !== 'ALL'
                    ? `No ${activeTab.toLowerCase()} invoices found for this date range.`
                    : 'No invoices found for the selected date range.'}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="min-h-[40px] px-4 rounded-xl bg-surface-container-low text-secondary font-bold text-xs hover:bg-surface-container cursor-pointer transition-all active:scale-95 flex items-center gap-1.5"
                      aria-label="Clear Search"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                      <span>Clear Search</span>
                    </button>
                  )}
                  {(activeTab !== 'ALL' || datePreset !== 'ALL_TIME') && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('ALL');
                        setDatePreset('ALL_TIME');
                        setCustomStart('');
                        setCustomEnd('');
                      }}
                      className="min-h-[40px] px-4 rounded-xl bg-surface-container-low text-on-surface-variant font-bold text-xs hover:bg-surface-container cursor-pointer transition-all active:scale-95 flex items-center gap-1.5"
                      aria-label="Reset Filters"
                    >
                      <span className="material-symbols-outlined text-[16px]">refresh</span>
                      <span>Reset Filters</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onOpenTableGridInvoice}
                    className="min-h-[40px] px-4 rounded-xl bg-secondary text-on-secondary font-bold text-xs shadow-xs hover:bg-secondary/90 cursor-pointer transition-all active:scale-95 flex items-center gap-1.5"
                    aria-label="Create Sale Bill"
                  >
                    <span className="material-symbols-outlined text-[18px]">add</span>
                    <span>+ Create Sale Bill</span>
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          sortedInvoices.map((inv) => {
            const isPaid = inv.paymentStatus === 'PAID';

            return (
              <div
                key={inv.id}
                onClick={() => onViewInvoice(inv)}
                className={`bg-surface-container-lowest rounded-xl p-2.5 sm:p-3 shadow-xs border flex flex-col gap-1.5 active:scale-[0.99] transition-all cursor-pointer ${
                  isSelected(inv.id)
                    ? 'border-secondary ring-1 ring-secondary/30 bg-secondary/5'
                    : 'border-outline-variant/20 hover:border-secondary/40'
                }`}
              >
                {/* Line 1: Checkbox + Party Name (left) | Grand Total (right) */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(inv.id);
                      }}
                      className="w-5 h-5 flex items-center justify-center shrink-0 cursor-pointer"
                      title="Select invoice"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected(inv.id)}
                        onChange={() => {}}
                        className="w-3.5 h-3.5 rounded text-secondary accent-secondary cursor-pointer"
                      />
                    </div>
                    <span className="font-bold text-xs sm:text-sm text-on-surface truncate">
                      {inv.partyName || 'Cash Customer'}
                    </span>
                  </div>
                  <span className="font-extrabold text-xs sm:text-sm text-on-surface whitespace-nowrap tabular-nums shrink-0">
                    {formatINR(inv.grandTotal)}
                  </span>
                </div>

                {/* Line 2 (Middle): Invoice # & Overdue Badge */}
                <div className="flex items-center gap-1.5 -mt-0.5 flex-wrap">
                  <span className="text-[10px] font-semibold text-secondary shrink-0 bg-secondary/10 px-1.5 py-0.2 rounded font-mono">
                    #{inv.invoiceNumber}
                  </span>

                  {/* Overdue Badge */}
                  {(() => {
                    const overdueDays =
                      inv.dueDate && (inv.balanceAmount || 0) > 0.01 && inv.paymentStatus !== 'PAID'
                        ? getOverdueDays(inv.dueDate)
                        : 0;
                    if (overdueDays <= 0) return null;
                    return (
                      <span
                        data-testid="overdue-badge"
                        className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800"
                      >
                        <span className="material-symbols-outlined text-[10px]">schedule</span>
                        <span>{overdueDays} days overdue</span>
                      </span>
                    );
                  })()}

                  {/* Converted Badge */}
                  {inv.isConverted && (
                    <span
                      data-testid="converted-badge"
                      className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                    >
                      <span className="material-symbols-outlined text-[10px]">transform</span>
                      <span>Converted {inv.convertedToInvoiceNumber ? `#${inv.convertedToInvoiceNumber}` : ''}</span>
                    </span>
                  )}

                  {/* 1-Tap Convert to Tax Invoice Button */}
                  {canConvertToInvoice(inv) && (
                    <button
                      type="button"
                      data-testid="convert-invoice-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmConvertDoc(inv);
                      }}
                      className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-secondary text-on-secondary shadow-xs hover:bg-secondary/90 active:scale-95 transition-all cursor-pointer ml-auto"
                      title="Convert Quotation/Challan directly to Tax Invoice"
                    >
                      <span className="material-symbols-outlined text-[12px]">receipt_long</span>
                      <span>Convert to Invoice</span>
                    </button>
                  )}

                  {/* E-Way Bill Button (Statutory threshold >= 50,000 or already has E-Way) */}
                  {(inv.grandTotal >= 50000 || inv.ewayBillNumber) && inv.invoiceType !== 'ESTIMATE' && inv.invoiceType !== 'DELIVERY_CHALLAN' && (
                    <button
                      type="button"
                      data-testid="eway-bill-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEwayInvoice(inv);
                      }}
                      className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md border transition-all cursor-pointer active:scale-95 ${
                        inv.ewayBillNumber
                          ? 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20'
                          : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                      }`}
                      title={inv.ewayBillNumber ? `E-Way Bill: ${inv.ewayBillNumber}` : 'Statutory E-Way Bill Required (Value ≥ ₹50,000)'}
                    >
                      <span className="material-symbols-outlined text-[12px]">local_shipping</span>
                      <span>{inv.ewayBillNumber ? `E-Way #${inv.ewayBillNumber.slice(-4)}` : 'E-Way Bill'}</span>
                    </button>
                  )}
                </div>

                {/* Line 3: Date & Items count (left) | Due amount + Record Pay button on a single line (right) */}
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
                            setDiscountAmount(0);
                            setPaymentMode('CASH');
                            setSplitCash('');
                            setSplitUPI('');
                            setSplitBank('');
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

              {/* Mode Selector */}
              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1">
                  Payment Mode
                </label>
                <div className="grid grid-cols-4 gap-1">
                  {(['UPI', 'CASH', 'BANK', 'SPLIT'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setPaymentMode(m);
                        if (m === 'SPLIT') {
                          const total = paymentAmount;
                          if (total > 0 && !splitCash && !splitUPI && !splitBank) {
                            if (paymentMode === 'CASH') setSplitCash(total.toString());
                            else if (paymentMode === 'BANK') setSplitBank(total.toString());
                            else setSplitUPI(total.toString());
                          }
                        }
                      }}
                      className={`py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                        paymentMode === m
                          ? 'bg-secondary text-on-secondary shadow-xs'
                          : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Single Amount Input */}
              {paymentMode !== 'SPLIT' ? (
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1">
                    Amount Received (₹)
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface font-extrabold text-lg focus:outline-none focus:ring-2 focus:ring-secondary/40"
                  />
                  {paymentAmount > paymentModalInvoice.balanceAmount && (
                    <p className="mt-1.5 text-[11px] font-bold text-secondary flex items-center gap-1 bg-secondary/10 px-2 py-1 rounded-lg">
                      <span className="material-symbols-outlined text-[15px]">account_balance_wallet</span>
                      <span>Excess {formatINR(paymentAmount - paymentModalInvoice.balanceAmount)} will be credited as customer advance</span>
                    </p>
                  )}
                </div>
              ) : (
                /* Split Allocation Box */
                (() => {
                  const target = paymentModalInvoice.balanceAmount;
                  const c = parseFloat(splitCash) || 0;
                  const u = parseFloat(splitUPI) || 0;
                  const b = parseFloat(splitBank) || 0;
                  const allocated = Number((c + u + b).toFixed(2));
                  const remaining = Number(Math.max(0, target - allocated).toFixed(2));

                  return (
                    <div className="p-3 bg-surface-container-low rounded-xl border border-secondary/20 flex flex-col gap-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-on-surface flex items-center gap-1">
                          <span className="material-symbols-outlined text-[15px] text-secondary">call_split</span>
                          <span>Split Breakdown</span>
                        </span>
                        <span className={`font-bold ${
                          allocated === target
                            ? 'text-secondary'
                            : allocated > target
                            ? 'text-error'
                            : 'text-amber-600'
                        }`}>
                          Allocated: {formatINR(allocated)} / {formatINR(target)}
                          {remaining > 0 && ` (${formatINR(remaining)} left)`}
                        </span>
                      </div>

                      <div className="flex flex-col gap-2">
                        {/* Cash */}
                        <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-surface border border-outline-variant/20">
                          <span className="text-xs font-bold text-on-surface flex items-center gap-1 w-20">
                            <span className="material-symbols-outlined text-[14px] text-emerald-600">payments</span>
                            Cash
                          </span>
                          <div className="relative flex-1">
                            <span className="absolute left-2 top-1.5 text-xs text-on-surface-variant font-bold">₹</span>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={splitCash}
                              onChange={(e) => setSplitCash(e.target.value)}
                              className="w-full pl-5 pr-2 py-1 bg-surface-container-lowest rounded-lg text-xs font-bold text-on-surface border border-outline-variant/30 focus:outline-none focus:border-secondary"
                            />
                          </div>
                          {remaining > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const next = (c + remaining).toFixed(2);
                                setSplitCash(parseFloat(next).toString());
                              }}
                              className="px-2 py-1 rounded bg-secondary/10 text-secondary text-[10px] font-bold cursor-pointer hover:bg-secondary/20 whitespace-nowrap"
                            >
                              + Fill
                            </button>
                          )}
                        </div>

                        {/* UPI */}
                        <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-surface border border-outline-variant/20">
                          <span className="text-xs font-bold text-on-surface flex items-center gap-1 w-20">
                            <span className="material-symbols-outlined text-[14px] text-blue-600">qr_code_2</span>
                            UPI
                          </span>
                          <div className="relative flex-1">
                            <span className="absolute left-2 top-1.5 text-xs text-on-surface-variant font-bold">₹</span>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={splitUPI}
                              onChange={(e) => setSplitUPI(e.target.value)}
                              className="w-full pl-5 pr-2 py-1 bg-surface-container-lowest rounded-lg text-xs font-bold text-on-surface border border-outline-variant/30 focus:outline-none focus:border-secondary"
                            />
                          </div>
                          {remaining > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const next = (u + remaining).toFixed(2);
                                setSplitUPI(parseFloat(next).toString());
                              }}
                              className="px-2 py-1 rounded bg-secondary/10 text-secondary text-[10px] font-bold cursor-pointer hover:bg-secondary/20 whitespace-nowrap"
                            >
                              + Fill
                            </button>
                          )}
                        </div>

                        {/* Bank */}
                        <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-surface border border-outline-variant/20">
                          <span className="text-xs font-bold text-on-surface flex items-center gap-1 w-20">
                            <span className="material-symbols-outlined text-[14px] text-purple-600">account_balance</span>
                            Bank
                          </span>
                          <div className="relative flex-1">
                            <span className="absolute left-2 top-1.5 text-xs text-on-surface-variant font-bold">₹</span>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={splitBank}
                              onChange={(e) => setSplitBank(e.target.value)}
                              className="w-full pl-5 pr-2 py-1 bg-surface-container-lowest rounded-lg text-xs font-bold text-on-surface border border-outline-variant/30 focus:outline-none focus:border-secondary"
                            />
                          </div>
                          {remaining > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const next = (b + remaining).toFixed(2);
                                setSplitBank(parseFloat(next).toString());
                              }}
                              className="px-2 py-1 rounded bg-secondary/10 text-secondary text-[10px] font-bold cursor-pointer hover:bg-secondary/20 whitespace-nowrap"
                            >
                              + Fill
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}

              {/* Discount Allowed Input */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-on-surface-variant">
                    Discount Allowed (₹)
                  </label>
                  {discountAmount > 0 && (
                    <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                      Total Settled: {formatINR(paymentAmount + discountAmount)}
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountAmount || ''}
                  onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface font-bold text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40 min-h-[36px]"
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

      {/* E-Way Bill Modal */}
      {selectedEwayInvoice && (
        <EWayBillModal
          isOpen={!!selectedEwayInvoice}
          invoice={selectedEwayInvoice}
          company={company}
          onClose={() => setSelectedEwayInvoice(null)}
          onInvoiceUpdated={(_updatedInv: Invoice) => {
            setSelectedEwayInvoice(null);
            if (onRefresh) onRefresh();
          }}
        />
      )}

      {/* Convert Document Confirmation Modal */}
      {confirmConvertDoc && (
        <ConfirmDeleteModal
          isOpen={!!confirmConvertDoc}
          title="Convert to Tax Invoice?"
          description={`Are you sure you want to convert ${
            confirmConvertDoc.invoiceType === 'ESTIMATE' ? 'Quotation' : 'Delivery Challan'
          } #${confirmConvertDoc.invoiceNumber} into an official Tax Invoice? This will generate a new Tax Invoice, assign a new invoice number, and adjust stock.`}
          confirmText="Convert Now"
          confirmButtonClass="bg-secondary text-on-secondary hover:bg-secondary/90"
          icon="receipt_long"
          iconBgClass="bg-secondary/15 text-secondary"
          onConfirm={async () => {
            const doc = confirmConvertDoc;
            setConfirmConvertDoc(null);
            await handleConvertDocument(doc);
          }}
          onClose={() => setConfirmConvertDoc(null)}
        />
      )}

      {/* Floating Bulk Action Toolbar */}
      <BulkActionToolbar
        selectedCount={selectedCount}
        onClearSelection={clearSelection}
        onBulkPrint={() => setIsBulkPrintOpen(true)}
        onBulkExport={handleBulkExport}
        onBulkMarkPaid={handleBulkMarkPaid}
        onBulkDelete={() => setIsBulkDeleteModalOpen(true)}
        markPaidLabel="Mark Paid"
      />

      {/* Bulk Print Preview Modal */}
      {isBulkPrintOpen && (
        <BulkPrintModal
          isOpen={isBulkPrintOpen}
          onClose={() => setIsBulkPrintOpen(false)}
          company={company}
          invoices={selectedInvoices}
          title="Bulk Sales Invoice Printing"
        />
      )}

      {/* Bulk Delete Confirmation Modal */}
      {isBulkDeleteModalOpen && (
        <ConfirmDeleteModal
          isOpen={isBulkDeleteModalOpen}
          title="Delete Selected Invoices?"
          recordName={`${selectedCount} selected invoices`}
          description={`Are you sure you want to permanently delete ${selectedCount} selected invoices? This will restore inventory stock.`}
          confirmText="Delete All Selected"
          onConfirm={handleConfirmBulkDelete}
          onClose={() => setIsBulkDeleteModalOpen(false)}
        />
      )}
    </div>
  );
};

