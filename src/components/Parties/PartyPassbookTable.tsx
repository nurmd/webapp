import React from 'react';
import { formatINR } from '../../core/utils/formatters.ts';
import { PassbookEntry, TxnFilterType, TxnSortOrderType } from './usePartyPassbook.ts';

export interface PartyPassbookTableProps {
  filteredPassbook: PassbookEntry[];
  txnFilter: TxnFilterType;
  setTxnFilter: (filter: TxnFilterType) => void;
  txnSortOrder: TxnSortOrderType;
  setTxnSortOrder: React.Dispatch<React.SetStateAction<TxnSortOrderType>>;
  searchTxn: string;
  setSearchTxn: (val: string) => void;
  onTransactionClick: (entry: PassbookEntry) => void;
}

export const PartyPassbookTable: React.FC<PartyPassbookTableProps> = ({
  filteredPassbook,
  txnFilter,
  setTxnFilter,
  txnSortOrder,
  setTxnSortOrder,
  searchTxn,
  setSearchTxn,
  onTransactionClick,
}) => {
  return (
    <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 p-3 sm:p-4 shadow-xs flex flex-col gap-2.5">
      {/* Header & Filter Controls */}
      <div className="flex items-center justify-between gap-1 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-on-surface">Transactions</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-surface-container font-bold text-on-surface-variant">
            {filteredPassbook.length}
          </span>
        </div>

        {/* Segmented Filter Pills & Sort Toggle */}
        <div className="flex items-center gap-1.5">
          <div className="inline-flex rounded-lg bg-surface-container p-0.5 text-[11px] font-semibold">
            {(['ALL', 'BILLS', 'PAYMENTS'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setTxnFilter(tab)}
                className={`px-2 py-0.5 rounded-md transition-all cursor-pointer capitalize ${
                  txnFilter === tab
                    ? 'bg-surface-container-lowest text-on-surface shadow-xs font-bold'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {tab === 'ALL' ? 'All' : tab.toLowerCase()}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setTxnSortOrder((prev) => (prev === 'NEWEST' ? 'OLDEST' : 'NEWEST'))}
            className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-[11px] font-bold text-on-surface-variant hover:text-on-surface bg-surface-container hover:bg-surface-container-high cursor-pointer transition-colors"
            title={txnSortOrder === 'NEWEST' ? 'Sorted: Newest First (Click for Oldest)' : 'Sorted: Oldest First (Click for Newest)'}
          >
            <span className="material-symbols-outlined text-[13px] text-primary">
              {txnSortOrder === 'NEWEST' ? 'south' : 'north'}
            </span>
            <span>{txnSortOrder === 'NEWEST' ? 'Newest' : 'Oldest'}</span>
          </button>
        </div>
      </div>

      {/* Search bar inside ledger */}
      <div className="relative flex items-center">
        <span className="material-symbols-outlined absolute left-2.5 text-on-surface-variant text-[15px]">
          search
        </span>
        <input
          type="text"
          placeholder="Search by invoice #, note, amount..."
          value={searchTxn}
          onChange={(e) => setSearchTxn(e.target.value)}
          className="w-full bg-surface-container-low pl-8 pr-7 py-1 rounded-xl text-xs text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none border border-outline-variant/20"
        />
        {searchTxn && (
          <button
            type="button"
            onClick={() => setSearchTxn('')}
            className="absolute right-2 text-on-surface-variant hover:text-on-surface cursor-pointer"
          >
            <span className="material-symbols-outlined text-[13px]">close</span>
          </button>
        )}
      </div>

      {/* Passbook Item Cards Feed */}
      <div className="space-y-1.5">
        {filteredPassbook.length === 0 ? (
          <div className="py-8 text-center text-on-surface-variant flex flex-col items-center gap-1">
            <span className="material-symbols-outlined text-[24px] text-outline">receipt_long</span>
            <p className="text-xs">No transactions in this filter</p>
          </div>
        ) : (
          filteredPassbook.map((entry) => {
            const isCredit = entry.credit > 0;
            const isDebit = entry.debit > 0;

            return (
              <div
                key={entry.id}
                onClick={() => onTransactionClick(entry)}
                className="p-2.5 rounded-xl bg-surface-container-low/60 hover:bg-surface-container-low active:scale-[0.99] transition-all flex items-center justify-between gap-2 cursor-pointer"
              >
                {/* Left Icon and Details */}
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      entry.type === 'PAYMENT_IN'
                        ? 'bg-secondary/15 text-secondary'
                        : entry.type === 'PAYMENT_OUT'
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                        : entry.type === 'SALE'
                        ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                        : entry.type === 'PURCHASE'
                        ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
                        : 'bg-surface-container text-on-surface-variant'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[15px]">
                      {entry.type === 'PAYMENT_IN'
                        ? 'arrow_downward'
                        : entry.type === 'PAYMENT_OUT'
                        ? 'arrow_upward'
                        : entry.type === 'SALE'
                        ? 'point_of_sale'
                        : entry.type === 'PURCHASE'
                        ? 'shopping_bag'
                        : 'account_balance'}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-on-surface truncate text-xs">
                        {entry.type === 'SALE'
                          ? `Sale #${entry.docNumber}`
                          : entry.type === 'PURCHASE'
                          ? `Bill #${entry.docNumber}`
                          : entry.type === 'PAYMENT_IN'
                          ? `Payment In (${entry.paymentMode || 'UPI'})`
                          : entry.type === 'PAYMENT_OUT'
                          ? `Payment Out (${entry.paymentMode || 'Cash'})`
                          : 'Opening Balance'}
                      </span>
                      {entry.status && entry.status !== 'OPENING' && (
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                            entry.status === 'PAID'
                              ? 'bg-secondary/10 text-secondary'
                              : entry.status === 'PARTIAL'
                              ? 'bg-amber-500/10 text-amber-600'
                              : 'bg-error/10 text-error'
                          }`}
                        >
                          {entry.status}
                        </span>
                      )}
                    </div>

                    <p className="text-[10px] text-on-surface-variant truncate">
                      {entry.type === 'SALE' && entry.rawInvoice ? (
                        <>
                          {entry.date} • {entry.rawInvoice.paymentStatus === 'PAID'
                            ? `Fully Paid (${entry.rawInvoice.paymentMode || 'Cash'})`
                            : entry.rawInvoice.paidAmount > 0
                            ? `Paid: ${formatINR(entry.rawInvoice.paidAmount)} • Due: ${formatINR(entry.rawInvoice.balanceAmount)}`
                            : `Unpaid: ${formatINR(entry.rawInvoice.balanceAmount)}`}
                        </>
                      ) : entry.type === 'PURCHASE' && entry.rawPurchase ? (
                        <>
                          {entry.date} • {entry.rawPurchase.paymentStatus === 'PAID'
                            ? `Fully Paid (${entry.rawPurchase.paymentMode || 'Cash'})`
                            : entry.rawPurchase.paidAmount > 0
                            ? `Paid: ${formatINR(entry.rawPurchase.paidAmount)} • Due: ${formatINR(entry.rawPurchase.balanceAmount)}`
                            : `Unpaid: ${formatINR(entry.rawPurchase.balanceAmount)}`}
                        </>
                      ) : (
                        <>{entry.date} {entry.description ? `• ${entry.description}` : ''}</>
                      )}
                    </p>
                  </div>
                </div>

                {/* Right Amount & Chevron */}
                <div className="flex items-center gap-1.5 flex-shrink-0 text-right">
                  <div>
                    <span
                      className={`font-currency-display-mobile text-xs font-black block ${
                        entry.type === 'PURCHASE'
                          ? 'text-orange-600 dark:text-orange-400'
                          : entry.type === 'SALE'
                          ? 'text-blue-600 dark:text-blue-400'
                          : isCredit
                          ? 'text-secondary'
                          : isDebit
                          ? 'text-error'
                          : 'text-on-surface'
                      }`}
                    >
                      {entry.type === 'PURCHASE'
                        ? `- ${formatINR(entry.billAmount || entry.credit)}`
                        : entry.type === 'SALE'
                        ? `+ ${formatINR(entry.billAmount || entry.debit)}`
                        : isCredit
                        ? `+ ${formatINR(entry.credit)}`
                        : isDebit
                        ? `- ${formatINR(entry.debit)}`
                        : '₹0'}
                    </span>
                    <span className="text-[9px] font-mono text-outline block">
                      Bal: {formatINR(Math.abs(entry.runningBalance))}
                    </span>
                  </div>

                  <span className="material-symbols-outlined text-[16px] text-outline ml-0.5">
                    chevron_right
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};
