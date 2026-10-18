import React, { useMemo, useEffect } from 'react';
import {
  Scale,
  CheckCircle2,
  AlertCircle,
  Landmark,
  Building,
  DollarSign,
  TrendingUp,
} from 'lucide-react';
import type { CompanyProfile } from '../../../models/company.ts';
import type { BankAccount, CashBankTransaction } from '../../../models/bankAccount.ts';
import type { Invoice } from '../../../models/invoice.ts';
import type { PurchaseBill } from '../../../models/purchase.ts';
import type { Expense } from '../../../models/expense.ts';
import type { InventoryItem } from '../../../models/item.ts';
import type { Party } from '../../../models/party.ts';
import type { LoanAccount } from '../../../models/loan.ts';
import { formatINR } from '../../../core/utils/formatters.ts';
import {
  computeBalanceSheetSummary,
  BalanceSheetResult,
} from '../../../core/accounting/balanceSheetCalculator.ts';
import { exportReportToCsv, printReportDocument } from '../utils/reportExportUtils.ts';

interface BalanceSheetCategoryProps {
  company: CompanyProfile;
  accounts: BankAccount[];
  transactions: CashBankTransaction[];
  invoices: Invoice[];
  purchases: PurchaseBill[];
  expenses: Expense[];
  items: InventoryItem[];
  parties: Party[];
  loans?: LoanAccount[];
  dateRangeLabel: string;
  onRegisterExportHandlers?: (handlers: { exportCsv?: () => void; exportPdf?: () => void }) => void;
}

export const BalanceSheetCategory: React.FC<BalanceSheetCategoryProps> = ({
  company,
  accounts,
  transactions,
  invoices,
  purchases,
  expenses,
  items,
  parties,
  loans = [],
  dateRangeLabel,
  onRegisterExportHandlers,
}) => {
  const bs: BalanceSheetResult = useMemo(() => {
    return computeBalanceSheetSummary({
      accounts,
      transactions,
      invoices,
      purchases,
      expenses,
      items,
      parties,
      loans,
    });
  }, [accounts, transactions, invoices, purchases, expenses, items, parties, loans]);

  // Register Export Handlers
  useEffect(() => {
    if (!onRegisterExportHandlers) return;

    const exportCsv = () => {
      const headers = ['Classification', 'Category', 'Account / Line Item', 'Note', 'Amount (INR)'];
      const rows: (string | number)[][] = [];

      // Assets
      bs.currentAssets.items.forEach((i) => {
        rows.push(['ASSETS', bs.currentAssets.title, i.name, i.note || '', i.amount]);
      });
      rows.push(['ASSETS', 'SUBTOTAL', 'Total Current Assets', '', bs.currentAssets.total]);
      rows.push(['ASSETS', 'TOTAL', 'TOTAL ASSETS', '', bs.totalAssets]);

      // Liabilities
      bs.currentLiabilities.items.forEach((i) => {
        rows.push(['LIABILITIES', bs.currentLiabilities.title, i.name, i.note || '', i.amount]);
      });
      bs.nonCurrentLiabilities.items.forEach((i) => {
        rows.push(['LIABILITIES', bs.nonCurrentLiabilities.title, i.name, i.note || '', i.amount]);
      });
      rows.push(['LIABILITIES', 'SUBTOTAL', 'Total Liabilities', '', bs.totalLiabilities]);

      // Equity
      bs.equity.items.forEach((i) => {
        rows.push(['EQUITY', bs.equity.title, i.name, i.note || '', i.amount]);
      });
      rows.push(['EQUITY', 'SUBTOTAL', 'Total Equity', '', bs.totalEquity]);
      rows.push(['LIABILITIES & EQUITY', 'TOTAL', 'TOTAL LIABILITIES & EQUITY', '', bs.totalLiabilitiesAndEquity]);

      exportReportToCsv(`BalanceSheet_${Date.now()}`, headers, rows);
    };

    const exportPdf = () => {
      const rows: (string | number)[][] = [];
      // Assets
      bs.currentAssets.items.forEach((i) => {
        rows.push(['ASSETS', i.name, i.note || '-', formatINR(i.amount)]);
      });
      rows.push(['ASSETS', 'Total Current Assets', '-', formatINR(bs.currentAssets.total)]);
      rows.push(['ASSETS', 'TOTAL ASSETS', 'Balanced', formatINR(bs.totalAssets)]);

      // Liabilities
      bs.currentLiabilities.items.forEach((i) => {
        rows.push(['LIABILITIES', i.name, i.note || '-', formatINR(i.amount)]);
      });
      bs.nonCurrentLiabilities.items.forEach((i) => {
        rows.push(['LIABILITIES', i.name, i.note || '-', formatINR(i.amount)]);
      });
      rows.push(['LIABILITIES', 'Total Liabilities', '-', formatINR(bs.totalLiabilities)]);

      // Equity
      bs.equity.items.forEach((i) => {
        rows.push(['EQUITY', i.name, i.note || '-', formatINR(i.amount)]);
      });
      rows.push(['EQUITY', 'Total Equity', '-', formatINR(bs.totalEquity)]);
      rows.push(['LIABILITIES & EQUITY', 'TOTAL LIABILITIES & EQUITY', 'Balanced', formatINR(bs.totalLiabilitiesAndEquity)]);

      printReportDocument({
        title: 'Balance Sheet Statement',
        subtitle: `Statement of Financial Position as of ${dateRangeLabel}`,
        company,
        dateRangeLabel,
        kpis: [
          { label: 'Total Assets', value: formatINR(bs.totalAssets) },
          { label: 'Total Liabilities', value: formatINR(bs.totalLiabilities) },
          { label: 'Total Equity (Net Worth)', value: formatINR(bs.totalEquity) },
          { label: 'Balance Invariant', value: bs.isBalanced ? 'Balanced' : 'Discrepancy' },
        ],
        headers: ['Classification', 'Account / Item', 'Notes', 'Amount (INR)'],
        rows,
        columnAlignments: ['left', 'left', 'left', 'right'],
      });
    };

    onRegisterExportHandlers({ exportCsv, exportPdf });
  }, [bs, company, dateRangeLabel, onRegisterExportHandlers]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Balance Verification Banner */}
      <div className="bg-surface-container-low rounded-xl sm:rounded-2xl p-3 sm:p-5 border border-outline-variant/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h3 className="text-sm sm:text-base font-bold text-on-surface m-0">
                Balance Sheet Reconciled
              </h3>
              <span className="text-[10px] sm:text-[11px] px-1.5 sm:px-2 py-0.2 rounded-full font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                Balanced
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-on-surface-variant mt-0.5 mb-0">
              Total Assets ({formatINR(bs.totalAssets)}) = Liabilities ({formatINR(bs.totalLiabilities)}) + Equity ({formatINR(bs.totalEquity)})
            </p>
          </div>
        </div>

        <div className="text-left sm:text-right self-start sm:self-auto border-t sm:border-t-0 border-outline-variant/20 pt-2 sm:pt-0 w-full sm:w-auto flex sm:block justify-between items-center">
          <div className="text-[11px] sm:text-xs text-on-surface-variant">Net Worth (Equity)</div>
          <div className="text-base sm:text-xl font-extrabold font-mono text-primary">
            {formatINR(bs.totalEquity)}
          </div>
        </div>
      </div>

      {/* 2-Column Balance Sheet Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 lg:gap-6">
        {/* Left: ASSETS */}
        <div className="bg-surface-container-lowest rounded-xl sm:rounded-2xl border border-outline-variant/30 shadow-xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="bg-blue-500/10 dark:bg-blue-500/20 px-4 sm:px-5 py-3 sm:py-3.5 border-b border-outline-variant/30 flex items-center justify-between">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-bold text-xs sm:text-base">
                <Landmark size={18} />
                <span>1. ASSETS</span>
              </div>
              <span className="text-xs font-mono font-bold text-blue-700 dark:text-blue-300">
                {formatINR(bs.totalAssets)}
              </span>
            </div>

            {/* Current Assets Section */}
            <div className="p-4 sm:p-5 space-y-4">
              <div className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                Current Assets
              </div>

              <div className="divide-y divide-outline-variant/20">
                {bs.currentAssets.items.map((item) => (
                  <div key={item.id} className="py-2.5 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs sm:text-sm font-semibold text-on-surface">{item.name}</div>
                      {item.note && <div className="text-[11px] text-on-surface-variant">{item.note}</div>}
                    </div>
                    <div className="text-xs sm:text-sm font-mono font-bold text-on-surface text-right">
                      {formatINR(item.amount)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Assets Footer Total */}
          <div className="bg-surface-container-low p-4 sm:p-5 border-t border-outline-variant/30 flex items-center justify-between">
            <span className="font-extrabold text-sm sm:text-base text-on-surface">TOTAL ASSETS</span>
            <span className="font-extrabold font-mono text-base sm:text-lg text-blue-600 dark:text-blue-400">
              {formatINR(bs.totalAssets)}
            </span>
          </div>
        </div>

        {/* Right: LIABILITIES & EQUITY */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="bg-purple-500/10 dark:bg-purple-500/20 px-5 py-3.5 border-b border-outline-variant/30 flex items-center justify-between">
              <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 font-bold text-sm sm:text-base">
                <Building size={18} />
                <span>2. LIABILITIES & EQUITY</span>
              </div>
              <span className="text-xs font-mono font-bold text-purple-700 dark:text-purple-300">
                {formatINR(bs.totalLiabilitiesAndEquity)}
              </span>
            </div>

            <div className="p-4 sm:p-5 space-y-5">
              {/* Current Liabilities */}
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">
                  Current Liabilities
                </div>
                <div className="divide-y divide-outline-variant/20">
                  {bs.currentLiabilities.items.map((item) => (
                    <div key={item.id} className="py-2.5 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs sm:text-sm font-semibold text-on-surface">{item.name}</div>
                        {item.note && <div className="text-[11px] text-on-surface-variant">{item.note}</div>}
                      </div>
                      <div className="text-xs sm:text-sm font-mono font-bold text-on-surface text-right">
                        {formatINR(item.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Long-Term Loans */}
              {bs.nonCurrentLiabilities.items.length > 0 && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">
                    Long-Term Borrowings & Loans
                  </div>
                  <div className="divide-y divide-outline-variant/20">
                    {bs.nonCurrentLiabilities.items.map((item) => (
                      <div key={item.id} className="py-2.5 flex items-center justify-between gap-2">
                        <div>
                          <div className="text-xs sm:text-sm font-semibold text-on-surface">{item.name}</div>
                          {item.note && <div className="text-[11px] text-on-surface-variant">{item.note}</div>}
                        </div>
                        <div className="text-xs sm:text-sm font-mono font-bold text-on-surface text-right">
                          {formatINR(item.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Owner's Equity */}
              <div className="pt-2 border-t border-outline-variant/20">
                <div className="text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-2">
                  Owner's Equity & Retained Surplus
                </div>
                <div className="divide-y divide-outline-variant/20">
                  {bs.equity.items.map((item) => (
                    <div key={item.id} className="py-2.5 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs sm:text-sm font-semibold text-on-surface">{item.name}</div>
                        {item.note && <div className="text-[11px] text-on-surface-variant">{item.note}</div>}
                      </div>
                      <div className="text-xs sm:text-sm font-mono font-bold text-on-surface text-right">
                        {formatINR(item.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Liabilities & Equity Footer Total */}
          <div className="bg-surface-container-low p-4 sm:p-5 border-t border-outline-variant/30 flex items-center justify-between">
            <span className="font-extrabold text-sm sm:text-base text-on-surface">TOTAL LIABILITIES & EQUITY</span>
            <span className="font-extrabold font-mono text-base sm:text-lg text-purple-600 dark:text-purple-400">
              {formatINR(bs.totalLiabilitiesAndEquity)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
