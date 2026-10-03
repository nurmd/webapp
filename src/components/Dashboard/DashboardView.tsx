import React, { useState } from 'react';
import { Invoice } from '../../models/invoice.ts';
import { InventoryItem } from '../../models/item.ts';
import { Party } from '../../models/party.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { AppTab } from '../Shell/Drawer.tsx';

interface DashboardViewProps {
  company: CompanyProfile;
  invoices: Invoice[];
  items: InventoryItem[];
  parties: Party[];
  onNewInvoice: () => void;
  onQuickPos: () => void;
  onViewInvoice: (invoice: Invoice) => void;
  onNavigateTab: (tab: AppTab) => void;
  onNavigateToParties?: (segment: 'CUSTOMERS' | 'SUPPLIERS', filter?: 'ALL' | 'OVERDUE' | 'SETTLED') => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  company: _company,
  invoices,
  items,
  parties,
  onNewInvoice,
  onQuickPos,
  onViewInvoice,
  onNavigateTab,
  onNavigateToParties,
}) => {
  const [txFilter, setTxFilter] = useState<'ALL' | 'UNPAID' | 'PAID'>('ALL');

  // Aggregates
  const totalSales = invoices.reduce((sum, inv) => sum + inv.grandTotal, 0);

  const totalReceivables = parties
    .filter((p) => p.currentBalance > 0)
    .reduce((sum, p) => sum + p.currentBalance, 0);

  const totalPayables = parties
    .filter((p) => p.currentBalance < 0)
    .reduce((sum, p) => sum + Math.abs(p.currentBalance), 0);

  const debtorParties = parties.filter((p) => p.currentBalance > 0);
  const creditorParties = parties.filter((p) => p.currentBalance < 0);

  const lowStockItems = items.filter((i) => i.currentStock <= i.minStockAlert);

  const unpaidCount = invoices.filter((i) => (i.balanceAmount || 0) > 0 || i.paymentStatus !== 'PAID').length;
  const paidCount = invoices.filter((i) => i.paymentStatus === 'PAID').length;

  // Filtered transactions
  const filteredInvoices = invoices.filter((inv) => {
    if (txFilter === 'UNPAID') return (inv.balanceAmount || 0) > 0 || inv.paymentStatus !== 'PAID';
    if (txFilter === 'PAID') return inv.paymentStatus === 'PAID';
    return true;
  });

  return (
    <div className="flex flex-col w-full px-3 sm:px-4 gap-3 sm:gap-4 py-3 max-w-4xl mx-auto">
      {/* 1. Low Stock Notice (Only visible when items are actually low on stock) */}
      {lowStockItems.length > 0 && (
        <div
          onClick={() => onNavigateTab('inventory')}
          className="bg-amber-500/10 border border-amber-500/25 rounded-2xl px-3.5 py-2.5 flex items-center justify-between cursor-pointer active:scale-98 transition-all text-xs"
        >
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-medium min-w-0">
            <span className="material-symbols-outlined text-[18px] text-amber-600 flex-shrink-0">warning</span>
            <span className="truncate">
              <strong>{lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''}</strong> running low on stock
            </span>
          </div>
          <span className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-0.5 flex-shrink-0 ml-2">
            <span>View Stock</span>
            <span className="material-symbols-outlined text-[15px]">chevron_right</span>
          </span>
        </div>
      )}

      {/* 2. Unified Financial Snapshot Card (Mobile-First 2-Tier Layout) */}
      <section className="bg-surface-container-lowest rounded-2xl p-3.5 sm:p-4 shadow-sm border border-outline-variant/30 flex flex-col gap-3">
        {/* Card Header */}
        <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
          <span className="font-bold text-xs uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-secondary"></span>
            Financial Overview
          </span>

          <button
            type="button"
            onClick={() => onNavigateTab('reports')}
            className="text-secondary text-xs font-bold flex items-center gap-0.5 hover:underline cursor-pointer"
          >
            <span>Reports</span>
            <span className="material-symbols-outlined text-[15px]">chevron_right</span>
          </button>
        </div>

        {/* Primary Metric: Total Sales Hero Banner */}
        <div
          onClick={() => onNavigateTab('sales')}
          className="flex items-center justify-between p-3 sm:p-3.5 rounded-xl bg-surface-container-low/60 hover:bg-surface-container-low transition-colors cursor-pointer group"
        >
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] sm:text-xs text-on-surface-variant uppercase font-bold tracking-wider">
              Total Sales
            </span>
            <span className="font-tabular-data text-xl sm:text-2xl font-black text-on-surface tracking-tight mt-0.5 group-hover:text-secondary transition-colors">
              {formatINR(totalSales)}
            </span>
            <span className="text-[11px] text-on-surface-variant font-medium mt-0.5">
              {invoices.length} bill{invoices.length === 1 ? '' : 's'} recorded
            </span>
          </div>

          <div className="flex items-center gap-1 text-secondary text-xs font-bold bg-secondary/10 px-2.5 py-1.5 rounded-xl group-hover:bg-secondary group-hover:text-on-secondary transition-all flex-shrink-0 ml-2">
            <span>Sales Hub</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </div>
        </div>

        {/* Cash Flow Balance: 2-Column Split (To Collect vs To Pay) */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {/* To Collect (Receivables) */}
          <div
            onClick={() => {
              if (onNavigateToParties) {
                onNavigateToParties('CUSTOMERS', debtorParties.length > 0 ? 'OVERDUE' : 'ALL');
              } else {
                onNavigateTab('parties');
              }
            }}
            className="p-3 sm:p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/50 dark:border-emerald-800/30 flex flex-col cursor-pointer active:scale-98 transition-all group min-w-0"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] sm:text-xs text-secondary font-bold uppercase tracking-wider flex items-center gap-1 truncate">
                <span className="material-symbols-outlined text-[14px] flex-shrink-0">south_west</span>
                <span className="truncate">To Collect</span>
              </span>
              <span className="text-[10px] font-bold text-secondary bg-emerald-100/80 dark:bg-emerald-900/60 px-1.5 py-0.5 rounded-md flex-shrink-0">
                {debtorParties.length}
              </span>
            </div>

            <span className="font-tabular-data text-sm sm:text-base md:text-lg font-black text-secondary mt-1.5 truncate">
              {formatINR(totalReceivables)}
            </span>
            <span className="text-[10px] sm:text-[11px] text-on-surface-variant font-medium mt-0.5 truncate">
              from {debtorParties.length} {debtorParties.length === 1 ? 'party' : 'parties'}
            </span>
          </div>

          {/* To Pay (Payables) */}
          <div
            onClick={() => {
              if (onNavigateToParties) {
                onNavigateToParties('SUPPLIERS', creditorParties.length > 0 ? 'OVERDUE' : 'ALL');
              } else {
                onNavigateTab('parties');
              }
            }}
            className="p-3 sm:p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/50 dark:border-rose-800/30 flex flex-col cursor-pointer active:scale-98 transition-all group min-w-0"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] sm:text-xs text-rose-600 dark:text-rose-400 font-bold uppercase tracking-wider flex items-center gap-1 truncate">
                <span className="material-symbols-outlined text-[14px] flex-shrink-0">north_east</span>
                <span className="truncate">To Pay</span>
              </span>
              <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-100/80 dark:bg-rose-900/60 px-1.5 py-0.5 rounded-md flex-shrink-0">
                {creditorParties.length}
              </span>
            </div>

            <span className="font-tabular-data text-sm sm:text-base md:text-lg font-black text-rose-600 dark:text-rose-400 mt-1.5 truncate">
              {formatINR(totalPayables)}
            </span>
            <span className="text-[10px] sm:text-[11px] text-on-surface-variant font-medium mt-0.5 truncate">
              to {creditorParties.length} supplier{creditorParties.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      </section>

      {/* 3. Fast Quick Action Buttons (Uniform 4-Column Grid) */}
      <section className="grid grid-cols-4 gap-2 sm:gap-3">
        {/* + Sale Bill (Primary Green) */}
        <button
          onClick={onNewInvoice}
          type="button"
          className="flex flex-col items-center justify-center gap-1.5 h-[72px] sm:h-20 px-1 rounded-2xl bg-secondary text-on-secondary shadow-sm active:scale-95 transition-all cursor-pointer"
        >
          <span className="material-symbols-outlined text-[22px]">add_notes</span>
          <span className="font-bold text-[11px] sm:text-xs truncate w-full text-center">Sale Bill</span>
        </button>

        {/* POS Counter */}
        <button
          onClick={onQuickPos}
          type="button"
          className="flex flex-col items-center justify-center gap-1.5 h-[72px] sm:h-20 px-1 rounded-2xl bg-surface-container-lowest text-on-surface border border-outline-variant/30 shadow-xs active:scale-95 transition-all cursor-pointer hover:border-secondary"
        >
          <span className="material-symbols-outlined text-[22px] text-secondary">point_of_sale</span>
          <span className="font-bold text-[11px] sm:text-xs truncate w-full text-center">Quick POS</span>
        </button>

        {/* Purchase */}
        <button
          onClick={() => onNavigateTab('purchases')}
          type="button"
          className="flex flex-col items-center justify-center gap-1.5 h-[72px] sm:h-20 px-1 rounded-2xl bg-surface-container-lowest text-on-surface border border-outline-variant/30 shadow-xs active:scale-95 transition-all cursor-pointer hover:border-secondary"
        >
          <span className="material-symbols-outlined text-[22px] text-on-surface-variant">shopping_bag</span>
          <span className="font-bold text-[11px] sm:text-xs truncate w-full text-center">Purchase</span>
        </button>

        {/* Add Party */}
        <button
          onClick={() => onNavigateTab('parties')}
          type="button"
          className="flex flex-col items-center justify-center gap-1.5 h-[72px] sm:h-20 px-1 rounded-2xl bg-surface-container-lowest text-on-surface border border-outline-variant/30 shadow-xs active:scale-95 transition-all cursor-pointer hover:border-secondary"
        >
          <span className="material-symbols-outlined text-[22px] text-on-surface-variant">person_add</span>
          <span className="font-bold text-[11px] sm:text-xs truncate w-full text-center">Add Party</span>
        </button>
      </section>

      {/* 4. Recent Invoices (Clean Passbook Container) */}
      <section className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/30 overflow-hidden flex flex-col">
        {/* Header & Segmented Filter Bar */}
        <div className="p-3.5 sm:p-4 border-b border-outline-variant/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm sm:text-base text-on-surface">Recent Invoices</span>
              <span className="text-xs bg-surface-container-low px-2 py-0.5 rounded-full text-on-surface-variant font-bold">
                {invoices.length}
              </span>
            </div>

            <button
              type="button"
              onClick={() => onNavigateTab('sales')}
              className="sm:hidden text-secondary text-xs font-bold flex items-center gap-0.5 hover:underline cursor-pointer"
            >
              <span>View All</span>
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </button>
          </div>

          {/* Segmented Filter Pills */}
          <div className="grid grid-cols-3 sm:flex items-center gap-1 bg-surface-container-low rounded-xl p-1 border border-outline-variant/30 text-xs font-bold">
            <button
              onClick={() => setTxFilter('ALL')}
              type="button"
              className={`py-1 px-2.5 rounded-lg text-center transition-colors cursor-pointer ${
                txFilter === 'ALL'
                  ? 'bg-surface-container-lowest text-on-surface shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setTxFilter('UNPAID')}
              type="button"
              className={`py-1 px-2.5 rounded-lg text-center transition-colors cursor-pointer ${
                txFilter === 'UNPAID'
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Unpaid ({unpaidCount})
            </button>
            <button
              onClick={() => setTxFilter('PAID')}
              type="button"
              className={`py-1 px-2.5 rounded-lg text-center transition-colors cursor-pointer ${
                txFilter === 'PAID'
                  ? 'bg-secondary text-on-secondary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Paid ({paidCount})
            </button>
          </div>
        </div>

        {/* Transactions List */}
        <div className="divide-y divide-outline-variant/20">
          {filteredInvoices.length === 0 ? (
            <div className="py-10 px-4 text-center flex flex-col items-center justify-center gap-2">
              <div className="w-11 h-11 rounded-2xl bg-surface-container-low flex items-center justify-center text-outline">
                <span className="material-symbols-outlined text-[22px]">receipt_long</span>
              </div>
              <span className="text-xs font-bold text-on-surface">No invoices found</span>
              <span className="text-[11px] text-on-surface-variant max-w-[220px]">
                {invoices.length === 0
                  ? 'Create your first GST sale bill or POS counter sale'
                  : 'No invoices match the selected filter'}
              </span>
              {invoices.length === 0 && (
                <button
                  onClick={onNewInvoice}
                  type="button"
                  className="mt-1 px-3.5 py-1.5 rounded-xl bg-secondary text-on-secondary font-bold text-xs shadow-xs cursor-pointer active:scale-95"
                >
                  + Create First Bill
                </button>
              )}
            </div>
          ) : (
            filteredInvoices.slice(0, 8).map((inv) => {
              const isPaid = inv.paymentStatus === 'PAID';
              return (
                <div
                  key={inv.id}
                  onClick={() => onViewInvoice(inv)}
                  className="p-3 sm:p-3.5 flex items-center justify-between gap-2.5 hover:bg-surface-container-low/40 active:bg-surface-container-low cursor-pointer transition-colors"
                >
                  {/* Left: Receipt Icon & Customer Name / Bill Details */}
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                        isPaid
                          ? 'bg-emerald-50 text-secondary dark:bg-emerald-950/60 dark:text-emerald-400'
                          : 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {isPaid ? 'receipt' : 'pending_actions'}
                      </span>
                    </div>

                    <div className="flex flex-col min-w-0">
                      <span className="font-bold text-xs sm:text-sm text-on-surface truncate">
                        {inv.partyName || 'Cash Customer'}
                      </span>
                      <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant truncate mt-0.5">
                        <span className="font-mono font-medium">{inv.invoiceNumber}</span>
                        <span>•</span>
                        <span>{formatDate(inv.date)}</span>
                        {inv.paymentMode && (
                          <>
                            <span>•</span>
                            <span className="uppercase text-[10px] font-semibold">{inv.paymentMode}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Amount & Payment Status Pill */}
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 text-right">
                    <div className="flex flex-col items-end">
                      <span className="font-tabular-data text-xs sm:text-sm font-black text-on-surface whitespace-nowrap">
                        {formatINR(inv.grandTotal)}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full mt-0.5 whitespace-nowrap ${
                          isPaid
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        }`}
                      >
                        {inv.paymentStatus}
                      </span>
                    </div>

                    <span className="material-symbols-outlined text-[16px] text-outline-variant flex-shrink-0">
                      chevron_right
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Link if more invoices exist */}
        {invoices.length > 8 && (
          <div className="p-3 text-center border-t border-outline-variant/20 bg-surface-container-lowest">
            <button
              onClick={() => onNavigateTab('sales')}
              type="button"
              className="text-secondary text-xs font-bold hover:underline cursor-pointer inline-flex items-center gap-1"
            >
              <span>View All {invoices.length} Invoices</span>
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
