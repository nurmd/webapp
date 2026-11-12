import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  QueuedWrite,
  MAX_ERROR_GROUPS,
  MAX_ERROR_MESSAGE_LENGTH,
  summarizeWriteQueueErrors,
  getWriteQueueHealth,
  makeAllWritesDue,
  enqueueWrite,
  recordFailure,
  getDueWrites,
} from '../services/db/writeQueue.ts';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key) ?? null : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

const memoryStorage = new MemoryStorage();
Object.defineProperty(globalThis, 'localStorage', {
  value: memoryStorage,
  writable: true,
  configurable: true,
});

describe('Write Queue Diagnostics and Health Summaries', () => {
  const TEST_DB = 'test_write_queue_diagnostics';

  beforeEach(() => {
    memoryStorage.clear();
  });

  afterEach(() => {
    memoryStorage.clear();
    vi.restoreAllMocks();
  });

  describe('summarizeWriteQueueErrors', () => {
    it('groups identical type and message and counts occurrences', () => {
      const now = Date.now();
      const entries: QueuedWrite[] = [
        {
          key: 'PUT:invoice:1',
          op: 'PUT',
          type: 'invoice',
          id: '1',
          enqueuedAt: now,
          attempts: 3,
          nextAttemptAt: now + 5000,
          lastError: 'QuotaExceededError: storage full',
        },
        {
          key: 'PUT:invoice:2',
          op: 'PUT',
          type: 'invoice',
          id: '2',
          enqueuedAt: now,
          attempts: 4,
          nextAttemptAt: now + 5000,
          lastError: 'QuotaExceededError: storage full',
        },
        {
          key: 'PUT:party:1',
          op: 'PUT',
          type: 'party',
          id: '1',
          enqueuedAt: now,
          attempts: 1,
          nextAttemptAt: now + 5000,
          lastError: 'NetworkError',
        },
      ];

      const groups = summarizeWriteQueueErrors(entries);
      expect(groups).toHaveLength(2);
      expect(groups[0]).toEqual({
        type: 'invoice',
        message: 'QuotaExceededError: storage full',
        count: 2,
      });
      expect(groups[1]).toEqual({
        type: 'party',
        message: 'NetworkError',
        count: 1,
      });
    });

    it('collapses whitespace, trims, and falls back to "unknown error" when message is missing or whitespace', () => {
      const now = Date.now();
      const entries: QueuedWrite[] = [
        {
          key: 'PUT:invoice:1',
          op: 'PUT',
          type: 'invoice',
          id: '1',
          enqueuedAt: now,
          attempts: 1,
          nextAttemptAt: now,
          lastError: '  Database   locked   \n\t busy  ',
        },
        {
          key: 'PUT:item:1',
          op: 'PUT',
          type: 'item',
          id: '1',
          enqueuedAt: now,
          attempts: 1,
          nextAttemptAt: now,
          lastError: undefined,
        },
        {
          key: 'PUT:item:2',
          op: 'PUT',
          type: 'item',
          id: '2',
          enqueuedAt: now,
          attempts: 1,
          nextAttemptAt: now,
          lastError: '   ',
        },
      ];

      const groups = summarizeWriteQueueErrors(entries);
      const invoiceGroup = groups.find((g) => g.type === 'invoice');
      const itemGroup = groups.find((g) => g.type === 'item');

      expect(invoiceGroup?.message).toBe('Database locked busy');
      expect(itemGroup?.message).toBe('unknown error');
      expect(itemGroup?.count).toBe(2);
    });

    it('truncates messages exceeding MAX_ERROR_MESSAGE_LENGTH (160 chars)', () => {
      const now = Date.now();
      const longMessage = 'A'.repeat(250);
      const entries: QueuedWrite[] = [
        {
          key: 'PUT:invoice:1',
          op: 'PUT',
          type: 'invoice',
          id: '1',
          enqueuedAt: now,
          attempts: 1,
          nextAttemptAt: now,
          lastError: longMessage,
        },
      ];

      const groups = summarizeWriteQueueErrors(entries);
      expect(groups).toHaveLength(1);
      expect(groups[0].message).toHaveLength(MAX_ERROR_MESSAGE_LENGTH);
      expect(groups[0].message).toBe('A'.repeat(160));
    });

    it('sorts by count desc, then type asc, then message asc, and caps at MAX_ERROR_GROUPS (5)', () => {
      const now = Date.now();
      const entries: QueuedWrite[] = [
        // Group A: count 4, type 'party', msg 'Z error'
        { key: '1', op: 'PUT', type: 'party', id: '1', enqueuedAt: now, attempts: 1, nextAttemptAt: now, lastError: 'Z error' },
        { key: '2', op: 'PUT', type: 'party', id: '2', enqueuedAt: now, attempts: 1, nextAttemptAt: now, lastError: 'Z error' },
        { key: '3', op: 'PUT', type: 'party', id: '3', enqueuedAt: now, attempts: 1, nextAttemptAt: now, lastError: 'Z error' },
        { key: '4', op: 'PUT', type: 'party', id: '4', enqueuedAt: now, attempts: 1, nextAttemptAt: now, lastError: 'Z error' },

        // Group B: count 3, type 'invoice', msg 'M error'
        { key: '5', op: 'PUT', type: 'invoice', id: '5', enqueuedAt: now, attempts: 1, nextAttemptAt: now, lastError: 'M error' },
        { key: '6', op: 'PUT', type: 'invoice', id: '6', enqueuedAt: now, attempts: 1, nextAttemptAt: now, lastError: 'M error' },
        { key: '7', op: 'PUT', type: 'invoice', id: '7', enqueuedAt: now, attempts: 1, nextAttemptAt: now, lastError: 'M error' },

        // Group C: count 3, type 'expense', msg 'K error' (same count 3 as B, but 'expense' < 'invoice' asc)
        { key: '8', op: 'PUT', type: 'expense', id: '8', enqueuedAt: now, attempts: 1, nextAttemptAt: now, lastError: 'K error' },
        { key: '9', op: 'PUT', type: 'expense', id: '9', enqueuedAt: now, attempts: 1, nextAttemptAt: now, lastError: 'K error' },
        { key: '10', op: 'PUT', type: 'expense', id: '10', enqueuedAt: now, attempts: 1, nextAttemptAt: now, lastError: 'K error' },

        // Group D: count 2, type 'item', msg 'B error'
        { key: '11', op: 'PUT', type: 'item', id: '11', enqueuedAt: now, attempts: 1, nextAttemptAt: now, lastError: 'B error' },
        { key: '12', op: 'PUT', type: 'item', id: '12', enqueuedAt: now, attempts: 1, nextAttemptAt: now, lastError: 'B error' },

        // Group E: count 2, type 'item', msg 'A error' (same count 2 and type 'item' as D, but 'A error' < 'B error' asc)
        { key: '13', op: 'PUT', type: 'item', id: '13', enqueuedAt: now, attempts: 1, nextAttemptAt: now, lastError: 'A error' },
        { key: '14', op: 'PUT', type: 'item', id: '14', enqueuedAt: now, attempts: 1, nextAttemptAt: now, lastError: 'A error' },

        // Group F: count 1, type 'voucher', msg 'X error' (should be cut off by MAX_ERROR_GROUPS = 5)
        { key: '15', op: 'PUT', type: 'voucher', id: '15', enqueuedAt: now, attempts: 1, nextAttemptAt: now, lastError: 'X error' },

        // Group G: count 1, type 'company', msg 'C error' (should also be cut off)
        { key: '16', op: 'PUT', type: 'company', id: '16', enqueuedAt: now, attempts: 1, nextAttemptAt: now, lastError: 'C error' },
      ];

      const groups = summarizeWriteQueueErrors(entries);
      expect(groups).toHaveLength(MAX_ERROR_GROUPS);
      expect(groups[0]).toEqual({ type: 'party', message: 'Z error', count: 4 });
      expect(groups[1]).toEqual({ type: 'expense', message: 'K error', count: 3 });
      expect(groups[2]).toEqual({ type: 'invoice', message: 'M error', count: 3 });
      expect(groups[3]).toEqual({ type: 'item', message: 'A error', count: 2 });
      expect(groups[4]).toEqual({ type: 'item', message: 'B error', count: 2 });
    });
  });

  describe('getWriteQueueHealth with errors', () => {
    it('populates errors and correctly calculates pending, retrying, failed, and dropped', () => {
      enqueueWrite(TEST_DB, { op: 'PUT', type: 'invoice', id: '1', doc: { id: '1' } });
      enqueueWrite(TEST_DB, { op: 'PUT', type: 'invoice', id: '2', doc: { id: '2' } });
      enqueueWrite(TEST_DB, { op: 'PUT', type: 'party', id: '3', doc: { id: '3' } });

      recordFailure(TEST_DB, 'PUT:invoice:1', 'Locked', 0);
      recordFailure(TEST_DB, 'PUT:invoice:2', 'Locked', 0);
      recordFailure(TEST_DB, 'PUT:invoice:2', 'Locked', 0);
      recordFailure(TEST_DB, 'PUT:invoice:2', 'Locked', 0); // attempts = 3 (failed >= 3)

      const health = getWriteQueueHealth(TEST_DB);
      expect(health.pending).toBe(3);
      expect(health.retrying).toBe(2);
      expect(health.failed).toBe(1);
      expect(health.dropped).toBe(0);
      expect(typeof health.oldestEnqueuedAt).toBe('number');
      expect(health.errors).toHaveLength(2);
      expect(health.errors[0]).toEqual({ type: 'invoice', message: 'Locked', count: 2 });
      expect(health.errors[1]).toEqual({ type: 'party', message: 'unknown error', count: 1 });
    });
  });

  describe('makeAllWritesDue', () => {
    it('resets nextAttemptAt on every queued entry so getDueWrites returns all entries immediately', () => {
      const now = Date.now();
      enqueueWrite(TEST_DB, { op: 'PUT', type: 'invoice', id: 'inv-1', doc: { id: 'inv-1' } });
      enqueueWrite(TEST_DB, { op: 'PUT', type: 'party', id: 'prt-1', doc: { id: 'prt-1' } });

      // Put them far into the future (e.g. 5 minutes backoff)
      recordFailure(TEST_DB, 'PUT:invoice:inv-1', 'Timeout', 300000);
      recordFailure(TEST_DB, 'PUT:party:prt-1', 'Timeout', 300000);

      const dueBefore = getDueWrites(TEST_DB, now);
      expect(dueBefore).toHaveLength(0);

      makeAllWritesDue(TEST_DB);

      const dueAfter = getDueWrites(TEST_DB, Date.now() + 10);
      expect(dueAfter).toHaveLength(2);
      expect(dueAfter.map((e) => e.id).sort()).toEqual(['inv-1', 'prt-1']);
    });

    it('is a no-op on an empty queue', () => {
      expect(() => makeAllWritesDue(TEST_DB)).not.toThrow();
      expect(getDueWrites(TEST_DB)).toHaveLength(0);
    });
  });
});
