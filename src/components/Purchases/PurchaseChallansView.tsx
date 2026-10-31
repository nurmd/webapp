import React, { useState, useMemo } from 'react';
import { PurchaseBill } from '../../models/purchase.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR, formatDate, formatQuantity } from '../../core/utils/formatters.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import {
  DatePreset,
  getDateFilterBounds,
  isDateInRange,
  LedgerSortOption,
  LEDGER_SORT_LABELS,
} from '../../core/utils/dateFilters.ts';
import { DateFilterModal } from '../Common/DateFilterModal.tsx';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal.tsx';
import { canConvertPurchaseChallan, convertPurchaseChallanToBill } from '../../core/utils/documentConversion.ts';
import { showAppToast } from '../../services/toast.ts';
import { db } from '../../services/db.ts';

export interface PurchaseChallansViewProps {
  company: CompanyProfile;
  purchases: PurchaseBill[];
  onNewPurchaseChallan: () => void;
  onViewPurchase?: (bill: PurchaseBill) => void;
  onEditPurchase?: (bill: PurchaseBill) => void;
  onDeletePurchase: (id: string) => void;
  onRefresh?: () => void;
}

export const PurchaseChallansView: React.FC<PurchaseChallansViewProps> = ({
  company,
  purchases,
  onNewPurchaseChallan,
  onViewPurchase,
  onEditPurchase,
  onDeletePurchase,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'ALL' | 'RECEIVED' | 'IN_TRANSIT' | 'DRAFT' | 'CANCELLED'>('ALL');
  const [search, setSearch] = useState('');
  const [confirmConvertDoc, setConfirmConvertDoc] = useState<PurchaseBill | null>(null);
  const [docToDelete, setDocToDelete] = useState<PurchaseBill | null>(null);
  const [docToCancel, setDocToCancel] = useState<PurchaseBill | null>(null);

  // Sorting
  const [sortBy, setSortBy] = useState<LedgerSortOption>('NEWEST');
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);

  // Date Filter
  const [datePreset, setDatePreset] = useState<DatePreset>('ALL_TIME');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);

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

  // 1. Filter only Purchase Challans
  const challanList = useMemo(() => {
    return purchases.filter((p) => p.purchaseType === 'CHALLAN');
  }, [purchases]);

  // 2. Date Filtering Bounds
  const dateRange = useMemo(() => {
    return getDateFilterBounds(datePreset, customStart, customEnd);
  }, [datePreset, customStart, customEnd]);

  const dateFiltered = useMemo(() => {
    if (!dateRange.start && !dateRange.end) return challanList;
    return challanList.filter((c) => isDateInRange(c.date, dateRange.start, dateRange.end));
  }, [challanList, dateRange]);

  // KPI Metrics
  const totalValue = dateFiltered.reduce((sum, c) => sum + c.grandTotal, 0);
  const receivedList = dateFiltered.filter(
    (c) => (c.challanStatus || 'RECEIVED') === 'RECEIVED' && !c.isCancelled
  );
  const receivedValue = receivedList.reduce((sum, c) => sum + c.grandTotal, 0);
  const inTransitList = dateFiltered.filter(
    (c) => c.challanStatus === 'IN_TRANSIT' && !c.isCancelled && !c.isConverted
  );
  const inTransitValue = inTransitList.reduce((sum, c) => sum + c.grandTotal, 0);
  const convertedList = dateFiltered.filter((c) => Boolean(c.isConverted));
  const convertedValue = convertedList.reduce((sum, c) => sum + c.grandTotal, 0);

  // 3. Search and Status Tab Filter (Invariant #3: Word-level substring matching)
  const statusFiltered = useMemo(() => {
    return dateFiltered.filter((c) => {
      const q = search.trim().toLowerCase();
      if (q) {
        const tokens = q.split(/\s+/).filter(Boolean);
        const searchableText = [
          c.billNumber,
          c.supplierName,
          c.supplierGstin,
          c.vehicleNumber,
          c.transporterName,
          c.lrNumber,
          c.ewayBillNumber,
          c.convertedToBillNumber,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        const matchesAll = tokens.every((token) => searchableText.includes(token));
        if (!matchesAll) return false;
      }

      const effectiveStatus = c.isCancelled
        ? 'CANCELLED'
        : (c.challanStatus || 'RECEIVED');

      if (activeTab === 'RECEIVED') return effectiveStatus === 'RECEIVED' && !c.isCancelled;
      if (activeTab === 'IN_TRANSIT') return effectiveStatus === 'IN_TRANSIT' && !c.isCancelled;
      if (activeTab === 'DRAFT') return effectiveStatus === 'DRAFT' && !c.isCancelled;
      if (activeTab === 'CANCELLED') return effectiveStatus === 'CANCELLED' || c.isCancelled;
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
        case 'NAME_AZ':
          return (a.supplierName || '').localeCompare(b.supplierName || '');
        case 'NAME_ZA':
          return (b.supplierName || '').localeCompare(a.supplierName || '');
        case 'DOC_NUM':
          return (a.billNumber || '').localeCompare(b.billNumber || '');
        default:
          return 0;
      }
    });
  }, [statusFiltered, sortBy]);

  // 1-Tap Convert to Inward Purchase Bill
  const handleConvertChallan = async (challan: PurchaseBill) => {
    try {
      const newBill = await convertPurchaseChallanToBill(challan, company);
      showAppToast(
        `Challan #${challan.billNumber} converted to Bill #${newBill.billNumber}. Stock retained, vendor payable recorded.`
      );
      setConfirmConvertDoc(null);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error('Failed to convert purchase challan:', err);
      showAppToast(err.message || 'Failed to convert purchase challan.');
    }
  };

  // Cancel Challan (reverts stock without deleting document history)
  const handleCancelChallan = (challan: PurchaseBill) => {
    try {
      const updated: PurchaseBill = {
        ...challan,
        isCancelled: true,
        challanStatus: 'CANCELLED',
        updatedAt: new Date().toISOString(),
      };
      db.savePurchase(updated);
      showAppToast(`Purchase Challan #${challan.billNumber} cancelled. Inward stock reverted.`);
      setDocToCancel(null);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error('Failed to cancel purchase challan:', err);
      showAppToast(err.message || 'Failed to cancel purchase challan.');
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-surface w-full animate-fade-in">
      {/* Top Header */}
      <div className="bg-surface-container-lowest border-b border-outline-variant/30 px-3 sm:px-6 py-3.5 flex items-center justify-between gap-3 sticky top-0 z-20">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-teal-500/15 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[22px]">move_to_inbox</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-on-surface truncate">
                Purchase Challans (GRN)
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20 shrink-0">
                Inward Stock
              </span>
            </div>
            <p className="text-xs text-on-surface-variant truncate">
              Goods receipt notes, physical inventory inwarding & bill conversion
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onNewPurchaseChallan}
          className="h-10 px-3.5 sm:px-4 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-95 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-md shadow-teal-600/25 transition-all cursor-pointer shrink-0"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          <span>New Challan</span>
        </button>
      </div>

      {/* Main Body */}
      <div className="px-3 sm:px-6 py-4 flex flex-col gap-4 max-w-7xl w-full mx-auto pb-28">
        {/* KPI Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          {/* Total Inward */}
          <div className="p-3 sm:p-3.5 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 flex flex-col justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-outline flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-teal-600">move_to_inbox</span>
              Total Inward
            </span>
            <div className="mt-1 flex items-baseline justify-between gap-1">
              <span className="text-base sm:text-lg font-bold text-on-surface">
                {formatINR(totalValue)}
              </span>
              <span className="text-[10px] font-semibold text-on-surface-variant">
                {dateFiltered.length} Docs
              </span>
            </div>
          </div>

          {/* Received in Stock */}
          <div className="p-3 sm:p-3.5 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 flex flex-col justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-outline flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-emerald-600">inventory</span>
              In Stock
            </span>
            <div className="mt-1 flex items-baseline justify-between gap-1">
              <span className="text-base sm:text-lg font-bold text-emerald-700 dark:text-emerald-400">
                {formatINR(receivedValue)}
              </span>
              <span className="text-[10px] font-semibold text-emerald-600">
                {receivedList.length} Received
              </span>
            </div>
          </div>

          {/* In Transit */}
          <div className="p-3 sm:p-3.5 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 flex flex-col justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-outline flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-blue-600">local_shipping</span>
              In Transit
            </span>
            <div className="mt-1 flex items-baseline justify-between gap-1">
              <span className="text-base sm:text-lg font-bold text-blue-700 dark:text-blue-400">
                {formatINR(inTransitValue)}
              </span>
              <span className="text-[10px] font-semibold text-blue-600">
                {inTransitList.length} Active
              </span>
            </div>
          </div>

          {/* Converted to Bill */}
          <div className="p-3 sm:p-3.5 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 flex flex-col justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-outline flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-purple-600">receipt_long</span>
              Converted
            </span>
            <div className="mt-1 flex items-baseline justify-between gap-1">
              <span className="text-base sm:text-lg font-bold text-purple-700 dark:text-purple-400">
                {formatINR(convertedValue)}
              </span>
              <span className="text-[10px] font-semibold text-purple-600">
                {convertedList.length} Billed
              </span>
            </div>
          </div>
        </div>

        {/* Filter Toolbar (Sticky Search + Filter Chips) */}
        <div className="flex flex-col gap-2.5 bg-surface-container-low/50 p-2.5 rounded-2xl border border-outline-variant/20">
          <div className="flex items-center gap-2">
            {/* Search Input with 1-Tap Clear */}
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">
                search
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search challan #, supplier, vehicle, transporter, LR..."
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-xl pl-9 pr-9 py-2 text-xs text-on-surface placeholder:text-outline outline-none focus:border-teal-500 transition-colors"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              )}
            </div>

            {/* Date Preset Filter */}
            <button
              type="button"
              onClick={() => setIsDateModalOpen(true)}
              className="h-9 px-3 rounded-xl bg-surface-container-lowest border border-outline-variant/30 hover:bg-surface-container active:scale-95 text-xs font-semibold text-on-surface flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
            >
              <span className="material-symbols-outlined text-[16px] text-teal-600">date_range</span>
              <span className="hidden sm:inline">
                {datePreset === 'ALL_TIME' ? 'All Time' : datePreset.replace('_', ' ')}
              </span>
            </button>

            {/* Sort Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsSortDropdownOpen((prev) => !prev)}
                className="h-9 px-2.5 sm:px-3 rounded-xl bg-surface-container-lowest border border-outline-variant/30 hover:bg-surface-container active:scale-95 text-xs font-semibold text-on-surface flex items-center gap-1 transition-all cursor-pointer shrink-0"
                title="Sort Challans"
              >
                <span className="material-symbols-outlined text-[16px] text-outline">sort</span>
                <span className="hidden sm:inline">{LEDGER_SORT_LABELS[sortBy] || 'Sort'}</span>
              </button>

              {isSortDropdownOpen && (
                <div className="absolute right-0 top-11 w-44 rounded-xl bg-surface-container-lowest shadow-xl border border-outline-variant/30 py-1 z-30 animate-scale-in">
                  {(Object.keys(LEDGER_SORT_LABELS) as LedgerSortOption[]).map((optionKey) => (
                    <button
                      key={optionKey}
                      type="button"
                      onClick={() => {
                        setSortBy(optionKey);
                        setIsSortDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs font-medium flex items-center justify-between hover:bg-surface-container transition-colors ${
                        sortBy === optionKey ? 'text-teal-600 font-bold bg-teal-500/10' : 'text-on-surface'
                      }`}
                    >
                      <span>{LEDGER_SORT_LABELS[optionKey]}</span>
                      {sortBy === optionKey && (
                        <span className="material-symbols-outlined text-[14px]">check</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            {(
              [
                { id: 'ALL', label: 'All', count: dateFiltered.length },
                { id: 'RECEIVED', label: 'Received (In Stock)', count: receivedList.length },
                { id: 'IN_TRANSIT', label: 'In Transit', count: inTransitList.length },
                { id: 'DRAFT', label: 'Draft', count: dateFiltered.filter((c) => c.challanStatus === 'DRAFT' && !c.isCancelled).length },
                { id: 'CANCELLED', label: 'Cancelled', count: dateFiltered.filter((c) => c.isCancelled || c.challanStatus === 'CANCELLED').length },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container border border-outline-variant/20'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-surface-container text-outline'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Challans List */}
        {sortedChallans.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-surface-container-lowest border border-outline-variant/30 flex flex-col items-center justify-center gap-2">
            <div className="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-[28px]">inventory_2</span>
            </div>
            <h3 className="font-bold text-sm text-on-surface">No Purchase Challans Found</h3>
            <p className="text-xs text-on-surface-variant max-w-sm">
              {search || activeTab !== 'ALL' || datePreset !== 'ALL_TIME'
                ? 'No inward goods receipt notes match the active search or filter criteria.'
                : 'Create your first Purchase Challan (GRN) to verify and receive inward inventory physical stock.'}
            </p>
            {search || activeTab !== 'ALL' || datePreset !== 'ALL_TIME' ? (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setActiveTab('ALL');
                  setDatePreset('ALL_TIME');
                }}
                className="mt-2 text-xs font-bold text-teal-600 hover:underline cursor-pointer"
              >
                Reset Filters
              </button>
            ) : (
              <button
                type="button"
                onClick={onNewPurchaseChallan}
                className="mt-2 h-9 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer"
              >
                + New Purchase Challan
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {sortedChallans.map((challan) => {
              const isCancelled = Boolean(challan.isCancelled || challan.challanStatus === 'CANCELLED');
              const isConverted = Boolean(challan.isConverted);
              const totalItems = challan.items ? challan.items.length : 0;
              const totalUnits = (challan.items || []).reduce((sum, it) => sum + (it.quantity || 0), 0);

              return (
                <div
                  key={challan.id}
                  className={`p-3.5 sm:p-4 rounded-2xl bg-surface-container-lowest border transition-all ${
                    isCancelled
                      ? 'border-error/30 opacity-75'
                      : isConverted
                      ? 'border-purple-500/30'
                      : 'border-outline-variant/30 hover:border-teal-500/50 hover:shadow-xs'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Left Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                        <span className="font-mono font-bold text-sm text-on-surface whitespace-nowrap shrink-0">
                          #{challan.billNumber}
                        </span>

                        {/* GRN Tag */}
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20 whitespace-nowrap shrink-0">
                          GRN
                        </span>

                        {/* Status Badges */}
                        {isCancelled ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-error/15 text-error whitespace-nowrap shrink-0">
                            Cancelled
                          </span>
                        ) : isConverted ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-700 dark:text-purple-300 flex items-center gap-1 whitespace-nowrap shrink-0">
                            <span className="material-symbols-outlined text-[12px]">check</span>
                            Billed #{challan.convertedToBillNumber || ''}
                          </span>
                        ) : challan.challanStatus === 'IN_TRANSIT' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-700 dark:text-blue-300">
                            In Transit
                          </span>
                        ) : challan.challanStatus === 'DRAFT' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/15 text-slate-700 dark:text-slate-300">
                            Draft
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px]">check_circle</span>
                            In Stock
                          </span>
                        )}
                      </div>

                      {/* Supplier & Date */}
                      <div className="mt-1 flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs">
                        <span className="font-bold text-on-surface truncate">
                          {challan.supplierName || 'Unknown Supplier'}
                        </span>
                        {challan.supplierGstin && (
                          <span className="font-mono text-[10px] text-outline">
                            GSTIN: {challan.supplierGstin}
                          </span>
                        )}
                        <span className="text-[11px] text-on-surface-variant">
                          • Date: {formatDate(challan.date)}
                        </span>
                      </div>

                      {/* Transport Metadata Strip */}
                      {(challan.vehicleNumber || challan.transporterName || challan.lrNumber || challan.ewayBillNumber) && (
                        <div className="mt-2 flex items-center flex-wrap gap-2 text-[10px] text-on-surface-variant bg-surface-container-low/60 px-2.5 py-1 rounded-lg">
                          {challan.vehicleNumber && (
                            <span className="flex items-center gap-1 font-mono font-bold">
                              <span className="material-symbols-outlined text-[12px] text-teal-600">directions_car</span>
                              {challan.vehicleNumber}
                            </span>
                          )}
                          {challan.transporterName && (
                            <span className="flex items-center gap-1">
                              <span className="material-symbols-outlined text-[12px] text-teal-600">forklift</span>
                              {challan.transporterName}
                            </span>
                          )}
                          {challan.lrNumber && (
                            <span className="font-mono">LR: {challan.lrNumber}</span>
                          )}
                          {challan.ewayBillNumber && (
                            <span className="font-mono">EWB: {challan.ewayBillNumber}</span>
                          )}
                        </div>
                      )}

                      {/* Line Item Summary */}
                      <div className="mt-2 text-[11px] text-on-surface-variant flex items-center gap-2">
                        <span>{totalItems} item{totalItems === 1 ? '' : 's'}</span>
                        <span>•</span>
                        <span>{formatQuantity(totalUnits)} units received</span>
                      </div>
                    </div>

                    {/* Right Amount & Actions */}
                    <div className="flex flex-col items-end justify-between shrink-0 self-stretch">
                      <div className="text-right">
                        <span className="text-sm sm:text-base font-bold text-on-surface block">
                          {formatINR(challan.grandTotal)}
                        </span>
                        <span className="text-[10px] font-semibold text-outline block">
                          GRN Value
                        </span>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-1.5 mt-2">
                        {/* 1-Tap Convert to Bill */}
                        {canConvertPurchaseChallan(challan) && (
                          <button
                            type="button"
                            onClick={() => setConfirmConvertDoc(challan)}
                            className="h-8 px-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1 shadow-xs cursor-pointer transition-all"
                            title="Convert to Inward Purchase Bill"
                          >
                            <span className="material-symbols-outlined text-[15px]">receipt_long</span>
                            <span className="hidden sm:inline">Convert to Bill</span>
                          </button>
                        )}

                        {/* View Preview */}
                        {onViewPurchase && (
                          <button
                            type="button"
                            onClick={() => onViewPurchase(challan)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container active:scale-95 transition-all cursor-pointer"
                            title="View Challan Details"
                            aria-label="View Challan Details"
                          >
                            <span className="material-symbols-outlined text-[18px]">visibility</span>
                          </button>
                        )}

                        {/* Edit Challan */}
                        {onEditPurchase && !isConverted && !isCancelled && (
                          <button
                            type="button"
                            onClick={() => onEditPurchase(challan)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container active:scale-95 transition-all cursor-pointer"
                            title="Edit Purchase Challan"
                            aria-label="Edit Purchase Challan"
                          >
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                          </button>
                        )}

                        {/* Cancel Challan */}
                        {!isConverted && !isCancelled && (
                          <button
                            type="button"
                            onClick={() => setDocToCancel(challan)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-outline hover:text-amber-600 hover:bg-amber-500/10 active:scale-95 transition-all cursor-pointer"
                            title="Cancel Challan (reverts stock)"
                            aria-label="Cancel Purchase Challan"
                          >
                            <span className="material-symbols-outlined text-[18px]">block</span>
                          </button>
                        )}

                        {/* Delete Challan */}
                        <button
                          type="button"
                          onClick={() => setDocToDelete(challan)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-outline hover:text-error hover:bg-error/10 active:scale-95 transition-all cursor-pointer"
                          title="Delete Purchase Challan"
                          aria-label="Delete Purchase Challan"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Date Filter Modal */}
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
        }}
      />

      {/* Confirm Conversion Dialog */}
      {confirmConvertDoc && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-surface-container-lowest rounded-2xl w-full max-w-sm shadow-2xl border border-outline-variant/30 p-5 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500/15 text-teal-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[22px]">receipt_long</span>
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-sm text-on-surface">Convert to Purchase Bill?</h3>
                <span className="text-xs text-on-surface-variant font-mono">
                  Challan #{confirmConvertDoc.billNumber}
                </span>
              </div>
            </div>

            <p className="text-xs text-on-surface-variant leading-relaxed">
              This will generate an official inward Purchase Bill with accounts payable liability for supplier{' '}
              <strong className="text-on-surface">{confirmConvertDoc.supplierName}</strong> ({formatINR(confirmConvertDoc.grandTotal)}).
              Physical inventory stock will <strong className="text-on-surface">not be duplicated</strong> because it was already received on this challan.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
              <button
                type="button"
                onClick={() => setConfirmConvertDoc(null)}
                className="px-3 py-1.5 rounded-xl border border-outline-variant/30 text-xs font-semibold hover:bg-surface-container text-on-surface cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConvertChallan(confirmConvertDoc)}
                className="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:scale-95 text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                Convert Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Cancellation Dialog */}
      {docToCancel && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in">
          <div className="bg-surface-container-lowest rounded-2xl w-full max-w-sm shadow-2xl border border-outline-variant/30 p-5 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[22px]">block</span>
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-sm text-on-surface">Cancel Purchase Challan?</h3>
                <span className="text-xs text-on-surface-variant font-mono">
                  Challan #{docToCancel.billNumber}
                </span>
              </div>
            </div>

            <p className="text-xs text-on-surface-variant leading-relaxed">
              Cancelling this Goods Receipt Note will revert all received physical stock back out of inventory. The document record is preserved for audit trail.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-outline-variant/20">
              <button
                type="button"
                onClick={() => setDocToCancel(null)}
                className="px-3 py-1.5 rounded-xl border border-outline-variant/30 text-xs font-semibold hover:bg-surface-container text-on-surface cursor-pointer"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={() => handleCancelChallan(docToCancel)}
                className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-95 text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Dialog */}
      {docToDelete && (
        <ConfirmDeleteModal
          isOpen={Boolean(docToDelete)}
          title="Delete Purchase Challan?"
          description={`Are you sure you want to permanently delete Purchase Challan #${docToDelete.billNumber}? If unconverted, inward physical stock will be reverted.`}
          confirmText="Delete Challan"
          confirmButtonClass="bg-error text-on-error hover:bg-error/90"
          onClose={() => setDocToDelete(null)}
          onConfirm={() => {
            const id = docToDelete.id;
            const num = docToDelete.billNumber;
            setDocToDelete(null);
            onDeletePurchase(id);
            showAppToast(`Purchase Challan #${num} deleted.`);
            if (onRefresh) onRefresh();
          }}
        />
      )}
    </div>
  );
};
