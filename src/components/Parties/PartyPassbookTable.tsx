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
      <div className="flex items-center justify-between gap-1 overflow-x-auto no-scrollbar py-0.5">
        <div className="flex items-center gap-1.5 whitespace-nowrap shrink-0">
          <span className="text-xs font-bold text-on-surface">Transactions</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-surface-container font-bold text-on-surface-variant">
            {filteredPassbook.length}
          </span>
        </div>

        {/* Segmented Filter Pills & Sort Toggle */}
        <div className="flex items-center gap-1.5 whitespace-nowrap shrink-0">
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
            aria-label="Clear search"
            className="absolute right-2 text-on-surface-variant hover:text-on-surface cursor-pointer"
          >
            <span className="material-symbols-outlined text-[13px]">close</span>
          </button>
        )}
      </div>

      {/* Passbook Item Cards Feed */}
      <div className="space-y-2">
        {filteredPassbook.length === 0 ? (
          <div className="py-8 text-center text-on-surface-variant flex flex-col items-center gap-1">
            <span className="material-symbols-outlined text-[24px] text-outline">receipt_long</span>
            <p className="text-xs">No transactions in this filter</p>
          </div>
        ) : (
          filteredPassbook.map((entry) => {
            const isCredit = entry.credit > 0;
            const isDebit = entry.debit > 0;

            // 1. Voucher Type Label & Icon
            let voucherTypeLabel = 'Transaction';
            let iconName = 'receipt';
            let iconColorClasses = 'bg-surface-container text-on-surface-variant';

            if (entry.type === 'SALE') {
              if (entry.rawInvoice?.invoiceType === 'CREDIT_NOTE') {
                voucherTypeLabel = 'Return';
                iconName = 'assignment_return';
                iconColorClasses = 'bg-rose-500/15 text-rose-600 dark:text-rose-400';
              } else {
                voucherTypeLabel = 'Invoice';
                iconName = 'point_of_sale';
                iconColorClasses = 'bg-blue-500/15 text-blue-600 dark:text-blue-400';
              }
            } else if (entry.type === 'PURCHASE') {
              if (entry.rawPurchase?.purchaseType === 'RETURN' || entry.rawPurchase?.noteType === 'D') {
                voucherTypeLabel = 'Return';
                iconName = 'assignment_return';
                iconColorClasses = 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
              } else {
                voucherTypeLabel = 'Purchase Bill';
                iconName = 'shopping_bag';
                iconColorClasses = 'bg-orange-500/15 text-orange-600 dark:text-orange-400';
              }
            } else if (entry.type === 'PAYMENT_IN') {
              voucherTypeLabel = 'Payment In';
              iconName = 'arrow_downward';
              iconColorClasses = 'bg-secondary/15 text-secondary';
            } else if (entry.type === 'PAYMENT_OUT') {
              voucherTypeLabel = 'Payment Out';
              iconName = 'arrow_upward';
              iconColorClasses = 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
            } else if (entry.type === 'OPENING') {
              voucherTypeLabel = 'Opening Balance';
              iconName = 'account_balance';
              iconColorClasses = 'bg-surface-container text-on-surface-variant';
            }

            // 2. Voucher Number (Line 2: gray text)
            const rawDocNo = (
              entry.rawInvoice?.invoiceNumber ||
              entry.rawPurchase?.billNumber ||
              entry.rawVoucher?.voucherNumber ||
              entry.docNumber ||
              ''
            ).trim();
            const voucherNumber = rawDocNo
              ? rawDocNo.startsWith('#')
                ? rawDocNo
                : `#${rawDocNo}`
              : '—';

            // 3. Line 3 Content: Voucher balance amount for invoice, linked voucherno for payment voucher
            let line3Node: React.ReactNode = null;

            if (entry.type === 'SALE') {
              const isCreditNote = entry.rawInvoice?.invoiceType === 'CREDIT_NOTE';
              if (isCreditNote) {
                const origInv = entry.rawInvoice?.originalInvoiceNumber;
                const bal = entry.rawInvoice?.balanceAmount;
                if (origInv) {
                  line3Node = (
                    <div className="text-[11px] text-on-surface-variant font-medium truncate">
                      Linked: #{origInv.replace(/^#/, '')}
                      {typeof bal === 'number' && (
                        <span className="ml-1 text-outline">• Balance: {formatINR(bal)}</span>
                      )}
                    </div>
                  );
                } else {
                  line3Node = (
                    <div className="text-[11px] text-on-surface-variant font-medium truncate">
                      Balance: {formatINR(entry.rawInvoice?.balanceAmount ?? entry.rawInvoice?.grandTotal ?? entry.billAmount ?? 0)}
                      {entry.rawInvoice?.returnReason && (
                        <span className="ml-1 text-outline">• {entry.rawInvoice.returnReason}</span>
                      )}
                    </div>
                  );
                }
              } else {
                const bal = entry.rawInvoice ? entry.rawInvoice.balanceAmount : (entry.billAmount ?? entry.debit ?? 0);
                const paid = entry.rawInvoice?.paidAmount ?? 0;
                line3Node = (
                  <div className="text-[11px] text-on-surface-variant font-medium truncate">
                    Balance: {formatINR(bal)}
                    {paid > 0 && bal > 0 ? (
                      <span className="ml-1 text-on-surface-variant/80 font-normal">
                        (Paid: {formatINR(paid)} • Due: {formatINR(bal)})
                      </span>
                    ) : null}
                  </div>
                );
              }
            } else if (entry.type === 'PURCHASE') {
              const isReturn = entry.rawPurchase?.purchaseType === 'RETURN' || entry.rawPurchase?.noteType === 'D';
              if (isReturn) {
                const origBill = entry.rawPurchase?.originalBillNumber || (entry.rawPurchase as any)?.originalInvoiceNumber;
                const bal = entry.rawPurchase?.balanceAmount;
                if (origBill) {
                  line3Node = (
                    <div className="text-[11px] text-on-surface-variant font-medium truncate">
                      Linked: #{origBill.replace(/^#/, '')}
                      {typeof bal === 'number' && (
                        <span className="ml-1 text-outline">• Balance: {formatINR(bal)}</span>
                      )}
                    </div>
                  );
                } else {
                  line3Node = (
                    <div className="text-[11px] text-on-surface-variant font-medium truncate">
                      Balance: {formatINR(entry.rawPurchase?.balanceAmount ?? entry.rawPurchase?.grandTotal ?? entry.billAmount ?? 0)}
                      {entry.rawPurchase?.returnReason && (
                        <span className="ml-1 text-outline">• {entry.rawPurchase.returnReason}</span>
                      )}
                    </div>
                  );
                }
              } else {
                const bal = entry.rawPurchase ? entry.rawPurchase.balanceAmount : (entry.billAmount ?? entry.credit ?? 0);
                const paid = entry.rawPurchase?.paidAmount ?? 0;
                line3Node = (
                  <div className="text-[11px] text-on-surface-variant font-medium truncate">
                    Balance: {formatINR(bal)}
                    {paid > 0 && bal > 0 ? (
                      <span className="ml-1 text-on-surface-variant/80 font-normal">
                        (Paid: {formatINR(paid)} • Due: {formatINR(bal)})
                      </span>
                    ) : null}
                  </div>
                );
              }
            } else if (entry.type === 'PAYMENT_IN' || entry.type === 'PAYMENT_OUT') {
              let linkedVouchersStr = '';
              let unallocatedAmt = 0;

              if (entry.rawVoucher) {
                if (entry.rawVoucher.paymentAllocations && entry.rawVoucher.paymentAllocations.length > 0) {
                  const docNumbers = entry.rawVoucher.paymentAllocations
                    .map((a) => a.documentNumber)
                    .filter(Boolean);
                  if (docNumbers.length > 0) {
                    linkedVouchersStr = docNumbers.map((d) => `#${d.replace(/^#/, '')}`).join(', ');
                  }
                  const allocatedSum = entry.rawVoucher.paymentAllocations.reduce((s, a) => s + (a.amount || 0), 0);
                  unallocatedAmt = Math.max(0, Math.round((entry.rawVoucher.totalAmount - allocatedSum) * 100) / 100);
                } else if (entry.rawVoucher.sourceDocumentNumber) {
                  linkedVouchersStr = `#${entry.rawVoucher.sourceDocumentNumber.replace(/^#/, '')}`;
                }
              } else if (entry.id.startsWith('pay-inv-') && entry.rawInvoice?.invoiceNumber) {
                linkedVouchersStr = `#${entry.rawInvoice.invoiceNumber.replace(/^#/, '')}`;
              } else if (entry.id.startsWith('pay-pur-') && entry.rawPurchase?.billNumber) {
                linkedVouchersStr = `#${entry.rawPurchase.billNumber.replace(/^#/, '')}`;
              }

              if (linkedVouchersStr) {
                line3Node = (
                  <div className="text-[11px] text-on-surface-variant font-medium truncate flex items-center gap-1.5">
                    <span className="truncate">Linked: {linkedVouchersStr}</span>
                    {unallocatedAmt > 0 && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium whitespace-nowrap">
                        Advance: {formatINR(unallocatedAmt)}
                      </span>
                    )}
                  </div>
                );
              } else {
                line3Node = (
                  <div className="text-[11px] text-on-surface-variant font-medium truncate">
                    {entry.description || 'Direct Payment (Unlinked)'}
                  </div>
                );
              }
            } else {
              // Opening Balance
              line3Node = (
                <div className="text-[11px] text-on-surface-variant font-medium truncate">
                  Opening Baseline
                </div>
              );
            }

            return (
              <div
                key={entry.id}
                data-testid={`passbook-entry-${entry.id}`}
                onClick={() => onTransactionClick(entry)}
                className="p-3 sm:p-3.5 rounded-2xl bg-surface-container-low/70 hover:bg-surface-container-low border border-outline-variant/20 hover:border-secondary/30 shadow-xs hover:shadow-sm active:scale-[0.99] transition-all flex items-center justify-between gap-3 cursor-pointer"
              >
                {/* Left Icon and 3-Line Details */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconColorClasses}`}
                  >
                    <span className="material-symbols-outlined text-[18px] sm:text-[20px]">
                      {iconName}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1 flex flex-col justify-center gap-0.5">
                    {/* Line 1: Voucher type (invoice, return, payment) and date */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-on-surface text-xs sm:text-sm">
                        {voucherTypeLabel}
                      </span>
                      <span className="text-outline text-[11px] sm:text-xs">
                        • {entry.date}
                      </span>
                      {entry.status && entry.status !== 'OPENING' && (
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                            entry.status === 'PAID'
                              ? 'bg-secondary/10 text-secondary'
                              : entry.status === 'PARTIAL'
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              : 'bg-error/10 text-error'
                          }`}
                        >
                          {entry.status}
                        </span>
                      )}
                    </div>

                    {/* Line 2: Voucher number in gray text */}
                    <div className="text-xs text-outline font-mono font-medium truncate tracking-tight">
                      {voucherNumber}
                    </div>

                    {/* Line 3: Voucher balance amount for invoice, linked voucherno for payment voucher */}
                    <div className="min-w-0 truncate">
                      {line3Node}
                    </div>
                  </div>
                </div>

                {/* Right Amount & Chevron */}
                <div className="flex items-center gap-2 flex-shrink-0 text-right">
                  <div>
                    <span
                      className={`font-currency-display-mobile text-xs sm:text-sm font-black block ${
                        entry.type === 'PURCHASE'
                          ? (entry.rawPurchase?.purchaseType === 'RETURN' || entry.rawPurchase?.noteType === 'D')
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-orange-600 dark:text-orange-400'
                          : entry.type === 'SALE'
                          ? entry.rawInvoice?.invoiceType === 'CREDIT_NOTE'
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-blue-600 dark:text-blue-400'
                          : isCredit
                          ? 'text-secondary'
                          : isDebit
                          ? 'text-error'
                          : 'text-on-surface'
                      }`}
                    >
                      {entry.type === 'PURCHASE'
                        ? (entry.rawPurchase?.purchaseType === 'RETURN' || entry.rawPurchase?.noteType === 'D')
                          ? `+ ${formatINR(entry.billAmount || entry.debit)}`
                          : `- ${formatINR(entry.billAmount || entry.credit)}`
                        : entry.type === 'SALE'
                        ? entry.rawInvoice?.invoiceType === 'CREDIT_NOTE'
                          ? `- ${formatINR(entry.billAmount || entry.credit)}`
                          : `+ ${formatINR(entry.billAmount || entry.debit)}`
                        : isCredit
                        ? `+ ${formatINR(entry.credit)}`
                        : isDebit
                        ? `- ${formatINR(entry.debit)}`
                        : '₹0'}
                    </span>
                    <span className="text-[10px] font-mono text-outline block mt-0.5">
                      Bal: {formatINR(Math.abs(entry.runningBalance))}
                    </span>
                  </div>

                  <span className="material-symbols-outlined text-[18px] text-outline ml-0.5">
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
