import React, { useState, useMemo, useEffect } from 'react';
import {
  Landmark,
  CreditCard,
  ArrowDownLeft,
  ArrowUpRight,
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
  onRegisterExportHandlers?: (handlers: { exportCsv?: () => void; exportPdf?: () => void }) => void;
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
  onRegisterExportHandlers,
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

  const [selectedAccountId, setSelectedAccountId] = useState<string>(defaultAccount.id);

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

    // Filter relevant entries
    const entries = financialSummary.ledgerEntries.filter((e) => {
      if (isTargetCash) {
        return e.category === 'CASH' || e.accountId === 'ACC_CASH';
      }
      return e.category === 'BANK' && (e.accountId === selectedAccount.id || e.accountId === 'ACC_BANK_DEFAULT');
    });

    // Sort chronologically ascending to compute accurate running balance
    entries.sort((a, b) => a.date.localeCompare(b.date));

    let currentBalance = selectedAccount.openingBalance || 0;
    const entriesWithRunningBalance: Array<UnifiedLedgerEntry & { calculatedRunningBalance: number }> = [];

    let totalDeposits = 0;
    let totalWithdrawals = 0;

    for (const entry of entries) {
      if (entry.flow === 'IN') {
        currentBalance += entry.amount;
        totalDeposits += entry.amount;
      } else {
        currentBalance -= entry.amount;
        totalWithdrawals += entry.amount;
      }

      entriesWithRunningBalance.push({
        ...entry,
        calculatedRunningBalance: Math.round(currentBalance * 100) / 100,
      });
    }

    // Now sort descending for table display
    entriesWithRunningBalance.sort((a, b) => b.date.localeCompare(a.date));

    // Apply search filter if any
    let filtered = entriesWithRunningBalance;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.counterpartyOrTitle.toLowerCase().includes(q) ||
          e.referenceNo?.toLowerCase().includes(q) ||
          e.description?.toLowerCase().includes(q) ||
          e.mode.toLowerCase().includes(q)
      );
    }

    return {
      entries: filtered,
      totalDeposits: Math.round(totalDeposits * 100) / 100,
      totalWithdrawals: Math.round(totalWithdrawals * 100) / 100,
      closingBalance: Math.round(currentBalance * 100) / 100,
    };
  }, [financialSummary, selectedAccount, searchQuery]);

  // Register Export Handlers
  useEffect(() => {
    if (!onRegisterExportHandlers) return;

    const exportCsv = () => {
      const headers = ['Date', 'Type', 'Description / Counterparty', 'Ref No', 'Mode', 'Withdrawal (Debit)', 'Deposit (Credit)', 'Balance (INR)'];
      const rows = accountEntries.entries.map((e) => [
        e.date,
        e.type,
        e.counterpartyOrTitle,
        e.referenceNo || '-',
        e.mode,
        e.flow === 'OUT' ? e.amount : 0,
        e.flow === 'IN' ? e.amount : 0,
        e.calculatedRunningBalance,
      ]);
      exportReportToCsv(`BankStatement_${selectedAccount.accountName}_${Date.now()}`, headers, rows);
    };

    const exportPdf = () => {
      printReportDocument({
        title: `Bank Statement: ${selectedAccount.accountName}`,
        subtitle: `Account Passbook & Transaction Ledger • ${dateRangeLabel}`,
        company,
        dateRangeLabel,
        kpis: [
          { label: 'Opening Balance', value: formatINR(selectedAccount.openingBalance || 0) },
          { label: 'Total Deposits (Credit)', value: `+${formatINR(accountEntries.totalDeposits)}` },
          { label: 'Total Withdrawals (Debit)', value: `-${formatINR(accountEntries.totalWithdrawals)}` },
          { label: 'Closing Balance', value: formatINR(accountEntries.closingBalance) },
        ],
        headers: ['Date', 'Type', 'Description / Details', 'Ref No', 'Mode', 'Debit (-)', 'Credit (+)', 'Balance (INR)'],
        rows: accountEntries.entries.map((e) => [
          e.date,
          e.type,
          e.counterpartyOrTitle,
          e.referenceNo || '-',
          e.mode,
          e.flow === 'OUT' ? formatINR(e.amount) : '-',
          e.flow === 'IN' ? formatINR(e.amount) : '-',
          formatINR(e.calculatedRunningBalance),
        ]),
        columnAlignments: ['left', 'left', 'left', 'left', 'left', 'right', 'right', 'right'],
      });
    };

    onRegisterExportHandlers({ exportCsv, exportPdf });
  }, [accountEntries, selectedAccount, company, dateRangeLabel, onRegisterExportHandlers]);

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
        <div className="flex items-center gap-3 text-xs sm:text-sm flex-wrap">
          {selectedAccount.bankName && (
            <span className="text-on-surface-variant text-[11px] sm:text-xs">Bank: <strong className="text-on-surface">{selectedAccount.bankName}</strong></span>
          )}
          {selectedAccount.ifscCode && (
            <span className="text-on-surface-variant font-mono text-[11px] sm:text-xs">IFSC: <strong className="text-on-surface">{selectedAccount.ifscCode}</strong></span>
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
            {formatINR(selectedAccount.openingBalance || 0)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-on-surface-variant">
            Start balance
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
              {accountEntries.entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-on-surface-variant">
                    No transactions recorded for {selectedAccount.accountName} in this period.
                  </td>
                </tr>
              ) : (
                accountEntries.entries.map((entry) => {
                  const isDeposit = entry.flow === 'IN';
                  return (
                    <tr key={entry.id} className="hover:bg-surface-container-low/50 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap text-on-surface font-mono text-xs">
                        {entry.date}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-surface-container text-on-surface border border-outline-variant/20">
                          {entry.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-on-surface font-medium">
                        <div>{entry.counterpartyOrTitle}</div>
                        {entry.description && (
                          <div className="text-[11px] text-on-surface-variant">{entry.description}</div>
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
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
