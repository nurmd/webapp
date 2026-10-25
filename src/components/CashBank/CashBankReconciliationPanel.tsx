import React, { useMemo } from 'react';
import type { BankAccount } from '../../models/bankAccount.ts';
import type { CashBankFinancialSummary } from '../../core/accounting/cashBankCalculator.ts';
import {
  buildCashBankReconciliation,
  buildReconciliationCsvRows,
  type ReconciliationIssue,
} from '../../core/accounting/cashBankReconciliation.ts';
import { exportReportToCsv } from '../Reports/utils/reportExportUtils.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { formatINR } from '../../core/utils/formatters.ts';

interface CashBankReconciliationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: BankAccount[];
  summary: CashBankFinancialSummary;
}

export const CashBankReconciliationPanel: React.FC<CashBankReconciliationPanelProps> = ({
  isOpen,
  onClose,
  accounts,
  summary,
}) => {
  useBackNavigation(() => {
    onClose();
    return true;
  }, isOpen, 25);

  const report = useMemo(() => {
    return buildCashBankReconciliation({ accounts, summary });
  }, [accounts, summary]);

  if (!isOpen) return null;

  const handleExportCsv = () => {
    const today = new Date().toISOString().split('T')[0];
    const { headers, rows } = buildReconciliationCsvRows(report);
    exportReportToCsv(`cash_bank_reconciliation_${today}.csv`, headers, rows);
  };

  const getSeverityBadgeClass = (severity: ReconciliationIssue['severity']) => {
    switch (severity) {
      case 'critical':
        return 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30';
      case 'warning':
        return 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30';
      case 'info':
      default:
        return 'bg-sky-500/15 text-sky-800 dark:text-sky-300 border-sky-500/30';
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reconciliation-panel-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-on-surface/50 backdrop-blur-xs animate-fade-in"
    >
      <div className="bg-surface-container-lowest rounded-2xl w-full max-w-4xl shadow-2xl border border-outline-variant/30 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3.5 sm:px-6 sm:py-4 border-b border-outline-variant/20 flex items-center justify-between gap-3 bg-surface-container-low/40">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
              <span className="material-symbols-outlined text-[20px]">fact_check</span>
            </div>
            <div className="min-w-0">
              <h2 id="reconciliation-panel-title" className="font-bold text-base sm:text-lg text-on-surface truncate">
                Balance Reconciliation
              </h2>
              <p className="text-xs text-on-surface-variant truncate">
                Read-only audit of every Cash & Bank rupee.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              data-testid="cash-bank-reconciliation-export"
              onClick={handleExportCsv}
              className="h-8 sm:h-9 px-3 rounded-xl bg-surface-container text-on-surface hover:bg-surface-container-high font-medium text-xs flex items-center gap-1.5 transition-all cursor-pointer"
              title="Export reconciliation report to CSV"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              <span className="hidden sm:inline">Export CSV</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container active:bg-surface-container-high transition-colors cursor-pointer"
              title="Close"
              aria-label="Close reconciliation report"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-3 sm:p-6 overflow-y-auto space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            {/* Card 1: Total Ledger Balance */}
            <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/20 flex flex-col">
              <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">
                Total Ledger Balance
              </span>
              <span
                className={`text-base sm:text-lg font-black font-tabular-data mt-1 truncate ${
                  report.totalLiquidBalance < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-on-surface'
                }`}
              >
                {formatINR(report.totalLiquidBalance)}
              </span>
              <span className="text-[10px] text-on-surface-variant mt-0.5">
                Cash: {formatINR(report.totalCashBalance)} • Bank: {formatINR(report.totalBankBalance)}
              </span>
            </div>

            {/* Card 2: Negative Accounts */}
            <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/20 flex flex-col">
              <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">
                Negative Accounts
              </span>
              <span
                className={`text-base sm:text-lg font-black font-tabular-data mt-1 ${
                  report.negativeAccountIds.length > 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {report.negativeAccountIds.length}
              </span>
              <span className="text-[10px] text-on-surface-variant mt-0.5">
                {report.negativeAccountIds.length > 0 ? 'Outflows exceed funds' : 'No negative accounts'}
              </span>
            </div>

            {/* Card 3: Unconfigured Accounts */}
            <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/20 flex flex-col">
              <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">
                Unconfigured Accounts
              </span>
              <span
                className={`text-base sm:text-lg font-black font-tabular-data mt-1 ${
                  report.unconfiguredAccountIds.length > 0
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-on-surface'
                }`}
              >
                {report.unconfiguredAccountIds.length}
              </span>
              <span className="text-[10px] text-on-surface-variant mt-0.5">
                {report.unconfiguredAccountIds.length > 0 ? 'Pending master setup' : 'All accounts configured'}
              </span>
            </div>

            {/* Card 4: Duplicate Candidates */}
            <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/20 flex flex-col">
              <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">
                Duplicate Candidates
              </span>
              <span
                className={`text-base sm:text-lg font-black font-tabular-data mt-1 ${
                  report.duplicateCandidates.length > 0
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {report.duplicateCandidates.length}
              </span>
              <span className="text-[10px] text-on-surface-variant mt-0.5">
                {report.duplicateCandidates.length > 0 ? 'Review for duplicate pay' : 'Zero duplicates flagged'}
              </span>
            </div>
          </div>

          {/* Accounts Breakdown List */}
          <div className="space-y-3">
            <h3 className="font-bold text-sm text-on-surface flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[18px] text-primary">account_balance_wallet</span>
              <span>Account Reconciliations</span>
            </h3>

            {report.accounts.length === 0 && (
              <div
                data-testid="reconciliation-empty-state"
                className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/30 text-center text-xs text-on-surface-variant"
              >
                No cash or bank accounts are configured yet. Add an account to start reconciling balances.
              </div>
            )}

            {report.accounts.map((acc) => {
              const statusBadgeClass =
                acc.status === 'negative'
                  ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30'
                  : acc.status === 'review'
                  ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30'
                  : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30';

              return (
                <div
                  key={acc.accountId}
                  data-testid={`reconciliation-account-${acc.accountId}`}
                  className="rounded-xl p-3.5 sm:p-4 bg-surface-container-low border border-outline-variant/30 space-y-3"
                >
                  {/* Account Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant flex-shrink-0">
                        <span className="material-symbols-outlined text-[16px]">
                          {acc.accountType === 'CASH' ? 'payments' : 'account_balance'}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-on-surface truncate">
                            {acc.accountName}
                          </span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant uppercase">
                            {acc.accountType}
                          </span>
                        </div>
                        <span className="text-[11px] text-on-surface-variant font-mono">
                          ID: {acc.accountId}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${statusBadgeClass}`}
                      >
                        {acc.status}
                      </span>
                    </div>
                  </div>

                  {/* Balance Equation Box */}
                  <div className="bg-surface-container-lowest rounded-lg p-2.5 sm:p-3 border border-outline-variant/20 font-mono text-xs text-on-surface">
                    <div className="text-[11px] uppercase tracking-wider text-on-surface-variant font-sans font-semibold mb-1">
                      Equation: Opening + Inflows − Outflows = Closing
                    </div>
                    <div className="font-tabular-data flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span>{formatINR(acc.openingBalance)} (Opening)</span>
                      <span className="text-emerald-600 font-bold">+</span>
                      <span>{formatINR(acc.totalInflow)} (Inflows)</span>
                      <span className="text-rose-600 font-bold">−</span>
                      <span>{formatINR(acc.totalOutflow)} (Outflows)</span>
                      <span className="font-bold">=</span>
                      <span
                        className={`font-bold ${
                          acc.ledgerClosing < 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-on-surface'
                        }`}
                      >
                        {formatINR(acc.ledgerClosing)}
                      </span>
                      {acc.difference !== 0 && (
                        <span className="text-rose-500 font-bold text-[11px]">
                          (Diff: {formatINR(acc.difference)})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Metric Columns */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2 rounded bg-surface-container-lowest/60 border border-outline-variant/15">
                      <span className="text-[10px] text-on-surface-variant uppercase">Opening</span>
                      <div className="font-bold font-tabular-data mt-0.5">{formatINR(acc.openingBalance)}</div>
                    </div>
                    <div className="p-2 rounded bg-surface-container-lowest/60 border border-outline-variant/15">
                      <span className="text-[10px] text-on-surface-variant uppercase">Inflows</span>
                      <div className="font-bold font-tabular-data text-emerald-600 dark:text-emerald-400 mt-0.5">
                        +{formatINR(acc.totalInflow)}
                      </div>
                    </div>
                    <div className="p-2 rounded bg-surface-container-lowest/60 border border-outline-variant/15">
                      <span className="text-[10px] text-on-surface-variant uppercase">Outflows</span>
                      <div className="font-bold font-tabular-data text-rose-600 dark:text-rose-400 mt-0.5">
                        -{formatINR(acc.totalOutflow)}
                      </div>
                    </div>
                    <div className="p-2 rounded bg-surface-container-lowest/60 border border-outline-variant/15">
                      <span className="text-[10px] text-on-surface-variant uppercase">Closing</span>
                      <div
                        className={`font-black font-tabular-data mt-0.5 ${
                          acc.ledgerClosing < 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-on-surface'
                        }`}
                      >
                        {formatINR(acc.ledgerClosing)}
                      </div>
                    </div>
                  </div>

                  {/* Negative Explanation Box */}
                  {acc.status === 'negative' && (
                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/25 text-xs text-rose-900 dark:text-rose-200 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <span className="material-symbols-outlined text-[16px] text-rose-600">warning</span>
                        <span>Negative Ledger Position</span>
                      </div>
                      <p className="leading-relaxed">{acc.explanation}</p>
                    </div>
                  )}

                  {/* Issues List */}
                  {acc.issues.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
                        Issues & Audit Signals ({acc.issues.length})
                      </div>
                      <div className="space-y-1">
                        {acc.issues.map((issue, idx) => (
                          <div
                            key={idx}
                            className={`p-2 rounded-lg border text-xs flex items-start gap-2 ${getSeverityBadgeClass(
                              issue.severity
                            )}`}
                          >
                            <span className="material-symbols-outlined text-[15px] flex-shrink-0 mt-0.5">
                              {issue.severity === 'critical'
                                ? 'error'
                                : issue.severity === 'warning'
                                ? 'warning'
                                : 'info'}
                            </span>
                            <div className="min-w-0">
                              <span className="font-mono text-[10px] uppercase font-bold mr-1.5 opacity-80">
                                [{issue.code}]
                              </span>
                              <span>{issue.message}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Source Breakdown Table */}
                  {acc.breakdown.length > 0 && (
                    <div className="pt-2">
                      <div className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                        Source Breakdown ({acc.breakdown.reduce((sum, b) => sum + b.count, 0)} entries)
                      </div>
                      <div className="overflow-x-auto rounded-lg border border-outline-variant/20 bg-surface-container-lowest">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-surface-container-high/40 text-[10px] uppercase text-on-surface-variant border-b border-outline-variant/20">
                            <tr>
                              <th className="py-1.5 px-2.5">Source</th>
                              <th className="py-1.5 px-2 text-right">Count</th>
                              <th className="py-1.5 px-2 text-right">Inflow</th>
                              <th className="py-1.5 px-2 text-right">Outflow</th>
                              <th className="py-1.5 px-2.5 text-right">Net</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-outline-variant/10 font-tabular-data">
                            {acc.breakdown.map((b) => (
                              <tr key={b.source} className="hover:bg-surface-container-low/40">
                                <td className="py-1.5 px-2.5 font-medium text-on-surface">{b.label}</td>
                                <td className="py-1.5 px-2 text-right text-on-surface-variant">{b.count}</td>
                                <td className="py-1.5 px-2 text-right text-emerald-600 dark:text-emerald-400">
                                  {b.inflow > 0 ? `+${formatINR(b.inflow)}` : '—'}
                                </td>
                                <td className="py-1.5 px-2 text-right text-rose-600 dark:text-rose-400">
                                  {b.outflow > 0 ? `-${formatINR(b.outflow)}` : '—'}
                                </td>
                                <td
                                  className={`py-1.5 px-2.5 text-right font-bold ${
                                    b.net < 0
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : b.net > 0
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-on-surface-variant'
                                  }`}
                                >
                                  {formatINR(b.net)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Section: Unconfigured Account IDs */}
          {report.unconfiguredAccountIds.length > 0 && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-2">
              <div className="flex items-center gap-2 font-bold text-xs text-amber-900 dark:text-amber-200">
                <span className="material-symbols-outlined text-[16px] text-amber-600">help</span>
                <span>Unconfigured Account IDs ({report.unconfiguredAccountIds.length})</span>
              </div>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                The following account IDs appear in transactions or ledger balances but are not yet registered in the bank accounts master list:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {report.unconfiguredAccountIds.map((id) => (
                  <span
                    key={id}
                    className="font-mono text-xs px-2 py-0.5 rounded bg-surface-container-lowest border border-amber-500/30 text-amber-900 dark:text-amber-200 font-bold"
                  >
                    {id}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Section: Duplicate Outflow Candidates */}
          {report.duplicateCandidates.length > 0 && (
            <div className="p-3.5 rounded-xl bg-surface-container-low border border-outline-variant/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-xs text-on-surface">
                  <span className="material-symbols-outlined text-[16px] text-amber-600">content_copy</span>
                  <span>Duplicate Outflow Candidates ({report.duplicateCandidates.length})</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 uppercase tracking-wider">
                  Review for duplicate payment
                </span>
              </div>
              <p className="text-xs text-on-surface-variant">
                These outflow entries share the same account, date, amount, and reference number. This is an informational review signal, not proof of error.
              </p>
              <div className="space-y-2">
                {report.duplicateCandidates.map((dup, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/20 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-on-surface">{dup.accountName}</span>
                      <span className="font-bold font-tabular-data text-rose-600 dark:text-rose-400">
                        {formatINR(dup.amount)}
                      </span>
                    </div>
                    <div className="text-[11px] text-on-surface-variant flex flex-wrap gap-x-3 gap-y-1">
                      <span>Date: {dup.date}</span>
                      <span>Reference: {dup.referenceNo}</span>
                      <span>Entries: {dup.entryIds.join(', ')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Note */}
        <div className="px-4 py-3 sm:px-6 border-t border-outline-variant/20 bg-surface-container-low/60 flex items-center justify-between text-xs text-on-surface-variant">
          <p className="text-[11px] sm:text-xs leading-normal">
            Read-only: no balances, vouchers, accounts, or sync data are changed by this report. Any correction must be entered manually and explicitly.
          </p>
        </div>
      </div>
    </div>
  );
};
