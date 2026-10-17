import React, { useState, useMemo } from 'react';
import { PurchaseBill } from '../../models/purchase.ts';
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
import { canConvertPurchaseOrder, convertPurchaseOrderToBill } from '../../core/utils/documentConversion.ts';
import { showAppToast } from '../../services/toast.ts';
import { db } from '../../services/db.ts';

export interface PurchaseOrdersViewProps {
  company: CompanyProfile;
  purchases: PurchaseBill[];
  onNewPurchaseOrder: () => void;
  onViewPurchase?: (bill: PurchaseBill) => void;
  onEditPurchase?: (bill: PurchaseBill) => void;
  onDeletePurchase: (id: string) => void;
  onRefresh?: () => void;
}

export const PurchaseOrdersView: React.FC<PurchaseOrdersViewProps> = ({
  company,
  purchases,
  onNewPurchaseOrder,
  onViewPurchase,
  onEditPurchase,
  onDeletePurchase,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'ALL' | 'PENDING' | 'FULFILLED' | 'CANCELLED'>('ALL');
  const [search, setSearch] = useState('');
  const [confirmConvertPo, setConfirmConvertPo] = useState<PurchaseBill | null>(null);
  const [docToDelete, setDocToDelete] = useState<PurchaseBill | null>(null);

  // Sorting
  const [sortBy, setSortBy] = useState<LedgerSortOption>('NEWEST');

  // Date Filter
  const [datePreset, setDatePreset] = useState<DatePreset>('ALL_TIME');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);

  useBackNavigation(() => {
    if (confirmConvertPo) {
      setConfirmConvertPo(null);
      return true;
    }
    if (docToDelete) {
      setDocToDelete(null);
      return true;
    }
    if (isDateModalOpen) {
      setIsDateModalOpen(false);
      return true;
    }
    return false;
  }, isDateModalOpen || !!confirmConvertPo || !!docToDelete, 20);

  // 1. Filter only Purchase Orders
  const purchaseOrders = useMemo(() => {
    return purchases.filter((p) => p.purchaseType === 'PO');
  }, [purchases]);

  // 2. Date Filtering
  const dateRange = useMemo(() => {
    return getDateFilterBounds(datePreset, customStart, customEnd);
  }, [datePreset, customStart, customEnd]);

  const dateFiltered = useMemo(() => {
    if (!dateRange.start && !dateRange.end) return purchaseOrders;
    return purchaseOrders.filter((po) => isDateInRange(po.date, dateRange.start, dateRange.end));
  }, [purchaseOrders, dateRange]);

  // KPI Metrics
  const totalValue = dateFiltered.reduce((sum, po) => sum + po.grandTotal, 0);
  const pendingOrders = dateFiltered.filter((po) => !po.isConverted && po.orderStatus !== 'CANCELLED');
  const pendingValue = pendingOrders.reduce((sum, po) => sum + po.grandTotal, 0);
  const fulfilledOrders = dateFiltered.filter((po) => po.isConverted || po.orderStatus === 'FULFILLED');
  const fulfilledValue = fulfilledOrders.reduce((sum, po) => sum + po.grandTotal, 0);

  // 3. Search & Tab Filter
  const statusFiltered = useMemo(() => {
    return dateFiltered.filter((po) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        po.billNumber.toLowerCase().includes(q) ||
        po.supplierName.toLowerCase().includes(q) ||
        (po.supplierGstin && po.supplierGstin.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (activeTab === 'PENDING') return !po.isConverted && po.orderStatus !== 'CANCELLED';
      if (activeTab === 'FULFILLED') return po.isConverted || po.orderStatus === 'FULFILLED';
      if (activeTab === 'CANCELLED') return po.orderStatus === 'CANCELLED';
      return true;
    });
  }, [dateFiltered, search, activeTab]);

  // 4. Sort
  const sortedOrders = useMemo(() => {
    return [...statusFiltered].sort((a, b) => {
      const tA = new Date(a.date).getTime() || 0;
      const tB = new Date(b.date).getTime() || 0;
      if (sortBy === 'NEWEST') return tB !== tA ? tB - tA : (b.id || '').localeCompare(a.id || '');
      if (sortBy === 'OLDEST') return tA !== tB ? tA - tB : (a.id || '').localeCompare(b.id || '');
      return b.grandTotal - a.grandTotal;
    });
  }, [statusFiltered, sortBy]);

  // 1-Tap Convert to Inward Purchase Bill
  const handleConvertPo = async (po: PurchaseBill) => {
    try {
      const newBill = await convertPurchaseOrderToBill(po, company);
      showAppToast(`PO #${po.billNumber} inwarded as Purchase Bill #${newBill.billNumber}. Stock updated.`);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error('Failed to convert purchase order:', err);
      showAppToast(err.message || 'Failed to convert purchase order.');
    }
  };

  const handleCancelPo = async (po: PurchaseBill) => {
    try {
      const updated: PurchaseBill = {
        ...po,
        orderStatus: 'CANCELLED',
        isCancelled: true,
        updatedAt: new Date().toISOString(),
      };
      await db.savePurchase(updated);
      showAppToast(`Purchase Order #${po.billNumber} cancelled.`);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Failed to cancel PO:', err);
      showAppToast('Failed to cancel PO.');
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-2xl">add_shopping_cart</span>
            <h1 className="font-headline-sm text-xl sm:text-2xl font-black text-on-surface tracking-tight">
              Purchase Orders
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-on-surface-variant mt-0.5">
            Manage procurement orders placed to suppliers & vendors, and 1-tap inward into Purchase Bills.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="new-purchase-order-btn"
            onClick={onNewPurchaseOrder}
            className="h-10 px-4 rounded-xl bg-secondary text-on-secondary text-xs sm:text-sm font-bold shadow-sm hover:bg-secondary/90 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer ml-auto"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>+ New Purchase Order</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-surface-container-lowest rounded-2xl p-3 sm:p-4 border border-outline-variant/30 flex flex-col justify-between shadow-xs">
          <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Total POs</span>
          <div className="mt-1">
            <span className="text-lg sm:text-xl font-extrabold text-on-surface tabular-nums">{dateFiltered.length}</span>
            <span className="text-xs text-on-surface-variant ml-1 font-semibold">({formatINR(totalValue)})</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl p-3 sm:p-4 border border-outline-variant/30 flex flex-col justify-between shadow-xs">
          <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Pending Inward</span>
          <div className="mt-1">
            <span className="text-lg sm:text-xl font-extrabold text-amber-800 dark:text-amber-300 tabular-nums">{pendingOrders.length}</span>
            <span className="text-xs text-on-surface-variant ml-1 font-semibold">({formatINR(pendingValue)})</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl p-3 sm:p-4 border border-outline-variant/30 flex flex-col justify-between shadow-xs">
          <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Inwarded / Billed</span>
          <div className="mt-1">
            <span className="text-lg sm:text-xl font-extrabold text-emerald-800 dark:text-emerald-300 tabular-nums">{fulfilledOrders.length}</span>
            <span className="text-xs text-on-surface-variant ml-1 font-semibold">({formatINR(fulfilledValue)})</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl p-3 sm:p-4 border border-outline-variant/30 flex flex-col justify-between shadow-xs">
          <span className="text-[11px] font-bold text-secondary uppercase tracking-wider">Fulfillment</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-lg sm:text-xl font-extrabold text-secondary tabular-nums">
              {dateFiltered.length > 0 ? Math.round((fulfilledOrders.length / dateFiltered.length) * 100) : 0}%
            </span>
            <span className="text-[11px] text-on-surface-variant">procured</span>
          </div>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
          {(['ALL', 'PENDING', 'FULFILLED', 'CANCELLED'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeTab === tab
                  ? 'bg-secondary text-on-secondary shadow-xs'
                  : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {tab === 'ALL'
                ? `All (${dateFiltered.length})`
                : tab === 'PENDING'
                ? `Pending (${pendingOrders.length})`
                : tab === 'FULFILLED'
                ? `Inwarded (${fulfilledOrders.length})`
                : `Cancelled (${dateFiltered.filter((o) => o.orderStatus === 'CANCELLED').length})`}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search PO #, supplier..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-outline-variant/40 bg-surface-container-lowest text-on-surface text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-secondary/30 min-h-[36px]"
            />
          </div>

          <button
            type="button"
            onClick={() => setIsDateModalOpen(true)}
            className="h-9 px-3 rounded-xl border border-outline-variant/40 bg-surface-container-lowest hover:bg-surface-container-low text-on-surface text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[16px] text-secondary">calendar_today</span>
            <span>{datePreset === 'ALL_TIME' ? 'All Time' : datePreset.replace('_', ' ')}</span>
          </button>
        </div>
      </div>

      {/* Orders List */}
      <div className="space-y-2.5">
        {sortedOrders.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-2xl p-8 sm:p-12 border border-outline-variant/20 text-center space-y-3">
            <span className="material-symbols-outlined text-4xl text-on-surface-variant/40">add_shopping_cart</span>
            <h3 className="font-bold text-sm text-on-surface">No purchase orders found</h3>
            <p className="text-xs text-on-surface-variant max-w-sm mx-auto">
              {search ? 'Try clearing your search query or date range.' : 'Place formal purchase orders to suppliers with item specifications, tax estimates, and promised delivery dates.'}
            </p>
            {!search && (
              <button
                type="button"
                onClick={onNewPurchaseOrder}
                className="mt-2 h-9 px-4 rounded-xl bg-secondary text-on-secondary text-xs font-bold shadow-xs hover:bg-secondary/90 cursor-pointer inline-flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                <span>+ Create Purchase Order</span>
              </button>
            )}
          </div>
        ) : (
          sortedOrders.map((po) => (
            <div
              key={po.id}
              onClick={() => onViewPurchase?.(po)}
              className="bg-surface-container-lowest rounded-xl p-3 sm:p-4 shadow-xs border border-outline-variant/20 flex flex-col gap-2 hover:border-secondary/40 active:scale-[0.99] transition-all cursor-pointer"
            >
              {/* Line 1: Supplier Name & Order Total */}
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-xs sm:text-sm text-on-surface truncate flex-1 min-w-0">
                  {po.supplierName || 'General Supplier'}
                </span>
                <span className="font-extrabold text-xs sm:text-sm text-on-surface whitespace-nowrap tabular-nums shrink-0">
                  {formatINR(po.grandTotal)}
                </span>
              </div>

              {/* Line 2: PO # & Status Badge */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold text-secondary shrink-0 bg-secondary/10 px-1.5 py-0.2 rounded font-mono">
                  #{po.billNumber}
                </span>

                {po.isConverted ? (
                  <span
                    data-testid="po-inwarded-badge"
                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                  >
                    <span className="material-symbols-outlined text-[12px]">inventory</span>
                    <span>Inwarded {po.convertedToBillNumber ? `(#${po.convertedToBillNumber})` : ''}</span>
                  </span>
                ) : po.orderStatus === 'CANCELLED' ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-300 dark:border-slate-700">
                    <span className="material-symbols-outlined text-[12px]">cancel</span>
                    <span>Cancelled</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                    <span className="material-symbols-outlined text-[12px]">schedule</span>
                    <span>Pending Receipt</span>
                  </span>
                )}

                {/* 1-Tap Convert to Inward Purchase Bill */}
                {canConvertPurchaseOrder(po) && (
                  <button
                    type="button"
                    data-testid="convert-po-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmConvertPo(po);
                    }}
                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-md bg-secondary text-on-secondary shadow-xs hover:bg-secondary/90 active:scale-95 transition-all cursor-pointer ml-auto"
                    title="Inward goods and convert PO to Purchase Bill"
                  >
                    <span className="material-symbols-outlined text-[12px]">inventory_2</span>
                    <span>Inward Bill</span>
                  </button>
                )}
              </div>

              {/* Line 3: Meta & Actions */}
              <div className="flex items-center justify-between gap-2 text-[11px] text-on-surface-variant pt-1 border-t border-outline-variant/15">
                <div className="flex items-center gap-1.5 truncate">
                  <span>{formatDate(po.date)}</span>
                  <span>•</span>
                  <span>{po.items?.length || 0} {po.items?.length === 1 ? 'item' : 'items'}</span>
                  {po.dueDate && (
                    <>
                      <span>•</span>
                      <span className="text-secondary font-semibold">Expected {formatDate(po.dueDate)}</span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {onEditPurchase && !po.isConverted && po.orderStatus !== 'CANCELLED' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditPurchase(po);
                      }}
                      className="p-1 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-md transition-colors"
                      title="Edit PO"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                    </button>
                  )}

                  {!po.isConverted && po.orderStatus !== 'CANCELLED' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCancelPo(po);
                      }}
                      className="p-1 text-amber-600 hover:bg-amber-50 rounded-md transition-colors"
                      title="Cancel PO"
                    >
                      <span className="material-symbols-outlined text-[16px]">block</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDocToDelete(po);
                    }}
                    className="p-1 text-error/70 hover:text-error hover:bg-error-container/20 rounded-md transition-colors"
                    title="Delete PO"
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
          onClick={onNewPurchaseOrder}
          className="h-11 px-4 rounded-full bg-secondary text-on-secondary font-bold text-xs shadow-lg flex items-center gap-1.5 active:scale-95 transition-transform cursor-pointer border border-white/10"
          title="Create New Purchase Order"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          <span>+ Purchase Order</span>
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

      {/* Convert PO Confirmation Modal */}
      {confirmConvertPo && (
        <ConfirmDeleteModal
          isOpen={!!confirmConvertPo}
          title="Inward Purchase Order to Bill?"
          description={`Are you sure you want to inward Purchase Order #${confirmConvertPo.billNumber} from ${confirmConvertPo.supplierName}? This will generate a formal inward Purchase Bill, increment inventory stock levels, and update supplier accounts.`}
          confirmText="Inward to Bill"
          confirmButtonClass="bg-secondary text-on-secondary hover:bg-secondary/90"
          icon="inventory_2"
          iconBgClass="bg-secondary/15 text-secondary"
          onConfirm={async () => {
            const po = confirmConvertPo;
            setConfirmConvertPo(null);
            await handleConvertPo(po);
          }}
          onClose={() => setConfirmConvertPo(null)}
        />
      )}

      {/* Delete PO Modal */}
      {docToDelete && (
        <ConfirmDeleteModal
          isOpen={!!docToDelete}
          title="Delete Purchase Order?"
          description={`Are you sure you want to delete purchase order #${docToDelete.billNumber} from ${docToDelete.supplierName}?`}
          confirmText="Delete PO"
          confirmButtonClass="bg-error text-on-error hover:bg-error/90"
          onConfirm={() => {
            const id = docToDelete.id;
            setDocToDelete(null);
            onDeletePurchase(id);
            showAppToast('Purchase Order deleted.');
          }}
          onClose={() => setDocToDelete(null)}
        />
      )}
    </div>
  );
};
