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
      {/* Header Banner */}
      <div className="pt-space-xs pb-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />
            <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
              Purchase Ledger
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsDateModalOpen(true)}
            className="flex items-center gap-1.5 bg-surface-container-low hover:bg-surface-container active:scale-95 px-3 py-1.5 rounded-full shadow-xs text-xs font-semibold cursor-pointer border border-outline-variant/30 transition-all"
          >
            <span className="material-symbols-outlined text-[16px] text-orange-600 dark:text-orange-400">
              calendar_month
            </span>
            <span className="text-on-surface font-bold text-xs">{dateRange.label}</span>
            <span className="material-symbols-outlined text-[16px] text-outline">
              arrow_drop_down
            </span>
          </button>
        </div>

        {/* Compact 3-Column Financial Summary Strip */}
        <div className="grid grid-cols-3 gap-2 mt-2">
          <div className="bg-surface-container-lowest rounded-xl p-2.5 border border-outline-variant/25 shadow-xs flex flex-col">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider truncate">
              Purchases
            </span>
            <span className="font-extrabold text-xs sm:text-sm text-on-surface mt-0.5 truncate">
              {formatINR(totalPurchases)}
            </span>
            <span className="text-[10px] text-on-surface-variant truncate">
              {dateFilteredPurchases.length} Bills
            </span>
          </div>

          <div className="bg-surface-container-lowest rounded-xl p-2.5 border border-outline-variant/25 shadow-xs flex flex-col">
            <span className="text-[10px] font-bold text-error uppercase tracking-wider truncate">
              To Pay
            </span>
            <span className="font-extrabold text-xs sm:text-sm text-error mt-0.5 truncate">
              {formatINR(totalToPay)}
            </span>
            <span className="text-[10px] text-error font-medium truncate">
              {unpaidPurchases.length} Pending
            </span>
          </div>

          <div className="bg-surface-container-lowest rounded-xl p-2.5 border border-outline-variant/25 shadow-xs flex flex-col">
            <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider truncate">
              ITC Credit
            </span>
            <span className="font-extrabold text-xs sm:text-sm text-orange-600 dark:text-orange-400 mt-0.5 truncate">
              {formatINR(totalItcClaimable)}
            </span>
            <span className="text-[10px] text-orange-600/80 dark:text-orange-400/80 font-medium truncate">
              Eligible
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
              className="w-full h-10 pl-9 pr-8 bg-surface-container-lowest text-on-surface text-xs rounded-xl shadow-xs border border-outline-variant/30 placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-orange-500/40"
              placeholder="Search bill, supplier..."
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
            onClick={() => {
              setEditingBill(null);
              setIsModalOpen(true);
            }}
            className="h-10 px-3.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs active:scale-95 transition-all flex-shrink-0 cursor-pointer"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>Purchase</span>
          </button>
        </div>

        {/* Filter Segmented Pills & Sort Control Row */}
        <div className="flex items-center justify-between gap-2 py-1 mt-1.5 flex-wrap">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <button
              onClick={() => setFilterStatus('ALL')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                filterStatus === 'ALL'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30'
              }`}
              type="button"
            >
              <span>All</span>
              <span className="text-[10px] opacity-80">({dateFilteredPurchases.length})</span>
            </button>

            <button
              onClick={() => setFilterStatus('UNPAID')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                filterStatus === 'UNPAID'
                  ? 'bg-error text-on-error shadow-xs'
                  : 'bg-surface-container-lowest text-error border border-outline-variant/30'
              }`}
              type="button"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-error" />
              <span>Due</span>
              <span className="text-[10px] opacity-90 font-bold">({unpaidPurchases.length})</span>
            </button>

            <button
              onClick={() => setFilterStatus('PAID')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                filterStatus === 'PAID'
                  ? 'bg-orange-600 text-white shadow-xs'
                  : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30'
              }`}
              type="button"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
              <span>Settled</span>
              <span className="text-[10px] opacity-80">({dateFilteredPurchases.filter((p) => p.paymentStatus === 'PAID').length})</span>
            </button>
          </div>

          {/* Sort Selector Dropdown */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30 hover:bg-surface-container-low cursor-pointer transition-all whitespace-nowrap shadow-xs"
            >
              <span className="material-symbols-outlined text-[15px] text-orange-600 dark:text-orange-400">sort</span>
              <span className="hidden sm:inline">Sort:</span>
              <span className="text-on-surface font-extrabold">{LEDGER_SORT_LABELS[sortBy].replace(' (Default)', '')}</span>
              <span className="material-symbols-outlined text-[14px] text-outline">arrow_drop_down</span>
            </button>

            {isSortDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsSortDropdownOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 z-50 w-52 bg-surface-container-lowest rounded-2xl shadow-xl border border-outline-variant/30 py-1.5 overflow-hidden animate-fade-in">
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
                        className={`w-full px-3 py-2 text-left text-xs font-semibold flex items-center justify-between hover:bg-surface-container-low cursor-pointer transition-colors ${
                          isSelected ? 'text-orange-600 dark:text-orange-400 font-bold bg-orange-500/5' : 'text-on-surface'
                        }`}
                      >
                        <span>{LEDGER_SORT_LABELS[key]}</span>
                        {isSelected && (
                          <span className="material-symbols-outlined text-[16px] text-orange-600 dark:text-orange-400">
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

        {/* Active Filter Indicators (Reset Pill) */}
        {datePreset !== 'ALL_TIME' && (
          <div className="flex items-center gap-2 mt-1 pt-1 border-t border-outline-variant/10 text-xs">
            <span className="text-[11px] text-on-surface-variant font-medium">Filtered by date:</span>
            <span className="inline-flex items-center gap-1 bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-orange-500/20">
              <span className="material-symbols-outlined text-[12px]">calendar_today</span>
              <span>{dateRange.label}</span>
              <button
                type="button"
                onClick={() => {
                  setDatePreset('ALL_TIME');
                  setCustomStart('');
                  setCustomEnd('');
                }}
                className="hover:text-error ml-1 cursor-pointer"
                title="Reset to All Time"
              >
                <span className="material-symbols-outlined text-[12px]">close</span>
              </button>
            </span>
          </div>
        )}
      </div>

      {/* 4. Purchase Bills List Stream (Clean Passbook Row Cards) */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-1">
        {sortedPurchases.length === 0 ? (
          <div className="md:col-span-2 bg-surface-container-lowest rounded-2xl p-8 text-center text-on-surface-variant border border-outline-variant/20 shadow-xs">
            No purchase records found.
          </div>
        ) : (
          sortedPurchases.map((bill) => {
            const isUnpaid = bill.paymentStatus === 'UNPAID';
            const isPartial = bill.paymentStatus === 'PARTIAL';
            const isPaid = bill.paymentStatus === 'PAID';
            const itemDesc = bill.items && bill.items.length > 0
              ? bill.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')
              : null;
            const dueAmt = bill.balanceAmount || (isUnpaid ? bill.grandTotal : 0);

            return (
              <div
                key={bill.id}
                onClick={() => setSelectedBillForPreview(bill)}
                className="bg-surface-container-lowest rounded-2xl p-3 sm:p-3.5 shadow-xs border border-outline-variant/20 flex flex-col gap-1.5 hover:border-orange-500/40 active:scale-[0.99] transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center font-bold text-xs flex-shrink-0">
                      {(bill.supplierName || 'S').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-bold text-xs sm:text-sm text-on-surface truncate">
                        {bill.supplierName}
                      </span>
                      <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant mt-0.5">
                        <span className="font-semibold text-orange-600 dark:text-orange-400">{bill.billNumber}</span>
                        <span>•</span>
                        <span>{formatDate(bill.date)}</span>
                        {bill.supplierGstin && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-[10px] text-outline truncate max-w-[80px] sm:max-w-none">
                              {bill.supplierGstin}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end flex-shrink-0 text-right pl-2">
                    <span className="font-extrabold text-xs sm:text-base text-on-surface whitespace-nowrap tabular-nums">
                      {formatINR(bill.grandTotal)}
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
                          <span>Settled</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[12px]">schedule</span>
                          <span>Due {formatINR(dueAmt)}</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>

                {/* Subtitle items line & ITC chip */}
                <div className="flex items-center justify-between text-[10px] text-on-surface-variant pt-1 border-t border-outline-variant/15 gap-2">
                  <span className="truncate text-on-surface-variant font-medium">
                    {itemDesc || `${bill.items?.length || 0} items`}
                  </span>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-bold text-[9px] text-orange-600 dark:text-orange-400">
                      +{formatINR(bill.totalTax)} ITC
                    </span>

                    {(isUnpaid || isPartial) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuickPay(bill);
                        }}
                        className="px-2 py-0.5 rounded-lg bg-error/15 hover:bg-error/25 text-error font-bold text-[10px] cursor-pointer active:scale-95 transition-all flex items-center gap-0.5"
                      >
                        <span className="material-symbols-outlined text-[12px]">payments</span>
                        <span>Pay</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </section>

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
