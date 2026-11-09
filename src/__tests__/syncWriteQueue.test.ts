import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  enqueueWrite,
  readQueue,
  removeWrite,
  recordFailure,
  getDueWrites,
  getWriteQueueHealth,
  clearWriteQueue,
  MAX_ENTRIES,
  BASE_DELAY_MS,
  MAX_DELAY_MS,
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
    return this.store.has(key) ? this.store.get(key)! : null;
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

describe('PouchDB Durable Write-Retry Queue (Pure Module Tests)', () => {
  const TEST_DB = 'test_db_main';
  const OTHER_DB = 'test_db_secondary';

  beforeEach(() => {
    memoryStorage.clear();
  });

  afterEach(() => {
    memoryStorage.clear();
    vi.restoreAllMocks();
  });

  it('enqueue dedupes by key and keeps the latest doc', () => {
    const doc1 = { id: 'INV-001', grandTotal: 100 };
    const doc2 = { id: 'INV-001', grandTotal: 250 };

    const first = enqueueWrite(TEST_DB, {
      op: 'PUT',
      type: 'invoice',
      id: 'INV-001',
      doc: doc1,
      error: 'Disk full',
    });
    expect(first.key).toBe('PUT:invoice:INV-001');

    let queue = readQueue(TEST_DB);
    expect(queue).toHaveLength(1);
    expect(queue[0].doc).toEqual(doc1);
    expect(queue[0].lastError).toBe('Disk full');

    const second = enqueueWrite(TEST_DB, {
      op: 'PUT',
      type: 'invoice',
      id: 'INV-001',
      doc: doc2,
      error: 'Lock contention',
    });

    expect(second.key).toBe('PUT:invoice:INV-001');
    queue = readQueue(TEST_DB);
    expect(queue).toHaveLength(1);
    expect(queue[0].doc).toEqual(doc2);
    expect(queue[0].lastError).toBe('Lock contention');
    expect(queue[0].attempts).toBe(0);
  });

  it('PUT supersedes a queued DELETE for the same type:id and vice versa', () => {
    // 1. Enqueue DELETE first
    enqueueWrite(TEST_DB, {
      op: 'DELETE',
      type: 'party',
      id: 'PTY-100',
      error: 'Delete failed',
    });

    let queue = readQueue(TEST_DB);
    expect(queue).toHaveLength(1);
    expect(queue[0].op).toBe('DELETE');
    expect(queue[0].key).toBe('DELETE:party:PTY-100');

    // 2. Later PUT for the same type:id must remove the queued DELETE
    const partyDoc = { id: 'PTY-100', name: 'Restored Party' };
    enqueueWrite(TEST_DB, {
      op: 'PUT',
      type: 'party',
      id: 'PTY-100',
      doc: partyDoc,
    });

    queue = readQueue(TEST_DB);
    expect(queue).toHaveLength(1);
    expect(queue[0].op).toBe('PUT');
    expect(queue[0].key).toBe('PUT:party:PTY-100');
    expect(queue[0].doc).toEqual(partyDoc);

    // 3. Later DELETE for the same type:id must remove the queued PUT
    enqueueWrite(TEST_DB, {
      op: 'DELETE',
      type: 'party',
      id: 'PTY-100',
    });

    queue = readQueue(TEST_DB);
    expect(queue).toHaveLength(1);
    expect(queue[0].op).toBe('DELETE');
    expect(queue[0].key).toBe('DELETE:party:PTY-100');
  });

  it('recordFailure grows nextAttemptAt and caps at MAX_DELAY_MS', () => {
    const item = enqueueWrite(TEST_DB, {
      op: 'PUT',
      type: 'item',
      id: 'ITEM-1',
      doc: { id: 'ITEM-1', name: 'Widget' },
    });

    const now = 1000000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    // First failure: attempts becomes 1, delay = BASE_DELAY_MS (2000)
    recordFailure(TEST_DB, item.key, 'Failure 1', 0);
    let queue = readQueue(TEST_DB);
    expect(queue[0].attempts).toBe(1);
    expect(queue[0].lastError).toBe('Failure 1');
    expect(queue[0].nextAttemptAt).toBe(now + BASE_DELAY_MS);

    // Second failure: attempts becomes 2, delay = 4000
    recordFailure(TEST_DB, item.key, 'Failure 2', 0);
    queue = readQueue(TEST_DB);
    expect(queue[0].attempts).toBe(2);
    expect(queue[0].nextAttemptAt).toBe(now + BASE_DELAY_MS * 2);

    // Third failure: attempts becomes 3, delay = 8000
    recordFailure(TEST_DB, item.key, 'Failure 3', 0);
    queue = readQueue(TEST_DB);
    expect(queue[0].attempts).toBe(3);
    expect(queue[0].nextAttemptAt).toBe(now + BASE_DELAY_MS * 4);

    // Simulate many consecutive failures (e.g. 15 attempts) to verify cap
    for (let i = 4; i <= 15; i++) {
      recordFailure(TEST_DB, item.key, `Failure ${i}`, 0);
    }
    queue = readQueue(TEST_DB);
    expect(queue[0].attempts).toBe(15);
    expect(queue[0].nextAttemptAt).toBe(now + MAX_DELAY_MS);
  });

  it('cap at MAX_ENTRIES drops oldest and increments dropped', () => {
    let now = 10000;
    vi.spyOn(Date, 'now').mockImplementation(() => ++now);

    // Enqueue MAX_ENTRIES items
    for (let i = 1; i <= MAX_ENTRIES; i++) {
      enqueueWrite(TEST_DB, {
        op: 'PUT',
        type: 'invoice',
        id: `INV-${i}`,
        doc: { id: `INV-${i}` },
      });
    }

    let health = getWriteQueueHealth(TEST_DB);
    expect(health.pending).toBe(MAX_ENTRIES);
    expect(health.dropped).toBe(0);

    // Enqueue 5 extra items past MAX_ENTRIES
    for (let i = MAX_ENTRIES + 1; i <= MAX_ENTRIES + 5; i++) {
      enqueueWrite(TEST_DB, {
        op: 'PUT',
        type: 'invoice',
        id: `INV-${i}`,
        doc: { id: `INV-${i}` },
      });
    }

    health = getWriteQueueHealth(TEST_DB);
    expect(health.pending).toBe(MAX_ENTRIES);
    expect(health.dropped).toBe(5);

    // Oldest items (INV-1 through INV-5) should have been dropped
    const queue = readQueue(TEST_DB);
    const ids = queue.map((e) => e.id);
    expect(ids).not.toContain('INV-1');
    expect(ids).not.toContain('INV-5');
    expect(ids).toContain('INV-6');
    expect(ids).toContain(`INV-${MAX_ENTRIES + 5}`);
  });

  it('health reports pending/retrying/failed/oldest', () => {
    let fakeTime = 500000;
    vi.spyOn(Date, 'now').mockImplementation(() => fakeTime);

    // Fresh write (attempts = 0)
    enqueueWrite(TEST_DB, {
      op: 'PUT',
      type: 'item',
      id: 'ITEM-FRESH',
    });

    fakeTime += 1000;
    // Retrying write (attempts = 1)
    const retrying = enqueueWrite(TEST_DB, {
      op: 'PUT',
      type: 'item',
      id: 'ITEM-RETRY',
    });
    recordFailure(TEST_DB, retrying.key, 'Transient error', 0);

    fakeTime += 1000;
    // Failed write (attempts >= 3)
    const failed = enqueueWrite(TEST_DB, {
      op: 'PUT',
      type: 'item',
      id: 'ITEM-FAILED',
    });
    recordFailure(TEST_DB, failed.key, 'Err 1', 0);
    recordFailure(TEST_DB, failed.key, 'Err 2', 0);
    recordFailure(TEST_DB, failed.key, 'Err 3', 0);

    const health = getWriteQueueHealth(TEST_DB);
    expect(health.pending).toBe(3);
    expect(health.retrying).toBe(2); // ITEM-RETRY (1) + ITEM-FAILED (3)
    expect(health.failed).toBe(1); // ITEM-FAILED (>= 3)
    expect(health.oldestEnqueuedAt).toBe(500000);
  });

  it('clearWriteQueue empties the queue', () => {
    enqueueWrite(TEST_DB, { op: 'PUT', type: 'invoice', id: '1' });
    enqueueWrite(TEST_DB, { op: 'DELETE', type: 'party', id: '2' });

    expect(readQueue(TEST_DB)).toHaveLength(2);

    clearWriteQueue(TEST_DB);

    expect(readQueue(TEST_DB)).toHaveLength(0);
    const health = getWriteQueueHealth(TEST_DB);
    expect(health.pending).toBe(0);
    expect(health.retrying).toBe(0);
    expect(health.failed).toBe(0);
    expect(health.dropped).toBe(0);
  });

  it('storage is isolated per dbName', () => {
    enqueueWrite(TEST_DB, { op: 'PUT', type: 'invoice', id: 'INV-A' });
    enqueueWrite(OTHER_DB, { op: 'PUT', type: 'invoice', id: 'INV-B' });

    const queueA = readQueue(TEST_DB);
    const queueB = readQueue(OTHER_DB);

    expect(queueA).toHaveLength(1);
    expect(queueA[0].id).toBe('INV-A');

    expect(queueB).toHaveLength(1);
    expect(queueB[0].id).toBe('INV-B');

    clearWriteQueue(TEST_DB);

    expect(readQueue(TEST_DB)).toHaveLength(0);
    expect(readQueue(OTHER_DB)).toHaveLength(1);
  });

  it('removeWrite removes an item by key and getDueWrites filters by nextAttemptAt', () => {
    const now = 2000000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const item1 = enqueueWrite(TEST_DB, { op: 'PUT', type: 'item', id: 'ITM-1' });
    const item2 = enqueueWrite(TEST_DB, { op: 'PUT', type: 'item', id: 'ITM-2' });

    // item1 failed and is scheduled in future (now + 2000)
    recordFailure(TEST_DB, item1.key, 'Delayed', 0);

    // At `now`, only item2 is due (nextAttemptAt is now)
    const dueAtNow = getDueWrites(TEST_DB, now);
    expect(dueAtNow.map((d) => d.id)).toEqual(['ITM-2']);

    // At `now + 2000`, both are due
    const dueLater = getDueWrites(TEST_DB, now + 2000);
    expect(dueLater.map((d) => d.id)).toContain('ITM-1');
    expect(dueLater.map((d) => d.id)).toContain('ITM-2');

    // removeWrite removes item2
    removeWrite(TEST_DB, item2.key);
    expect(readQueue(TEST_DB).map((d) => d.id)).toEqual(['ITM-1']);
  });
});
