/**
 * Durable Local Write-Retry Queue for PouchDB Operations.
 *
 * Guarantees:
 * - When local PouchDB putDoc/deleteDoc operations encounter transient failures (e.g. disk/quota,
 *   busy IndexedDB transactions, lock contention), writes are persisted in localStorage.
 * - Retries with exponential backoff and jitter.
 * - Coalesces operations: newer PUT supersedes an earlier PUT/DELETE for the same entity, and
 *   a DELETE supersedes a queued PUT.
 * - Bounded queue size (MAX_ENTRIES = 500) with oldest-entry eviction tracking (dropped count).
 * - Per-database storage isolation: `vyapar_pouch_write_queue_v1:${dbName}`.
 * - Pure defensive storage access: never throws on private browsing or quota limits.
 */

export type QueuedWriteOp = 'PUT' | 'DELETE';

export interface QueuedWrite {
  key: string;
  op: QueuedWriteOp;
  type: string;
  id: string;
  doc?: unknown;
  enqueuedAt: number;
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
}

export interface WriteQueueErrorGroup {
  type: string;
  message: string;
  count: number;
}

export const MAX_ERROR_GROUPS = 5;
export const MAX_ERROR_MESSAGE_LENGTH = 160;

export interface WriteQueueHealth {
  pending: number;
  retrying: number;
  failed: number;
  oldestEnqueuedAt?: number;
  dropped: number;
  errors: WriteQueueErrorGroup[];
}

export const MAX_ENTRIES = 500;
export const BASE_DELAY_MS = 2000;
export const MAX_DELAY_MS = 300000; // 5 minutes

export const WRITE_QUEUE_KEY_PREFIX = 'vyapar_pouch_write_queue_v1:';

export function getWriteQueueStorageKey(dbName: string): string {
  return `${WRITE_QUEUE_KEY_PREFIX}${dbName}`;
}

export interface PersistedQueuePayload {
  entries: QueuedWrite[];
  dropped: number;
}

/**
 * Computes exponential backoff delay with jitter.
 * Formula: min(BASE_DELAY_MS * 2 ** (attempts - 1), MAX_DELAY_MS) + (0..1000ms jitter)
 */
export function computeBackoffDelay(attempts: number, jitterMs?: number): number {
  const safeAttempts = Math.max(1, attempts);
  const exponential = BASE_DELAY_MS * Math.pow(2, safeAttempts - 1);
  const capped = Math.min(exponential, MAX_DELAY_MS);
  const jitter = jitterMs !== undefined ? jitterMs : Math.floor(Math.random() * 1000);
  return capped + jitter;
}

function loadPersistedQueue(dbName: string): PersistedQueuePayload {
  try {
    if (typeof localStorage === 'undefined') {
      return { entries: [], dropped: 0 };
    }
    const raw = localStorage.getItem(getWriteQueueStorageKey(dbName));
    if (!raw || !raw.trim()) {
      return { entries: [], dropped: 0 };
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { entries: parsed, dropped: 0 };
    }
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.entries)) {
      return {
        entries: parsed.entries,
        dropped: typeof parsed.dropped === 'number' ? parsed.dropped : 0,
      };
    }
  } catch {
    // Storage access failures fall back to safe empty state
  }
  return { entries: [], dropped: 0 };
}

function savePersistedQueue(dbName: string, payload: PersistedQueuePayload): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const key = getWriteQueueStorageKey(dbName);
    if (payload.entries.length === 0 && payload.dropped === 0) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(payload));
    }
  } catch {
    // Storage quota or private browsing errors caught defensively
  }
}

/**
 * Reads all queued write entries for a database.
 */
export function readQueue(dbName: string): QueuedWrite[] {
  return loadPersistedQueue(dbName).entries;
}

/**
 * Enqueues a write operation with deduplication and op-superseding.
 * - Dedupe by key `${op}:${type}:${id}`
 * - Replaces the opposite op for the same `${type}:${id}` (later PUT supersedes DELETE, and vice versa)
 * - Keeps the latest doc snapshot
 * - Evicts oldest entries past MAX_ENTRIES and increments dropped count
 */
export function enqueueWrite(
  dbName: string,
  item: { op: QueuedWriteOp; type: string; id: string; doc?: unknown; error?: string }
): QueuedWrite {
  const payload = loadPersistedQueue(dbName);
  let entries = payload.entries;
  let dropped = payload.dropped;

  const key = `${item.op}:${item.type}:${item.id}`;
  const oppositeOp: QueuedWriteOp = item.op === 'PUT' ? 'DELETE' : 'PUT';
  const oppositeKey = `${oppositeOp}:${item.type}:${item.id}`;
  const now = Date.now();

  // 1. Remove opposite op if present (a later PUT supersedes a queued DELETE and vice versa)
  entries = entries.filter((e) => e.key !== oppositeKey);

  // 2. Dedupe by key and keep latest doc snapshot
  const existingIdx = entries.findIndex((e) => e.key === key);
  let queued: QueuedWrite;

  if (existingIdx >= 0) {
    const existing = entries[existingIdx];
    queued = {
      ...existing,
      doc: item.doc,
      attempts: 0,
      nextAttemptAt: now,
      lastError: item.error ?? existing.lastError,
    };
    entries[existingIdx] = queued;
  } else {
    queued = {
      key,
      op: item.op,
      type: item.type,
      id: item.id,
      doc: item.doc,
      enqueuedAt: now,
      attempts: 0,
      nextAttemptAt: now,
      lastError: item.error,
    };
    entries.push(queued);
  }

  // 3. Cap at MAX_ENTRIES: drop oldest entries past MAX_ENTRIES
  if (entries.length > MAX_ENTRIES) {
    const excess = entries.length - MAX_ENTRIES;
    // Sort oldest first by enqueuedAt
    entries.sort((a, b) => a.enqueuedAt - b.enqueuedAt);
    entries.splice(0, excess);
    dropped += excess;
  }

  savePersistedQueue(dbName, { entries, dropped });
  return queued;
}

/**
 * Removes an entry from the write queue upon successful persistence.
 */
export function removeWrite(dbName: string, key: string): void {
  const payload = loadPersistedQueue(dbName);
  const resolvedKey = key || '';
  const remaining = payload.entries.filter((e) => {
    const entryKey = e.key || `${e.op}:${e.type}:${e.id}`;
    return entryKey !== resolvedKey && e.key !== key;
  });
  if (remaining.length !== payload.entries.length) {
    savePersistedQueue(dbName, { entries: remaining, dropped: payload.dropped });
  }
}

/**
 * Records a failure for a queued entry: increments attempts and schedules nextAttemptAt with backoff.
 */
export function recordFailure(dbName: string, key: string, error?: string, jitterMs?: number): void {
  const payload = loadPersistedQueue(dbName);
  const entry = payload.entries.find((e) => e.key === key);
  if (!entry) return;

  entry.attempts += 1;
  entry.lastError = error;
  entry.nextAttemptAt = Date.now() + computeBackoffDelay(entry.attempts, jitterMs);

  savePersistedQueue(dbName, payload);
}

/**
 * Retrieves write operations that are eligible for retry (nextAttemptAt <= now).
 */
export function getDueWrites(dbName: string, now: number = Date.now()): QueuedWrite[] {
  const entries = readQueue(dbName);
  return entries.filter((e) => e.nextAttemptAt <= now);
}

/**
 * Groups queued write errors by type and normalized message, sorted by count desc,
 * then type asc, then message asc, capped at MAX_ERROR_GROUPS.
 */
export function summarizeWriteQueueErrors(entries: QueuedWrite[]): WriteQueueErrorGroup[] {
  const groupMap = new Map<string, WriteQueueErrorGroup>();

  for (const entry of entries) {
    const raw = entry.lastError || 'unknown error';
    const collapsed = raw.replace(/\s+/g, ' ').trim();
    const message = (collapsed || 'unknown error').slice(0, MAX_ERROR_MESSAGE_LENGTH);
    const type = entry.type;
    const key = `${type}::${message}`;

    const existing = groupMap.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groupMap.set(key, {
        type,
        message,
        count: 1,
      });
    }
  }

  const groups = Array.from(groupMap.values());
  groups.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    const typeCmp = a.type.localeCompare(b.type);
    if (typeCmp !== 0) {
      return typeCmp;
    }
    return a.message.localeCompare(b.message);
  });

  return groups.slice(0, MAX_ERROR_GROUPS);
}

/**
 * Returns health metrics for the write queue:
 * - pending: total queued operations
 * - retrying: entries with attempts > 0
 * - failed: entries with attempts >= 3
 * - oldestEnqueuedAt: timestamp of earliest enqueued entry
 * - dropped: count of discarded entries due to MAX_ENTRIES overflow
 * - errors: summarized error groups
 */
export function getWriteQueueHealth(dbName: string): WriteQueueHealth {
  const payload = loadPersistedQueue(dbName);
  const entries = payload.entries;
  const pending = entries.length;
  const retrying = entries.filter((e) => e.attempts > 0).length;
  const failed = entries.filter((e) => e.attempts >= 3).length;
  const oldestEnqueuedAt =
    entries.length > 0 ? Math.min(...entries.map((e) => e.enqueuedAt)) : undefined;

  return {
    pending,
    retrying,
    failed,
    oldestEnqueuedAt,
    dropped: payload.dropped,
    errors: summarizeWriteQueueErrors(entries),
  };
}

/**
 * Resets nextAttemptAt to now for all queued writes in a database so they are immediately due for retry.
 * No-op on an empty queue.
 */
export function makeAllWritesDue(dbName: string): void {
  const payload = loadPersistedQueue(dbName);
  if (payload.entries.length === 0) {
    return;
  }
  const now = Date.now();
  for (const entry of payload.entries) {
    entry.nextAttemptAt = now;
  }
  savePersistedQueue(dbName, payload);
}

/**
 * Empties the write queue and resets dropped count for a database.
 */
export function clearWriteQueue(dbName: string): void {
  savePersistedQueue(dbName, { entries: [], dropped: 0 });
}
