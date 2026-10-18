import React, { useState, useMemo, useEffect } from 'react';
import {
  Waves,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  Landmark,
} from 'lucide-react';
import type { CompanyProfile } from '../../../models/company.ts';
import type { BankAccount, CashBankTransaction } from '../../../models/bankAccount.ts';
import type { Invoice } from '../../../models/invoice.ts';
import type { PurchaseBill } from '../../../models/purchase.ts';
import type { Expense } from '../../../models/expense.ts';
import type { Voucher } from '../../../core/accounting/voucherTypes.ts';
import type { LoanAccount, LoanTransaction } from '../../../models/loan.ts';
import { formatINR, formatDate } from '../../../core/utils/formatters.ts';
import {
  computeCashFlowStatement,
  CashFlowStatementResult,
  CashFlowLineItem,
} from '../../../core/accounting/cashFlowCalculator.ts';
import { exportReportToCsv, printReportDocument } from '../utils/reportExportUtils.ts';

interface CashFlowCategoryProps {
  company: CompanyProfile;
  accounts: BankAccount[];
  invoices: Invoice[];
  purchases: PurchaseBill[];
  expenses: Expense[];
  vouchers?: Voucher[];
  transactions: CashBankTransaction[];
  loans?: LoanAccount[];
  loanTransactions?: LoanTransaction[];
  searchQuery?: string;
  dateRangeLabel: string;
  onRegisterExportHandlers?: (handlers: { exportCsv?: () => void; exportPdf?: () => void }) => void;
}

export const CashFlowCategory: React.FC<CashFlowCategoryProps> = ({
  company,
  accounts,
  invoices,
  purchases,
  expenses,
  vouchers = [],
  transactions,
  loans = [],
  loanTransactions = [],
  searchQuery = '',
  dateRangeLabel,
  onRegisterExportHandlers,
}) => {
  const [activeTab, setActiveTab] = useState<'ALL' | 'OPERATING' | 'FINANCING' | 'INVESTING'>('ALL');

  const cashFlow: CashFlowStatementResult = useMemo(() => {
    return computeCashFlowStatement({
      accounts,
      invoices,
      purchases,
      expenses,
      vouchers,
      transactions,
      loanTransactions,
    });
  }, [accounts, invoices, purchases, expenses, vouchers, transactions, loanTransactions]);

  // Combine and filter line items
  const allItems: CashFlowLineItem[] = useMemo(() => {
    let list: CashFlowLineItem[] = [];
    if (activeTab === 'ALL' || activeTab === 'OPERATING') {
      list = list.concat(cashFlow.operatingActivities.items);
    }
    if (activeTab === 'ALL' || activeTab === 'FINANCING') {
      list = list.concat(cashFlow.financingActivities.items);
    }
    if (activeTab === 'ALL' || activeTab === 'INVESTING') {
      list = list.concat(cashFlow.investingActivities.items);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.counterparty?.toLowerCase().includes(q) ||
          i.referenceNo?.toLowerCase().includes(q) ||
          i.mode.toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [cashFlow, activeTab, searchQuery]);

  // Register Export Handlers
  useEffect(() => {
    if (!onRegisterExportHandlers) return;

    const exportCsv = () => {
      const headers = ['Date', 'Category', 'Activity / Title', 'Counterparty', 'Ref No', 'Mode', 'Flow', 'Amount (INR)'];
      const rows = allItems.map((item) => [
        item.date,
        item.category,
        item.title,
        item.counterparty || '-',
        item.referenceNo || '-',
        item.mode,
        item.flow,
        item.amount,
      ]);
      exportReportToCsv(`CashFlow_Statement_${Date.now()}`, headers, rows);
    };

    const exportPdf = () => {
      printReportDocument({
        title: 'Cash Flow Statement',
        subtitle: `Statement of Liquid Cash & Bank Inflows & Outflows • ${dateRangeLabel}`,
        company,
        dateRangeLabel,
        kpis: [
          { label: 'Opening Liquid Balance', value: formatINR(cashFlow.openingLiquidBalance) },
          { label: 'Operating Cash Flow', value: formatINR(cashFlow.operatingActivities.netCashFlow) },
          { label: 'Net Cash Flow', value: formatINR(cashFlow.netCashFlow) },
          { label: 'Closing Liquid Balance', value: formatINR(cashFlow.closingLiquidBalance) },
        ],
        headers: ['Date', 'Category', 'Activity Description', 'Counterparty', 'Ref No', 'Mode', 'Flow', 'Amount (INR)'],
        rows: allItems.map((i) => [
          i.date,
          i.category,
          i.title,
          i.counterparty || '-',
          i.referenceNo || '-',
          i.mode,
          i.flow,
          formatINR(i.amount),
        ]),
        columnAlignments: ['left', 'left', 'left', 'left', 'left', 'left', 'left', 'right'],
      });
    };

    onRegisterExportHandlers({ exportCsv, exportPdf });
  }, [allItems, cashFlow, company, dateRangeLabel, onRegisterExportHandlers]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-surface-container-low p-3 sm:p-4 rounded-xl border border-outline-variant/30 flex flex-col justify-between">
          <div className="text-[11px] sm:text-xs text-on-surface-variant font-bold uppercase tracking-wide">
            Opening Liquid Balance
          </div>
          <div className="text-base sm:text-2xl font-extrabold font-mono text-on-surface my-0.5 sm:my-1">
            {formatINR(cashFlow.openingLiquidBalance)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-on-surface-variant">
            From cash & bank balances
          </div>
        </div>

        <div className="bg-surface-container-low p-3 sm:p-4 rounded-xl border border-outline-variant/30 flex flex-col justify-between">
          <div className="text-[11px] sm:text-xs text-on-surface-variant font-bold uppercase tracking-wide">
            Operating Cash Flow
          </div>
          <div
            className={`text-base sm:text-2xl font-extrabold font-mono my-0.5 sm:my-1 ${
              cashFlow.operatingActivities.netCashFlow >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {formatINR(cashFlow.operatingActivities.netCashFlow)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-on-surface-variant truncate">
            In: {formatINR(cashFlow.operatingActivities.totalInflow)} • Out: {formatINR(cashFlow.operatingActivities.totalOutflow)}
          </div>
        </div>

        <div className="bg-surface-container-low p-3 sm:p-4 rounded-xl border border-outline-variant/30 flex flex-col justify-between">
          <div className="text-[11px] sm:text-xs text-on-surface-variant font-bold uppercase tracking-wide">
            Net Cash Flow
          </div>
          <div
            className={`text-base sm:text-2xl font-extrabold font-mono my-0.5 sm:my-1 ${
              cashFlow.netCashFlow >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {formatINR(cashFlow.netCashFlow)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-on-surface-variant truncate">
            In: {formatINR(cashFlow.totalInflows)} • Out: {formatINR(cashFlow.totalOutflows)}
          </div>
        </div>

        <div className="bg-surface-container-low p-3 sm:p-4 rounded-xl border border-outline-variant/30 flex flex-col justify-between">
          <div className="text-[11px] sm:text-xs text-on-surface-variant font-bold uppercase tracking-wide">
            Closing Liquid Balance
          </div>
          <div className="text-base sm:text-2xl font-extrabold font-mono text-primary my-0.5 sm:my-1">
            {formatINR(cashFlow.closingLiquidBalance)}
          </div>
          <div className="text-[10px] sm:text-[11px] text-on-surface-variant">
            Net liquid funds available
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-outline-variant/30 pb-2 overflow-x-auto no-scrollbar">
        {[
          { id: 'ALL', label: `All Transactions (${allItems.length})` },
          { id: 'OPERATING', label: `Operating (${cashFlow.operatingActivities.items.length})` },
          { id: 'FINANCING', label: `Financing (${cashFlow.financingActivities.items.length})` },
          { id: 'INVESTING', label: `Transfers (${cashFlow.investingActivities.items.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activeTab === tab.id
                ? 'bg-primary text-on-primary shadow-xs'
                : 'bg-surface hover:bg-surface-container text-on-surface-variant'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Transactions Table */}
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-surface-container-low text-on-surface-variant border-b border-outline-variant/30 font-semibold">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Activity Description</th>
                <th className="py-3 px-4">Counterparty / Details</th>
                <th className="py-3 px-4">Mode</th>
                <th className="py-3 px-4">Flow</th>
                <th className="py-3 px-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {allItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-on-surface-variant">
                    No cash flow transactions recorded for this period.
                  </td>
                </tr>
              ) : (
                allItems.map((item) => {
                  const isInflow = item.flow === 'INFLOW';
                  return (
                    <tr key={item.id} className="hover:bg-surface-container-low/50 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap text-on-surface font-mono text-xs">
                        {item.date}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-on-surface">{item.title}</div>
                        <div className="text-[11px] text-on-surface-variant">{item.category}</div>
                      </td>
                      <td className="py-3 px-4 text-on-surface">
                        <div>{item.counterparty || '-'}</div>
                        {item.referenceNo && (
                          <div className="text-[11px] font-mono text-on-surface-variant">Ref: {item.referenceNo}</div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-surface-container text-on-surface border border-outline-variant/20">
                          {item.mode}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                            isInflow
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                              : 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          {isInflow ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
                          <span>{item.flow}</span>
                        </span>
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-bold font-mono ${
                          isInflow
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isInflow ? `+${formatINR(item.amount)}` : `-${formatINR(item.amount)}`}
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
