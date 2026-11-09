import { STORAGE_KEYS } from './storageEngine.ts';
import { pouch } from '../pouchdb.ts';

export interface EntityDivergence {
  type: string;
  localCount: number;
  pouchCount: number;
  localHash: string;
  pouchHash: string;
  divergent: boolean;
  missingInPouch: number;
  missingLocally: number;
}

export interface DivergenceReport {
  checkedAt: string;
  entities: EntityDivergence[];
  divergentTypes: string[];
  totalLocal: number;
  totalPouch: number;
}

export const DIVERGENCE_ENTITIES: Array<{ type: string; storageKey: string }> = [
  { type: 'invoice', storageKey: STORAGE_KEYS.INVOICES },
  { type: 'purchase', storageKey: STORAGE_KEYS.PURCHASES },
  { type: 'party', storageKey: STORAGE_KEYS.PARTIES },
  { type: 'item', storageKey: STORAGE_KEYS.ITEMS },
  { type: 'expense', storageKey: STORAGE_KEYS.EXPENSES },
  { type: 'voucher', storageKey: STORAGE_KEYS.VOUCHERS },
  { type: 'bank_account', storageKey: STORAGE_KEYS.BANK_ACCOUNTS },
  { type: 'cash_bank_txn', storageKey: STORAGE_KEYS.CASH_BANK_TXNS },
  { type: 'loan', storageKey: STORAGE_KEYS.LOANS },
  { type: 'loan_txn', storageKey: STORAGE_KEYS.LOAN_TXNS },
];

/**
 * 32-bit FNV-1a hex digest helper (no crypto, synchronous).
 */
export function fnv1aHex(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Drops PouchDB transport and replication metadata before content hashing.
 */
export function normalizeRecord(record: unknown): unknown {
  if (!record || typeof record !== 'object') return record;
  const { _id, _rev, _deleted, docType, syncedAt, ...rest } = record as Record<string, unknown>;
  return rest;
}

/**
 * Deterministically serializes values with sorted object keys.
 */
export function stableStringify(val: unknown): string {
  if (val === null || typeof val !== 'object') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return '[' + val.map((item) => (item === undefined ? 'null' : stableStringify(item))).join(',') + ']';
  }
  const obj = val as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  const pairs = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return '{' + pairs.join(',') + '}';
}

/**
 * Sorts records by id and computes deterministic FNV-1a hash.
 */
export function hashRecords(records: unknown[]): string {
  const sorted = [...records].sort((a: any, b: any) => {
    const idA = String(a?.id ?? a?._id ?? '');
    const idB = String(b?.id ?? b?._id ?? '');
    return idA.localeCompare(idB);
  });
  const normalized = sorted.map(normalizeRecord);
  return fnv1aHex(stableStringify(normalized));
}

let lastReport: DivergenceReport | null = null;
let startupScheduled = false;
const listeners = new Set<(report: DivergenceReport) => void>();

export function getLastDivergenceReport(): DivergenceReport | null {
  return lastReport;
}

export function subscribeDivergenceReport(cb: (report: DivergenceReport) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function notifySubscribers(report: DivergenceReport): void {
  listeners.forEach((listener) => {
    try {
      listener(report);
    } catch (e) {
      console.warn('[DivergenceReport] Subscriber execution failed:', e);
    }
  });
}

/**
 * Executes a read-only comparison across all configured entities between
 * the localStorage cache and the local PouchDB replica.
 * Never performs writes, repairs, or deletions.
 */
export async function runDivergenceCheck(): Promise<DivergenceReport> {
  const entities: EntityDivergence[] = [];
  const divergentTypes: string[] = [];
  let totalLocal = 0;
  let totalPouch = 0;

  for (const { type, storageKey } of DIVERGENCE_ENTITIES) {
    try {
      let readFailed = false;

      // 1. Read local cache
      let localRecords: any[] = [];
      try {
        if (typeof localStorage !== 'undefined') {
          const raw = localStorage.getItem(storageKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              localRecords = parsed;
            }
          }
        }
      } catch (err) {
        readFailed = true;
        console.warn(`[DivergenceReport] Failed reading local storage for ${storageKey}:`, err);
      }

      // 2. Read PouchDB replica
      let pouchRecords: any[] = [];
      try {
        const fetched = await pouch.getAllDocs(type);
        if (Array.isArray(fetched)) {
          pouchRecords = fetched;
        }
      } catch (err) {
        readFailed = true;
        console.warn(`[DivergenceReport] Failed reading PouchDB for ${type}:`, err);
      }

      const localCount = localRecords.length;
      const pouchCount = pouchRecords.length;
      totalLocal += localCount;
      totalPouch += pouchCount;

      const localHash = hashRecords(localRecords);
      const pouchHash = hashRecords(pouchRecords);

      const localIds = new Set(
        localRecords
          .map((r: any) => (r?.id !== undefined ? String(r.id) : r?._id !== undefined ? String(r._id) : ''))
          .filter(Boolean)
      );
      const pouchIds = new Set(
        pouchRecords
          .map((p: any) => (p?.id !== undefined ? String(p.id) : p?._id !== undefined ? String(p._id) : ''))
          .filter(Boolean)
      );

      let missingInPouch = 0;
      for (const id of localIds) {
        if (!pouchIds.has(id)) {
          missingInPouch++;
        }
      }

      let missingLocally = 0;
      for (const id of pouchIds) {
        if (!localIds.has(id)) {
          missingLocally++;
        }
      }

      const divergent =
        readFailed ||
        localCount !== pouchCount ||
        localHash !== pouchHash ||
        missingInPouch > 0 ||
        missingLocally > 0;

      if (divergent) {
        divergentTypes.push(type);
      }

      entities.push({
        type,
        localCount,
        pouchCount,
        localHash,
        pouchHash,
        divergent,
        missingInPouch,
        missingLocally,
      });
    } catch (err) {
      console.warn(`[DivergenceReport] Unexpected failure checking ${type}:`, err);
      divergentTypes.push(type);
      entities.push({
        type,
        localCount: 0,
        pouchCount: 0,
        localHash: '',
        pouchHash: '',
        divergent: true,
        missingInPouch: 0,
        missingLocally: 0,
      });
    }
  }

  const report: DivergenceReport = {
    checkedAt: new Date().toISOString(),
    entities,
    divergentTypes,
    totalLocal,
    totalPouch,
  };

  lastReport = report;
  notifySubscribers(report);
  return report;
}

/**
 * Schedules a startup divergence check once per session.
 * Uses requestIdleCallback (fallback 4000ms), skips in demo mode,
 * logs a warning if divergences are found, and never throws.
 */
export function scheduleStartupDivergenceCheck(): void {
  if (startupScheduled) return;
  startupScheduled = true;

  const execute = () => {
    try {
      if (typeof pouch?.isDemoMode === 'function' && pouch.isDemoMode()) {
        return;
      }
      runDivergenceCheck()
        .then((report) => {
          if (report.divergentTypes.length > 0) {
            console.warn(
              '[DivergenceReport] LocalStorage vs PouchDB divergence detected at startup:',
              report.divergentTypes
            );
          }
        })
        .catch((err) => {
          console.warn('[DivergenceReport] Startup divergence check failed:', err);
        });
    } catch (err) {
      console.warn('[DivergenceReport] Failed executing startup divergence check:', err);
    }
  };

  try {
    if (typeof window !== 'undefined' && typeof (window as any).requestIdleCallback === 'function') {
      (window as any).requestIdleCallback(execute, { timeout: 4000 });
    } else {
      setTimeout(execute, 4000);
    }
  } catch {
    setTimeout(execute, 4000);
  }
}

/**
 * Clears cached divergence report, scheduled flag, and subscribers for testing.
 */
export function resetDivergenceStateForTests(): void {
  lastReport = null;
  startupScheduled = false;
  listeners.clear();
}
