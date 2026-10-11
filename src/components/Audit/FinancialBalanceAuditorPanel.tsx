import React, { useState, useEffect, useMemo } from 'react';
import {
  auditAllPartyBalances,
  reconcilePartyBalances,
  PartyBalanceAuditReport,
  PartyBalanceDiscrepancyRecord,
} from '../../core/audit/financialBalanceAuditor.ts';
import { formatINR } from '../../core/utils/formatters.ts';

export interface FinancialBalanceAuditorPanelProps {
  onRefreshParent?: () => void;
}

export const FinancialBalanceAuditorPanel: React.FC<FinancialBalanceAuditorPanelProps> = ({
  onRefreshParent,
}) => {
  const [report, setReport] = useState<PartyBalanceAuditReport | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [filterType, setFilterType] = useState<'ALL' | 'CUSTOMER' | 'SUPPLIER'>('ALL');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const runAudit = () => {
    setIsAuditing(true);
    try {
      const res = auditAllPartyBalances();
      setReport(res);
    } catch (err: any) {
      console.error('Audit run error:', err);
    } finally {
      setIsAuditing(false);
    }
  };

  useEffect(() => {
    runAudit();
  }, []);

  const handleReconcile = async () => {
    if (!report || report.discrepantPartiesCount === 0) return;
    if (
      !window.confirm(
        `Are you sure you want to reconcile ${report.discrepantPartiesCount} party accounts? This will adjust recorded party balances to match authentic transaction ground truth and log an MCA Rule 3(1) audit entry.`
      )
    ) {
      return;
    }

    setIsReconciling(true);
    try {
      const res = await reconcilePartyBalances(report);
      setStatusMessage(
        `Successfully auto-reconciled ${res.reconciledCount} party account(s) and repaired ${res.repairedDocumentsCount} transaction(s)!`
      );
      runAudit();
      onRefreshParent?.();
    } catch (err: any) {
      alert(`Reconciliation failed: ${err.message || err}`);
    } finally {
      setIsReconciling(false);
    }
  };

  const filteredDiscrepancies = useMemo(() => {
    if (!report) return [];
    if (filterType === 'ALL') return report.discrepancies;
    return report.discrepancies.filter((d) => d.partyType === filterType);
  }, [report, filterType]);

  return (
    <div className="flex flex-col gap-4 w-full animate-fade-in">
      {/* Action Strip & Status Banner */}
      <div className="bg-surface-container-low rounded-2xl p-4 sm:p-5 border border-outline-variant/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-secondary/15 text-secondary flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[24px]">account_balance</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-bold text-on-surface">
                Financial Transaction & Balance Auditor
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-secondary/10 text-secondary uppercase tracking-wider">
                Real-Time Integrity
              </span>
            </div>
            <p className="text-xs text-on-surface-variant mt-0.5 max-w-xl">
              Crosschecks all customer & supplier accounts against invoices, purchases, payments, and opening balances to guarantee zero ledger divergence.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={runAudit}
            disabled={isAuditing}
            className="px-3.5 py-2 rounded-xl border border-outline-variant/30 text-xs font-bold text-on-surface hover:bg-surface-container transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-[16px] ${isAuditing ? 'animate-spin' : ''}`}>
              refresh
            </span>
            <span>{isAuditing ? 'Scanning...' : 'Re-Scan'}</span>
          </button>

          {report && report.discrepantPartiesCount > 0 && (
            <button
              type="button"
              onClick={handleReconcile}
              disabled={isReconciling}
              className="px-4 py-2 rounded-xl bg-secondary text-on-secondary text-xs font-bold shadow-sm hover:opacity-95 active:scale-98 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[16px]">build_circle</span>
              <span>{isReconciling ? 'Reconciling...' : '1-Click Auto-Reconcile'}</span>
            </button>
          )}
        </div>
      </div>

      {statusMessage && (
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            <span>{statusMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-xs font-bold opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Metric Cards */}
      {report && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant/20 shadow-2xs">
            <span className="text-[11px] text-on-surface-variant font-medium block">Accounts Audited</span>
            <span className="text-lg sm:text-xl font-black text-on-surface mt-0.5 block">
              {report.totalPartiesAudited}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant/20 shadow-2xs">
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium block">
              100% Balanced
            </span>
            <span className="text-lg sm:text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5 block">
              {report.healthyPartiesCount}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant/20 shadow-2xs">
            <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium block">
              Discrepancies
            </span>
            <span className="text-lg sm:text-xl font-black text-amber-600 dark:text-amber-400 mt-0.5 block">
              {report.discrepantPartiesCount}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant/20 shadow-2xs">
            <span className="text-[11px] text-on-surface-variant font-medium block">Total Variance</span>
            <span className="text-lg sm:text-xl font-black text-on-surface mt-0.5 block font-tabular-data">
              {formatINR(report.totalDiscrepancyAmount)}
            </span>
          </div>
        </div>
      )}

      {/* Discrepancy Table or Clean State */}
      {report && report.discrepantPartiesCount === 0 && report.inconsistentDocuments.length === 0 ? (
        <div className="p-8 rounded-2xl bg-surface-container-lowest border border-emerald-500/20 text-center flex flex-col items-center gap-2">
          <span className="material-symbols-outlined text-[44px] text-emerald-500">task_alt</span>
          <h4 className="font-bold text-base text-on-surface">Perfect Financial Balance</h4>
          <p className="text-xs text-on-surface-variant max-w-md">
            All customer and supplier account balances match their transaction history down to the last paisa. No missing vouchers or arithmetic divergences found.
          </p>
        </div>
      ) : (
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden shadow-sm flex flex-col">
          {/* Table Toolbar */}
          <div className="p-3.5 border-b border-outline-variant/20 bg-surface-container-low/40 flex items-center justify-between">
            <span className="text-xs font-bold text-on-surface">
              Detected Account Discrepancies ({filteredDiscrepancies.length})
            </span>
            <div className="flex items-center gap-1 bg-surface-container p-0.5 rounded-lg text-xs font-bold">
              <button
                type="button"
                onClick={() => setFilterType('ALL')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  filterType === 'ALL' ? 'bg-surface-container-lowest shadow-xs text-on-surface' : 'text-on-surface-variant'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilterType('CUSTOMER')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  filterType === 'CUSTOMER' ? 'bg-surface-container-lowest shadow-xs text-on-surface' : 'text-on-surface-variant'
                }`}
              >
                Customers
              </button>
              <button
                type="button"
                onClick={() => setFilterType('SUPPLIER')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  filterType === 'SUPPLIER' ? 'bg-surface-container-lowest shadow-xs text-on-surface' : 'text-on-surface-variant'
                }`}
              >
                Suppliers
              </button>
            </div>
          </div>

          {/* List of Discrepancies */}
          <div className="divide-y divide-outline-variant/15 overflow-x-auto">
            {filteredDiscrepancies.map((d) => (
              <div key={d.partyId} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-on-surface truncate">{d.partyName}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        d.partyType === 'CUSTOMER'
                          ? 'bg-secondary/10 text-secondary'
                          : 'bg-primary/10 text-primary'
                      }`}
                    >
                      {d.partyType}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-on-surface-variant text-[11px]">
                    <span>Opening: {formatINR(d.openingBalance)} ({d.openingBalanceType})</span>
                    <span>Invoiced: {formatINR(d.totalInvoiced)}</span>
                    <span>Receipts: {formatINR(d.totalReceipts)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0 font-tabular-data">
                  <div className="text-right">
                    <span className="text-[10px] text-on-surface-variant uppercase font-semibold block">Recorded</span>
                    <span className="font-bold text-xs text-on-surface">{formatINR(d.recordedBalance)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-on-surface-variant uppercase font-semibold block">True Balance</span>
                    <span className="font-bold text-xs text-secondary">{formatINR(d.computedBalance)}</span>
                  </div>
                  <div className="text-right px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 uppercase font-bold block">Variance</span>
                    <span className="font-black text-xs text-amber-600 dark:text-amber-400">
                      {formatINR(d.discrepancy)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
