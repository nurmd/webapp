import React, { useState, useEffect, useMemo } from 'react';
import {
  auditAllItemStock,
  reconcileItemStock,
  StockAuditReport,
  StockDiscrepancyRecord,
} from '../../core/audit/inventoryStockAuditor.ts';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal.tsx';

export interface InventoryStockAuditorPanelProps {
  onRefreshParent?: () => void;
}

export const InventoryStockAuditorPanel: React.FC<InventoryStockAuditorPanelProps> = ({
  onRefreshParent,
}) => {
  const [report, setReport] = useState<StockAuditReport | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [filterType, setFilterType] = useState<'ALL' | 'VARIANCE' | 'NEGATIVE'>('ALL');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showReconcileConfirm, setShowReconcileConfirm] = useState(false);

  const runAudit = () => {
    setIsAuditing(true);
    try {
      const res = auditAllItemStock();
      setReport(res);
    } catch (err: any) {
      console.error('Stock audit error:', err);
    } finally {
      setIsAuditing(false);
    }
  };

  useEffect(() => {
    runAudit();
  }, []);

  const executeReconcile = async () => {
    if (!report || report.discrepantItemsCount === 0) return;

    setIsReconciling(true);
    try {
      const res = await reconcileItemStock(report);
      setStatusMessage(
        `Successfully reconciled ${res.reconciledCount} inventory items by generating ${res.adjustmentsCreated} correction entries!`
      );
      runAudit();
      onRefreshParent?.();
    } catch (err: any) {
      console.error('Stock reconciliation failed:', err);
      setStatusMessage(`Stock reconciliation failed: ${err.message || err}`);
    } finally {
      setIsReconciling(false);
    }
  };

  const handleReconcile = () => {
    if (!report || report.discrepantItemsCount === 0) return;
    setShowReconcileConfirm(true);
  };

  const filteredDiscrepancies = useMemo(() => {
    if (!report) return [];
    if (filterType === 'VARIANCE') return report.discrepancies.filter((d) => Math.abs(d.variance) > 0.001);
    if (filterType === 'NEGATIVE') return report.discrepancies.filter((d) => d.isNegativeStockViolation);
    return report.discrepancies;
  }, [report, filterType]);

  return (
    <div className="flex flex-col gap-4 w-full animate-fade-in">
      {/* Action Strip & Status Banner */}
      <div className="bg-surface-container-low rounded-2xl p-4 sm:p-5 border border-outline-variant/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[24px]">inventory_2</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-bold text-on-surface">
                Inventory Stock & Quantity Auditor
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary uppercase tracking-wider">
                Stock Traceability
              </span>
            </div>
            <p className="text-xs text-on-surface-variant mt-0.5 max-w-xl">
              Crosschecks physical stock levels against purchase additions, sales decrements, and manual adjustments to eliminate phantom inventory and negative stock violations.
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

          {report && report.discrepantItemsCount > 0 && (
            <button
              type="button"
              onClick={handleReconcile}
              disabled={isReconciling}
              className="px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-bold shadow-sm hover:opacity-95 active:scale-98 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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
            <span className="text-[11px] text-on-surface-variant font-medium block">Catalog Items Audited</span>
            <span className="text-lg sm:text-xl font-black text-on-surface mt-0.5 block">
              {report.totalItemsAudited}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant/20 shadow-2xs">
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium block">
              100% In Sync
            </span>
            <span className="text-lg sm:text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5 block">
              {report.healthyItemsCount}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant/20 shadow-2xs">
            <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium block">
              Quantity Variances
            </span>
            <span className="text-lg sm:text-xl font-black text-amber-600 dark:text-amber-400 mt-0.5 block">
              {report.discrepantItemsCount}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant/20 shadow-2xs">
            <span className="text-[11px] text-error font-medium block">Negative Violations</span>
            <span className="text-lg sm:text-xl font-black text-error mt-0.5 block">
              {report.negativeStockViolationsCount}
            </span>
          </div>
        </div>
      )}

      {/* Discrepancies Table */}
      {report && report.discrepantItemsCount === 0 ? (
        <div className="p-8 rounded-2xl bg-surface-container-lowest border border-emerald-500/20 text-center flex flex-col items-center gap-2">
          <span className="material-symbols-outlined text-[44px] text-emerald-500">verified</span>
          <h4 className="font-bold text-base text-on-surface">Inventory Perfectly Aligned</h4>
          <p className="text-xs text-on-surface-variant max-w-md">
            All inventory item quantities match their purchase additions, customer sales decrements, and stock adjustments. No negative stock violations detected.
          </p>
        </div>
      ) : (
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 overflow-hidden shadow-sm flex flex-col">
          {/* Table Toolbar */}
          <div className="p-3.5 border-b border-outline-variant/20 bg-surface-container-low/40 flex items-center justify-between">
            <span className="text-xs font-bold text-on-surface">
              Stock Variances &amp; Violations ({filteredDiscrepancies.length})
            </span>
            <div className="flex items-center gap-1 bg-surface-container p-0.5 rounded-lg text-xs font-bold">
              <button
                type="button"
                onClick={() => setFilterType('ALL')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  filterType === 'ALL' ? 'bg-surface-container-lowest shadow-xs text-on-surface' : 'text-on-surface-variant'
                }`}
              >
                All ({report?.discrepantItemsCount || 0})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('VARIANCE')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  filterType === 'VARIANCE' ? 'bg-surface-container-lowest shadow-xs text-on-surface' : 'text-on-surface-variant'
                }`}
              >
                Variance
              </button>
              <button
                type="button"
                onClick={() => setFilterType('NEGATIVE')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  filterType === 'NEGATIVE' ? 'bg-surface-container-lowest shadow-xs text-on-surface' : 'text-on-surface-variant'
                }`}
              >
                Negative Stock ({report?.negativeStockViolationsCount || 0})
              </button>
            </div>
          </div>

          {/* List of Stock Discrepancies */}
          <div className="divide-y divide-outline-variant/15 overflow-x-auto">
            {filteredDiscrepancies.map((d) => (
              <div key={d.itemId} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-on-surface truncate">{d.itemName}</span>
                    {d.sku && (
                      <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant text-[10px] font-mono">
                        {d.sku}
                      </span>
                    )}
                    {d.isNegativeStockViolation && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-error/15 text-error">
                        Negative Stock
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-on-surface-variant text-[11px]">
                    <span>Purchased: {d.totalPurchased} {d.unit}</span>
                    <span>Sold: {d.totalSold} {d.unit}</span>
                    <span>Adjustments: {d.totalAdjusted} {d.unit}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0 font-tabular-data">
                  <div className="text-right">
                    <span className="text-[10px] text-on-surface-variant uppercase font-semibold block">Recorded</span>
                    <span className="font-bold text-xs text-on-surface">{d.recordedStock} {d.unit}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-on-surface-variant uppercase font-semibold block">Computed</span>
                    <span className="font-bold text-xs text-primary">{d.computedStock} {d.unit}</span>
                  </div>
                  <div className="text-right px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 uppercase font-bold block">Variance</span>
                    <span className="font-black text-xs text-amber-600 dark:text-amber-400">
                      {d.variance > 0 ? `+${d.variance}` : d.variance} {d.unit}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inventory Stock Reconciliation Confirmation Modal */}
      {showReconcileConfirm && report && (
        <ConfirmDeleteModal
          isOpen={showReconcileConfirm}
          title="Reconcile Inventory Stock?"
          recordName={`${report.discrepantItemsCount} inventory item(s) with discrepancy`}
          description={`Are you sure you want to reconcile ${report.discrepantItemsCount} inventory item(s)? This will create automated correction adjustments to match purchase/sales transaction movements and log an immutable MCA Rule 3(1) audit record.`}
          confirmText="Reconcile Stock"
          cancelText="Cancel"
          onConfirm={() => {
            setShowReconcileConfirm(false);
            executeReconcile();
          }}
          onClose={() => setShowReconcileConfirm(false)}
        />
      )}
    </div>
  );
};
