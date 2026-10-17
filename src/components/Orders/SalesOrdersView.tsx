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

export interface SalesOrdersViewProps {
  company: CompanyProfile;
  invoices: Invoice[];
  onNewSalesOrder: () => void;
  onViewInvoice: (invoice: Invoice) => void;
  onEditInvoice?: (invoice: Invoice) => void;
  onDeleteInvoice: (id: string) => void;
  onRefresh?: () => void;
}

export const SalesOrdersView: React.FC<SalesOrdersViewProps> = ({
  company,
  invoices,
  onNewSalesOrder,
  onViewInvoice,
  onEditInvoice,
  onDeleteInvoice,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'ALL' | 'PENDING' | 'FULFILLED' | 'CANCELLED'>('ALL');
  const [search, setSearch] = useState('');
  const [confirmConvertDoc, setConfirmConvertDoc] = useState<Invoice | null>(null);
  const [docToDelete, setDocToDelete] = useState<Invoice | null>(null);

  // Sorting
  const [sortBy, setSortBy] = useState<LedgerSortOption>('NEWEST');

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
    if (isDateModalOpen) {
      setIsDateModalOpen(false);
      return true;
    }
    return false;
  }, isDateModalOpen || !!confirmConvertDoc || !!docToDelete, 20);

  // 1. Filter only Sales Orders
  const salesOrders = useMemo(() => {
    return invoices.filter((i) => i.invoiceType === 'SALES_ORDER');
  }, [invoices]);

  // 2. Date Filtering
  const dateRange = useMemo(() => {
    return getDateFilterBounds(datePreset, customStart, customEnd);
  }, [datePreset, customStart, customEnd]);

  const dateFiltered = useMemo(() => {
    if (!dateRange.start && !dateRange.end) return salesOrders;
    return salesOrders.filter((inv) => isDateInRange(inv.date, dateRange.start, dateRange.end));
  }, [salesOrders, dateRange]);

  // KPI Metrics
  const totalValue = dateFiltered.reduce((sum, so) => sum + so.grandTotal, 0);
  const pendingOrders = dateFiltered.filter((so) => !so.isConverted && so.orderStatus !== 'CANCELLED');
  const pendingValue = pendingOrders.reduce((sum, so) => sum + so.grandTotal, 0);
  const fulfilledOrders = dateFiltered.filter((so) => so.isConverted || so.orderStatus === 'FULFILLED');
  const fulfilledValue = fulfilledOrders.reduce((sum, so) => sum + so.grandTotal, 0);

  // 3. Search & Tab Filter
  const statusFiltered = useMemo(() => {
    return dateFiltered.filter((inv) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.partyName.toLowerCase().includes(q) ||
        (inv.partyGstin && inv.partyGstin.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (activeTab === 'PENDING') return !inv.isConverted && inv.orderStatus !== 'CANCELLED';
      if (activeTab === 'FULFILLED') return inv.isConverted || inv.orderStatus === 'FULFILLED';
      if (activeTab === 'CANCELLED') return inv.orderStatus === 'CANCELLED';
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

  // 1-Tap Convert to Tax Invoice
  const handleConvertSalesOrder = async (doc: Invoice) => {
    try {
      const newInv = await convertDocumentToTaxInvoice(doc, company);
      showAppToast(`Sales Order #${doc.invoiceNumber} converted to Tax Invoice #${newInv.invoiceNumber}`);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error('Failed to convert sales order:', err);
      showAppToast(err.message || 'Failed to convert sales order.');
    }
  };

  const handleCancelOrder = async (order: Invoice) => {
    try {
      const updated: Invoice = {
        ...order,
        orderStatus: 'CANCELLED',
        isCancelled: true,
        updatedAt: new Date().toISOString(),
      };
      await db.saveInvoice(updated);
      showAppToast(`Sales Order #${order.invoiceNumber} cancelled.`);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Failed to cancel order:', err);
      showAppToast('Failed to cancel order.');
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-2xl">assignment</span>
            <h1 className="font-headline-sm text-xl sm:text-2xl font-black text-on-surface tracking-tight">
              Sales Orders
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-on-surface-variant mt-0.5">
            Track confirmed client bookings, advance delivery orders, and convert directly to Sale Invoices.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="new-sales-order-btn"
            onClick={onNewSalesOrder}
            className="h-10 px-4 rounded-xl bg-secondary text-on-secondary text-xs sm:text-sm font-bold shadow-sm hover:bg-secondary/90 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer ml-auto"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>+ New Sales Order</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-surface-container-lowest rounded-2xl p-3 sm:p-4 border border-outline-variant/30 flex flex-col justify-between shadow-xs">
          <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">Total Orders</span>
          <div className="mt-1">
            <span className="text-lg sm:text-xl font-extrabold text-on-surface tabular-nums">{dateFiltered.length}</span>
            <span className="text-xs text-on-surface-variant ml-1 font-semibold">({formatINR(totalValue)})</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl p-3 sm:p-4 border border-outline-variant/30 flex flex-col justify-between shadow-xs">
          <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Pending Delivery</span>
          <div className="mt-1">
            <span className="text-lg sm:text-xl font-extrabold text-amber-800 dark:text-amber-300 tabular-nums">{pendingOrders.length}</span>
            <span className="text-xs text-on-surface-variant ml-1 font-semibold">({formatINR(pendingValue)})</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl p-3 sm:p-4 border border-outline-variant/30 flex flex-col justify-between shadow-xs">
          <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Fulfilled / Billed</span>
          <div className="mt-1">
            <span className="text-lg sm:text-xl font-extrabold text-emerald-800 dark:text-emerald-300 tabular-nums">{fulfilledOrders.length}</span>
            <span className="text-xs text-on-surface-variant ml-1 font-semibold">({formatINR(fulfilledValue)})</span>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl p-3 sm:p-4 border border-outline-variant/30 flex flex-col justify-between shadow-xs">
          <span className="text-[11px] font-bold text-secondary uppercase tracking-wider">Fulfillment Rate</span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-lg sm:text-xl font-extrabold text-secondary tabular-nums">
              {dateFiltered.length > 0 ? Math.round((fulfilledOrders.length / dateFiltered.length) * 100) : 0}%
            </span>
            <span className="text-[11px] text-on-surface-variant">delivered</span>
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
                ? `Fulfilled (${fulfilledOrders.length})`
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
              placeholder="Search order #, customer..."
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
            <span className="material-symbols-outlined text-4xl text-on-surface-variant/40">assignment</span>
            <h3 className="font-bold text-sm text-on-surface">No sales orders found</h3>
            <p className="text-xs text-on-surface-variant max-w-sm mx-auto">
              {search ? 'Try clearing your search query or date filter.' : 'Record advance customer orders to track fulfillment schedules and pending dispatches.'}
            </p>
            {!search && (
              <button
                type="button"
                onClick={onNewSalesOrder}
                className="mt-2 h-9 px-4 rounded-xl bg-secondary text-on-secondary text-xs font-bold shadow-xs hover:bg-secondary/90 cursor-pointer inline-flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                <span>+ Create Sales Order</span>
              </button>
            )}
          </div>
        ) : (
          sortedOrders.map((order) => (
            <div
              key={order.id}
              onClick={() => onViewInvoice(order)}
              className="bg-surface-container-lowest rounded-xl p-3 sm:p-4 shadow-xs border border-outline-variant/20 flex flex-col gap-2 hover:border-secondary/40 active:scale-[0.99] transition-all cursor-pointer"
            >
              {/* Line 1: Party Name & Grand Total */}
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-xs sm:text-sm text-on-surface truncate flex-1 min-w-0">
                  {order.partyName || 'Cash Customer'}
                </span>
                <span className="font-extrabold text-xs sm:text-sm text-on-surface whitespace-nowrap tabular-nums shrink-0">
                  {formatINR(order.grandTotal)}
                </span>
              </div>

              {/* Line 2: Order # & Status Badge */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold text-secondary shrink-0 bg-secondary/10 px-1.5 py-0.2 rounded font-mono">
                  #{order.invoiceNumber}
                </span>

                {order.isConverted ? (
                  <span
                    data-testid="order-fulfilled-badge"
                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                  >
                    <span className="material-symbols-outlined text-[12px]">done_all</span>
                    <span>Fulfilled {order.convertedToInvoiceNumber ? `(#${order.convertedToInvoiceNumber})` : ''}</span>
                  </span>
                ) : order.orderStatus === 'CANCELLED' ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-300 dark:border-slate-700">
                    <span className="material-symbols-outlined text-[12px]">cancel</span>
                    <span>Cancelled</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                    <span className="material-symbols-outlined text-[12px]">schedule</span>
                    <span>Pending Delivery</span>
                  </span>
                )}

                {/* Convert to Invoice Button */}
                {canConvertToInvoice(order) && (
                  <button
                    type="button"
                    data-testid="convert-sales-order-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmConvertDoc(order);
                    }}
                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-md bg-secondary text-on-secondary shadow-xs hover:bg-secondary/90 active:scale-95 transition-all cursor-pointer ml-auto"
                    title="Convert Sales Order to Tax Invoice"
                  >
                    <span className="material-symbols-outlined text-[12px]">receipt_long</span>
                    <span>Convert to Invoice</span>
                  </button>
                )}
              </div>

              {/* Line 3: Meta & Actions */}
              <div className="flex items-center justify-between gap-2 text-[11px] text-on-surface-variant pt-1 border-t border-outline-variant/15">
                <div className="flex items-center gap-1.5 truncate">
                  <span>{formatDate(order.date)}</span>
                  <span>•</span>
                  <span>{order.items?.length || 0} {order.items?.length === 1 ? 'item' : 'items'}</span>
                  {order.dueDate && (
                    <>
                      <span>•</span>
                      <span className="text-secondary font-semibold">Delivery by {formatDate(order.dueDate)}</span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {order.partyPhone && (
                    <a
                      href={getWhatsAppShareUrl(order, company, order.partyPhone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                      title="Share Order on WhatsApp"
                    >
                      <span className="material-symbols-outlined text-[16px]">share</span>
                    </a>
                  )}

                  {onEditInvoice && !order.isConverted && order.orderStatus !== 'CANCELLED' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditInvoice(order);
                      }}
                      className="p-1 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-md transition-colors"
                      title="Edit Order"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                    </button>
                  )}

                  {!order.isConverted && order.orderStatus !== 'CANCELLED' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCancelOrder(order);
                      }}
                      className="p-1 text-amber-600 hover:bg-amber-50 rounded-md transition-colors"
                      title="Cancel Order"
                    >
                      <span className="material-symbols-outlined text-[16px]">block</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDocToDelete(order);
                    }}
                    className="p-1 text-error/70 hover:text-error hover:bg-error-container/20 rounded-md transition-colors"
                    title="Delete Order"
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
          onClick={onNewSalesOrder}
          className="h-11 px-4 rounded-full bg-secondary text-on-secondary font-bold text-xs shadow-lg flex items-center gap-1.5 active:scale-95 transition-transform cursor-pointer border border-white/10"
          title="Create New Sales Order"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          <span>+ Sales Order</span>
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

      {/* Convert Order Confirmation Modal */}
      {confirmConvertDoc && (
        <ConfirmDeleteModal
          isOpen={!!confirmConvertDoc}
          title="Convert Sales Order to Tax Invoice?"
          description={`Are you sure you want to convert Sales Order #${confirmConvertDoc.invoiceNumber} for ${confirmConvertDoc.partyName} into an official Tax Invoice? This will generate a new Tax Invoice, assign a sequential invoice number, and adjust inventory stock.`}
          confirmText="Convert to Invoice"
          confirmButtonClass="bg-secondary text-on-secondary hover:bg-secondary/90"
          icon="receipt_long"
          iconBgClass="bg-secondary/15 text-secondary"
          onConfirm={async () => {
            const doc = confirmConvertDoc;
            setConfirmConvertDoc(null);
            await handleConvertSalesOrder(doc);
          }}
          onClose={() => setConfirmConvertDoc(null)}
        />
      )}

      {/* Delete Order Modal */}
      {docToDelete && (
        <ConfirmDeleteModal
          isOpen={!!docToDelete}
          title="Delete Sales Order?"
          description={`Are you sure you want to delete sales order #${docToDelete.invoiceNumber} for ${docToDelete.partyName}?`}
          confirmText="Delete Order"
          confirmButtonClass="bg-error text-on-error hover:bg-error/90"
          onConfirm={() => {
            const id = docToDelete.id;
            setDocToDelete(null);
            onDeleteInvoice(id);
            showAppToast('Sales Order deleted.');
          }}
          onClose={() => setDocToDelete(null)}
        />
      )}
    </div>
  );
};
