import React, { useState, useMemo } from 'react';
import { PurchaseBill } from '../../models/purchase.ts';
import { Party } from '../../models/party.ts';
import { CompanyProfile } from '../../models/company.ts';
import { InventoryItem } from '../../models/item.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { TableGridPurchaseModal } from './TableGridPurchaseModal.tsx';
import { SimplifiedPurchaseModal } from './SimplifiedPurchaseModal.tsx';
import {
  DatePreset,
  getDateFilterBounds,
  isDateInRange,
  LedgerSortOption,
  LEDGER_SORT_LABELS,
} from '../../core/utils/dateFilters.ts';
import { DateFilterModal } from '../Common/DateFilterModal.tsx';

interface PurchasesHubViewProps {
  purchases: PurchaseBill[];
  parties: Party[];
  company: CompanyProfile;
  itemsCatalog: InventoryItem[];
  onSavePurchase: (bill: PurchaseBill) => void;
  onDeletePurchase: (id: string) => void;
  onEditPurchase?: (bill: PurchaseBill) => void;
  onAddNewParty?: () => void;
}

export const PurchasesHubView: React.FC<PurchasesHubViewProps> = ({
  purchases,
  parties,
  company,
  itemsCatalog,
  onSavePurchase,
  onDeletePurchase,
  onEditPurchase,
  onAddNewParty,
}) => {
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'UNPAID' | 'DUE' | 'PAID'>('ALL');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<PurchaseBill | null>(null);
  const [selectedBillForPreview, setSelectedBillForPreview] = useState<PurchaseBill | null>(null);

  // Sorting state - Defaults to NEWEST first as requested
  const [sortBy, setSortBy] = useState<LedgerSortOption>('NEWEST');
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);

  // Date Range Filter state - Interactive selectable date picker
  const [datePreset, setDatePreset] = useState<DatePreset>('ALL_TIME');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);

  // Active Date Bounds
  const dateRange = useMemo(() => {
    return getDateFilterBounds(datePreset, customStart, customEnd);
  }, [datePreset, customStart, customEnd]);

  // 1. Date Filter
  const dateFilteredPurchases = useMemo(() => {
    if (!dateRange.start && !dateRange.end) return purchases;
    return purchases.filter((p) => isDateInRange(p.date, dateRange.start, dateRange.end));
  }, [purchases, dateRange]);

  // Financial Metrics dynamically calculated on active date period
  const totalPurchases = dateFilteredPurchases.reduce((s, p) => s + p.grandTotal, 0);
  const unpaidPurchases = dateFilteredPurchases.filter((p) => p.paymentStatus !== 'PAID');
  const totalToPay = unpaidPurchases.reduce((s, p) => s + (p.balanceAmount || p.grandTotal), 0);
  const totalItcClaimable = dateFilteredPurchases
    .filter((p) => p.itcEligibility !== 'INELIGIBLE_17_5')
    .reduce((s, p) => s + p.totalTax, 0);

  // 2. Search & Status Filter
  const statusFiltered = useMemo(() => {
    return dateFilteredPurchases.filter((p) => {
      const q = search.trim().toLowerCase();
      const matchesSearch = !q ||
        p.billNumber.toLowerCase().includes(q) ||
        p.supplierName.toLowerCase().includes(q) ||
        (p.supplierGstin && p.supplierGstin.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (filterStatus === 'UNPAID') return p.paymentStatus === 'UNPAID';
      if (filterStatus === 'DUE') return p.paymentStatus === 'PARTIAL' || (p.paymentStatus === 'UNPAID' && (p.balanceAmount || 0) > 0);
      if (filterStatus === 'PAID') return p.paymentStatus === 'PAID';
      return true;
    });
  }, [dateFilteredPurchases, search, filterStatus]);

  // 3. Sort - Defaults to NEWEST first
  const sortedPurchases = useMemo(() => {
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
          return (b.billNumber || '').localeCompare(a.billNumber || '', undefined, { numeric: true });
        default:
          return 0;
      }
    });
  }, [statusFiltered, sortBy]);



  const handleQuickPay = (bill: PurchaseBill) => {
    const updated: PurchaseBill = {
      ...bill,
      paidAmount: bill.grandTotal,
      balanceAmount: 0,
      paymentStatus: 'PAID',
      updatedAt: new Date().toISOString(),
    };
    onSavePurchase(updated);
  };

  return (
    <div className="flex flex-col w-full pb-28 max-w-7xl mx-auto px-margin-mobile md:px-6 py-3 gap-space-sm">
      {/* Header, Metrics & Controls Strip */}
      <div className="pt-1.5 pb-1 flex flex-col gap-2">
        {/* Row 1: Title + Date Range Selector Pill */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
            <span className="text-sm font-bold text-on-surface">Purchase Ledger</span>
          </div>

          {/* Date Range Selector Pill */}
          <button
            type="button"
            onClick={() => setIsDateModalOpen(true)}
            className={`h-7 flex items-center gap-1 px-2.5 rounded-lg shadow-xs text-[11px] font-bold cursor-pointer border transition-all shrink-0 ${
              datePreset !== 'ALL_TIME'
                ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30'
                : 'bg-surface-container-lowest text-on-surface-variant border-outline-variant/25 hover:bg-surface-container-low'
            }`}
            title="Filter by date range"
          >
            <span className="material-symbols-outlined text-[13px] text-orange-600 dark:text-orange-400">calendar_month</span>
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
          {/* Purchase Total Card */}
          <div className="bg-surface-container-lowest rounded-xl p-2.5 sm:p-3 border border-outline-variant/20 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-outline text-[11px] font-bold">
              <span className="uppercase tracking-wider">Purchase Total</span>
              <span className="text-[10px] bg-surface-container-low px-1.5 py-0.2 rounded font-semibold text-on-surface-variant">
                {dateFilteredPurchases.length} {dateFilteredPurchases.length === 1 ? 'bill' : 'bills'}
              </span>
            </div>
            <div className="mt-1 text-base sm:text-lg font-black text-on-surface tabular-nums tracking-tight">
              {formatINR(totalPurchases)}
            </div>
          </div>

          {/* Total to Pay Card */}
          <div className="bg-surface-container-lowest rounded-xl p-2.5 sm:p-3 border border-outline-variant/20 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-error text-[11px] font-bold">
              <span className="uppercase tracking-wider">Total to Pay</span>
              {unpaidPurchases.length > 0 ? (
                <span className="text-[10px] bg-error/10 px-1.5 py-0.2 rounded font-bold text-error">
                  {unpaidPurchases.length} due
                </span>
              ) : (
                <span className="text-[10px] bg-secondary/10 px-1.5 py-0.2 rounded font-bold text-secondary">
                  Settled
                </span>
              )}
            </div>
            <div className={`mt-1 text-base sm:text-lg font-black tabular-nums tracking-tight ${totalToPay > 0 ? 'text-error' : 'text-on-surface'}`}>
              {formatINR(totalToPay)}
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
              className="w-full h-7 pl-7 pr-6 bg-surface-container-lowest text-on-surface text-xs rounded-lg shadow-xs border border-outline-variant/25 placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-orange-500/40"
              placeholder="Search bill, supplier..."
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
              <span className="material-symbols-outlined text-[14px] text-orange-600 dark:text-orange-400">sort</span>
              <span className="material-symbols-outlined text-[13px] text-outline">arrow_drop_down</span>
            </button>

            {isSortDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsSortDropdownOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-surface-container-lowest rounded-xl shadow-xl border border-outline-variant/30 py-1 overflow-hidden animate-fade-in">
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-outline border-b border-outline-variant/15">
                    Sort Purchase Ledger
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
                          isSelected ? 'text-orange-600 dark:text-orange-400 font-bold bg-orange-500/5' : 'text-on-surface'
                        }`}
                      >
                        <span>{LEDGER_SORT_LABELS[key]}</span>
                        {isSelected && (
                          <span className="material-symbols-outlined text-[15px] text-orange-600 dark:text-orange-400">
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
            onClick={() => setFilterStatus('ALL')}
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
              filterStatus === 'ALL'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/25'
            }`}
            type="button"
          >
            <span>All</span>
            <span className="text-[10px] opacity-80">({dateFilteredPurchases.length})</span>
          </button>

          <button
            onClick={() => setFilterStatus('UNPAID')}
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
              filterStatus === 'UNPAID'
                ? 'bg-error text-on-error shadow-xs'
                : 'bg-surface-container-lowest text-error border border-outline-variant/25'
            }`}
            type="button"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-error" />
            <span>Due</span>
            <span className="text-[10px] opacity-90 font-bold">({unpaidPurchases.length})</span>
          </button>

          <button
            onClick={() => setFilterStatus('PAID')}
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
              filterStatus === 'PAID'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/25'
            }`}
            type="button"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
            <span>Settled</span>
            <span className="text-[10px] opacity-80">({dateFilteredPurchases.filter((p) => p.paymentStatus === 'PAID').length})</span>
          </button>
        </div>
      </div>

      {/* 4. Purchase Bills List Stream (Slim Passbook Cards) */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
        {sortedPurchases.length === 0 ? (
          <div className="md:col-span-2 bg-surface-container-lowest rounded-2xl p-8 text-center text-on-surface-variant border border-outline-variant/20 shadow-xs">
            No purchase records found.
          </div>
        ) : (
          sortedPurchases.map((bill) => {
            const isUnpaid = bill.paymentStatus === 'UNPAID';
            const isPartial = bill.paymentStatus === 'PARTIAL';
            const isPaid = bill.paymentStatus === 'PAID';
            const dueAmt = bill.balanceAmount || (isUnpaid ? bill.grandTotal : 0);

            return (
              <div
                key={bill.id}
                onClick={() => setSelectedBillForPreview(bill)}
                className="bg-surface-container-lowest rounded-xl p-2.5 sm:p-3 shadow-xs border border-outline-variant/20 flex flex-col gap-1.5 hover:border-orange-500/40 active:scale-[0.99] transition-all cursor-pointer"
              >
                {/* Line 1: Supplier Name & Bill # (left) | Grand Total (right) */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className="font-bold text-xs sm:text-sm text-on-surface truncate">
                      {bill.supplierName}
                    </span>
                    <span className="text-[10px] font-semibold text-orange-600 dark:text-orange-400 shrink-0 bg-orange-500/10 px-1.5 py-0.2 rounded">
                      #{bill.billNumber}
                    </span>
                  </div>
                  <span className="font-extrabold text-xs sm:text-sm text-on-surface whitespace-nowrap tabular-nums shrink-0">
                    {formatINR(bill.grandTotal)}
                  </span>
                </div>

                {/* Line 2: Date & Items count (left) | Due amount + Quick Pay button on a single line (right) */}
                <div className="flex items-center justify-between gap-2 text-[11px] text-on-surface-variant">
                  <div className="flex items-center gap-1.5 min-w-0 truncate text-[11px]">
                    <span>{formatDate(bill.date)}</span>
                    <span>•</span>
                    <span className="truncate">{bill.items?.length || 0} {bill.items?.length === 1 ? 'item' : 'items'}</span>
                    {bill.totalTax > 0 && (
                      <>
                        <span>•</span>
                        <span className="font-semibold text-orange-600 dark:text-orange-400">+{formatINR(bill.totalTax)} ITC</span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {(isUnpaid || isPartial) ? (
                      <>
                        <span className="text-[11px] font-bold text-error whitespace-nowrap tabular-nums">
                          Due {formatINR(dueAmt)}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickPay(bill);
                          }}
                          className="h-6 px-2 rounded-md bg-error/15 hover:bg-error/25 text-error font-bold text-[10px] cursor-pointer active:scale-95 transition-all flex items-center gap-0.5"
                        >
                          <span className="material-symbols-outlined text-[12px]">payments</span>
                          <span>Pay</span>
                        </button>
                      </>
                    ) : (
                      <span className="text-[10px] font-bold text-secondary flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-[13px]">check_circle</span>
                        <span>Settled</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* Floating Action Button for New Purchase */}
      <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40">
        <button
          onClick={() => {
            setEditingBill(null);
            setIsModalOpen(true);
          }}
          className="h-11 px-4 rounded-full bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-lg flex items-center gap-1.5 active:scale-95 transition-transform cursor-pointer border border-white/10"
          type="button"
          title="Create New Purchase Bill"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          <span>+ Purchase</span>
        </button>
      </div>

      {/* Table Grid Purchase Workstation Modal */}
      {(isModalOpen || editingBill) && (
        <TableGridPurchaseModal
          company={company}
          parties={parties}
          itemsCatalog={itemsCatalog}
          initialBill={editingBill}
          onClose={() => {
            setIsModalOpen(false);
            setEditingBill(null);
          }}
          onSave={(newBill) => {
            onSavePurchase(newBill);
            setIsModalOpen(false);
            setEditingBill(null);
          }}
          onAddNewParty={() => {
            if (onAddNewParty) onAddNewParty();
          }}
        />
      )}

      {/* Simplified Mobile Purchase Bill Preview Modal */}
      {selectedBillForPreview && (
        <SimplifiedPurchaseModal
          bill={selectedBillForPreview}
          company={company}
          onClose={() => setSelectedBillForPreview(null)}
          onEditPurchase={(bill) => {
            setSelectedBillForPreview(null);
            if (onEditPurchase) {
              onEditPurchase(bill);
            } else {
              setEditingBill(bill);
            }
          }}
          onDeletePurchase={(id) => {
            setSelectedBillForPreview(null);
            onDeletePurchase(id);
          }}
        />
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
        accentColor="orange-500"
      />
    </div>
  );
};
