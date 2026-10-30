import React, { useState, useMemo, useCallback } from 'react';
import type { CompanyProfile } from '../../models/company.ts';
import type { BankAccount, CashBankTransaction, UnifiedLedgerEntry } from '../../models/bankAccount.ts';
import type { Invoice, PaymentSplit } from '../../models/invoice.ts';
import type { PurchaseBill } from '../../models/purchase.ts';
import type { Expense } from '../../models/expense.ts';
import type { Voucher, PaymentAllocation } from '../../core/accounting/voucherTypes.ts';
import type { Party } from '../../models/party.ts';
import type { AppTab } from '../Shell/Drawer.tsx';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { computeCashBankSummary } from '../../core/accounting/cashBankCalculator.ts';
import { DatePreset, getDateFilterBounds, isDateInRange } from '../../core/utils/dateFilters.ts';
import { DateFilterModal } from '../Common/DateFilterModal.tsx';
import { DirectCashBankModal } from '../CashBank/DirectCashBankModal.tsx';
import { RecordPaymentModal } from '../Parties/RecordPaymentModal.tsx';
import { usePaymentModal } from './PaymentModalContext.tsx';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { inferVoucherPaymentMode } from '../../core/accounting/paymentAllocation.ts';
import type { PassbookEntry } from '../Parties/usePartyPassbook.ts';

const CashBankTransactionDetailModal = React.lazy(() =>
  import('../CashBank/CashBankTransactionDetailModal.tsx').then((m) => ({ default: m.CashBankTransactionDetailModal }))
);
const VoucherEditorModal = React.lazy(() =>
  import('../Parties/VoucherEditorModal.tsx').then((m) => ({ default: m.VoucherEditorModal }))
);

export interface PaymentTransactionsViewProps {
  flow: 'IN' | 'OUT';
  company: CompanyProfile;
  accounts: BankAccount[];
  transactions: CashBankTransaction[];
  invoices: Invoice[];
  purchases: PurchaseBill[];
  expenses: Expense[];
  vouchers?: Voucher[];
  parties?: Party[];
  onSaveTransaction: (txn: CashBankTransaction) => void;
  onDeleteTransaction: (id: string) => void;
  onNavigateTab: (tab: AppTab) => void;
  onViewInvoice?: (invoice: Invoice) => void;
  onViewPurchase?: (bill: PurchaseBill) => void;
  onRecordPartyPayment?: (
    party: Party,
    amount: number,
    paymentMode: string,
    notes: string,
    paymentType?: 'IN' | 'OUT',
    paymentSplits?: PaymentSplit[],
    discount?: number,
    bankAccountId?: string,
    allocations?: PaymentAllocation[],
    allocationMode?: 'MANUAL' | 'AUTO_FIFO' | 'UNALLOCATED' | 'SOURCE_DOCUMENT',
    paymentDate?: string
  ) => boolean | void;
  onOpenPaymentModal?: (flow: 'IN' | 'OUT') => void;
  onUnlinkAllocation?: (voucherId: string, documentType: 'INVOICE' | 'PURCHASE', documentId: string) => void;
}

export const PaymentTransactionsView: React.FC<PaymentTransactionsViewProps> = ({
  flow,
  company,
  accounts,
  transactions,
  invoices,
  purchases,
  expenses,
  vouchers = [],
  parties = [],
  onSaveTransaction,
  onDeleteTransaction,
  onNavigateTab,
  onViewInvoice,
  onViewPurchase,
  onRecordPartyPayment,
  onOpenPaymentModal,
  onUnlinkAllocation,
}) => {
  const isFlowIn = flow === 'IN';
  const paymentModal = usePaymentModal();

  const [isLocalPaymentModalOpen, setIsLocalPaymentModalOpen] = useState(false);
  const [isDirectModalOpen, setIsDirectModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedLedgerEntry, setSelectedLedgerEntry] = useState<UnifiedLedgerEntry | null>(null);
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState<Voucher | null>(null);
  const [editingVoucherParty, setEditingVoucherParty] = useState<Party | null>(null);

  // Filters: Payment In/Out defaults to ALL_TIME as mandated by invariant #17
  const [datePreset, setDatePreset] = useState<DatePreset>('ALL_TIME');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [accountFilter, setAccountFilter] = useState<string>('ALL'); // 'ALL' | 'CASH' | 'BANK' | accountId
  const [searchQuery, setSearchQuery] = useState('');

  // Android back-navigation priority handling
  useBackNavigation(() => {
    if (isLocalPaymentModalOpen) {
      setIsLocalPaymentModalOpen(false);
      return true;
    }
    if (editingVoucher) {
      setEditingVoucher(null);
      setEditingVoucherParty(null);
      return true;
    }
    if (isDateModalOpen) {
      setIsDateModalOpen(false);
      return true;
    }
    if (isDirectModalOpen) {
      setIsDirectModalOpen(false);
      return true;
    }
    if (isDetailModalOpen) {
      setIsDetailModalOpen(false);
      setSelectedLedgerEntry(null);
      return true;
    }
    return false;
  }, isLocalPaymentModalOpen || Boolean(editingVoucher) || isDateModalOpen || isDirectModalOpen || isDetailModalOpen, 20);

  const handleOpenRecordPayment = useCallback(() => {
    if (onOpenPaymentModal) {
      onOpenPaymentModal(flow);
    } else if (paymentModal.isAvailable) {
      paymentModal.openPaymentModal({ flow });
    } else {
      setIsLocalPaymentModalOpen(true);
    }
  }, [onOpenPaymentModal, flow, paymentModal]);

  const resolveVoucherParty = useCallback((voucher: Voucher): Party | null => {
    if (voucher.partyId) {
      const byId = parties.find((p) => p.id === voucher.partyId);
      if (byId) return byId;
    }
    if (voucher.partyName) {
      const norm = voucher.partyName.trim().toLowerCase();
      const byName = parties.find((p) => p.name.trim().toLowerCase() === norm);
      if (byName) return byName;
    }
    return null;
  }, [parties]);

  const handleEditVoucher = useCallback((voucher: Voucher) => {
    if (!voucher || (voucher.voucherType !== 'RECEIPT' && voucher.voucherType !== 'PAYMENT')) {
      return;
    }
    const party = resolveVoucherParty(voucher);
    if (!party) {
      alert('The party for this payment could not be found. Open the party statement to edit it.');
      return;
    }
    setEditingVoucher(voucher);
    setEditingVoucherParty(party);
    setIsDetailModalOpen(false);
    setSelectedLedgerEntry(null);
  }, [resolveVoucherParty]);

  const editingPassbookEntry = useMemo<PassbookEntry | null>(() => {
    if (!editingVoucher) return null;
    return {
      id: `vchr-${editingVoucher.id}`,
      rawId: editingVoucher.id,
      date: editingVoucher.date,
      docNumber: editingVoucher.voucherNumber,
      type: editingVoucher.voucherType === 'RECEIPT' ? 'PAYMENT_IN' : 'PAYMENT_OUT',
      description: editingVoucher.narration || '',
      debit: editingVoucher.voucherType === 'PAYMENT' ? editingVoucher.totalAmount : 0,
      credit: editingVoucher.voucherType === 'RECEIPT' ? editingVoucher.totalAmount : 0,
      runningBalance: 0,
      status: 'PAID',
      paymentMode: inferVoucherPaymentMode(editingVoucher),
      rawVoucher: editingVoucher,
    };
  }, [editingVoucher]);

  // Date range bounds
  const dateRange = useMemo(() => {
    return getDateFilterBounds(datePreset, customStart, customEnd);
  }, [datePreset, customStart, customEnd]);

  const voucherMap = useMemo(() => new Map(vouchers.map((v) => [v.id, v])), [vouchers]);
  const invoiceMap = useMemo(() => new Map(invoices.map((inv) => [inv.id, inv])), [invoices]);
  const purchaseMap = useMemo(() => new Map(purchases.map((pur) => [pur.id, pur])), [purchases]);

  // Compute live ledger math via centralized engine
  const summary = useMemo(() => {
    return computeCashBankSummary({
      accounts,
      invoices,
      purchases,
      expenses,
      vouchers,
      transactions,
    });
  }, [accounts, invoices, purchases, expenses, vouchers, transactions]);

  // Filtered ledger entries (Strictly excludes CONTRA rows)
  const filteredEntries = useMemo(() => {
    return summary.ledgerEntries.filter((entry) => {
      // 1. Flow & contra exclusion invariant
      if (entry.flow !== flow || entry.type === 'CONTRA' || entry.contraType) {
        return false;
      }

      // 2. Account filter
      if (accountFilter === 'CASH') {
        if (entry.category !== 'CASH' && entry.accountId !== 'ACC_CASH') return false;
      } else if (accountFilter === 'BANK') {
        if (entry.category !== 'BANK' || entry.accountId === 'ACC_CASH') return false;
      } else if (accountFilter !== 'ALL') {
        // Specific account ID
        if (entry.accountId !== accountFilter) return false;
      }

      // 3. Date range filter
      if (dateRange.start || dateRange.end) {
        if (!isDateInRange(entry.date, dateRange.start, dateRange.end)) {
          return false;
        }
      }

      // 4. Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchTitle = (entry.counterpartyOrTitle || '').toLowerCase().includes(query);
        const matchRef = (entry.referenceNo || '').toLowerCase().includes(query);
        const matchDesc = (entry.description || '').toLowerCase().includes(query);
        const matchMode = (entry.mode || '').toLowerCase().includes(query);
        const matchAccount = (entry.accountName || '').toLowerCase().includes(query);
        const matchAmount = entry.amount.toString().includes(query);

        let matchLinkedDocs = false;
        if (entry.rawVoucherId) {
          const v = voucherMap.get(entry.rawVoucherId);
          if (v) {
            if (v.voucherNumber?.toLowerCase().includes(query)) matchLinkedDocs = true;
            if (v.sourceDocumentNumber?.toLowerCase().includes(query)) matchLinkedDocs = true;
            if (v.paymentAllocations?.some((a) => a.documentNumber.toLowerCase().includes(query))) {
              matchLinkedDocs = true;
            }
          }
        }

        if (!matchTitle && !matchRef && !matchDesc && !matchMode && !matchAccount && !matchAmount && !matchLinkedDocs) {
          return false;
        }
      }

      return true;
    });
  }, [summary.ledgerEntries, flow, accountFilter, dateRange.start, dateRange.end, searchQuery, voucherMap]);

  // Totals for the current filtered set (never misleading all-time totals)
  const { totalAmount, totalCount, cashPortion, bankPortion } = useMemo(() => {
    let sum = 0;
    let cash = 0;
    let bank = 0;

    for (const entry of filteredEntries) {
      sum += entry.amount;
      if (entry.category === 'CASH' || entry.accountId === 'ACC_CASH') {
        cash += entry.amount;
      } else {
        bank += entry.amount;
      }
    }

    return {
      totalAmount: Math.round(sum * 100) / 100,
      totalCount: filteredEntries.length,
      cashPortion: Math.round(cash * 100) / 100,
      bankPortion: Math.round(bank * 100) / 100,
    };
  }, [filteredEntries]);

  // Resolve raw transaction for native direct entries
  const selectedRawTxn = useMemo(() => {
    if (!selectedLedgerEntry) return null;
    if (selectedLedgerEntry.txnId) {
      return transactions.find((t) => t.id === selectedLedgerEntry.txnId) || null;
    }
    const cleanId = selectedLedgerEntry.id.replace(/^LEDGER-TXN-(OUT|IN)-/, '');
    return transactions.find((t) => t.id === cleanId || t.id === selectedLedgerEntry.id) || null;
  }, [selectedLedgerEntry, transactions]);

  const handleOpenDetailModal = (entry: UnifiedLedgerEntry) => {
    setSelectedLedgerEntry(entry);
    setIsDetailModalOpen(true);
  };

  const pageTitle = isFlowIn ? 'Payment In' : 'Payment Out';
  const pageSubtitle = isFlowIn
    ? 'Customer receipts, sales collections & money-in transactions'
    : 'Supplier payments, purchase disbursements & overhead payouts';
  const ctaLabel = isFlowIn ? '+ Record Payment In' : '+ Record Payment Out';
  const directModalFlow = isFlowIn ? 'ADD_MONEY' : 'REDUCE_MONEY';

  // Preselected account for manual creation modal
  const preselectedAccountId =
    accountFilter !== 'ALL' && accountFilter !== 'BANK'
      ? accountFilter === 'CASH'
        ? 'ACC_CASH'
        : accountFilter
      : undefined;

  return (
    <div className="flex flex-col w-full px-3 sm:px-4 md:px-6 py-3 gap-3.5 max-w-7xl mx-auto">
      {/* 1. Header Bar with Back Button to Dashboard */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => onNavigateTab('dashboard')}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high transition-colors cursor-pointer flex-shrink-0"
            title="Back to Dashboard"
            aria-label="Back to dashboard"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-headline-sm text-base sm:text-lg font-bold text-on-surface truncate">
                {pageTitle}
              </h1>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  isFlowIn
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                    : 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
                }`}
              >
                {isFlowIn ? 'Money In' : 'Money Out'}
              </span>
            </div>
            <span className="text-[11px] text-on-surface-variant truncate">
              {pageSubtitle}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {(onRecordPartyPayment || onOpenPaymentModal || paymentModal.isAvailable) && (
            <button
              type="button"
              onClick={handleOpenRecordPayment}
              className={`h-9 px-3 sm:px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer ${
                isFlowIn
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                  : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20'
              }`}
              title={isFlowIn ? 'Record Receipt with bill links' : 'Record Payment with bill links'}
              aria-label={isFlowIn ? 'Record Receipt' : 'Record Payment'}
            >
              <span className="material-symbols-outlined text-[17px]">
                {isFlowIn ? 'receipt_long' : 'payments'}
              </span>
              <span className="hidden sm:inline">
                {isFlowIn ? '+ Record Receipt' : '+ Record Payment'}
              </span>
              <span className="sm:hidden">{isFlowIn ? '+ Receipt' : '+ Payment'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsDirectModalOpen(true)}
            className="h-9 px-2.5 sm:px-3 rounded-xl text-xs font-semibold flex items-center gap-1 border border-outline-variant/30 bg-surface-container-lowest hover:bg-surface-container text-on-surface-variant transition-all cursor-pointer"
            title={ctaLabel}
            aria-label={ctaLabel}
          >
            <span className="material-symbols-outlined text-[16px]">
              {isFlowIn ? 'add_circle' : 'remove_circle'}
            </span>
            <span className="hidden md:inline">Direct</span>
          </button>
        </div>
      </div>

      {/* 2. Total Summary Strip for Filtered Set */}
      <section className="grid grid-cols-3 gap-2 p-2.5 sm:p-3.5 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs">
        {/* Metric 1: Total Sum */}
        <div className="flex flex-col min-w-0 px-1 border-r border-outline-variant/20">
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1 truncate">
            <span
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                isFlowIn ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
            />
            <span className="truncate">{isFlowIn ? 'Total Received' : 'Total Paid'}</span>
          </span>
          <span
            className={`font-tabular-data text-sm sm:text-base md:text-lg font-black mt-0.5 truncate ${
              isFlowIn
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-rose-700 dark:text-rose-400'
            }`}
          >
            {formatINR(totalAmount)}
          </span>
          <span className="text-[10px] text-on-surface-variant font-medium truncate">
            {totalCount} transaction{totalCount === 1 ? '' : 's'}
          </span>
        </div>

        {/* Metric 2: Cash Component */}
        <div className="flex flex-col min-w-0 px-1 border-r border-outline-variant/20">
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1 truncate">
            <span className="material-symbols-outlined text-[13px] flex-shrink-0">payments</span>
            <span className="truncate">In Cash</span>
          </span>
          <span className="font-tabular-data text-sm sm:text-base md:text-lg font-black text-on-surface mt-0.5 truncate">
            {formatINR(cashPortion)}
          </span>
          <span className="text-[10px] text-on-surface-variant font-medium truncate">
            Physical register
          </span>
        </div>

        {/* Metric 3: Bank / Online Component */}
        <div className="flex flex-col min-w-0 px-1">
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1 truncate">
            <span className="material-symbols-outlined text-[13px] flex-shrink-0">account_balance</span>
            <span className="truncate">Via Bank / UPI</span>
          </span>
          <span className="font-tabular-data text-sm sm:text-base md:text-lg font-black text-on-surface mt-0.5 truncate">
            {formatINR(bankPortion)}
          </span>
          <span className="text-[10px] text-on-surface-variant font-medium truncate">
            Bank transfers & UPI
          </span>
        </div>
      </section>

      {/* 3. Filter Bar: Sticky Search + Account Filter + Date Filter */}
      <section className="sticky top-0 z-20 bg-surface/95 backdrop-blur-md py-1.5 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          {/* Search Box */}
          <div className="flex-1 flex items-center bg-surface-container-lowest rounded-xl border border-outline-variant/30 px-3 py-1.5 shadow-xs">
            <span className="material-symbols-outlined text-outline text-[18px] mr-2 flex-shrink-0">
              search
            </span>
            <input
              type="text"
              placeholder={`Search ${pageTitle.toLowerCase()} by party, ref, mode, narration...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-xs text-on-surface placeholder:text-outline outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="text-outline hover:text-on-surface p-0.5 flex-shrink-0 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>

          {/* Date Range Selector Pill */}
          <button
            type="button"
            onClick={() => setIsDateModalOpen(true)}
            className={`h-9 flex items-center gap-1.5 px-3 rounded-xl shadow-xs text-xs font-bold cursor-pointer border transition-all shrink-0 active:scale-95 ${
              datePreset !== 'ALL_TIME'
                ? isFlowIn
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                  : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
                : 'bg-surface-container-lowest text-on-surface-variant border-outline-variant/25 hover:bg-surface-container-low'
            }`}
            title="Filter by date range"
            aria-label="Filter by date range"
          >
            <span className="material-symbols-outlined text-[15px]">calendar_month</span>
            <span className="truncate max-w-[100px] sm:max-w-[150px]">{dateRange.label}</span>
            {datePreset !== 'ALL_TIME' && (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setDatePreset('ALL_TIME');
                  setCustomStart('');
                  setCustomEnd('');
                }}
                className="material-symbols-outlined text-[13px] hover:text-error ml-0.5 cursor-pointer"
                title="Reset to All Time"
                aria-label="Reset date filter"
              >
                close
              </span>
            )}
          </button>
        </div>

        {/* Account Filter Pills / Dropdown */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          <button
            type="button"
            onClick={() => setAccountFilter('ALL')}
            className={`min-h-[30px] px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer flex-shrink-0 ${
              accountFilter === 'ALL'
                ? 'bg-primary text-on-primary shadow-xs'
                : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container border border-outline-variant/20'
            }`}
          >
            All Accounts
          </button>
          <button
            type="button"
            onClick={() => setAccountFilter('CASH')}
            className={`min-h-[30px] px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1 flex-shrink-0 ${
              accountFilter === 'CASH'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container border border-outline-variant/20'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">payments</span>
            <span>Cash</span>
          </button>
          <button
            type="button"
            onClick={() => setAccountFilter('BANK')}
            className={`min-h-[30px] px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1 flex-shrink-0 ${
              accountFilter === 'BANK'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container border border-outline-variant/20'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">account_balance</span>
            <span>Bank (All)</span>
          </button>

          {/* Specific bank accounts */}
          {accounts
            .filter((a) => a.accountType === 'BANK')
            .map((acc) => {
              const isSelected = accountFilter === acc.id;
              return (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => setAccountFilter(isSelected ? 'ALL' : acc.id)}
                  className={`min-h-[30px] px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer flex-shrink-0 ${
                    isSelected
                      ? 'bg-secondary text-on-secondary shadow-xs font-bold'
                      : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container border border-outline-variant/20'
                  }`}
                  title={acc.accountName}
                >
                  <span className="truncate max-w-[120px] inline-block align-middle">
                    {acc.accountName}
                  </span>
                </button>
              );
            })}

          {(accountFilter !== 'ALL' || datePreset !== 'ALL_TIME' || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setAccountFilter('ALL');
                setDatePreset('ALL_TIME');
                setCustomStart('');
                setCustomEnd('');
                setSearchQuery('');
              }}
              className="min-h-[30px] px-2.5 py-1 rounded-full text-xs font-semibold text-error hover:bg-error/10 border border-error/30 transition-colors cursor-pointer flex items-center gap-1 shrink-0"
              title="Clear all active filters"
            >
              <span className="material-symbols-outlined text-[14px]">filter_alt_off</span>
              <span>Reset</span>
            </button>
          )}
        </div>
      </section>

      {/* 4. Transactions List */}
      <section className="flex flex-col gap-2">
        {filteredEntries.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-2xl p-8 text-center text-on-surface-variant border border-outline-variant/20 shadow-xs flex flex-col items-center justify-center gap-2">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center ${
                isFlowIn ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'
              }`}
            >
              <span className="material-symbols-outlined text-[26px]">
                {isFlowIn ? 'call_received' : 'call_made'}
              </span>
            </div>
            <p className="font-bold text-sm text-on-surface">
              No {pageTitle} transactions found
            </p>
            <p className="text-xs text-outline max-w-sm">
              {searchQuery || accountFilter !== 'ALL' || datePreset !== 'ALL_TIME'
                ? 'Try clearing your active search or filters to see more entries.'
                : isFlowIn
                ? 'No money-in transactions recorded yet. Record your first customer payment or receipt below.'
                : 'No money-out transactions recorded yet. Record your first supplier payment or expense below.'}
            </p>
            <button
              type="button"
              onClick={() => setIsDirectModalOpen(true)}
              className={`mt-2 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xs cursor-pointer active:scale-95 transition-all ${
                isFlowIn ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              {ctaLabel}
            </button>
          </div>
        ) : (
          filteredEntries.map((entry) => {
            const isNative =
              entry.type === 'DIRECT_IN' ||
              entry.type === 'DIRECT_OUT' ||
              Boolean(entry.txnId) ||
              entry.id.startsWith('LEDGER-TXN-');

            return (
              <div
                key={entry.id}
                onClick={() => handleOpenDetailModal(entry)}
                className="w-full p-3 sm:p-3.5 rounded-2xl bg-surface-container-lowest border border-outline-variant/25 hover:border-secondary/40 shadow-xs hover:shadow-sm transition-all cursor-pointer flex items-center justify-between gap-3 active:scale-[0.99]"
              >
                {/* Left Side: Avatar + Details */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0 ${
                      isFlowIn
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                        : 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {isFlowIn ? 'arrow_downward' : 'arrow_upward'}
                    </span>
                  </div>

                  <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-xs sm:text-sm text-on-surface truncate">
                        {entry.counterpartyOrTitle || (isFlowIn ? 'Direct Inflow' : 'Direct Outflow')}
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-surface-container text-on-surface-variant flex-shrink-0">
                        {entry.type.replace('_', ' ')}
                      </span>
                      {isNative ? (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-primary/10 text-primary border border-primary/20 flex-shrink-0">
                          Direct
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 flex-shrink-0">
                          Auto
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-on-surface-variant mt-0.5 truncate">
                      <span>{formatDate(entry.date)}</span>
                      <span>•</span>
                      <span className="truncate flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-[13px]">
                          {entry.category === 'CASH' ? 'payments' : 'account_balance'}
                        </span>
                        <span>{entry.accountName}</span>
                      </span>
                      {entry.mode && (
                        <>
                          <span>•</span>
                          <span className="truncate font-medium">{entry.mode}</span>
                        </>
                      )}
                      {entry.referenceNo && (
                        <>
                          <span>•</span>
                          <span className="truncate font-mono">Ref: {entry.referenceNo}</span>
                        </>
                      )}
                    </div>

                    {/* Linked Document Badges for Payment Vouchers */}
                    {(() => {
                      const linkedVoucher = entry.rawVoucherId ? voucherMap.get(entry.rawVoucherId) : null;
                      if (!linkedVoucher) return null;

                      if (linkedVoucher.paymentAllocations && linkedVoucher.paymentAllocations.length > 0) {
                        const allocatedSum = linkedVoucher.paymentAllocations.reduce((s, a) => s + (a.amount || 0), 0);
                        const unallocatedAmount = Math.max(0, Math.round((linkedVoucher.totalAmount - allocatedSum) * 100) / 100);
                        return (
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <span className="text-[10px] text-on-surface-variant font-medium">Linked to:</span>
                            {linkedVoucher.paymentAllocations.map((alloc) => {
                              const inv = alloc.documentType === 'INVOICE' ? invoiceMap.get(alloc.documentId) : null;
                              const pur = alloc.documentType === 'PURCHASE' ? purchaseMap.get(alloc.documentId) : null;
                              return (
                                <button
                                  key={alloc.documentId}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (inv && onViewInvoice) onViewInvoice(inv);
                                    else if (pur && onViewPurchase) onViewPurchase(pur);
                                  }}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-secondary/10 hover:bg-secondary/20 text-secondary border border-secondary/20 text-[10px] font-bold font-mono transition-colors cursor-pointer"
                                  title={`Click to view ${alloc.documentNumber}`}
                                >
                                  <span>{alloc.documentNumber}</span>
                                  <span className="font-sans font-medium text-[9px] text-on-surface-variant">
                                    ({formatINR(alloc.amount)})
                                  </span>
                                  <span className="material-symbols-outlined text-[11px]">open_in_new</span>
                                </button>
                              );
                            })}
                            {unallocatedAmount > 0 ? (
                              <span className="px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[10px] font-medium">
                                Advance: {formatINR(unallocatedAmount)}
                              </span>
                            ) : null}
                          </div>
                        );
                      }

                      if (linkedVoucher.allocationMode === 'UNALLOCATED' || (!linkedVoucher.paymentAllocations?.length && linkedVoucher.partyId)) {
                        return (
                          <div className="flex items-center gap-1 mt-1.5">
                            <span className="px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[10px] font-medium">
                              Unallocated Advance: {formatINR(linkedVoucher.totalAmount || entry.amount)}
                            </span>
                          </div>
                        );
                      }

                      if (linkedVoucher.sourceDocumentNumber) {
                        return (
                          <div className="flex items-center gap-1 mt-1.5">
                            <span className="px-1.5 py-0.5 rounded-md bg-secondary/10 text-secondary text-[10px] font-medium font-mono">
                              Linked to: {linkedVoucher.sourceDocumentNumber}
                            </span>
                          </div>
                        );
                      }

                      return null;
                    })()}
                  </div>
                </div>

                {/* Right Side: Amount */}
                <div className="flex flex-col items-end flex-shrink-0">
                  <span
                    className={`font-tabular-data text-xs sm:text-sm font-black ${
                      isFlowIn
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-rose-700 dark:text-rose-400'
                    }`}
                  >
                    {isFlowIn ? `+${formatINR(entry.amount)}` : `-${formatINR(entry.amount)}`}
                  </span>
                  <span className="text-[10px] text-outline mt-0.5">
                    {isNative ? 'Tap to edit' : 'Tap for details'}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* 5. Direct Cash/Bank Modal (for recording manual Payment In / Out) */}
      <DirectCashBankModal
        isOpen={isDirectModalOpen}
        onClose={() => setIsDirectModalOpen(false)}
        accounts={accounts}
        accountBalances={summary.accountBalances}
        onSaveTxn={(txn) => {
          onSaveTransaction(txn);
          setIsDirectModalOpen(false);
        }}
        initialFlow={directModalFlow}
        preselectedAccountId={preselectedAccountId}
      />

      {/* 6. Detail / Edit / Delete Modal */}
      {isDetailModalOpen && (
        <React.Suspense fallback={null}>
          <CashBankTransactionDetailModal
            isOpen={isDetailModalOpen}
            onClose={() => {
              setIsDetailModalOpen(false);
              setSelectedLedgerEntry(null);
            }}
            entry={selectedLedgerEntry}
            rawTransaction={selectedRawTxn}
            accounts={accounts}
            company={company}
            parties={parties}
            vouchers={vouchers}
            invoices={invoices}
            purchases={purchases}
            onViewInvoice={onViewInvoice}
            onViewPurchase={onViewPurchase}
            onSaveTransaction={onSaveTransaction}
            onDeleteTransaction={onDeleteTransaction}
            onNavigateTab={onNavigateTab}
            onUnlinkAllocation={onUnlinkAllocation}
            onEditVoucher={handleEditVoucher}
          />
        </React.Suspense>
      )}

      {/* 7. Date Filter Modal */}
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
          setIsDateModalOpen(false);
        }}
        accentColor={isFlowIn ? 'emerald-600' : 'rose-600'}
      />

      {/* 8. Voucher Editor Modal (Edit Payment from Payment In / Payment Out) */}
      {editingPassbookEntry && editingVoucherParty && (
        <React.Suspense fallback={null}>
          <VoucherEditorModal
            editingLedgerEntry={editingPassbookEntry}
            party={editingVoucherParty}
            company={company}
            onClose={() => {
              setEditingVoucher(null);
              setEditingVoucherParty(null);
            }}
            onViewInvoice={onViewInvoice}
            onViewPurchase={onViewPurchase}
            onRefresh={() => {
              setEditingVoucher(null);
              setEditingVoucherParty(null);
            }}
          />
        </React.Suspense>
      )}

      {/* 9. Standalone Local Payment Modal Fallback (when global context is not active) */}
      {isLocalPaymentModalOpen && (
        <RecordPaymentModal
          asDialog={true}
          isOpen={isLocalPaymentModalOpen}
          onClose={() => setIsLocalPaymentModalOpen(false)}
          parties={parties}
          invoices={invoices}
          purchases={purchases}
          bankAccounts={accounts}
          initialPaymentType={isFlowIn ? 'IN' : 'OUT'}
          onRecordPayment={(
            party,
            amount,
            paymentMode,
            notes,
            paymentType,
            paymentSplits,
            discount,
            bankAccountId,
            allocations,
            allocationMode,
            paymentDate
          ) => {
            const res = onRecordPartyPayment?.(
              party,
              amount,
              paymentMode,
              notes,
              paymentType,
              paymentSplits,
              discount,
              bankAccountId,
              allocations,
              allocationMode,
              paymentDate
            );
            if (res === false) {
              return false;
            }
            setIsLocalPaymentModalOpen(false);
            return true;
          }}
        />
      )}
    </div>
  );
};
