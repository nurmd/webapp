import React, { useState, useEffect, useSyncExternalStore } from 'react';
import {
  getStorageHealth,
  subscribeStorageHealth,
  getStorageEstimate,
  formatBytes,
} from '../../services/db/storageHealth.ts';
import { db } from '../../services/db.ts';
import { showAppToast } from '../../services/toast.ts';

export const StorageQuotaBanner: React.FC = () => {
  const health = useSyncExternalStore(subscribeStorageHealth, getStorageHealth);
  const [dismissed, setDismissed] = useState(false);
  const [estimate, setEstimate] = useState<{
    supported: boolean;
    usage?: number;
    quota?: number;
    percent?: number;
  } | null>(null);

  useEffect(() => {
    if (health.quotaExceeded && !dismissed) {
      let active = true;
      getStorageEstimate().then((est) => {
        if (active) {
          setEstimate(est);
        }
      });
      return () => {
        active = false;
      };
    }
  }, [health.quotaExceeded, dismissed, health.failedWrites]);

  if (!health.quotaExceeded || dismissed) {
    return null;
  }

  const count = health.affectedKeys.length || 1;

  const handleRetry = async () => {
    try {
      const res = db.retryQuotaFailedWrites();
      if (typeof showAppToast === 'function') {
        if (res.recovered > 0 && res.stillFailing === 0) {
          showAppToast(`Saved ${res.recovered} change(s) to local cache.`);
        } else if (res.recovered > 0 && res.stillFailing > 0) {
          showAppToast(`Saved ${res.recovered} change(s); ${res.stillFailing} still failing.`);
        } else {
          showAppToast(`Storage is still full; ${res.stillFailing} change(s) failed.`);
        }
      }
      const updatedEstimate = await getStorageEstimate();
      setEstimate(updatedEstimate);
    } catch (e) {
      console.warn('[StorageQuotaBanner] Retry failed:', e);
    }
  };

  const hasEstimate =
    estimate?.supported &&
    typeof estimate.usage === 'number' &&
    typeof estimate.quota === 'number';

  return (
    <aside
      role="status"
      data-testid="storage-quota-banner"
      className="flex-shrink-0 z-20 w-full bg-amber-500/15 dark:bg-amber-950/50 border-b border-amber-500/30 px-3.5 py-2.5 sm:px-4 sm:py-3 text-amber-900 dark:text-amber-100 transition-colors"
    >
      <div className="max-w-7xl mx-auto flex items-start sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
          <span
            className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-xl flex-shrink-0 mt-0.5 sm:mt-0 select-none"
            aria-hidden="true"
          >
            warning
          </span>
          <div className="min-w-0 flex-1 text-xs sm:text-sm">
            <div className="font-semibold text-amber-950 dark:text-amber-100">
              Device storage is full
            </div>
            <p className="mt-0.5 text-amber-900/90 dark:text-amber-200/90 leading-tight">
              {count} change(s) are saved to the database but could not be cached locally.
              {hasEstimate && (
                <span className="block sm:inline sm:ml-2 font-mono text-[11px] sm:text-xs text-amber-800 dark:text-amber-300">
                  Local cache: {formatBytes(estimate.usage)} of {formatBytes(estimate.quota)} ({Math.round(estimate.percent ?? 0)}%)
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={handleRetry}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            <span>Retry save</span>
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss storage warning"
            className="p-1 rounded-lg text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 active:bg-amber-500/30 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
