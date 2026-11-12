import React, { useState } from 'react';
import { db } from '../../services/db.ts';
import type {
  PaiseMigrationPlan,
  PaiseMigrationReport,
} from '../../services/db/paiseMigrationStorage.ts';

export default function PaiseBackfillCard(): React.ReactElement {
  const [plan, setPlan] = useState<PaiseMigrationPlan | null>(null);
  const [report, setReport] = useState<PaiseMigrationReport | null>(null);
  const [confirming, setConfirming] = useState<boolean>(false);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  const handleCheckPlan = (): void => {
    try {
      setReport(null);
      const newPlan = db.planPaiseMigration();
      setPlan(newPlan);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setReport({
        success: false,
        dryRun: false,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        entities: [],
        totalMigrated: 0,
        totalSkipped: 0,
        totalDivergences: 0,
        abortedReason: msg,
      });
    }
  };

  const handleConfirmBackfill = (): void => {
    setIsRunning(true);
    try {
      const res = db.runPaiseMigration();
      setReport(res);
      setConfirming(false);
      try {
        const refreshedPlan = db.planPaiseMigration();
        setPlan(refreshedPlan);
      } catch {
        // Retain the report even if plan refresh encounters an error
      }
    } catch (err: unknown) {
      setConfirming(false);
      const msg = err instanceof Error ? err.message : String(err);
      setReport({
        success: false,
        dryRun: false,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        entities: [],
        totalMigrated: 0,
        totalSkipped: 0,
        totalDivergences: 0,
        abortedReason: msg,
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <section
      data-testid="paise-backfill-card"
      className="p-4 sm:p-5 rounded-2xl bg-surface border border-outline-variant/30 space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-primary">
              database
            </span>
            <h3 className="text-sm font-bold text-on-surface">Paise backfill (v1)</h3>
          </div>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Stamps integer-paise fields on existing documents. Rupee values are never modified.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <button
            type="button"
            data-testid="paise-backfill-check"
            onClick={handleCheckPlan}
            disabled={isRunning}
            className="px-3.5 py-2 rounded-xl bg-surface-container-high hover:bg-surface-container-highest active:scale-[0.98] text-on-surface text-xs font-semibold flex items-center gap-2 border border-outline-variant/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[16px]">rule</span>
            <span>Check plan</span>
          </button>

          {confirming ? (
            <>
              <button
                type="button"
                data-testid="paise-backfill-confirm"
                onClick={handleConfirmBackfill}
                disabled={isRunning}
                className="px-3.5 py-2 rounded-xl bg-primary text-on-primary hover:bg-primary/90 active:scale-[0.98] text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span
                  className={`material-symbols-outlined text-[16px] ${
                    isRunning ? 'animate-spin' : ''
                  }`}
                >
                  {isRunning ? 'sync' : 'check'}
                </span>
                <span>{isRunning ? 'Running…' : 'Confirm backfill'}</span>
              </button>
              <button
                type="button"
                data-testid="paise-backfill-cancel"
                onClick={() => setConfirming(false)}
                disabled={isRunning}
                className="px-3.5 py-2 rounded-xl bg-surface-container-high hover:bg-surface-container-highest active:scale-[0.98] text-on-surface text-xs font-semibold flex items-center gap-2 border border-outline-variant/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
                <span>Cancel</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              data-testid="paise-backfill-run"
              onClick={() => setConfirming(true)}
              disabled={!plan || plan.totalPending === 0 || isRunning}
              className="px-3.5 py-2 rounded-xl bg-primary text-on-primary hover:bg-primary/90 active:scale-[0.98] text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[16px]">play_arrow</span>
              <span>Run backfill</span>
            </button>
          )}
        </div>
      </div>

      {plan && (
        <div data-testid="paise-backfill-plan" className="space-y-3">
          {plan.totalPending === 0 ? (
            <div className="p-3 rounded-xl border border-outline-variant/20 bg-surface-container-low text-xs flex items-center gap-2 text-on-surface">
              <span className="material-symbols-outlined text-[16px] text-emerald-600 dark:text-emerald-400">
                check_circle
              </span>
              <span className="font-semibold text-xs">Plan: nothing to do</span>
            </div>
          ) : null}

          <div className="p-3 rounded-xl border border-outline-variant/20 bg-surface-container-lowest text-xs flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3 sm:gap-4 text-on-surface flex-wrap">
              <span>
                Total documents: <strong className="font-mono">{plan.totalDocuments}</strong>
              </span>
              <span className="opacity-40">·</span>
              <span>
                Current: <strong className="font-mono">{plan.totalCurrent}</strong>
              </span>
              <span className="opacity-40">·</span>
              <span>
                Pending:{' '}
                <strong className="font-mono text-amber-600 dark:text-amber-400">
                  {plan.totalPending}
                </strong>
              </span>
            </div>
          </div>

          <div className="divide-y divide-outline-variant/15 border border-outline-variant/20 rounded-xl overflow-hidden bg-surface-container-lowest text-xs">
            {plan.entities.map((item) => (
              <div
                key={item.entity}
                className="p-2.5 sm:px-3 flex items-center justify-between gap-2"
              >
                <span className="font-mono text-xs font-semibold text-on-surface capitalize">
                  {item.entity}
                </span>
                <span className="font-mono text-[11px] text-on-surface-variant">
                  {item.pending} / {item.total}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {report && (
        <div
          data-testid="paise-backfill-status"
          className={`p-3 rounded-xl border text-xs space-y-1.5 ${
            report.success
              ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/20 dark:border-emerald-900/40 dark:text-emerald-300'
              : 'bg-red-50/50 border-red-200 text-red-900 dark:bg-red-950/20 dark:border-red-900/40 dark:text-red-300'
          }`}
        >
          {report.success ? (
            <>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                <span
                  data-testid="paise-backfill-report-counts"
                  className="font-semibold text-xs"
                >
                  Migrated {report.totalMigrated} · Skipped {report.totalSkipped} · Divergences {report.totalDivergences}
                </span>
              </div>
              {report.backupId && (
                <div className="text-[11px] font-mono pl-6 opacity-90">
                  Backup {report.backupId}
                  {report.backupChecksum ? ` (${report.backupChecksum.slice(0, 12)})` : ''}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px]">error</span>
              <span className="font-semibold text-xs">
                {report.abortedReason ?? 'Migration failed'}
              </span>
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-on-surface-variant leading-relaxed">
        A verified pre-migration backup is created before any write. Idempotent — already-migrated documents are skipped.
      </p>
    </section>
  );
}
