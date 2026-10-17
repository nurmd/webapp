import React, { useState, useMemo } from 'react';
import { PurchaseBill } from '../../models/purchase.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import {
  DatePreset,
  getDateFilterBounds,
  isDateInRange,
  LedgerSortOption,
} from '../../core/utils/dateFilters.ts';
import { DateFilterModal } from '../Common/DateFilterModal.tsx';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal.tsx';
import { showAppToast } from '../../services/toast.ts';

export interface PurchaseReturnsViewProps {
  company: CompanyProfile;
  purchases: PurchaseBill[];
  onNewPurchaseReturn: () => void;
  onViewPurchase?: (bill: PurchaseBill) => void;
  onEditPurchase?: (bill: PurchaseBill) => void;
  onDeletePurchase: (id: string) => void;
}

export const PurchaseReturnsView: React.FC<PurchaseReturnsViewProps> = ({
  company,
  purchases,
  onNewPurchaseReturn,
  onViewPurchase,
  onEditPurchase,
  onDeletePurchase,
}) => {
  const [search, setSearch] = useState('');
  const [docToDelete, setDocToDelete] = useState<PurchaseBill | null>(null);

  // Sorting
  const [sortBy, setSortBy] = useState<LedgerSortOption>('NEWEST');

  // Date Filter
  const [datePreset, setDatePreset] = useState<DatePreset>('ALL_TIME');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);

  useBackNavigation(() => {
    if (docToDelete) {
      setDocToDelete(null);
      return true;
    }
    if (isDateModalOpen) {
      setIsDateModalOpen(false);
      return true;
    }
    return false;
  }, isDateModalOpen || !!docToDelete, 20);

  // 1. Filter only Purchase Returns / Debit Notes
  const debitNotes = useMemo(() => {
    return purchases.filter((p) => p.purchaseType === 'RETURN' || p.noteType === 'D');
  }, [purchases]);

  // 2. Date Filtering
  const dateRange = useMemo(() => {
    return getDateFilterBounds(datePreset, customStart, customEnd);
  }, [datePreset, customStart, customEnd]);

  const dateFiltered = useMemo(() => {
    if (!dateRange.start && !dateRange.end) return debitNotes;
    return debitNotes.filter((p) => isDateInRange(p.date, dateRange.start, dateRange.end));
  }, [debitNotes, dateRange]);

  // KPI Metrics
  const totalDebitAmount = dateFiltered.reduce((sum, dn) => sum + dn.grandTotal, 0);
  const totalItcReversed = dateFiltered.reduce((sum, dn) => sum + (dn.totalTax || 0), 0);
  const totalItemsReturned = dateFiltered.reduce((sum, dn) => {
    return sum + (dn.items?.reduce((isum, itm) => isum + (itm.quantity || 0), 0) || 0);
  }, 0);

  // 3. Search Filter
  const searchedNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dateFiltered;
    return dateFiltered.filter((p) => {
      return (
        p.billNumber.toLowerCase().includes(q) ||
        p.supplierName.toLowerCase().includes(q) ||
        (p.originalBillNumber && p.originalBillNumber.toLowerCase().includes(q)) ||
        (p.supplierGstin && p.supplierGstin.toLowerCase().includes(q))
      );
    });
  }, [dateFiltered, search]);

  // 4. Sort
  const sortedNotes = useMemo(() => {
    return [...searchedNotes].sort((a, b) => {
      const tA = new Date(a.date).getTime() || 0;
      const tB = new Date(b.date).getTime() || 0;
      if (sortBy === 'NEWEST') return tB !== tA ? tB - tA : (b.id || '').localeCompare(a.id || '');
      if (sortBy === 'OLDEST') return tA !== tB ? tA - tB : (a.id || '').localeCompare(b.id || '');
      return b.grandTotal - a.grandTotal;
    });
  }, [searchedNotes, sortBy]);

  return (
    <div className="w-full max-w-7xl mx-auto p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-2xl">assignment_turned_in</span>
            <h1 className="font-headline-sm text-xl sm:text-2xl font-black text-on-surface tracking-tight">
              Purchase Return (Debit Notes)
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-on-surface-variant mt-0.5">
            Issue Debit Notes to vendors for returned inventory, rejected goods, or billing adjustments (GSTR-3B Table 4(B) ITC Reversal).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="new-purchase-return-btn"
            onClick={onNewPurchaseReturn}
            className="h-10 px-4 rounded-xl bg-secondary text-on-secondary text-xs sm:text-sm font-bold shadow-sm hover:bg-secondary/90 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer ml-auto"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>+ New Purchase Return</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-surface-container-lowest rounded-2xl p-3 sm:p-4 border border-outline-variant/30 flex flex-col justify-between shadow-xs">
          <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Total Debit Notes</span>
          <div className="mt-1">
            <span className="text-lg sm:text-xl font-extrabold text-on-surface tabular-nums">{dateFiltered.length}</span>
            <span className="text-xs text-on-surface-variant ml-1 font-semibold">Notes Issued</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl p-3 sm:p-4 border border-outline-variant/30 flex flex-col justify-between shadow-xs">
          <span className="text-[11px] font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider">Total Value Returned</span>
          <div className="mt-1">
            <span className="text-lg sm:text-xl font-extrabold text-rose-800 dark:text-rose-300 tabular-nums">{formatINR(totalDebitAmount)}</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl p-3 sm:p-4 border border-outline-variant/30 flex flex-col justify-between shadow-xs">
          <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">ITC Reversible</span>
          <div className="mt-1">
            <span className="text-lg sm:text-xl font-extrabold text-amber-800 dark:text-amber-300 tabular-nums">{formatINR(totalItcReversed)}</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl p-3 sm:p-4 border border-outline-variant/30 flex flex-col justify-between shadow-xs">
          <span className="text-[11px] font-bold text-secondary uppercase tracking-wider">Stock Dispatched</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-lg sm:text-xl font-extrabold text-secondary tabular-nums">{totalItemsReturned}</span>
            <span className="text-[11px] text-on-surface-variant">units returned</span>
          </div>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="relative flex-1 sm:max-w-md">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
            search
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Debit Note #, vendor, or original bill #..."
            className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-outline-variant/40 bg-surface-container-lowest text-on-surface text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-secondary/30 min-h-[36px]"
          />
        </div>

        <button
          type="button"
          onClick={() => setIsDateModalOpen(true)}
          className="h-9 px-3 rounded-xl border border-outline-variant/40 bg-surface-container-lowest hover:bg-surface-container-low text-on-surface text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap self-end sm:self-auto"
        >
          <span className="material-symbols-outlined text-[16px] text-secondary">calendar_today</span>
          <span>{datePreset === 'ALL_TIME' ? 'All Time' : datePreset.replace('_', ' ')}</span>
        </button>
      </div>

      {/* Debit Notes List */}
      <div className="space-y-2.5">
        {sortedNotes.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-2xl p-8 sm:p-12 border border-outline-variant/20 text-center space-y-3">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant/40">assignment_turned_in</span>
            <h3 className="font-bold text-sm text-on-surface">No purchase return debit notes found</h3>
            <p className="text-xs text-on-surface-variant max-w-sm mx-auto">
              {search ? 'Try clearing your search query or date range.' : 'When returning defective goods or receiving credit from suppliers, issue a Debit Note to deduct stock and reduce vendor liability.'}
            </p>
            {!search && (
              <button
                type="button"
                onClick={onNewPurchaseReturn}
                className="mt-2 h-9 px-4 rounded-xl bg-secondary text-on-secondary text-xs font-bold shadow-xs hover:bg-secondary/90 cursor-pointer inline-flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                <span>+ Create Purchase Return (DN)</span>
              </button>
            )}
          </div>
        ) : (
          sortedNotes.map((dn) => (
            <div
              key={dn.id}
              onClick={() => onViewPurchase?.(dn)}
              className="bg-surface-container-lowest rounded-xl p-3 sm:p-4 shadow-xs border border-outline-variant/20 flex flex-col gap-2 hover:border-secondary/40 active:scale-[0.99] transition-all cursor-pointer"
            >
              {/* Line 1: Supplier & Returned Value */}
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-xs sm:text-sm text-on-surface truncate flex-1 min-w-0">
                  {dn.supplierName || 'General Supplier'}
                </span>
                <span className="font-extrabold text-xs sm:text-sm text-rose-700 dark:text-rose-400 whitespace-nowrap tabular-nums shrink-0">
                  - {formatINR(dn.grandTotal)}
                </span>
              </div>

              {/* Line 2: Debit Note # & Original Bill reference */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold text-secondary shrink-0 bg-secondary/10 px-1.5 py-0.2 rounded font-mono">
                  #{dn.billNumber}
                </span>

                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                  <span className="material-symbols-outlined text-[12px]">post_add</span>
                  <span>Debit Note</span>
                </span>

                {dn.originalBillNumber && (
                  <span className="text-[10px] font-medium text-on-surface-variant bg-surface-container-low px-1.5 py-0.2 rounded">
                    Against Purchase #{dn.originalBillNumber}
                  </span>
                )}

                {dn.returnReason && (
                  <span className="text-[10px] italic text-on-surface-variant truncate max-w-[200px]">
                    Reason: {dn.returnReason}
                  </span>
                )}
              </div>

              {/* Line 3: Meta & Actions */}
              <div className="flex items-center justify-between gap-2 text-[11px] text-on-surface-variant pt-1 border-t border-outline-variant/15">
                <div className="flex items-center gap-1.5 truncate">
                  <span>{formatDate(dn.date)}</span>
                  <span>•</span>
                  <span>{dn.items?.length || 0} {dn.items?.length === 1 ? 'item' : 'items'} returned</span>
                  {dn.totalTax > 0 && (
                    <>
                      <span>•</span>
                      <span>ITC: {formatINR(dn.totalTax)}</span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {onEditPurchase && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditPurchase(dn);
                      }}
                      className="p-1 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-md transition-colors"
                      title="Edit Debit Note"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDocToDelete(dn);
                    }}
                    className="p-1 text-error/70 hover:text-error hover:bg-error-container/20 rounded-md transition-colors"
                    title="Delete Debit Note"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Floating Action Button */}
      <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40">
        <button
          type="button"
          onClick={onNewPurchaseReturn}
          className="h-11 px-4 rounded-full bg-secondary text-on-secondary font-bold text-xs shadow-lg flex items-center gap-1.5 active:scale-95 transition-transform cursor-pointer border border-white/10"
          title="Create New Debit Note"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          <span>+ Purchase Return</span>
        </button>
      </div>

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

      {/* Delete Confirmation Modal */}
      {docToDelete && (
        <ConfirmDeleteModal
          isOpen={!!docToDelete}
          title="Delete Debit Note?"
          description={`Are you sure you want to delete Debit Note #${docToDelete.billNumber} for ${docToDelete.supplierName}? This action will remove the debit note record.`}
          confirmText="Delete Debit Note"
          confirmButtonClass="bg-error text-on-error hover:bg-error/90"
          onConfirm={() => {
            const id = docToDelete.id;
            setDocToDelete(null);
            onDeletePurchase(id);
            showAppToast('Debit Note deleted successfully.');
          }}
          onClose={() => setDocToDelete(null)}
        />
      )}
    </div>
  );
};
