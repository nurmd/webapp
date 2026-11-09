/**
 * MCA Rule 3(1) Compliant In-Memory Audit Retention Engine.
 *
 * Provides configurable in-memory record window capping to avoid runaway heap usage,
 * while ensuring that all historical records remain permanently preserved in
 * PouchDB/IndexedDB and are fully queryable and exportable.
 *
 * Immutability invariant: Never deletes, purges, or mutates persisted audit records.
 */

export interface AuditRetentionPolicy {
  maxInMemoryRecords: number;
}

export const AUDIT_RETENTION_STORAGE_KEY = 'vyapar_audit_retention_v1';
export const DEFAULT_MAX_IN_MEMORY_RECORDS = 5000;
export const MIN_IN_MEMORY_RECORDS = 100;
export const MAX_IN_MEMORY_RECORDS = 50000;

// Epoch definitions: Epoch 1 = historical/legacy archive; Epoch 2 = current immutable hash-chain.
export const LEGACY_AUDIT_EPOCH = 1;
export const CURRENT_AUDIT_EPOCH = 2;

function clampMaxRecords(val: unknown): number {
  const num = typeof val === 'number' ? Math.floor(val) : Number(val);
  if (isNaN(num)) {
    return DEFAULT_MAX_IN_MEMORY_RECORDS;
  }
  return Math.max(MIN_IN_MEMORY_RECORDS, Math.min(MAX_IN_MEMORY_RECORDS, num));
}

let testPolicyOverride: AuditRetentionPolicy | null = null;

/**
 * Sets an explicit retention policy override for test suites.
 */
export function setAuditRetentionPolicyForTests(policy: AuditRetentionPolicy | null): void {
  testPolicyOverride = policy ? { ...policy } : null;
}

/**
 * Reads the active audit retention policy from localStorage.
 * Clamps maxInMemoryRecords between 100 and 50,000, falling back to 5,000.
 */
export function getAuditRetentionPolicy(): AuditRetentionPolicy {
  if (testPolicyOverride) {
    return { ...testPolicyOverride };
  }
  if (typeof localStorage === 'undefined') {
    return { maxInMemoryRecords: DEFAULT_MAX_IN_MEMORY_RECORDS };
  }
  try {
    const raw = localStorage.getItem(AUDIT_RETENTION_STORAGE_KEY);
    if (!raw) {
      return { maxInMemoryRecords: DEFAULT_MAX_IN_MEMORY_RECORDS };
    }
    const parsed = JSON.parse(raw);
    return {
      maxInMemoryRecords: clampMaxRecords(parsed?.maxInMemoryRecords),
    };
  } catch (err) {
    console.warn('[AuditRetention] Failed reading retention policy from localStorage:', err);
    return { maxInMemoryRecords: DEFAULT_MAX_IN_MEMORY_RECORDS };
  }
}

/**
 * Merges partial policy updates, validates/clamps bounds, and persists to localStorage.
 */
export function setAuditRetentionPolicy(
  partial: Partial<AuditRetentionPolicy>,
  allowBelowMinForTesting = false
): AuditRetentionPolicy {
  if (allowBelowMinForTesting && typeof partial.maxInMemoryRecords === 'number') {
    testPolicyOverride = {
      maxInMemoryRecords: Math.max(1, Math.floor(partial.maxInMemoryRecords)),
    };
    return { ...testPolicyOverride };
  }

  const current = getAuditRetentionPolicy();
  const nextMax =
    partial.maxInMemoryRecords !== undefined
      ? clampMaxRecords(partial.maxInMemoryRecords)
      : current.maxInMemoryRecords;

  const policy: AuditRetentionPolicy = {
    maxInMemoryRecords: nextMax,
  };

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(AUDIT_RETENTION_STORAGE_KEY, JSON.stringify(policy));
    } catch (err) {
      console.warn('[AuditRetention] Failed persisting retention policy to localStorage:', err);
    }
  }

  return policy;
}

/**
 * Removes the retention policy configuration key from localStorage (for test cleanup).
 */
export function resetAuditRetentionPolicyForTests(): void {
  testPolicyOverride = null;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(AUDIT_RETENTION_STORAGE_KEY);
    } catch {}
  }
}

/**
 * Given a chronologically sorted array of records, splits it into:
 * - `retained`: the newest `cap` entries (held in fast in-memory heap).
 * - `evicted`: older entries in original chronological order.
 * When records.length <= cap, evicted is [].
 */
export function selectRetainedWindow<T extends { sequence: number }>(
  records: T[],
  cap: number
): { retained: T[]; evicted: T[] } {
  const clampedCap = Math.max(1, Math.floor(cap));
  if (records.length <= clampedCap) {
    return {
      retained: [...records],
      evicted: [],
    };
  }
  const splitIndex = records.length - clampedCap;
  return {
    retained: records.slice(splitIndex),
    evicted: records.slice(0, splitIndex),
  };
}

export interface RetentionStats {
  total: number;
  currentEpoch: number;
  legacyEpoch: number;
  oldestSequence?: number;
  newestSequence?: number;
}

/**
 * Computes descriptive epoch and sequence statistics for a set of audit records.
 */
export function computeRetentionStats(
  records: Array<{ sequence: number; epoch?: number }>
): RetentionStats {
  const total = records.length;
  let currentEpoch = 0;
  let legacyEpoch = 0;

  for (const r of records) {
    const ep = r.epoch ?? LEGACY_AUDIT_EPOCH;
    if (ep === CURRENT_AUDIT_EPOCH) {
      currentEpoch++;
    } else {
      legacyEpoch++;
    }
  }

  const oldestSequence = total > 0 ? records[0].sequence : undefined;
  const newestSequence = total > 0 ? records[total - 1].sequence : undefined;

  return {
    total,
    currentEpoch,
    legacyEpoch,
    oldestSequence,
    newestSequence,
  };
}
