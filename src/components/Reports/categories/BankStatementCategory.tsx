import React, { useState, useMemo, useEffect } from 'react';
import {
  Landmark,
  CreditCard,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  ArrowRightLeft,
  Search,
  Filter,
} from 'lucide-react';
import type { CompanyProfile } from '../../../models/company.ts';
import type { BankAccount, CashBankTransaction, UnifiedLedgerEntry } from '../../../models/bankAccount.ts';
import type { Invoice } from '../../../models/invoice.ts';
import type { PurchaseBill } from '../../../models/purchase.ts';
import type { Expense } from '../../../models/expense.ts';
import type { Voucher } from '../../../core/accounting/voucherTypes.ts';
import { formatINR } from '../../../core/utils/formatters.ts';
import { computeCashBankSummary } from '../../../core/accounting/cashBankCalculator.ts';
import { exportReportToCsv, printReportDocument } from '../utils/reportExportUtils.ts';
import type { AppTab } from '../../Shell/Drawer.tsx';

const CashBankTransactionDetailModal = React.lazy(() =>
  import('../../CashBank/CashBankTransactionDetailModal.tsx').then((m) => ({ default: m.CashBankTransactionDetailModal }))
);

interface BankStatementCategoryProps {
  company: CompanyProfile;
  accounts: BankAccount[];
  transactions: CashBankTransaction[];
  invoices: Invoice[];
  purchases: PurchaseBill[];
  expenses: Expense[];
  vouchers?: Voucher[];
  searchQuery?: string;
  dateRangeLabel: string;
  dateRangeStart?: string;
  dateRangeEnd?: string;
  initialAccountId?: string;
  onRegisterExportHandlers?: (handlers: { exportCsv?: () => void; exportPdf?: () => void }) => void;
  onSaveTransaction?: (txn: CashBankTransaction) => void;
  onDeleteTransaction?: (id: string) => void;
  onNavigateTab?: (tab: AppTab) => void;
  onViewInvoice?: (invoice: Invoice) => void;
  onViewPurchase?: (bill: PurchaseBill) => void;
}

export const BankStatementCategory: React.FC<BankStatementCategoryProps> = ({
  company,
  accounts,
  transactions,
  invoices,
  purchases,
  expenses,
  vouchers = [],
  searchQuery = '',
  dateRangeLabel,
  dateRangeStart,
  dateRangeEnd,
  initialAccountId,
  onRegisterExportHandlers,
  onSaveTransaction,
  onDeleteTransaction,
  onNavigateTab,
  onViewInvoice,
  onViewPurchase,
}) => {
  // Find default or first bank account
  const defaultAccount = accounts.find((a) => a.accountType === 'BANK' && a.isDefault) ||
    accounts.find((a) => a.accountType === 'BANK') ||
    accounts[0] || {
      id: 'ACC_CASH',
      accountName: 'Cash in Hand',
      accountType: 'CASH' as const,
      openingBalance: 0,
      createdAt: '',
      updatedAt: '',
    };

  const [selectedAccountId, setSelectedAccountId] = useState<string>(() => {
    if (initialAccountId && accounts.some((a) => a.id === initialAccountId)) {
      return initialAccountId;
    }
    return defaultAccount.id;
  });

  useEffect(() => {
    if (initialAccountId && accounts.some((a) => a.id === initialAccountId)) {
      setSelectedAccountId(initialAccountId);
    }
  }, [initialAccountId, accounts]);
  // Default to chronological ascending order (standard banking passbook format)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Detail Modal State
  const [selectedEntry, setSelectedEntry] = useState<UnifiedLedgerEntry | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const selectedRawTxn = useMemo(() => {
    if (!selectedEntry) return null;
    if (selectedEntry.txnId) {
      return transactions.find((t) => t.id === selectedEntry.txnId) || null;
    }
    const cleanId = selectedEntry.id.replace(/^LEDGER-TXN-(OUT|IN)-/, '');
    return transactions.find((t) => t.id === cleanId || t.id === selectedEntry.id) || null;
  }, [selectedEntry, transactions]);

  const handleEntryClick = (entry: UnifiedLedgerEntry) => {
    setSelectedEntry(entry);
    setIsDetailModalOpen(true);
  };

  const selectedAccount = useMemo(() => {
    return accounts.find((a) => a.id === selectedAccountId) || defaultAccount;
  }, [accounts, selectedAccountId, defaultAccount]);

  // Generate unified ledger transactions
  const financialSummary = useMemo(() => {
    return computeCashBankSummary({
      accounts,
      invoices,
      purchases,
      expenses,
      vouchers,
      transactions,
    });
  }, [accounts, invoices, purchases, expenses, vouchers, transactions]);

  // Filter entries for the selected bank account and compute running balance
  const accountEntries = useMemo(() => {
    const isTargetCash = selectedAccount.accountType === 'CASH' || selectedAccount.id === 'ACC_CASH';
    const isDefaultBank = !isTargetCash && (selectedAccount.id === defaultAccount.id || selectedAccount.isDefault);

    // Filter relevant entries for the selected account
    const entries = financialSummary.ledgerEntries.filter((e) => {
      if (isTargetCash) {
        return e.category === 'CASH' || e.accountId === 'ACC_CASH';
      }
      if (isDefaultBank) {
        return e.category === 'BANK' && (e.accountId === selectedAccount.id || e.accountId === 'ACC_BANK' || e.accountId === 'ACC_BANK_DEFAULT');
      }
      return e.category === 'BANK' && e.accountId === selectedAccount.id;
    });

    // 1. Sort chronologically ascending with deterministic tie-breaker
    entries.sort((a, b) => {
      const dateDiff = a.date.localeCompare(b.date);
      if (dateDiff !== 0) return dateDiff;
      return a.id.localeCompare(b.id);
    });

    // 2. Compute period opening balance and isolate period entries
    let periodOpeningBalance = selectedAccount.openingBalance || 0;
    const periodEntries: UnifiedLedgerEntry[] = [];

    entries.forEach((entry) => {
      const normalizedDate = (entry.date || '').slice(0, 10);
      if (dateRangeStart && normalizedDate < dateRangeStart) {
        if (entry.flow === 'IN') {
          periodOpeningBalance += entry.amount;
        } else {
          periodOpeningBalance -= entry.amount;
        }
      } else if (!dateRangeEnd || normalizedDate <= dateRangeEnd) {
        periodEntries.push(entry);
      }
    });
    periodOpeningBalance = Math.round(periodOpeningBalance * 100) / 100;

    let currentBalance = periodOpeningBalance;
    const entriesWithRunningBalance: Array<UnifiedLedgerEntry & { calculatedRunningBalance: number; chronoIndex: number }> = [];

    let totalDeposits = 0;
    let totalWithdrawals = 0;

    periodEntries.forEach((entry, idx) => {
      if (entry.flow === 'IN') {
        currentBalance += entry.amount;
        totalDeposits += entry.amount;
      } else {
        currentBalance -= entry.amount;
        totalWithdrawals += entry.amount;
      }

      entriesWithRunningBalance.push({
        ...entry,
        chronoIndex: idx,
        calculatedRunningBalance: Math.round(currentBalance * 100) / 100,
      });
    });

    // 3. Order for display based on selected sortOrder
    const displayList = [...entriesWithRunningBalance];
    if (sortOrder === 'desc') {
      displayList.sort((a, b) => b.chronoIndex - a.chronoIndex);
    } else {
      displayList.sort((a, b) => a.chronoIndex - b.chronoIndex);
    }

    // 4. Apply search filter if any
    let filtered = displayList;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.counterpartyOrTitle.toLowerCase().includes(q) ||
          e.referenceNo?.toLowerCase().includes(q) ||
          e.description?.toLowerCase().includes(q) ||
          e.mode.toLowerCase().includes(q) ||
          e.type.toLowerCase().includes(q)
      );
    }

    return {
      entries: filtered,
      periodOpeningBalance,
      totalDeposits: Math.round(totalDeposits * 100) / 100,
      totalWithdrawals: Math.round(totalWithdrawals * 100) / 100,
      closingBalance: Math.round(currentBalance * 100) / 100,
    };
  }, [financialSummary, selectedAccount, defaultAccount.id, sortOrder, searchQuery, dateRangeStart, dateRangeEnd]);

  const showOpeningRow = useMemo(() => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      'opening balance brought forward b/f'.includes(q) ||
      (dateRangeStart && dateRangeStart.includes(q)) ||
      (selectedAccount.openingBalanceDate && selectedAccount.openingBalanceDate.includes(q))
    );
  }, [searchQuery, dateRangeStart, selectedAccount.openingBalanceDate]);

  // Register Export Handlers
  useEffect(() => {
    if (!onRegisterExportHandlers) return;

    const exportCsv = () => {
      const headers = ['Date', 'Type', 'Description / Counterparty', 'Ref No', 'Mode', 'Withdrawal (Debit)', 'Deposit (Credit)', 'Balance (INR)'];
      const rows: (string | number)[][] = [];

      const openingRow = [
        dateRangeStart || selectedAccount.openingBalanceDate || 'Opening',
        'OPENING',
        dateRangeStart ? `Period Opening Balance (as of ${dateRangeStart})` : 'Opening Balance Brought Forward (B/F)',
        '-',
        'OPENING',
        0,
        0,
        accountEntries.periodOpeningBalance,
      ];

      if (sortOrder === 'asc') {
        rows.push(openingRow);
      }

      accountEntries.entries.forEach((e) => {
        const contraDetails = e.type === 'CONTRA' && (e.fromAccountName || e.toAccountName)
          ? ` [From: ${e.fromAccountName || (e.flow === 'OUT' ? selectedAccount.accountName : 'Cash')} ➔ To: ${e.toAccountName || (e.flow === 'IN' ? selectedAccount.accountName : 'Bank')}]`
          : '';
        rows.push([
          e.date,
          e.type,
          `${e.counterpartyOrTitle}${contraDetails}`,
          e.referenceNo || '-',
          e.mode,
          e.flow === 'OUT' ? e.amount : 0,
          e.flow === 'IN' ? e.amount : 0,
          e.calculatedRunningBalance,
        ]);
      });

      if (sortOrder === 'desc') {
        rows.push(openingRow);
      }

      const summaryRow = [
        'Total / Closing Balance',
        '',
        '',
        '',
        '',
        accountEntries.totalWithdrawals,
        accountEntries.totalDeposits,
        accountEntries.closingBalance,
      ];

      exportReportToCsv(`BankStatement_${selectedAccount.accountName.replace(/\s+/g, '_')}_${Date.now()}`, headers, rows, summaryRow);
    };

    const exportPdf = () => {
      const openingRow = [
        dateRangeStart || selectedAccount.openingBalanceDate || 'Opening',
        'OPENING',
        dateRangeStart ? `Period Opening Balance (as of ${dateRangeStart})` : 'Opening Balance Brought Forward (B/F)',
        '-',
        '-',
        '-',
        '-',
        formatINR(accountEntries.periodOpeningBalance),
      ];

      const txnRows = accountEntries.entries.map((e) => {
        const contraDetails = e.type === 'CONTRA' && (e.fromAccountName || e.toAccountName)
          ? ` [From: ${e.fromAccountName || (e.flow === 'OUT' ? selectedAccount.accountName : 'Cash')} ➔ To: ${e.toAccountName || (e.flow === 'IN' ? selectedAccount.accountName : 'Bank')}]`
          : '';
        return [
          e.date,
          e.type,
          `${e.counterpartyOrTitle}${contraDetails}`,
          e.referenceNo || '-',
          e.mode,
          e.flow === 'OUT' ? formatINR(e.amount) : '-',
          e.flow === 'IN' ? formatINR(e.amount) : '-',
          formatINR(e.calculatedRunningBalance),
        ];
      });

      const rows = sortOrder === 'asc' ? [openingRow, ...txnRows] : [...txnRows, openingRow];

      printReportDocument({
        title: `Bank Statement: ${selectedAccount.accountName}`,
        subtitle: `Account Passbook & Transaction Ledger • ${dateRangeLabel}`,
        company,
        dateRangeLabel,
        kpis: [
          { label: 'Period Opening Balance', value: formatINR(accountEntries.periodOpeningBalance) },
          { label: 'Total Deposits (Credit)', value: `+${formatINR(accountEntries.totalDeposits)}` },
          { label: 'Total Withdrawals (Debit)', value: `-${formatINR(accountEntries.totalWithdrawals)}` },
          { label: 'Closing Balance', value: formatINR(accountEntries.closingBalance) },
        ],
        headers: ['Date', 'Type', 'Description / Details', 'Ref No', 'Mode', 'Debit (-)', 'Credit (+)', 'Balance (INR)'],
        rows,
        summaryRow: [
          'Total / Closing Balance',
          '',
          '',
          '',
          '',
          `-${formatINR(accountEntries.totalWithdrawals)}`,
          `+${formatINR(accountEntries.totalDeposits)}`,
          formatINR(accountEntries.closingBalance),
        ],
        columnAlignments: ['left', 'left', 'left', 'left', 'left', 'right', 'right', 'right'],
      });
    };

    onRegisterExportHandlers({ exportCsv, exportPdf });
  }, [accountEntries, selectedAccount, company, dateRangeLabel, dateRangeStart, onRegisterExportHandlers, sortOrder]);

  const openingRowNode = (
    <tr key="opening-balance-row" className="bg-surface-container-low/60 font-medium border-b border-outline-variant/30 text-on-surface">
      <td className="py-3 px-4 whitespace-nowrap text-on-surface-variant font-mono text-xs">
        {dateRangeStart || selectedAccount.openingBalanceDate || 'Opening'}
      </td>
      <td className="py-3 px-4">
        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30">
          OPENING
        </span>
      </td>
      <td className="py-3 px-4 text-on-surface">
        <div className="font-bold text-xs sm:text-sm">
          Opening Balance Brought Forward (B/F)
        </div>
        <div className="text-[11px] text-on-surface-variant">
          {dateRangeStart ? `Period Opening Balance (as of ${dateRangeStart}) • Calculated baseline before selected period` : 'Baseline account balance'}
        </div>
      </td>
      <td className="py-3 px-4 font-mono text-xs text-on-surface-variant">-</td>
      <td className="py-3 px-4 text-right font-mono text-on-surface-variant">-</td>
      <td className="py-3 px-4 text-right font-mono text-on-surface-variant">-</td>
      <td className="py-3 px-4 text-right font-mono font-bold text-on-surface">
        {formatINR(accountEntries.periodOpeningBalance)}
      </td>
    </tr>
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Account Switcher Bar */}
      <div className="bg-surface-container-low rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-outline-variant/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 shrink-0">
            <Landmark size={18} />
          </div>
          <div>
            <label htmlFor="account-selector" className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-on-surface-variant block mb-1">
              Select Bank Account / Register
            </label>
            <select
              id="account-selector"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="px-2.5 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-bold bg-surface border border-outline-variant/40 text-on-surface focus:ring-1 focus:ring-primary focus:outline-hidden cursor-pointer"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.accountName} ({acc.accountType}) {acc.accountNumber ? `•••• ${acc.accountNumber.slice(-4)}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Selected Account Details Pill */}
        <div className="flex items-center gap-3 text-xs sm:text-sm overflow-x-auto no-scrollbar py-0.5">
          {selectedAccount.bankName && (
            <span className="text-on-surface-variant text-[11px] sm:text-xs whitespace-nowrap shrink-0">Bank: <strong className="text-on-surface">{selectedAccount.bankName}</strong></span>
          )}
          {selectedAccount.ifscCode && (
            <span className="text-on-surface-variant font-mono text-[11px] sm:text-xs whitespace-nowrap shrink-0">IFSC: <strong className="text-on-surface">{selectedAccount.ifscCode}</strong></span>
          )}
        </div>
      </div>

      {/* Account Balance Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-surface-container-low p-3 sm:p-4 rounded-xl border border-outline-variant/30 flex flex-col justify-between">
          <div className="text-[11px] sm:text-xs text-on-surface-variant font-bold uppercase tracking-wide">
            Opening Balance
          </div>
          <div className="text-sm sm:text-xl font-bold font-mono text-on-surface my-0.5 sm:my-1">
            {formatINR(accountEntries.periodOpeningBalance)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-on-surface-variant">
            {dateRangeStart ? `As of ${dateRangeStart}` : 'Start balance (B/F)'}
          </div>
        </div>

        <div className="bg-surface-container-low p-3 sm:p-4 rounded-xl border border-outline-variant/30 flex flex-col justify-between">
          <div className="text-[11px] sm:text-xs text-on-surface-variant font-bold uppercase tracking-wide">
            Total Deposits (Credit)
          </div>
          <div className="text-sm sm:text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 my-0.5 sm:my-1">
            +{formatINR(accountEntries.totalDeposits)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-on-surface-variant truncate">
            Inward funds & receipts
          </div>
        </div>

        <div className="bg-surface-container-low p-3 sm:p-4 rounded-xl border border-outline-variant/30 flex flex-col justify-between">
          <div className="text-[11px] sm:text-xs text-on-surface-variant font-bold uppercase tracking-wide">
            Total Withdrawals (Debit)
          </div>
          <div className="text-sm sm:text-xl font-bold font-mono text-rose-600 dark:text-rose-400 my-0.5 sm:my-1">
            -{formatINR(accountEntries.totalWithdrawals)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-on-surface-variant truncate">
            Outward payments & charges
          </div>
        </div>

        <div className="bg-surface-container-low p-3 sm:p-4 rounded-xl border border-outline-variant/30 flex flex-col justify-between">
          <div className="text-[11px] sm:text-xs text-on-surface-variant font-bold uppercase tracking-wide">
            Closing Bank Balance
          </div>
          <div className="text-base sm:text-2xl font-extrabold font-mono text-primary my-0.5 sm:my-1">
            {formatINR(accountEntries.closingBalance)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-on-surface-variant">
            Available ledger balance
          </div>
        </div>
      </div>

      {/* Table Header Bar with Passbook Sort Order Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-on-surface flex items-center gap-2">
            <span>Passbook Ledger & Statement</span>
            <span className="text-[11px] font-normal text-on-surface-variant px-2 py-0.5 rounded-full bg-surface-container border border-outline-variant/30">
              {accountEntries.entries.length} {accountEntries.entries.length === 1 ? 'transaction' : 'transactions'}
            </span>
          </h3>
          <p className="text-[11px] sm:text-xs text-on-surface-variant mt-0.5">
            {sortOrder === 'asc' ? 'Chronological passbook order (Oldest first) • Monotonic running balance' : 'Recent transactions first (Newest first)'}
          </p>
        </div>

        {/* Sort Order Toggle */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto bg-surface-container-low p-1 rounded-xl border border-outline-variant/30 text-xs">
          <button
            type="button"
            onClick={() => setSortOrder('asc')}
            className={`px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              sortOrder === 'asc'
                ? 'bg-primary text-on-primary shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
            }`}
            title="Chronological passbook order: Opening balance on top, running balance increments sequentially"
          >
            <ArrowUp size={13} />
            <span>Oldest First (Passbook)</span>
          </button>
          <button
            type="button"
            onClick={() => setSortOrder('desc')}
            className={`px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              sortOrder === 'desc'
                ? 'bg-primary text-on-primary shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
            }`}
            title="Recent transactions first"
          >
            <ArrowDown size={13} />
            <span>Newest First</span>
          </button>
        </div>
      </div>

      {/* Statement Table */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-surface-container-low text-on-surface-variant border-b border-outline-variant/30 font-semibold">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Description / Details</th>
                <th className="py-3 px-4">Ref / UTR</th>
                <th className="py-3 px-4 text-right">Debit (-)</th>
                <th className="py-3 px-4 text-right">Credit (+)</th>
                <th className="py-3 px-4 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {sortOrder === 'asc' && showOpeningRow && openingRowNode}

              {accountEntries.entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-on-surface-variant italic">
                    {searchQuery.trim()
                      ? 'No transactions matching your search query.'
                      : `No transactions recorded for ${selectedAccount.accountName} in this period.`}
                  </td>
                </tr>
              ) : (
                accountEntries.entries.map((entry) => {
                  const isDeposit = entry.flow === 'IN';
                  const isContra = entry.type === 'CONTRA';
                  const fromName = entry.fromAccountName || (!isDeposit ? selectedAccount.accountName : 'Cash in Hand');
                  const toName = entry.toAccountName || (isDeposit ? selectedAccount.accountName : 'Bank');

                  return (
                    <tr
                      key={entry.id}
                      onClick={() => handleEntryClick(entry)}
                      className="hover:bg-surface-container-low/70 transition-colors cursor-pointer group"
                      title="Click to view/edit transaction details"
                    >
                      <td className="py-3 px-4 whitespace-nowrap text-on-surface font-mono text-xs">
                        {entry.date}
                      </td>
                      <td className="py-3 px-4">
                        {isContra ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30">
                              <ArrowRightLeft size={10} className="shrink-0" />
                              <span>CONTRA</span>
                            </span>
                            {entry.contraType && (
                              <span className="text-[9px] font-bold uppercase tracking-wide text-on-surface-variant text-center">
                                {entry.contraType}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-surface-container text-on-surface border border-outline-variant/20">
                            {entry.type}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-on-surface font-medium">
                        {isContra ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                              <span className="font-bold text-xs sm:text-sm text-on-surface whitespace-nowrap shrink-0">
                                {entry.counterpartyOrTitle}
                              </span>
                              {/* Visual From -> To Route Pill */}
                              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-xs whitespace-nowrap shrink-0">
                                <span className="text-[9px] uppercase font-bold text-blue-700 dark:text-blue-300 tracking-wider">From:</span>
                                <span className={`text-[11px] font-bold ${
                                  !isDeposit ? 'text-rose-700 dark:text-rose-400 underline underline-offset-2' : 'text-on-surface'
                                }`}>
                                  {fromName}
                                </span>
                                <ArrowRight size={11} className="text-blue-600 dark:text-blue-400 shrink-0 font-bold" />
                                <span className="text-[9px] uppercase font-bold text-blue-700 dark:text-blue-300 tracking-wider">To:</span>
                                <span className={`text-[11px] font-bold ${
                                  isDeposit ? 'text-emerald-700 dark:text-emerald-400 underline underline-offset-2' : 'text-on-surface'
                                }`}>
                                  {toName}
                                </span>
                              </div>
                            </div>
                            <div className="text-[11px] text-on-surface-variant flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                              <span className={`inline-flex items-center gap-0.5 font-semibold whitespace-nowrap shrink-0 ${
                                isDeposit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                              }`}>
                                {isDeposit ? (
                                  <>
                                    <ArrowDownLeft size={12} />
                                    <span>Received from <strong>{fromName}</strong></span>
                                  </>
                                ) : (
                                  <>
                                    <ArrowUpRight size={12} />
                                    <span>Transferred to <strong>{toName}</strong></span>
                                  </>
                                )}
                              </span>
                              {entry.description && (
                                <>
                                  <span>•</span>
                                  <span className="truncate italic text-on-surface-variant">{entry.description}</span>
                                </>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div>{entry.counterpartyOrTitle}</div>
                            {entry.description && (
                              <div className="text-[11px] text-on-surface-variant">{entry.description}</div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-on-surface-variant">
                        {entry.referenceNo || '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-rose-600 dark:text-rose-400">
                        {!isDeposit ? formatINR(entry.amount) : '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        {isDeposit ? formatINR(entry.amount) : '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-on-surface">
                        {formatINR(entry.calculatedRunningBalance)}
                      </td>
                    </tr>
                  );
                })
              )}

              {sortOrder === 'desc' && showOpeningRow && openingRowNode}
            </tbody>
            <tfoot>
              <tr className="bg-surface-container-low font-bold text-on-surface border-t-2 border-outline-variant/40">
                <td className="py-3 px-4 font-bold" colSpan={4}>
                  <span className="text-[10px] uppercase tracking-wider text-on-surface-variant block">Summary</span>
                  <span>Total Withdrawals, Deposits & Closing Balance</span>
                </td>
                <td className="py-3 px-4 text-right font-mono font-bold text-rose-600 dark:text-rose-400 text-xs sm:text-sm">
                  -{formatINR(accountEntries.totalWithdrawals)}
                </td>
                <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 text-xs sm:text-sm">
                  +{formatINR(accountEntries.totalDeposits)}
                </td>
                <td className="py-3 px-4 text-right font-mono font-extrabold text-primary text-sm sm:text-base">
                  {formatINR(accountEntries.closingBalance)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {isDetailModalOpen && (
        <React.Suspense fallback={null}>
          <CashBankTransactionDetailModal
            isOpen={isDetailModalOpen}
            onClose={() => {
              setIsDetailModalOpen(false);
              setSelectedEntry(null);
            }}
            entry={selectedEntry}
            rawTransaction={selectedRawTxn}
            accounts={accounts}
            vouchers={vouchers}
            invoices={invoices}
            purchases={purchases}
            onViewInvoice={onViewInvoice}
            onViewPurchase={onViewPurchase}
            onSaveTransaction={onSaveTransaction}
            onDeleteTransaction={onDeleteTransaction}
            onNavigateTab={onNavigateTab}
          />
        </React.Suspense>
      )}
    </div>
  );
};
