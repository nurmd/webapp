import React, { useState, useMemo } from 'react';
import { Invoice } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { getWhatsAppShareUrl } from '../../core/utils/upiAndShare.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import {
  DatePreset,
  getDateFilterBounds,
  isDateInRange,
  LedgerSortOption,
} from '../../core/utils/dateFilters.ts';
import { DateFilterModal } from '../Common/DateFilterModal.tsx';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal.tsx';
import { canConvertToInvoice, convertDocumentToTaxInvoice } from '../../core/utils/documentConversion.ts';
import { showAppToast } from '../../services/toast.ts';
import { db } from '../../services/db.ts';

export type ChallanTabFilter = 'ALL' | 'DRAFT' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';

export interface DeliveryChallansViewProps {
  company: CompanyProfile;
  invoices: Invoice[];
  onNewDeliveryChallan: () => void;
  onViewInvoice: (invoice: Invoice) => void;
  onEditInvoice?: (invoice: Invoice) => void;
  onDeleteInvoice: (id: string) => void;
  onRefresh?: () => void;
}

export const DeliveryChallansView: React.FC<DeliveryChallansViewProps> = ({
  company,
  invoices,
  onNewDeliveryChallan,
  onViewInvoice,
  onEditInvoice,
  onDeleteInvoice,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<ChallanTabFilter>('ALL');
  const [search, setSearch] = useState('');
  const [confirmConvertDoc, setConfirmConvertDoc] = useState<Invoice | null>(null);
  const [docToDelete, setDocToDelete] = useState<Invoice | null>(null);
  const [docToCancel, setDocToCancel] = useState<Invoice | null>(null);
  const [isConverting, setIsConverting] = useState(false);

  // Sorting
  const [sortBy, setSortBy] = useState<LedgerSortOption>('NEWEST');
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);

  // Date Filter
  const [datePreset, setDatePreset] = useState<DatePreset>('ALL_TIME');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);

  // Android Back navigation stack
  useBackNavigation(() => {
    if (confirmConvertDoc) {
      setConfirmConvertDoc(null);
      return true;
    }
    if (docToDelete) {
      setDocToDelete(null);
      return true;
    }
    if (docToCancel) {
      setDocToCancel(null);
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
    return false;
  }, isDateModalOpen || isSortDropdownOpen || !!confirmConvertDoc || !!docToDelete || !!docToCancel, 20);

  // 1. Filter only Delivery Challans
  const challanList = useMemo(() => {
    return invoices.filter((i) => i.invoiceType === 'DELIVERY_CHALLAN');
  }, [invoices]);

  // 2. Date Filtering Bounds
  const dateRange = useMemo(() => {
    return getDateFilterBounds(datePreset, customStart, customEnd);
  }, [datePreset, customStart, customEnd]);

  const dateFiltered = useMemo(() => {
    if (!dateRange.start && !dateRange.end) return challanList;
    return challanList.filter((inv) => isDateInRange(inv.date, dateRange.start, dateRange.end));
  }, [challanList, dateRange]);

  // KPI Metrics calculation
  const totalValue = dateFiltered.reduce((sum, c) => sum + c.grandTotal, 0);
  const draftList = dateFiltered.filter((c) => (c.challanStatus || 'DISPATCHED') === 'DRAFT' && !c.isCancelled);
  const draftValue = draftList.reduce((sum, c) => sum + c.grandTotal, 0);
  const dispatchedList = dateFiltered.filter(
    (c) => (c.challanStatus || 'DISPATCHED') === 'DISPATCHED' && !c.isCancelled && !c.isConverted
  );
  const dispatchedValue = dispatchedList.reduce((sum, c) => sum + c.grandTotal, 0);
  const deliveredList = dateFiltered.filter(
    (c) => c.challanStatus === 'DELIVERED' || c.isConverted
  );
  const deliveredValue = deliveredList.reduce((sum, c) => sum + c.grandTotal, 0);
  const cancelledList = dateFiltered.filter(
    (c) => c.isCancelled || c.challanStatus === 'CANCELLED'
  );

  // 3. Search and Status Tab Filter
  const statusFiltered = useMemo(() => {
    return dateFiltered.filter((inv) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.partyName.toLowerCase().includes(q) ||
        (inv.consigneeName && inv.consigneeName.toLowerCase().includes(q)) ||
        (inv.partyGstin && inv.partyGstin.toLowerCase().includes(q)) ||
        (inv.vehicleNumber && inv.vehicleNumber.toLowerCase().includes(q)) ||
        (inv.transporterName && inv.transporterName.toLowerCase().includes(q)) ||
        (inv.ewayBillNumber && inv.ewayBillNumber.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      const effectiveStatus = inv.isCancelled
        ? 'CANCELLED'
        : inv.isConverted
        ? 'DELIVERED'
        : (inv.challanStatus || 'DISPATCHED');

      if (activeTab === 'DRAFT') return effectiveStatus === 'DRAFT';
      if (activeTab === 'DISPATCHED') return effectiveStatus === 'DISPATCHED';
      if (activeTab === 'DELIVERED') return effectiveStatus === 'DELIVERED';
      if (activeTab === 'CANCELLED') return effectiveStatus === 'CANCELLED';
      return true;
    });
  }, [dateFiltered, search, activeTab]);

  // 4. Sort
  const sortedChallans = useMemo(() => {
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
        default:
          return 0;
      }
    });
  }, [statusFiltered, sortBy]);

  // 1-Tap Convert to Tax Invoice Handler
  const handleConvertChallan = async (doc: Invoice) => {
    setIsConverting(true);
    try {
      const newInv = await convertDocumentToTaxInvoice(doc, company);
      showAppToast(`Challan #${doc.invoiceNumber} converted to Tax Invoice #${newInv.invoiceNumber}`);
      setConfirmConvertDoc(null);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error('Failed to convert delivery challan:', err);
      showAppToast(err.message || 'Failed to convert delivery challan.');
    } finally {
      setIsConverting(false);
    }
  };

  // Status Change Handler (e.g. Draft -> Dispatched -> Delivered)
  const handleUpdateStatus = async (doc: Invoice, newStatus: 'DRAFT' | 'DISPATCHED' | 'DELIVERED') => {
    try {
      const updated: Invoice = {
        ...doc,
        challanStatus: newStatus,
        updatedAt: new Date().toISOString(),
      };
      await db.saveInvoice(updated);
      showAppToast(`Challan #${doc.invoiceNumber} marked as ${newStatus}`);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Failed to update challan status:', err);
      showAppToast('Failed to update status.');
    }
  };

  // Cancel Challan Handler
  const handleCancelChallan = async (doc: Invoice) => {
    try {
      const updated: Invoice = {
        ...doc,
        challanStatus: 'CANCELLED',
        isCancelled: true,
        updatedAt: new Date().toISOString(),
      };
      await db.saveInvoice(updated);
      showAppToast(`Delivery Challan #${doc.invoiceNumber} cancelled.`);
      setDocToCancel(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Failed to cancel delivery challan:', err);
      showAppToast('Failed to cancel delivery challan.');
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 pb-24">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-2xl">local_shipping</span>
            <h1 className="font-headline-sm text-xl sm:text-2xl font-black text-on-surface tracking-tight">
              Delivery Challans
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-on-surface-variant mt-0.5">
            Rule 55 goods transport documentation, vehicle tracking, and 1-tap conversion to Tax Invoices.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="new-delivery-challan-btn"
            onClick={onNewDeliveryChallan}
            className="h-10 px-4 rounded-xl bg-secondary text-on-secondary text-xs sm:text-sm font-bold shadow-sm hover:bg-secondary/90 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer ml-auto"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>+ New Delivery Challan</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-surface-container-lowest rounded-2xl p-3 sm:p-4 border border-outline-variant/30 flex flex-col justify-between shadow-xs">
          <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Total Challans</span>
          <div className="mt-1">
            <span className="text-lg sm:text-xl font-extrabold text-on-surface tabular-nums">{dateFiltered.length}</span>
            <span className="text-xs text-on-surface-variant ml-1 font-semibold">({formatINR(totalValue)})</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl p-3 sm:p-4 border border-outline-variant/30 flex flex-col justify-between shadow-xs">
          <span className="text-[11px] font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wider">In Transit / Dispatched</span>
          <div className="mt-1">
            <span className="text-lg sm:text-xl font-extrabold text-sky-800 dark:text-sky-300 tabular-nums">{dispatchedList.length}</span>
            <span className="text-xs text-on-surface-variant ml-1 font-semibold">({formatINR(dispatchedValue)})</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl p-3 sm:p-4 border border-outline-variant/30 flex flex-col justify-between shadow-xs">
          <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Delivered / Converted</span>
          <div className="mt-1">
            <span className="text-lg sm:text-xl font-extrabold text-emerald-800 dark:text-emerald-300 tabular-nums">{deliveredList.length}</span>
            <span className="text-xs text-on-surface-variant ml-1 font-semibold">({formatINR(deliveredValue)})</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl p-3 sm:p-4 border border-outline-variant/30 flex flex-col justify-between shadow-xs">
          <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Drafts</span>
          <div className="mt-1">
            <span className="text-lg sm:text-xl font-extrabold text-amber-800 dark:text-amber-300 tabular-nums">{draftList.length}</span>
            <span className="text-xs text-on-surface-variant ml-1 font-semibold">({formatINR(draftValue)})</span>
          </div>
        </div>
      </div>

      {/* Sticky Filter & Search Bar (Guardrail #9) */}
      <div className="sticky top-0 z-20 bg-surface/95 backdrop-blur-md pt-1 pb-2 flex flex-col sm:flex-row gap-2 sm:items-center justify-between border-b border-outline-variant/20">
        <div className="relative flex-1 min-w-[220px]">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
            search
          </span>
          <input
            type="text"
            role="searchbox"
            data-testid="challan-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by DC #, party, vehicle, e-way bill..."
            className="w-full h-10 pl-9 pr-8 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs sm:text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-2 focus:ring-secondary/40 transition-all font-medium"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface p-0.5 rounded cursor-pointer"
              title="Clear search"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {/* Date Filter Button */}
          <button
            type="button"
            data-testid="challan-date-filter-btn"
            onClick={() => setIsDateModalOpen(true)}
            className="h-10 px-3 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-semibold text-on-surface flex items-center gap-1.5 hover:bg-surface-container transition-all cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-[16px] text-secondary">calendar_today</span>
            <span>{datePreset === 'ALL_TIME' ? 'All Dates' : datePreset.replace(/_/g, ' ')}</span>
          </button>

          {/* Sort Button */}
          <div className="relative shrink-0">
            <button
              type="button"
              data-testid="challan-sort-btn"
              onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
              className="h-10 px-3 rounded-xl bg-surface-container-low border border-outline-variant/30 text-xs font-semibold text-on-surface flex items-center gap-1.5 hover:bg-surface-container transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px] text-secondary">sort</span>
              <span>Sort</span>
            </button>

            {isSortDropdownOpen && (
              <div className="absolute right-0 mt-1 w-44 rounded-xl bg-surface-container-lowest border border-outline-variant/40 shadow-lg p-1.5 z-30 text-xs">
                {(['NEWEST', 'OLDEST', 'AMOUNT_HIGH', 'AMOUNT_LOW'] as LedgerSortOption[]).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      setSortBy(opt);
                      setIsSortDropdownOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg font-medium transition-colors cursor-pointer flex items-center justify-between ${
                      sortBy === opt ? 'bg-secondary/15 text-secondary font-bold' : 'hover:bg-surface-container text-on-surface'
                    }`}
                  >
                    <span>
                      {opt === 'NEWEST'
                        ? 'Newest Date'
                        : opt === 'OLDEST'
                        ? 'Oldest Date'
                        : opt === 'AMOUNT_HIGH'
                        ? 'Amount (High to Low)'
                        : 'Amount (Low to High)'}
                    </span>
                    {sortBy === opt && <span className="material-symbols-outlined text-[14px]">check</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status Segment Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-outline-variant/20 no-scrollbar">
        {[
          { key: 'ALL', label: 'All', count: dateFiltered.length },
          { key: 'DISPATCHED', label: 'In Transit / Dispatched', count: dispatchedList.length },
          { key: 'DELIVERED', label: 'Delivered', count: deliveredList.length },
          { key: 'DRAFT', label: 'Drafts', count: draftList.length },
          { key: 'CANCELLED', label: 'Cancelled', count: cancelledList.length },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            data-testid={`challan-tab-${tab.key.toLowerCase()}`}
            onClick={() => setActiveTab(tab.key as ChallanTabFilter)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
              activeTab === tab.key
                ? 'bg-secondary text-on-secondary shadow-xs'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
            }`}
          >
            <span>{tab.label}</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === tab.key ? 'bg-on-secondary/20 text-on-secondary' : 'bg-surface-container-high text-on-surface'
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Main Challans List / Table */}
      {sortedChallans.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-secondary/10 text-secondary mx-auto flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl">local_shipping</span>
          </div>
          <h2 className="text-base font-bold text-on-surface">No Delivery Challans Found</h2>
          <p className="text-xs text-on-surface-variant max-w-sm mx-auto">
            {search
              ? 'No challans match your search filter. Try clearing your query.'
              : 'Create a delivery challan under Rule 55 for sending goods for job work, approval, or delivery without posting to sales.'}
          </p>
          {!search && (
            <button
              type="button"
              onClick={onNewDeliveryChallan}
              className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-secondary text-on-secondary text-xs font-bold shadow-xs hover:bg-secondary/90 active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>+ Create First Challan</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Desktop Table View */}
          <div className="hidden md:block bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface-container-low/70 border-b border-outline-variant/30 text-on-surface-variant font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">DC Number</th>
                  <th className="py-3 px-4">Date / Dispatch</th>
                  <th className="py-3 px-4">Party & Consignee</th>
                  <th className="py-3 px-4">Vehicle & E-Way</th>
                  <th className="py-3 px-4 text-center">Items</th>
                  <th className="py-3 px-4 text-right">Value (₹)</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {sortedChallans.map((challan) => {
                  const effectiveStatus = challan.isCancelled
                    ? 'CANCELLED'
                    : challan.isConverted
                    ? 'DELIVERED'
                    : (challan.challanStatus || 'DISPATCHED');
                  const isDelivered = effectiveStatus === 'DELIVERED';
                  const isCancelled = effectiveStatus === 'CANCELLED';
                  const isDraft = effectiveStatus === 'DRAFT';

                  return (
                    <tr
                      key={challan.id}
                      data-testid={`challan-row-${challan.id}`}
                      className="hover:bg-surface-container/30 transition-colors group"
                    >
                      {/* DC Number & Type */}
                      <td className="py-3 px-4 font-mono font-bold text-on-surface">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onViewInvoice(challan)}
                            className="hover:underline text-secondary font-black cursor-pointer text-left"
                          >
                            {challan.invoiceNumber}
                          </button>
                          {challan.isConverted && (
                            <span
                              className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30"
                              title={`Converted to Tax Invoice #${challan.convertedToInvoiceNumber || ''}`}
                            >
                              Billed
                            </span>
                          )}
                        </div>
                        {challan.challanType && (
                          <div className="text-[10px] text-teal-700 dark:text-teal-400 font-semibold mt-0.5">
                            {challan.challanType === 'SUPPLY_ON_APPROVAL'
                              ? 'Supply on approval'
                              : challan.challanType === 'JOB_WORK'
                              ? 'Job work'
                              : challan.challanType === 'OTHERS'
                              ? 'Others'
                              : 'For removal'}
                          </div>
                        )}
                      </td>

                      {/* Date & Due */}
                      <td className="py-3 px-4 text-on-surface-variant">
                        <div className="font-medium text-on-surface">{formatDate(challan.date)}</div>
                        {challan.dueDate && (
                          <div className="text-[10px] text-on-surface-variant/70">
                            Transit: {formatDate(challan.dueDate)}
                          </div>
                        )}
                      </td>

                      {/* Party & Consignee */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-on-surface">{challan.partyName}</div>
                        {challan.consigneeName && challan.consigneeName !== challan.partyName && (
                          <div className="text-[10px] text-on-surface-variant">
                            Ship to: {challan.consigneeName}
                          </div>
                        )}
                        {challan.partyGstin && (
                          <div className="text-[10px] font-mono text-on-surface-variant">
                            GSTIN: {challan.partyGstin}
                          </div>
                        )}
                      </td>

                      {/* Transport details */}
                      <td className="py-3 px-4 text-on-surface-variant">
                        {challan.vehicleNumber ? (
                          <div className="font-mono font-bold text-on-surface flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px]">directions_car</span>
                            <span>{challan.vehicleNumber}</span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-outline italic">No vehicle</span>
                        )}
                        {challan.ewayBillNumber && (
                          <div className="text-[10px] font-mono text-secondary mt-0.5">
                            EWB: {challan.ewayBillNumber}
                          </div>
                        )}
                        {challan.transporterName && (
                          <div className="text-[10px] truncate max-w-[140px] text-on-surface-variant">
                            {challan.transporterName}
                          </div>
                        )}
                      </td>

                      {/* Item Count */}
                      <td className="py-3 px-4 text-center font-medium text-on-surface">
                        <span className="px-2 py-0.5 rounded-full bg-surface-container text-xs font-semibold">
                          {challan.items?.length || 0}
                        </span>
                      </td>

                      {/* Grand Total */}
                      <td className="py-3 px-4 text-right font-extrabold text-on-surface tabular-nums">
                        {formatINR(challan.grandTotal)}
                      </td>

                      {/* Status Badge */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${
                            isCancelled
                              ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25'
                              : isDelivered
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
                              : isDraft
                              ? 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/25'
                              : 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isCancelled
                                ? 'bg-rose-500'
                                : isDelivered
                                ? 'bg-emerald-500'
                                : isDraft
                                ? 'bg-slate-500'
                                : 'bg-sky-500'
                            }`}
                          />
                          <span>{effectiveStatus}</span>
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* View / Print */}
                          <button
                            type="button"
                            onClick={() => onViewInvoice(challan)}
                            data-testid={`challan-view-btn-${challan.id}`}
                            className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container active:scale-95 transition-all cursor-pointer"
                            title="Preview & Print Challan"
                          >
                            <span className="material-symbols-outlined text-[18px]">print</span>
                          </button>

                          {/* Convert to Tax Invoice */}
                          {!challan.isConverted && !isCancelled && (
                            <button
                              type="button"
                              onClick={() => setConfirmConvertDoc(challan)}
                              data-testid={`challan-convert-btn-${challan.id}`}
                              className="px-2 py-1 rounded-lg bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-800 dark:text-emerald-300 font-bold text-[11px] border border-emerald-600/30 active:scale-95 transition-all cursor-pointer flex items-center gap-1"
                              title="Convert this delivery challan into a Tax Invoice"
                            >
                              <span className="material-symbols-outlined text-[14px]">receipt_long</span>
                              <span>Convert</span>
                            </button>
                          )}

                          {/* Edit */}
                          {onEditInvoice && !challan.isConverted && !isCancelled && (
                            <button
                              type="button"
                              onClick={() => onEditInvoice(challan)}
                              data-testid={`challan-edit-btn-${challan.id}`}
                              className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container active:scale-95 transition-all cursor-pointer"
                              title="Edit Challan"
                            >
                              <span className="material-symbols-outlined text-[18px]">edit</span>
                            </button>
                          )}

                          {/* Status cycle (Dispatched -> Delivered) */}
                          {!challan.isConverted && !isCancelled && (
                            <>
                              {isDraft && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateStatus(challan, 'DISPATCHED')}
                                  className="p-1.5 rounded-lg text-sky-700 hover:bg-sky-500/15 active:scale-95 transition-all cursor-pointer"
                                  title="Mark as Dispatched"
                                >
                                  <span className="material-symbols-outlined text-[18px]">local_shipping</span>
                                </button>
                              )}
                              {!isDelivered && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateStatus(challan, 'DELIVERED')}
                                  className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-500/15 active:scale-95 transition-all cursor-pointer"
                                  title="Mark as Delivered"
                                >
                                  <span className="material-symbols-outlined text-[18px]">done_all</span>
                                </button>
                              )}
                            </>
                          )}

                          {/* Cancel */}
                          {!challan.isConverted && !isCancelled && (
                            <button
                              type="button"
                              onClick={() => setDocToCancel(challan)}
                              data-testid={`challan-cancel-btn-${challan.id}`}
                              className="p-1.5 rounded-lg text-on-surface-variant hover:text-rose-600 hover:bg-rose-500/15 active:scale-95 transition-all cursor-pointer"
                              title="Cancel Challan"
                            >
                              <span className="material-symbols-outlined text-[18px]">cancel</span>
                            </button>
                          )}

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() => setDocToDelete(challan)}
                            data-testid={`challan-delete-btn-${challan.id}`}
                            className="p-1.5 rounded-lg text-on-surface-variant hover:text-rose-600 hover:bg-rose-500/15 active:scale-95 transition-all cursor-pointer"
                            title="Delete Challan"
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {sortedChallans.map((challan) => {
              const effectiveStatus = challan.isCancelled
                ? 'CANCELLED'
                : challan.isConverted
                ? 'DELIVERED'
                : (challan.challanStatus || 'DISPATCHED');
              const isDelivered = effectiveStatus === 'DELIVERED';
              const isCancelled = effectiveStatus === 'CANCELLED';
              const isDraft = effectiveStatus === 'DRAFT';

              return (
                <div
                  key={challan.id}
                  data-testid={`challan-card-${challan.id}`}
                  className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-3.5 space-y-2.5 shadow-xs"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-outline-variant/20 pb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-black text-sm text-on-surface">
                        {challan.invoiceNumber}
                      </span>
                      {challan.isConverted && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
                          Billed
                        </span>
                      )}
                      {challan.challanType && (
                        <span className="text-[9px] font-semibold text-teal-700 dark:text-teal-400 bg-teal-500/10 px-1.5 py-0.2 rounded border border-teal-500/20">
                          {challan.challanType === 'SUPPLY_ON_APPROVAL'
                            ? 'Approval'
                            : challan.challanType === 'JOB_WORK'
                            ? 'Job Work'
                            : challan.challanType === 'OTHERS'
                            ? 'Others'
                            : 'Removal'}
                        </span>
                      )}
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                        isCancelled
                          ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25'
                          : isDelivered
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
                          : isDraft
                          ? 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/25'
                          : 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isCancelled
                            ? 'bg-rose-500'
                            : isDelivered
                            ? 'bg-emerald-500'
                            : isDraft
                            ? 'bg-slate-500'
                            : 'bg-sky-500'
                        }`}
                      />
                      <span>{effectiveStatus}</span>
                    </span>
                  </div>

                  <div className="flex justify-between items-start text-xs gap-2">
                    <div>
                      <div className="font-bold text-on-surface text-sm">{challan.partyName}</div>
                      {challan.consigneeName && challan.consigneeName !== challan.partyName && (
                        <div className="text-[11px] text-on-surface-variant">Ship to: {challan.consigneeName}</div>
                      )}
                      <div className="text-[11px] text-on-surface-variant mt-0.5">
                        Date: {formatDate(challan.date)}
                        {challan.vehicleNumber && ` • ${challan.vehicleNumber}`}
                      </div>
                      {challan.ewayBillNumber && (
                        <div className="text-[10px] font-mono text-secondary mt-0.5">
                          EWB: {challan.ewayBillNumber}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-extrabold text-on-surface tabular-nums">
                        {formatINR(challan.grandTotal)}
                      </div>
                      <div className="text-[10px] text-on-surface-variant font-medium">
                        {challan.items?.length || 0} items
                      </div>
                    </div>
                  </div>

                  {/* Mobile Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-outline-variant/20 text-xs">
                    <button
                      type="button"
                      onClick={() => onViewInvoice(challan)}
                      className="px-2.5 py-1 rounded-lg bg-surface-container text-on-surface font-semibold flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[15px]">print</span>
                      <span>Print</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      {!challan.isConverted && !isCancelled && (
                        <button
                          type="button"
                          onClick={() => setConfirmConvertDoc(challan)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600/15 text-emerald-800 dark:text-emerald-300 font-bold border border-emerald-600/30 flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[15px]">receipt_long</span>
                          <span>Convert to Invoice</span>
                        </button>
                      )}

                      {onEditInvoice && !challan.isConverted && !isCancelled && (
                        <button
                          type="button"
                          onClick={() => onEditInvoice(challan)}
                          className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container active:scale-95 transition-all cursor-pointer"
                          title="Edit"
                        >
                          <span className="material-symbols-outlined text-[16px]">edit</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setDocToDelete(challan)}
                        className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-500/15 active:scale-95 transition-all cursor-pointer"
                        title="Delete"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Date Filter Modal */}
      {isDateModalOpen && (
        <DateFilterModal
          isOpen={isDateModalOpen}
          activePreset={datePreset}
          customStartDate={customStart}
          customEndDate={customEnd}
          onClose={() => setIsDateModalOpen(false)}
          onSelectRange={(preset: DatePreset, start?: string, end?: string) => {
            setDatePreset(preset);
            setCustomStart(start || '');
            setCustomEnd(end || '');
            setIsDateModalOpen(false);
          }}
          accentColor="secondary"
        />
      )}

      {/* Convert to Tax Invoice Confirmation Dialog */}
      {confirmConvertDoc && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 shadow-2xl max-w-md w-full p-5 space-y-4 animate-scale-up">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-2xl">receipt_long</span>
              </div>
              <div>
                <h3 className="font-bold text-base text-on-surface">Convert to Tax Invoice</h3>
                <p className="text-xs text-on-surface-variant">
                  Generate official B2B/B2CS GST Tax Invoice from Challan #{confirmConvertDoc.invoiceNumber}
                </p>
              </div>
            </div>

            <div className="bg-surface-container-low rounded-xl p-3 text-xs space-y-1.5 border border-outline-variant/20">
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Customer:</span>
                <span className="font-bold text-on-surface">{confirmConvertDoc.partyName}</span>
              </div>
              {confirmDocDetails(confirmConvertDoc)}
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Line Items:</span>
                <span className="font-semibold text-on-surface">{confirmConvertDoc.items?.length || 0} items</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-outline-variant/20">
                <span className="font-bold text-on-surface">Invoice Total:</span>
                <span className="font-extrabold text-secondary tabular-nums">
                  {formatINR(confirmConvertDoc.grandTotal)}
                </span>
              </div>
            </div>

            <div className="text-[11px] text-on-surface-variant bg-amber-500/10 border border-amber-500/25 rounded-xl p-2.5">
              <strong>Accounting Note:</strong> Converting will assign a sequential Tax Invoice number, decrement inventory stock, and post to customer sales ledger.
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmConvertDoc(null)}
                disabled={isConverting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-on-surface-variant hover:bg-surface-container cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="confirm-convert-challan-btn"
                onClick={() => handleConvertChallan(confirmConvertDoc)}
                disabled={isConverting}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {isConverting ? (
                  <>
                    <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                    <span>Converting...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                    <span>Confirm & Generate Bill</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Challan Confirmation Dialog */}
      {docToCancel && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 shadow-2xl max-w-sm w-full p-5 space-y-4 animate-scale-up">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-700 dark:text-rose-300 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-2xl">cancel</span>
              </div>
              <div>
                <h3 className="font-bold text-base text-on-surface">Cancel Challan?</h3>
                <p className="text-xs text-on-surface-variant">
                  Challan #{docToCancel.invoiceNumber} will be marked as CANCELLED.
                </p>
              </div>
            </div>

            <p className="text-xs text-on-surface-variant">
              Are you sure you want to cancel this delivery challan? This action preserves the audit record with a cancelled state.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDocToCancel(null)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-on-surface-variant hover:bg-surface-container cursor-pointer transition-colors"
              >
                No, Keep
              </button>
              <button
                type="button"
                data-testid="confirm-cancel-challan-btn"
                onClick={() => handleCancelChallan(docToCancel)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 active:scale-95 transition-all shadow-xs cursor-pointer"
              >
                Yes, Cancel Challan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Challan Modal */}
      {docToDelete && (
        <ConfirmDeleteModal
          isOpen={Boolean(docToDelete)}
          title="Delete Delivery Challan?"
          description={`Are you sure you want to permanently delete Delivery Challan #${docToDelete.invoiceNumber} for ${docToDelete.partyName}?`}
          confirmText="Delete Challan"
          confirmButtonClass="bg-error text-on-error hover:bg-error/90"
          onConfirm={() => {
            onDeleteInvoice(docToDelete.id);
            setDocToDelete(null);
          }}
          onClose={() => setDocToDelete(null)}
        />
      )}
    </div>
  );
};

function confirmDocDetails(doc: Invoice) {
  return doc.vehicleNumber ? (
    <div className="flex justify-between">
      <span className="text-on-surface-variant">Vehicle:</span>
      <span className="font-mono font-bold text-on-surface">{doc.vehicleNumber}</span>
    </div>
  ) : null;
}
