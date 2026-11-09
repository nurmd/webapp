/**
 * In-Memory Storage Health & Quota Diagnostics.
 *
 * Guarantees:
 * - In-memory only: NEVER writes to localStorage, avoiding recursive failures under quota exhaustion.
 * - Reactive: components subscribe via useSyncExternalStore or subscribeStorageHealth.
 * - Storage estimate probing with graceful degradation across browsers and Android WebViews.
 */

export interface StorageHealthSnapshot {
  quotaExceeded: boolean;
  affectedKeys: string[];
  lastQuotaAt?: string;
  lastRecoveredAt?: string;
  failedWrites: number;
}

let healthSnapshot: StorageHealthSnapshot = {
  quotaExceeded: false,
  affectedKeys: [],
  failedWrites: 0,
};

const listeners = new Set<(health: StorageHealthSnapshot) => void>();

function notify(): void {
  const copy = getStorageHealth();
  listeners.forEach((listener) => {
    try {
      listener(copy);
    } catch (e) {
      console.warn('[StorageHealth] Listener execution failed:', e);
    }
  });
}

export function getStorageHealth(): StorageHealthSnapshot {
  return healthSnapshot;
}

export function subscribeStorageHealth(cb: (health: StorageHealthSnapshot) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function recordQuotaExceeded(key: string): void {
  const keys = new Set(healthSnapshot.affectedKeys);
  keys.add(key);
  healthSnapshot = {
    ...healthSnapshot,
    quotaExceeded: true,
    affectedKeys: Array.from(keys),
    failedWrites: healthSnapshot.failedWrites + 1,
    lastQuotaAt: new Date().toISOString(),
  };
  notify();
}

export function recordQuotaRecovered(keys?: string[]): void {
  let remainingKeys: string[];
  if (keys && keys.length > 0) {
    const toRemove = new Set(keys);
    remainingKeys = healthSnapshot.affectedKeys.filter((k) => !toRemove.has(k));
  } else {
    remainingKeys = [];
  }

  healthSnapshot = {
    ...healthSnapshot,
    affectedKeys: remainingKeys,
    quotaExceeded: remainingKeys.length > 0,
    lastRecoveredAt: new Date().toISOString(),
  };
  notify();
}

export function resetStorageHealthForTests(): void {
  healthSnapshot = {
    quotaExceeded: false,
    affectedKeys: [],
    failedWrites: 0,
  };
  notify();
}

export async function getStorageEstimate(): Promise<{
  supported: boolean;
  usage?: number;
  quota?: number;
  percent?: number;
}> {
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.estimate === 'function'
    ) {
      const estimate = await navigator.storage.estimate();
      const usage = typeof estimate.usage === 'number' ? estimate.usage : undefined;
      const quota = typeof estimate.quota === 'number' ? estimate.quota : undefined;
      let percent: number | undefined;
      if (typeof usage === 'number' && typeof quota === 'number' && quota > 0) {
        percent = (usage / quota) * 100;
      }
      return { supported: true, usage, quota, percent };
    }
  } catch {
    // Storage estimation failure fallback
  }
  return { supported: false };
}

export function formatBytes(bytes?: number): string {
  if (typeof bytes !== 'number' || isNaN(bytes) || bytes < 0) {
    return '0 B';
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
