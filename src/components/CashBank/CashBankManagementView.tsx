import React, { useState, useMemo } from 'react';
import { BankAccount, CashBankTransaction, UnifiedLedgerEntry } from '../../models/bankAccount.ts';
import { Invoice } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { Expense } from '../../models/expense.ts';
import { Voucher } from '../../core/accounting/voucherTypes.ts';
import { CompanyProfile } from '../../models/company.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { computeCashBankSummary } from '../../core/accounting/cashBankCalculator.ts';
import { CashBankTransferModal } from './CashBankTransferModal.tsx';
import { DirectCashBankModal } from './DirectCashBankModal.tsx';
import { AddEditBankAccountModal } from './AddEditBankAccountModal.tsx';
import { AppTab } from '../Shell/Drawer.tsx';

interface CashBankManagementViewProps {
  company: CompanyProfile;
  accounts: BankAccount[];
  transactions: CashBankTransaction[];
  invoices: Invoice[];
  purchases: PurchaseBill[];
  expenses: Expense[];
  vouchers: Voucher[];
  onSaveAccount: (account: BankAccount) => void;
  onDeleteAccount: (id: string) => void;
  onSaveTransaction: (txn: CashBankTransaction) => void;
  onDeleteTransaction: (id: string) => void;
  onNavigateTab: (tab: AppTab) => void;
}

export const CashBankManagementView: React.FC<CashBankManagementViewProps> = ({
  company: _company,
  accounts,
  transactions,
  invoices,
  purchases,
  expenses,
  vouchers,
  onSaveAccount,
  onDeleteAccount,
  onSaveTransaction,
  onDeleteTransaction: _onDeleteTransaction,
  onNavigateTab,
}) => {
  // Navigation / Modal States
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferInitialType, setTransferInitialType] = useState<'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER'>('DEPOSIT');

  const [isDirectModalOpen, setIsDirectModalOpen] = useState(false);
  const [directFlow, setDirectFlow] = useState<'ADD_MONEY' | 'REDUCE_MONEY'>('ADD_MONEY');
  const [directPreselectedAccount, setDirectPreselectedAccount] = useState<string | undefined>();

  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);

  // Filters
  const [accountFilter, setAccountFilter] = useState<'ALL' | 'CASH' | 'BANK'>('ALL');
  const [flowFilter, setFlowFilter] = useState<'ALL' | 'IN' | 'OUT' | 'CONTRA'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  // Compute live balances and unified passbook entries
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

  // Filtered passbook ledger
  const filteredLedger = useMemo(() => {
    return summary.ledgerEntries.filter((entry) => {
      // 1. Account type filter
      if (accountFilter === 'CASH' && entry.category !== 'CASH') return false;
      if (accountFilter === 'BANK' && entry.category !== 'BANK') return false;

      // 2. Specific account filter (when tapping an account card)
      if (selectedAccountId && entry.accountId !== selectedAccountId) return false;

      // 3. Flow filter
      if (flowFilter === 'IN' && (entry.flow !== 'IN' || entry.type === 'CONTRA')) return false;
      if (flowFilter === 'OUT' && (entry.flow !== 'OUT' || entry.type === 'CONTRA')) return false;
      if (flowFilter === 'CONTRA' && entry.type !== 'CONTRA') return false;

      // 4. Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchTitle = entry.counterpartyOrTitle.toLowerCase().includes(query);
        const matchRef = (entry.referenceNo || '').toLowerCase().includes(query);
        const matchDesc = (entry.description || '').toLowerCase().includes(query);
        const matchMode = entry.mode.toLowerCase().includes(query);
        if (!matchTitle && !matchRef && !matchDesc && !matchMode) return false;
      }

      return true;
    });
  }, [summary.ledgerEntries, accountFilter, selectedAccountId, flowFilter, searchQuery]);

  const bankAccounts = accounts.filter((a) => a.accountType === 'BANK');
  const cashAccount = accounts.find((a) => a.accountType === 'CASH') || {
    id: 'ACC_CASH',
    accountName: 'Cash in Hand',
    accountType: 'CASH' as const,
    openingBalance: 0,
    createdAt: '',
    updatedAt: '',
  };

  const cashBal = summary.accountBalances['ACC_CASH'] ?? summary.totalCashBalance;

  return (
    <div className="flex flex-col w-full px-3 sm:px-4 md:px-6 py-3 gap-3.5 max-w-7xl mx-auto">
      {/* 1. Header Bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => onNavigateTab('dashboard')}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high transition-colors cursor-pointer flex-shrink-0"
            title="Back to Dashboard"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <div className="flex flex-col min-w-0">
            <h1 className="font-headline-sm text-base sm:text-lg font-bold text-on-surface truncate">
              Cash & Bank
            </h1>
            <span className="text-[11px] text-on-surface-variant truncate">
              Live balances, passbook ledger & bank transfers
            </span>
          </div>
        </div>

        {/* Quick CTA Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={() => {
              setTransferInitialType('DEPOSIT');
              setIsTransferModalOpen(true);
            }}
            className="h-9 px-3 rounded-xl bg-secondary text-on-secondary font-label-md text-xs font-bold shadow-xs active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
            title="Transfer between Cash & Bank"
          >
            <span className="material-symbols-outlined text-[16px]">swap_horiz</span>
            <span className="hidden sm:inline">Transfer</span>
            <span className="sm:hidden">Transfer</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setDirectFlow('ADD_MONEY');
              setDirectPreselectedAccount('ACC_CASH');
              setIsDirectModalOpen(true);
            }}
            className="h-9 px-2.5 rounded-xl bg-surface-container text-on-surface hover:bg-surface-container-high font-label-md text-xs font-bold active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
            title="Add Cash or Direct Money In"
          >
            <span className="material-symbols-outlined text-[16px] text-emerald-600">add</span>
            <span className="hidden sm:inline">Add Money</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingAccount(null);
              setIsAddAccountModalOpen(true);
            }}
            className="h-9 w-9 rounded-xl bg-surface-container text-on-surface hover:bg-surface-container-high flex items-center justify-center active:scale-95 transition-all cursor-pointer"
            title="Add New Bank Account"
          >
            <span className="material-symbols-outlined text-[18px]">add_card</span>
          </button>
        </div>
      </div>

      {/* 2. Compact Financial Summary Strip (3 Metrics on Single Row) */}
      <section className="grid grid-cols-3 gap-2 p-2.5 sm:p-3 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs">
        {/* Metric 1: Total Liquid Balance */}
        <div className="flex flex-col min-w-0 px-1 border-r border-outline-variant/20">
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1 truncate">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"></span>
            <span className="truncate">Total Balance</span>
          </span>
          <span className="font-tabular-data text-sm sm:text-base md:text-lg font-black text-on-surface mt-0.5 truncate">
            {formatINR(summary.totalLiquidBalance)}
          </span>
          <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold truncate">
            +₹{formatINR(summary.todayInflow).replace('₹', '')} today
          </span>
        </div>

        {/* Metric 2: Cash in Hand */}
        <div
          onClick={() => {
            if (accountFilter === 'CASH') {
              setAccountFilter('ALL');
              setSelectedAccountId(null);
            } else {
              setAccountFilter('CASH');
              setSelectedAccountId('ACC_CASH');
            }
          }}
          className={`flex flex-col min-w-0 px-1 border-r border-outline-variant/20 cursor-pointer rounded-lg p-0.5 transition-colors ${
            accountFilter === 'CASH' ? 'bg-emerald-500/10' : ''
          }`}
        >
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1 truncate">
            <span className="material-symbols-outlined text-[13px] flex-shrink-0">payments</span>
            <span className="truncate">Cash in Hand</span>
          </span>
          <span className="font-tabular-data text-sm sm:text-base md:text-lg font-black text-emerald-700 dark:text-emerald-400 mt-0.5 truncate">
            {formatINR(cashBal)}
          </span>
          <span className="text-[10px] text-on-surface-variant font-medium truncate">
            Physical register
          </span>
        </div>

        {/* Metric 3: Bank Accounts */}
        <div
          onClick={() => {
            if (accountFilter === 'BANK') {
              setAccountFilter('ALL');
              setSelectedAccountId(null);
            } else {
              setAccountFilter('BANK');
              setSelectedAccountId(null);
            }
          }}
          className={`flex flex-col min-w-0 px-1 cursor-pointer rounded-lg p-0.5 transition-colors ${
            accountFilter === 'BANK' ? 'bg-blue-500/10' : ''
          }`}
        >
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 flex items-center gap-1 truncate">
            <span className="material-symbols-outlined text-[13px] flex-shrink-0">account_balance</span>
            <span className="truncate">In Bank</span>
          </span>
          <span className="font-tabular-data text-sm sm:text-base md:text-lg font-black text-blue-700 dark:text-blue-400 mt-0.5 truncate">
            {formatINR(summary.totalBankBalance)}
          </span>
          <span className="text-[10px] text-on-surface-variant font-medium truncate">
            {bankAccounts.length} linked bank{bankAccounts.length === 1 ? '' : 's'}
          </span>
        </div>
      </section>

      {/* 3. Account Cards (Clean Horizontal Slider) */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold text-on-surface flex items-center gap-1.5 uppercase tracking-wider">
            <span>Accounts & Registers</span>
            <span className="text-[10px] font-semibold text-on-surface-variant">
              ({accounts.length})
            </span>
          </span>

          {selectedAccountId && (
            <button
              type="button"
              onClick={() => {
                setSelectedAccountId(null);
                setAccountFilter('ALL');
              }}
              className="text-[11px] font-bold text-secondary hover:underline cursor-pointer"
            >
              Clear selection
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {/* Card: Cash in Hand */}
          <div
            onClick={() => {
              setSelectedAccountId(selectedAccountId === 'ACC_CASH' ? null : 'ACC_CASH');
              setAccountFilter(selectedAccountId === 'ACC_CASH' ? 'ALL' : 'CASH');
            }}
            className={`p-3.5 rounded-2xl bg-surface-container-lowest border transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
              selectedAccountId === 'ACC_CASH'
                ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm'
                : 'border-outline-variant/30 hover:border-emerald-500/50 shadow-xs'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-700 dark:text-emerald-400 flex-shrink-0">
                  <span className="material-symbols-outlined text-[20px]">payments</span>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-on-surface truncate">Cash in Hand</span>
                  <span className="text-[10px] text-on-surface-variant truncate">Counter Cash Register</span>
                </div>
              </div>

              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 flex-shrink-0">
                Cash
              </span>
            </div>

            <div className="flex items-end justify-between pt-1 border-t border-outline-variant/15">
              <div>
                <span className="text-[10px] text-on-surface-variant block">Balance</span>
                <span className="font-tabular-data text-base font-black text-emerald-700 dark:text-emerald-400">
                  {formatINR(cashBal)}
                </span>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setTransferInitialType('DEPOSIT');
                  setIsTransferModalOpen(true);
                }}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold text-[11px] hover:bg-emerald-500/20 active:scale-95 transition-all cursor-pointer flex items-center gap-1"
                title="Deposit cash to bank"
              >
                <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                <span>To Bank</span>
              </button>
            </div>
          </div>

          {/* Cards: Bank Accounts */}
          {bankAccounts.map((acc) => {
            const bal = summary.accountBalances[acc.id] ?? acc.openingBalance ?? 0;
            const isSelected = selectedAccountId === acc.id;

            return (
              <div
                key={acc.id}
                onClick={() => {
                  setSelectedAccountId(isSelected ? null : acc.id);
                  setAccountFilter(isSelected ? 'ALL' : 'BANK');
                }}
                className={`p-3.5 rounded-2xl bg-surface-container-lowest border transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                  isSelected
                    ? 'border-secondary ring-2 ring-secondary/20 shadow-sm'
                    : 'border-outline-variant/30 hover:border-secondary/50 shadow-xs'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center text-blue-700 dark:text-blue-400 flex-shrink-0">
                      <span className="material-symbols-outlined text-[20px]">account_balance</span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold text-on-surface truncate">{acc.accountName}</span>
                      <span className="text-[10px] text-on-surface-variant truncate font-mono">
                        {acc.accountNumber ? `A/C •••• ${acc.accountNumber.slice(-4)}` : acc.bankName || 'Bank A/C'}
                      </span>
                    </div>
                  </div>

                  {acc.isDefault ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-secondary/15 text-secondary flex-shrink-0">
                      Primary
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-container text-on-surface-variant flex-shrink-0">
                      Bank
                    </span>
                  )}
                </div>

                <div className="flex items-end justify-between pt-1 border-t border-outline-variant/15">
                  <div>
                    <span className="text-[10px] text-on-surface-variant block">Balance</span>
                    <span className="font-tabular-data text-base font-black text-on-surface">
                      {formatINR(bal)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingAccount(acc);
                        setIsAddAccountModalOpen(true);
                      }}
                      className="w-7 h-7 rounded-lg bg-surface-container text-on-surface-variant hover:text-on-surface flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                      title="Edit bank account details"
                    >
                      <span className="material-symbols-outlined text-[15px]">edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTransferInitialType('WITHDRAWAL');
                        setIsTransferModalOpen(true);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-secondary/10 text-secondary font-bold text-[11px] hover:bg-secondary/20 active:scale-95 transition-all cursor-pointer flex items-center gap-1"
                      title="Withdraw cash from bank"
                    >
                      <span>Withdraw</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Quick Add Bank Card (if <= 2 bank accounts) */}
          {bankAccounts.length < 3 && (
            <div
              onClick={() => {
                setEditingAccount(null);
                setIsAddAccountModalOpen(true);
              }}
              className="p-3.5 rounded-2xl border border-dashed border-outline-variant/50 hover:border-secondary hover:bg-secondary/5 transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 text-center min-h-[90px]"
            >
              <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
                <span className="material-symbols-outlined text-[18px]">add</span>
              </div>
              <span className="text-xs font-bold text-on-surface">Add Bank Account</span>
              <span className="text-[10px] text-on-surface-variant">Support multiple banks & UPI</span>
            </div>
          )}
        </div>
      </section>

      {/* 4. Passbook / Transaction Ledger Section */}
      <section className="flex flex-col gap-2.5 pt-1">
        {/* Passbook Title & Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-on-surface uppercase tracking-wider">
              Cash & Bank Passbook
            </span>
            <span className="text-[11px] font-bold text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full">
              {filteredLedger.length} entries
            </span>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 sm:max-w-xs">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-[16px] text-on-surface-variant">
              search
            </span>
            <input
              type="text"
              placeholder="Search bill, party, or notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-surface-container-lowest border border-outline-variant/30 rounded-xl outline-none focus:border-secondary text-on-surface placeholder:text-on-surface-variant/60"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface cursor-pointer"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          {/* Account Filter Pills */}
          <button
            type="button"
            onClick={() => {
              setAccountFilter('ALL');
              setSelectedAccountId(null);
            }}
            className={`px-3 py-1 rounded-xl text-xs font-bold cursor-pointer transition-all flex-shrink-0 ${
              accountFilter === 'ALL' && !selectedAccountId
                ? 'bg-secondary text-on-secondary shadow-xs'
                : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
            }`}
          >
            All Accounts
          </button>
          <button
            type="button"
            onClick={() => {
              setAccountFilter('CASH');
              setSelectedAccountId('ACC_CASH');
            }}
            className={`px-3 py-1 rounded-xl text-xs font-bold cursor-pointer transition-all flex items-center gap-1 flex-shrink-0 ${
              accountFilter === 'CASH'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[13px]">payments</span>
            <span>Cash Only</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setAccountFilter('BANK');
              setSelectedAccountId(null);
            }}
            className={`px-3 py-1 rounded-xl text-xs font-bold cursor-pointer transition-all flex items-center gap-1 flex-shrink-0 ${
              accountFilter === 'BANK'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[13px]">account_balance</span>
            <span>Bank Only</span>
          </button>

          <span className="text-outline-variant/40">|</span>

          {/* Flow Filter Pills */}
          <button
            type="button"
            onClick={() => setFlowFilter('IN')}
            className={`px-2.5 py-1 rounded-xl text-[11px] font-bold cursor-pointer transition-all flex items-center gap-1 flex-shrink-0 ${
              flowFilter === 'IN'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[13px]">arrow_downward</span>
            <span>Money In (+)</span>
          </button>
          <button
            type="button"
            onClick={() => setFlowFilter('OUT')}
            className={`px-2.5 py-1 rounded-xl text-[11px] font-bold cursor-pointer transition-all flex items-center gap-1 flex-shrink-0 ${
              flowFilter === 'OUT'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[13px]">arrow_upward</span>
            <span>Money Out (-)</span>
          </button>
          <button
            type="button"
            onClick={() => setFlowFilter('CONTRA')}
            className={`px-2.5 py-1 rounded-xl text-[11px] font-bold cursor-pointer transition-all flex items-center gap-1 flex-shrink-0 ${
              flowFilter === 'CONTRA'
                ? 'bg-secondary text-on-secondary shadow-xs'
                : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[13px]">swap_horiz</span>
            <span>Transfers</span>
          </button>
          {flowFilter !== 'ALL' && (
            <button
              type="button"
              onClick={() => setFlowFilter('ALL')}
              className="text-[11px] text-secondary font-bold hover:underline cursor-pointer flex-shrink-0"
            >
              Reset
            </button>
          )}
        </div>

        {/* Passbook Ledger Rows */}
        <div className="flex flex-col gap-1.5">
          {filteredLedger.length === 0 ? (
            <div className="p-8 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 text-center flex flex-col items-center justify-center gap-2">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant/40">receipt_long</span>
              <p className="font-bold text-sm text-on-surface">No transactions found</p>
              <p className="text-xs text-on-surface-variant max-w-xs">
                {searchQuery
                  ? 'No entries match your search criteria. Try a different query.'
                  : 'Start recording sales, expenses, or cash transfers to see your live passbook.'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setTransferInitialType('DEPOSIT');
                  setIsTransferModalOpen(true);
                }}
                className="mt-1 px-4 py-1.5 bg-secondary text-on-secondary rounded-xl text-xs font-bold shadow-xs cursor-pointer"
              >
                Record Cash/Bank Transfer
              </button>
            </div>
          ) : (
            filteredLedger.map((entry) => {
              const isInflow = entry.flow === 'IN' && entry.type !== 'CONTRA';
              const isOutflow = entry.flow === 'OUT' && entry.type !== 'CONTRA';
              const isContra = entry.type === 'CONTRA';

              return (
                <div
                  key={entry.id}
                  className="px-3.5 py-2.5 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs flex items-center justify-between gap-3 hover:border-outline-variant/60 transition-colors"
                >
                  {/* Left: Direction Icon & Details */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        isContra
                          ? 'bg-blue-500/10 text-blue-600'
                          : isInflow
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : 'bg-rose-500/10 text-rose-600'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        {isContra
                          ? 'swap_horiz'
                          : isInflow
                          ? 'arrow_downward'
                          : 'arrow_upward'}
                      </span>
                    </div>

                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs sm:text-sm text-on-surface truncate">
                          {entry.counterpartyOrTitle}
                        </span>
                        {entry.referenceNo && (
                          <span className="text-[10px] text-on-surface-variant font-mono bg-surface-container px-1.5 py-0.2 rounded-md flex-shrink-0">
                            #{entry.referenceNo}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant mt-0.5 flex-wrap">
                        <span>{formatDate(entry.date)}</span>
                        <span>•</span>
                        <span className="flex items-center gap-0.5">
                          <span className="material-symbols-outlined text-[12px]">
                            {entry.category === 'CASH' ? 'payments' : 'account_balance'}
                          </span>
                          <span>{entry.accountName}</span>
                        </span>
                        <span>•</span>
                        <span className="px-1.5 py-0.2 rounded bg-surface-container font-semibold text-[10px]">
                          {entry.mode}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Flow Amount */}
                  <div className="flex flex-col items-end flex-shrink-0">
                    <span
                      className={`font-tabular-data text-xs sm:text-sm font-black tracking-tight ${
                        isContra
                          ? 'text-blue-700 dark:text-blue-400'
                          : isInflow
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {isInflow ? '+' : isOutflow ? '-' : '⇄'} {formatINR(entry.amount)}
                    </span>
                    <span className="text-[10px] text-on-surface-variant font-semibold">
                      {isContra
                        ? (entry.flow === 'IN' ? 'Deposited' : 'Deducted')
                        : isInflow
                        ? 'Received'
                        : 'Paid'}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* 5. Modals */}
      <CashBankTransferModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        accounts={accounts}
        accountBalances={summary.accountBalances}
        onSaveTransfer={onSaveTransaction}
        initialType={transferInitialType}
      />

      <DirectCashBankModal
        isOpen={isDirectModalOpen}
        onClose={() => setIsDirectModalOpen(false)}
        accounts={accounts}
        accountBalances={summary.accountBalances}
        onSaveTxn={onSaveTransaction}
        initialFlow={directFlow}
        preselectedAccountId={directPreselectedAccount}
      />

      <AddEditBankAccountModal
        isOpen={isAddAccountModalOpen}
        onClose={() => {
          setIsAddAccountModalOpen(false);
          setEditingAccount(null);
        }}
        onSaveAccount={onSaveAccount}
        editingAccount={editingAccount}
      />
    </div>
  );
};
