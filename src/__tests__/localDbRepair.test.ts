import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

class TestStorage implements Storage {
  private store: Map<string, string> = new Map();
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

const testStorage = new TestStorage();
Object.defineProperty(globalThis, 'localStorage', { value: testStorage, writable: true, configurable: true });

import PouchDB from 'pouchdb-browser';
import { pouch, DEFAULT_REPAIR_TIMEOUTS, type PouchSyncState } from '../services/pouchdb.ts';
import { enqueueWrite, getWriteQueueHealth } from '../services/db/writeQueue.ts';

/**
 * Short timeouts for tests that must simulate a wedged store. Kept tiny so the
 * suite stays fast.
 */
const FAST = { probeMs: 40, closeMs: 40, destroyMs: 40, restoreMs: 40 };

/**
 * Generous timeouts for tests that expect the store to be healthy. The full suite
 * runs many files in parallel on a phone-class CPU, so a 40ms probe is flaky here.
 */
const TOLERANT = { probeMs: 5000, closeMs: 3000, destroyMs: 3000, restoreMs: 3000 };

/** A local DB stub whose every operation fails immediately. */
function failingDb() {
  const fail = () => Promise.reject(new Error('wedge'));
  return {
    put: vi.fn(fail),
    get: vi.fn(fail),
    remove: vi.fn(fail),
    close: vi.fn(fail),
    destroy: vi.fn(fail),
  };
}

/** A local DB stub whose every operation never settles, like a wedged IndexedDB. */
function hangingDb() {
  const hang = () => new Promise<never>(() => {});
  return {
    put: vi.fn(hang),
    get: vi.fn(hang),
    remove: vi.fn(hang),
    close: vi.fn(hang),
    destroy: vi.fn(hang),
  };
}

const svc = pouch as any;

async function destroyDb(name: string): Promise<void> {
  try {
    const db = new PouchDB(name);
    await db.destroy();
  } catch {
    /* ignore */
  }
}

describe('Local replica repair (wedged IndexedDB recovery)', () => {
  const healthyDbName = 'test_repair_healthy';
  const wedgedDbName = 'test_repair_wedged';
  const breakerDbName = 'test_repair_breaker';
  const pendingDbName = 'test_repair_pending';

  beforeEach(() => {
    testStorage.clear();
  });

  afterEach(async () => {
    if (svc.writeQueueTimer) {
      clearTimeout(svc.writeQueueTimer);
      svc.writeQueueTimer = null;
    }
    svc.writeQueueEntryTimeoutMs = 5000;
    vi.restoreAllMocks();
    await Promise.all([
      destroyDb(healthyDbName),
      destroyDb(wedgedDbName),
      destroyDb(breakerDbName),
      destroyDb(pendingDbName),
    ]);
    testStorage.clear();
  });

  it('exposes production-sized repair timeouts by default', () => {
    expect(DEFAULT_REPAIR_TIMEOUTS.probeMs).toBe(3000);
    expect(DEFAULT_REPAIR_TIMEOUTS.restoreMs).toBeGreaterThanOrEqual(60000);
  });

  it('leaves a responsive local replica intact (tier 1 only)', async () => {
    svc.activeDbName = healthyDbName;
    svc.localDB = new PouchDB(healthyDbName);

    const result = await pouch.repairLocalDatabase(TOLERANT);

    expect(result.ok).toBe(true);
    expect(result.rebuilt).toBe(false);
    expect(result.pending).toBe(0);
  });

  it('recovers by reopening the handle when only the handle was stale (tier 1)', async () => {
    svc.activeDbName = wedgedDbName;
    svc.localDB = failingDb();

    const result = await pouch.repairLocalDatabase(TOLERANT);

    expect(result.ok).toBe(true);
    expect(result.rebuilt).toBe(false);
  });

  it('rebuilds the replica when reopening the handle still cannot write (tier 2)', async () => {
    svc.activeDbName = wedgedDbName;
    svc.localDB = failingDb();
    // Simulate a store that stays wedged even after a fresh handle is opened.
    const stuck = hangingDb();
    svc.createLocalDb = vi.fn(() => stuck);

    try {
      const result = await pouch.repairLocalDatabase(FAST);

      expect(result.rebuilt).toBe(true);
      expect(result.ok).toBe(false);
      expect(svc.createLocalDb).toHaveBeenCalled();
      // The replica was successfully deleted, so no epoch bump is needed.
      expect(testStorage.getItem('gst_pouch_db_epoch_test_repair_wedged')).toBeNull();
    } finally {
      delete svc.createLocalDb;
    }
  });

  it('abandons an undeletable replica by advancing the physical database epoch', async () => {
    svc.activeDbName = wedgedDbName;
    svc.localDB = failingDb();
    const stuck = hangingDb();
    svc.createLocalDb = vi.fn(() => stuck);
    svc.destroyLocalDb = vi.fn(async () => false);

    try {
      const result = await pouch.repairLocalDatabase(FAST);

      expect(result.rebuilt).toBe(true);
      // A replica that cannot even be deleted is abandoned in place: the epoch
      // advances so the next launch opens a fresh physical IndexedDB database.
      expect(testStorage.getItem('gst_pouch_db_epoch_test_repair_wedged')).toBe('1');
    } finally {
      delete svc.createLocalDb;
      delete svc.destroyLocalDb;
    }
  });

  it('stops draining after repeated timeouts instead of burning the whole queue', async () => {
    svc.activeDbName = breakerDbName;
    svc.localDB = hangingDb();
    svc.writeQueueEntryTimeoutMs = 15;

    for (let i = 0; i < 20; i += 1) {
      enqueueWrite(breakerDbName, {
        op: 'PUT',
        type: 'invoice',
        id: `INV-BREAKER-${i}`,
        doc: { id: `INV-BREAKER-${i}` },
      });
    }

    const startedAt = Date.now();
    await pouch.retryWriteQueueNow();
    const elapsed = Date.now() - startedAt;

    const health = getWriteQueueHealth(breakerDbName);
    expect(health.pending).toBe(20);
    // Breaker trips after 5 consecutive timeouts, so only a handful are attempted.
    expect(health.retrying).toBeGreaterThanOrEqual(5);
    expect(health.retrying).toBeLessThan(20);
    expect(elapsed).toBeLessThan(2000);
  });

  it('derives pendingChanges from the durable queue instead of reporting zero', async () => {
    svc.activeDbName = pendingDbName;
    svc.localDB = new PouchDB(pendingDbName);

    enqueueWrite(pendingDbName, { op: 'PUT', type: 'party', id: 'PTY-1', doc: { id: 'PTY-1' } });
    enqueueWrite(pendingDbName, { op: 'PUT', type: 'party', id: 'PTY-2', doc: { id: 'PTY-2' } });

    // Start from a clean counter so the assertion isolates the queue-derived floor.
    svc.currentState = { ...svc.currentState, pendingChanges: 0 };

    const states: PouchSyncState[] = [];
    const unsubscribe = pouch.subscribeSync((state) => states.push(state));

    (pouch as any).notifySyncState();
    unsubscribe();

    const last = states[states.length - 1];
    expect(last.pendingChanges).toBe(2);
  });
});
