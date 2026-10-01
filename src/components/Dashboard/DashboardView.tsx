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
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  company,
  invoices,
  items,
  parties,
  onNewInvoice,
  onQuickPos,
  onViewInvoice,
  onNavigateTab,
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
          className="bg-amber-500/10 border border-amber-500/25 rounded-2xl px-3.5 py-2.5 flex items-center justify-between cursor-pointer active:scale-99 transition-all text-xs"
        >
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-medium">
            <span className="material-symbols-outlined text-[18px] text-amber-600">warning</span>
            <span>
              <strong>{lowStockItems.length} item{lowStockItems.length > 1 ? 's' : ''}</strong> running low on stock
            </span>
          </div>
          <span className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-0.5">
            <span>View Stock</span>
            <span className="material-symbols-outlined text-[15px]">chevron_right</span>
          </span>
        </div>
      )}

      {/* 2. Unified Financial Snapshot Card (Glanceable 3-Metric Summary) */}
      <section className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-outline-variant/30">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-outline-variant/20">
          <span className="font-bold text-xs uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-secondary"></span>
            Overview
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

        {/* 3-Column Metrics Grid */}
        <div className="grid grid-cols-3 divide-x divide-outline-variant/20 pt-1">
          {/* Total Sales */}
          <div
            onClick={() => onNavigateTab('sales')}
            className="px-2 first:pl-0 flex flex-col cursor-pointer group"
          >
            <span className="text-[10px] sm:text-xs text-on-surface-variant uppercase font-bold tracking-wider">
              Total Sales
            </span>
            <span className="font-tabular-data text-base sm:text-lg font-black text-on-surface mt-0.5 group-hover:text-secondary transition-colors">
              {formatINR(totalSales)}
            </span>
            <span className="text-[11px] text-on-surface-variant mt-0.5">
              {invoices.length} bill{invoices.length === 1 ? '' : 's'}
            </span>
          </div>

          {/* To Collect (Receivables) */}
          <div
            onClick={() => onNavigateTab('parties')}
            className="px-2 sm:px-3 flex flex-col cursor-pointer group"
          >
            <span className="text-[10px] sm:text-xs text-secondary uppercase font-bold tracking-wider flex items-center gap-1">
              To Collect
            </span>
            <span className="font-tabular-data text-base sm:text-lg font-black text-secondary mt-0.5 group-hover:opacity-85 transition-opacity">
              {formatINR(totalReceivables)}
            </span>
            <span className="text-[11px] text-on-surface-variant mt-0.5">
              {debtorParties.length} {debtorParties.length === 1 ? 'party' : 'parties'}
            </span>
          </div>

          {/* To Pay (Payables) */}
          <div
            onClick={() => onNavigateTab('purchases')}
            className="px-2 last:pr-0 flex flex-col cursor-pointer group"
          >
            <span className="text-[10px] sm:text-xs text-rose-600 dark:text-rose-400 uppercase font-bold tracking-wider">
              To Pay
            </span>
            <span className="font-tabular-data text-base sm:text-lg font-black text-rose-600 dark:text-rose-400 mt-0.5 group-hover:opacity-85 transition-opacity">
              {formatINR(totalPayables)}
            </span>
            <span className="text-[11px] text-on-surface-variant mt-0.5">
              {creditorParties.length} supplier{creditorParties.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      </section>

      {/* 3. Fast Quick Action Buttons */}
      <section className="grid grid-cols-4 gap-2">
        {/* + Sale Bill (Primary) */}
        <button
          onClick={onNewInvoice}
          type="button"
          className="flex flex-col items-center justify-center gap-1 py-3 px-2 rounded-2xl bg-secondary text-on-secondary shadow-sm active:scale-95 transition-transform cursor-pointer"
        >
          <span className="material-symbols-outlined text-[22px]">add_notes</span>
          <span className="font-bold text-xs">Sale Bill</span>
        </button>

        {/* POS Counter */}
        <button
          onClick={onQuickPos}
          type="button"
          className="flex flex-col items-center justify-center gap-1 py-3 px-2 rounded-2xl bg-surface-container-lowest text-on-surface border border-outline-variant/30 shadow-xs active:scale-95 transition-transform cursor-pointer"
        >
          <span className="material-symbols-outlined text-[22px] text-secondary">point_of_sale</span>
          <span className="font-bold text-xs">Quick POS</span>
        </button>

        {/* + Purchase */}
        <button
          onClick={() => onNavigateTab('purchases')}
          type="button"
          className="flex flex-col items-center justify-center gap-1 py-3 px-2 rounded-2xl bg-surface-container-lowest text-on-surface border border-outline-variant/30 shadow-xs active:scale-95 transition-transform cursor-pointer"
        >
          <span className="material-symbols-outlined text-[22px] text-on-surface-variant">shopping_bag</span>
          <span className="font-bold text-xs">Purchase</span>
        </button>

        {/* + Party */}
        <button
          onClick={() => onNavigateTab('parties')}
          type="button"
          className="flex flex-col items-center justify-center gap-1 py-3 px-2 rounded-2xl bg-surface-container-lowest text-on-surface border border-outline-variant/30 shadow-xs active:scale-95 transition-transform cursor-pointer"
        >
          <span className="material-symbols-outlined text-[22px] text-on-surface-variant">person_add</span>
          <span className="font-bold text-xs">Add Party</span>
        </button>
      </section>

      {/* 4. Recent Invoices (Single-Row Glanceable Passbook) */}
      <section className="bg-surface-container-lowest rounded-2xl p-4 shadow-sm border border-outline-variant/30 flex flex-col gap-3">
        {/* Header & Filter Row */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-on-surface">Recent Invoices</span>
            <span className="text-xs bg-surface-container-low px-2 py-0.5 rounded-full text-on-surface-variant font-bold">
              {invoices.length}
            </span>
          </div>

          <div className="flex items-center gap-1 bg-surface-container-low rounded-xl p-0.5 border border-outline-variant/30 text-xs font-bold">
            <button
              onClick={() => setTxFilter('ALL')}
              type="button"
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                txFilter === 'ALL'
                  ? 'bg-surface-container-lowest text-on-surface shadow-xs'
                  : 'text-on-surface-variant'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setTxFilter('UNPAID')}
              type="button"
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                txFilter === 'UNPAID'
                  ? 'bg-error-container text-on-error-container shadow-xs'
                  : 'text-on-surface-variant'
              }`}
            >
              Unpaid ({unpaidCount})
            </button>
            <button
              onClick={() => setTxFilter('PAID')}
              type="button"
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                txFilter === 'PAID'
                  ? 'bg-secondary text-on-secondary shadow-xs'
                  : 'text-on-surface-variant'
              }`}
            >
              Paid ({paidCount})
            </button>
          </div>
        </div>

        {/* Transactions List */}
        <div className="divide-y divide-outline-variant/20 -mx-4 -mb-4">
          {filteredInvoices.length === 0 ? (
            <div className="py-8 text-center text-on-surface-variant text-xs">
              No transactions match this filter.
            </div>
          ) : (
            filteredInvoices.slice(0, 10).map((inv) => {
              const isPaid = inv.paymentStatus === 'PAID';
              return (
                <div
                  key={inv.id}
                  onClick={() => onViewInvoice(inv)}
                  className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-surface-container-low/40 active:bg-surface-container-low cursor-pointer transition-colors"
                >
                  {/* Left: Customer Name & Invoice Info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                        isPaid
                          ? 'bg-secondary-container/60 text-secondary'
                          : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {isPaid ? 'receipt' : 'pending_actions'}
                      </span>
                    </div>

                    <div className="flex flex-col min-w-0">
                      <span className="font-bold text-xs sm:text-sm text-on-surface truncate">
                        {inv.partyName}
                      </span>
                      <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant truncate">
                        <span className="font-mono font-medium">{inv.invoiceNumber}</span>
                        <span>•</span>
                        <span>{formatDate(inv.date)}</span>
                        {inv.paymentMode && (
                          <>
                            <span>•</span>
                            <span className="uppercase">{inv.paymentMode}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Amount & Status Badge */}
                  <div className="flex items-center gap-2 flex-shrink-0 text-right">
                    <div className="flex flex-col items-end">
                      <span className="font-tabular-data text-xs sm:text-sm font-black text-on-surface">
                        {formatINR(inv.grandTotal)}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                          isPaid
                            ? 'bg-secondary-container text-on-secondary-container'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        }`}
                      >
                        {inv.paymentStatus}
                      </span>
                    </div>

                    <span className="material-symbols-outlined text-[18px] text-outline-variant">
                      chevron_right
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {invoices.length > 10 && (
          <div className="pt-2 text-center border-t border-outline-variant/20 -mx-4 -mb-2">
            <button
              onClick={() => onNavigateTab('sales')}
              type="button"
              className="text-secondary text-xs font-bold hover:underline cursor-pointer py-1"
            >
              View All {invoices.length} Invoices →
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
