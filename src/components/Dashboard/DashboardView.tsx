import React, { useState } from 'react';
import { Invoice } from '../../models/invoice.ts';
import { InventoryItem } from '../../models/item.ts';
import { Party } from '../../models/party.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { getPaymentReminderWhatsAppUrl, getWhatsAppShareUrl } from '../../core/utils/upiAndShare.ts';
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
  const totalTax = invoices.reduce((sum, inv) => sum + inv.totalTax, 0);

  const totalReceivables = parties
    .filter((p) => p.currentBalance > 0)
    .reduce((sum, p) => sum + p.currentBalance, 0);

  const totalPayables = parties
    .filter((p) => p.currentBalance < 0)
    .reduce((sum, p) => sum + Math.abs(p.currentBalance), 0);

  const debtorParties = parties.filter((p) => p.currentBalance > 0);

  // Collections split calculation
  const upiCollections = invoices
    .filter((i) => i.paymentMode === 'UPI')
    .reduce((sum, i) => sum + i.paidAmount, 0);
  const cashCollections = invoices
    .filter((i) => i.paymentMode === 'CASH')
    .reduce((sum, i) => sum + i.paidAmount, 0);
  const totalCollections = upiCollections + cashCollections;
  const collectionPercent = totalSales > 0 ? Math.min(100, Math.round((totalCollections / totalSales) * 100)) : 100;
  const upiPercent = totalCollections > 0 ? Math.round((upiCollections / totalCollections) * 100) : 67;

  // Filtered transactions
  const filteredInvoices = invoices.filter((inv) => {
    if (txFilter === 'UNPAID') return inv.balanceAmount > 0;
    if (txFilter === 'PAID') return inv.paymentStatus === 'PAID';
    return true;
  });

  const handleRemindFirstDebtor = () => {
    if (debtorParties.length > 0) {
      const debtor = debtorParties[0];
      const url = getPaymentReminderWhatsAppUrl(
        debtor.name,
        debtor.phone,
        debtor.currentBalance,
        company.tradeName || company.businessName,
        company.upiId
      );
      window.open(url, '_blank');
    } else {
      alert('All parties have cleared their balances!');
    }
  };

  return (
    <div className="flex flex-col w-full px-margin-mobile gap-space-md py-4 max-w-4xl mx-auto">
      {/* 1. GST & Compliance Alert Banner (Stitch Design) */}
      <section className="w-full bg-surface-container-high rounded-xl p-space-sm flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-space-sm min-w-0">
          <div className="w-8 h-8 rounded-full bg-surface-container-lowest flex items-center justify-center flex-shrink-0 text-secondary shadow-sm">
            <span className="material-symbols-outlined text-[18px]">verified_user</span>
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-label-md text-label-md text-on-surface font-bold">
                GSTR-1 Due in 6 days
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-outline-variant"></span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                Liability: <strong className="font-label-md text-on-surface">{formatINR(totalTax || 14820)}</strong>
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={() => onNavigateTab('reports')}
          className="text-secondary font-label-md text-label-md px-space-xs py-1 rounded-lg active:bg-secondary-container/40 transition-colors flex-shrink-0 flex items-center gap-0.5 cursor-pointer font-bold"
          type="button"
        >
          <span>Summary</span>
          <span className="material-symbols-outlined text-[16px]">chevron_right</span>
        </button>
      </section>

      {/* 2. Business Health Pulse Cards (Stitch Design) */}
      <section className="flex flex-col gap-space-sm">
        {/* Today's Total Sales Card */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-outline-variant/20 flex flex-col gap-space-md">
          <div className="flex items-start justify-between">
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm text-on-surface-variant font-bold flex items-center gap-1 uppercase tracking-wider">
                TODAY'S TOTAL SALES
                <span className="material-symbols-outlined text-[15px] text-outline">insights</span>
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="font-currency-display-mobile text-currency-display-mobile text-on-surface font-extrabold tracking-tight">
                  {formatINR(totalSales || 48250)}
                </span>
                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-label-sm text-label-sm font-bold">
                  <span className="material-symbols-outlined text-[13px]">trending_up</span>
                  +14.2%
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
              <span className="material-symbols-outlined text-[20px]">point_of_sale</span>
            </div>
          </div>

          {/* Collections Breakdown Split Bar */}
          <div className="pt-space-xs flex flex-col gap-1.5">
            <div className="flex items-center justify-between font-label-sm text-label-sm">
              <span className="text-on-surface-variant">
                Collections: <span className="font-label-md text-on-surface font-bold">{formatINR(totalCollections || 36500)}</span>
              </span>
              <span className="text-secondary font-label-sm font-bold">{collectionPercent}% Collected</span>
            </div>
            <div className="w-full h-2 rounded-full bg-surface-container overflow-hidden flex">
              <div className="bg-secondary h-full rounded-l-full transition-all" style={{ width: `${upiPercent}%` }}></div>
              <div className="bg-secondary-container h-full transition-all" style={{ width: `${100 - upiPercent}%` }}></div>
            </div>
            <div className="flex items-center justify-between text-on-surface-variant font-body-sm text-body-sm pt-0.5 text-xs">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-secondary"></span>
                UPI: <strong className="text-on-surface">{formatINR(upiCollections || 24500)}</strong>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-secondary-container"></span>
                Cash: <strong className="text-on-surface">{formatINR(cashCollections || 12000)}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Dual Metric Cards: Receivable vs Payable */}
        <div className="grid grid-cols-2 gap-space-sm">
          {/* You'll Receive */}
          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-outline-variant/20 flex flex-col justify-between">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                  To Collect
                </span>
                <span className="w-2 h-2 rounded-full bg-secondary"></span>
              </div>
              <span className="font-currency-display-mobile text-currency-display-mobile text-secondary font-bold tracking-tight">
                {formatINR(totalReceivables || 184200)}
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant text-xs">
                From {debtorParties.length || 14} parties
              </span>
            </div>
            <button
              onClick={handleRemindFirstDebtor}
              className="mt-space-sm pt-space-xs flex items-center justify-between text-secondary font-label-sm text-label-sm active:opacity-75 transition-opacity cursor-pointer font-bold"
              type="button"
            >
              <span>Remind Parties</span>
              <span className="material-symbols-outlined text-[16px]">forward_to_inbox</span>
            </button>
          </div>

          {/* You'll Pay */}
          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-outline-variant/20 flex flex-col justify-between">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
                  To Pay
                </span>
                <span className="w-2 h-2 rounded-full bg-error"></span>
              </div>
              <span className="font-currency-display-mobile text-currency-display-mobile text-error font-bold tracking-tight">
                {formatINR(totalPayables || 62400)}
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant text-xs">
                To suppliers (7d)
              </span>
            </div>
            <button
              onClick={() => onNavigateTab('purchases')}
              className="mt-space-sm pt-space-xs flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm active:text-on-surface transition-colors cursor-pointer font-medium"
              type="button"
            >
              <span>Pay Suppliers</span>
              <span className="material-symbols-outlined text-[16px]">payments</span>
            </button>
          </div>
        </div>
      </section>

      {/* 3. Quick Action Grid (Stitch 4-grid) */}
      <section className="flex flex-col gap-space-xs">
        <div className="flex items-center justify-between px-space-xs">
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">
            Quick Actions
          </span>
          <span className="font-label-sm text-label-sm text-secondary font-medium cursor-pointer">
            Vyapar Fast Menu
          </span>
        </div>
        <div className="grid grid-cols-4 gap-space-xs">
          {/* Add Bill */}
          <button
            onClick={onNewInvoice}
            className="flex flex-col items-center gap-1.5 p-space-sm rounded-xl bg-surface-container-lowest shadow-sm border border-outline-variant/20 active:scale-95 transition-transform cursor-pointer"
            type="button"
          >
            <div className="w-12 h-12 rounded-xl bg-secondary-container/60 text-secondary flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">receipt_long</span>
            </div>
            <span className="font-label-sm text-label-sm text-on-surface text-center font-bold">Sale Bill</span>
          </button>

          {/* Add Purchase */}
          <button
            onClick={() => onNavigateTab('purchases')}
            className="flex flex-col items-center gap-1.5 p-space-sm rounded-xl bg-surface-container-lowest shadow-sm border border-outline-variant/20 active:scale-95 transition-transform cursor-pointer"
            type="button"
          >
            <div className="w-12 h-12 rounded-xl bg-surface-container text-on-surface-variant flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">shopping_cart</span>
            </div>
            <span className="font-label-sm text-label-sm text-on-surface text-center font-bold">Purchase</span>
          </button>

          {/* Add Party */}
          <button
            onClick={() => onNavigateTab('parties')}
            className="flex flex-col items-center gap-1.5 p-space-sm rounded-xl bg-surface-container-lowest shadow-sm border border-outline-variant/20 active:scale-95 transition-transform cursor-pointer"
            type="button"
          >
            <div className="w-12 h-12 rounded-xl bg-surface-container text-on-surface-variant flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">person_add</span>
            </div>
            <span className="font-label-sm text-label-sm text-on-surface text-center font-bold">Add Party</span>
          </button>

          {/* POS Quick Bill */}
          <button
            onClick={onQuickPos}
            className="flex flex-col items-center gap-1.5 p-space-sm rounded-xl bg-surface-container-lowest shadow-sm border border-outline-variant/20 active:scale-95 transition-transform cursor-pointer"
            type="button"
          >
            <div className="w-12 h-12 rounded-xl bg-primary-fixed text-on-primary-fixed flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">storefront</span>
            </div>
            <span className="font-label-sm text-label-sm text-on-surface text-center font-bold">POS Counter</span>
          </button>
        </div>
      </section>

      {/* 4. Recent Transactions Feed (Stitch Design) */}
      <section className="flex flex-col gap-space-sm">
        <div className="flex items-center justify-between px-space-xs">
          <div className="flex items-center gap-1.5">
            <span className="font-headline-sm text-[16px] text-on-surface font-bold">Recent Transactions</span>
            <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
          </div>
          <button
            onClick={() => onNavigateTab('sales')}
            className="text-secondary font-label-sm text-label-sm font-bold active:opacity-75 transition-opacity cursor-pointer"
            type="button"
          >
            See All Sales →
          </button>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          <button
            onClick={() => setTxFilter('ALL')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
              txFilter === 'ALL'
                ? 'bg-secondary text-on-secondary shadow-sm'
                : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30'
            }`}
            type="button"
          >
            All Bills
          </button>
          <button
            onClick={() => setTxFilter('UNPAID')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
              txFilter === 'UNPAID'
                ? 'bg-error text-on-error shadow-sm'
                : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30'
            }`}
            type="button"
          >
            Pending Due
          </button>
          <button
            onClick={() => setTxFilter('PAID')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
              txFilter === 'PAID'
                ? 'bg-secondary text-on-secondary shadow-sm'
                : 'bg-surface-container-lowest text-on-surface-variant border border-outline-variant/30'
            }`}
            type="button"
          >
            Paid in Full
          </button>
        </div>

        {/* Transactions Card List */}
        <div className="rounded-xl bg-surface-container-lowest shadow-sm border border-outline-variant/20 overflow-hidden divide-y divide-outline-variant/20">
          {filteredInvoices.length === 0 ? (
            <div className="p-8 text-center text-on-surface-variant text-sm">
              No transactions match this filter.
            </div>
          ) : (
            filteredInvoices.slice(0, 8).map((inv) => {
              const isPaid = inv.paymentStatus === 'PAID';
              return (
                <div
                  key={inv.id}
                  className="p-space-md flex items-center justify-between hover:bg-surface-container-low/40 transition-colors"
                >
                  <div className="flex items-center gap-space-sm min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        isPaid ? 'bg-secondary-container/60 text-secondary' : 'bg-error-container/60 text-error'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        {isPaid ? 'check_circle' : 'pending_actions'}
                      </span>
                    </div>

                    <div className="flex flex-col min-w-0">
                      <span className="font-label-md text-label-md text-on-surface font-bold truncate">
                        {inv.partyName}
                      </span>
                      <div className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                        <span>{inv.invoiceNumber}</span>
                        <span>•</span>
                        <span>{formatDate(inv.date)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-space-sm flex-shrink-0">
                    <div className="flex flex-col items-end">
                      <span className="font-tabular-data text-[15px] font-extrabold text-on-surface">
                        {formatINR(inv.grandTotal)}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          isPaid ? 'bg-secondary-container text-on-secondary-container' : 'bg-error-container text-on-error-container'
                        }`}
                      >
                        {inv.paymentStatus}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onViewInvoice(inv)}
                        aria-label="View Invoice"
                        className="w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-on-surface-variant active:text-on-surface cursor-pointer"
                        title="View & Print"
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[16px]">visibility</span>
                      </button>
                      <button
                        onClick={() => {
                          const url = getWhatsAppShareUrl(inv, company);
                          window.open(url, '_blank');
                        }}
                        aria-label="Share on WhatsApp"
                        className="w-8 h-8 rounded-lg bg-[#25D366]/15 text-[#25D366] flex items-center justify-center active:scale-95 cursor-pointer"
                        title="WhatsApp"
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[16px]">send</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
};
