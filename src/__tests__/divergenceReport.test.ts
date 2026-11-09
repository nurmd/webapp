import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EntityDivergence,
  DivergenceReport,
  DIVERGENCE_ENTITIES,
  fnv1aHex,
  normalizeRecord,
  stableStringify,
  hashRecords,
  runDivergenceCheck,
  getLastDivergenceReport,
  subscribeDivergenceReport,
  scheduleStartupDivergenceCheck,
  resetDivergenceStateForTests,
} from '../services/db/divergenceReport.ts';
import { STORAGE_KEYS } from '../services/db/storageEngine.ts';
import { pouch } from '../services/pouchdb.ts';

// ---------------------------------------------------------------------------
// Mock Storage Implementation for Test Environment
// ---------------------------------------------------------------------------
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
Object.defineProperty(globalThis, 'localStorage', {
  value: testStorage,
  writable: true,
  configurable: true,
});
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: testStorage,
    writable: true,
    configurable: true,
  });
}

// ---------------------------------------------------------------------------
// Mocks for External Storage Engines (PouchDB & AuditTrail)
// ---------------------------------------------------------------------------
vi.mock('../services/pouchdb.ts', () => ({
  pouch: {
    putDoc: vi.fn(async () => {}),
    deleteDoc: vi.fn(async () => {}),
    getAllDocs: vi.fn(async () => []),
    getSyncState: vi.fn(() => ({ status: 'offline', remoteUrl: '', pendingChanges: 0 })),
    subscribeSync: vi.fn(() => () => {}),
    syncNow: vi.fn(async () => {}),
    startSync: vi.fn(),
    stopSync: vi.fn(),
    migrateFromLocalStorage: vi.fn(async () => {}),
    isDemoMode: vi.fn(() => false),
  },
  PouchService: vi.fn(),
}));

describe('Phase 1.3 Read-Only Startup Divergence Report Suite', () => {
  beforeEach(() => {
    testStorage.clear();
    resetDivergenceStateForTests();
    vi.restoreAllMocks();
    (pouch.getAllDocs as any).mockResolvedValue([]);
    (pouch.isDemoMode as any).mockReturnValue(false);
  });

  afterEach(() => {
    resetDivergenceStateForTests();
    vi.restoreAllMocks();
  });

  describe('Pure helper functions (fnv1aHex, normalizeRecord, stableStringify, hashRecords)', () => {
    it('fnv1aHex generates deterministic 8-character hexadecimal hashes', () => {
      const h1 = fnv1aHex('vyapar-books');
      const h2 = fnv1aHex('vyapar-books');
      const h3 = fnv1aHex('vyapar-books-2');

      expect(h1).toHaveLength(8);
      expect(h1).toBe(h2);
      expect(h1).not.toBe(h3);
    });

    it('normalizeRecord strips transport and metadata fields (_id, _rev, _deleted, docType, syncedAt)', () => {
      const docWithMeta = {
        _id: 'invoice:INV-001',
        _rev: '2-9a8b7c',
        _deleted: false,
        docType: 'invoice',
        syncedAt: '2026-11-09T00:00:00.000Z',
        id: 'INV-001',
        invoiceNumber: 'INV/2026/001',
        grandTotal: 1500,
      };

      const normalized = normalizeRecord(docWithMeta) as any;
      expect(normalized._id).toBeUndefined();
      expect(normalized._rev).toBeUndefined();
      expect(normalized._deleted).toBeUndefined();
      expect(normalized.docType).toBeUndefined();
      expect(normalized.syncedAt).toBeUndefined();
      expect(normalized.id).toBe('INV-001');
      expect(normalized.invoiceNumber).toBe('INV/2026/001');
      expect(normalized.grandTotal).toBe(1500);
    });

    it('normalizeRecord returns primitives and nullish values as-is', () => {
      expect(normalizeRecord(null)).toBeNull();
      expect(normalizeRecord(undefined)).toBeUndefined();
      expect(normalizeRecord(42)).toBe(42);
      expect(normalizeRecord('string')).toBe('string');
    });

    it('stableStringify produces key-sorted deterministic JSON strings', () => {
      const obj1 = { z: 1, a: 2, m: { y: 10, x: 20 } };
      const obj2 = { a: 2, z: 1, m: { x: 20, y: 10 } };

      expect(stableStringify(obj1)).toBe(stableStringify(obj2));
      expect(stableStringify(obj1)).toBe('{"a":2,"m":{"x":20,"y":10},"z":1}');
    });

    it('Pouch metadata (_rev/_id/syncedAt/docType) does not change the hash', () => {
      const plainDoc = { id: 'INV-001', invoiceNumber: 'INV/2026/001', grandTotal: 1500 };
      const docWithMeta = {
        ...plainDoc,
        _id: 'invoice:INV-001',
        _rev: '2-9a8b7c',
        _deleted: false,
        docType: 'invoice',
        syncedAt: '2026-11-09T00:00:00.000Z',
      };
      expect(hashRecords([plainDoc])).toBe(hashRecords([docWithMeta]));
    });

    it('key order in objects does not change the hash', () => {
      const doc1 = { id: 'ITM-1', name: 'Widget', price: 100, tax: 18 };
      const doc2 = { tax: 18, price: 100, name: 'Widget', id: 'ITM-1' };
      expect(hashRecords([doc1])).toBe(hashRecords([doc2]));
    });

    it('hashRecords sorts items by id so input array ordering does not alter hash', () => {
      const recA = { id: 'A', name: 'Alpha' };
      const recB = { id: 'B', name: 'Beta', _rev: '1-xyz' };

      const hash1 = hashRecords([recA, recB]);
      const hash2 = hashRecords([recB, recA]);

      expect(hash1).toBe(hash2);
    });
  });

  describe('runDivergenceCheck() execution', () => {
    it('reports zero divergence when both localStorage and PouchDB are empty', async () => {
      const report = await runDivergenceCheck();

      expect(report.checkedAt).toBeDefined();
      expect(report.divergentTypes).toEqual([]);
      expect(report.totalLocal).toBe(0);
      expect(report.totalPouch).toBe(0);
      expect(report.entities).toHaveLength(DIVERGENCE_ENTITIES.length);
      expect(report.entities.every((e) => !e.divergent)).toBe(true);
    });

    it('reports zero divergence when entities have identical business data despite PouchDB metadata', async () => {
      const partyLocal = [{ id: 'P-1', name: 'Acme Traders', gstin: '27AABCU9603R1ZM' }];
      const partyPouch = [
        {
          id: 'P-1',
          name: 'Acme Traders',
          gstin: '27AABCU9603R1ZM',
          _id: 'party:P-1',
          _rev: '3-beef',
          docType: 'party',
          syncedAt: '2026-11-09T07:00:00Z',
        },
      ];

      testStorage.setItem(STORAGE_KEYS.PARTIES, JSON.stringify(partyLocal));
      (pouch.getAllDocs as any).mockImplementation(async (type: string) => {
        if (type === 'party') return partyPouch;
        return [];
      });

      const report = await runDivergenceCheck();
      expect(report.divergentTypes).toEqual([]);
      const partyEnt = report.entities.find((e) => e.type === 'party')!;
      expect(partyEnt.divergent).toBe(false);
      expect(partyEnt.localCount).toBe(1);
      expect(partyEnt.pouchCount).toBe(1);
      expect(partyEnt.localHash).toBe(partyEnt.pouchHash);
      expect(partyEnt.missingInPouch).toBe(0);
      expect(partyEnt.missingLocally).toBe(0);
    });

    it('detects missingInPouch when a record exists only in localStorage cache', async () => {
      const itemsLocal = [
        { id: 'ITM-1', name: 'Item One', stock: 10 },
        { id: 'ITM-2', name: 'Item Two', stock: 20 },
      ];
      const itemsPouch = [{ id: 'ITM-1', name: 'Item One', stock: 10 }];

      testStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(itemsLocal));
      (pouch.getAllDocs as any).mockImplementation(async (type: string) => {
        if (type === 'item') return itemsPouch;
        return [];
      });

      const report = await runDivergenceCheck();
      expect(report.divergentTypes).toContain('item');

      const itemEnt = report.entities.find((e) => e.type === 'item')!;
      expect(itemEnt.divergent).toBe(true);
      expect(itemEnt.localCount).toBe(2);
      expect(itemEnt.pouchCount).toBe(1);
      expect(itemEnt.missingInPouch).toBe(1);
      expect(itemEnt.missingLocally).toBe(0);
    });

    it('detects missingLocally when a record exists only in PouchDB replica', async () => {
      const expensesPouch = [
        { id: 'EXP-100', category: 'Rent', amount: 15000 },
      ];

      (pouch.getAllDocs as any).mockImplementation(async (type: string) => {
        if (type === 'expense') return expensesPouch;
        return [];
      });

      const report = await runDivergenceCheck();
      expect(report.divergentTypes).toContain('expense');

      const expEnt = report.entities.find((e) => e.type === 'expense')!;
      expect(expEnt.divergent).toBe(true);
      expect(expEnt.localCount).toBe(0);
      expect(expEnt.pouchCount).toBe(1);
      expect(expEnt.missingInPouch).toBe(0);
      expect(expEnt.missingLocally).toBe(1);
    });

    it('detects content hash divergence when counts and IDs match but attributes differ', async () => {
      const invLocal = [{ id: 'INV-1', invoiceNumber: 'INV/01', grandTotal: 500 }];
      const invPouch = [{ id: 'INV-1', invoiceNumber: 'INV/01', grandTotal: 600 }]; // modified amount

      testStorage.setItem(STORAGE_KEYS.INVOICES, JSON.stringify(invLocal));
      (pouch.getAllDocs as any).mockImplementation(async (type: string) => {
        if (type === 'invoice') return invPouch;
        return [];
      });

      const report = await runDivergenceCheck();
      expect(report.divergentTypes).toContain('invoice');

      const invEnt = report.entities.find((e) => e.type === 'invoice')!;
      expect(invEnt.divergent).toBe(true);
      expect(invEnt.localCount).toBe(1);
      expect(invEnt.pouchCount).toBe(1);
      expect(invEnt.missingInPouch).toBe(0);
      expect(invEnt.missingLocally).toBe(0);
      expect(invEnt.localHash).not.toBe(invEnt.pouchHash);
    });

    it('isolates errors gracefully per entity without aborting the entire report', async () => {
      // Simulate PouchDB throwing for vouchers
      (pouch.getAllDocs as any).mockImplementation(async (type: string) => {
        if (type === 'voucher') {
          throw new Error('PouchDB read error on vouchers');
        }
        return [];
      });

      const report = await runDivergenceCheck();
      expect(report.divergentTypes).toContain('voucher');
      const voucherEnt = report.entities.find((e) => e.type === 'voucher')!;
      expect(voucherEnt.divergent).toBe(true);
      // Other entities should have succeeded
      const invoiceEnt = report.entities.find((e) => e.type === 'invoice')!;
      expect(invoiceEnt.divergent).toBe(false);
    });

    it('runDivergenceCheck is strictly read-only: spy on localStorage.setItem, pouch.putDoc, pouch.deleteDoc and assert none were called', async () => {
      const setItemSpy = vi.spyOn(testStorage, 'setItem');
      const removeItemSpy = vi.spyOn(testStorage, 'removeItem');
      const clearSpy = vi.spyOn(testStorage, 'clear');

      await runDivergenceCheck();

      expect(setItemSpy).not.toHaveBeenCalled();
      expect(removeItemSpy).not.toHaveBeenCalled();
      expect(clearSpy).not.toHaveBeenCalled();
      expect(pouch.putDoc).not.toHaveBeenCalled();
      expect(pouch.deleteDoc).not.toHaveBeenCalled();
    });
  });

  describe('Report subscription and caching', () => {
    it('notifies subscribers and updates getLastDivergenceReport()', async () => {
      expect(getLastDivergenceReport()).toBeNull();

      const subscriber = vi.fn();
      const unsubscribe = subscribeDivergenceReport(subscriber);

      const report = await runDivergenceCheck();
      expect(getLastDivergenceReport()).toBe(report);
      expect(subscriber).toHaveBeenCalledWith(report);

      unsubscribe();
      await runDivergenceCheck();
      expect(subscriber).toHaveBeenCalledTimes(1);
    });
  });

  describe('scheduleStartupDivergenceCheck()', () => {
    it('skips check when pouch is in demo mode', async () => {
      (pouch.isDemoMode as any).mockReturnValue(true);
      const runSpy = vi.fn();

      scheduleStartupDivergenceCheck();
      // Should not trigger runDivergenceCheck
      expect(getLastDivergenceReport()).toBeNull();
    });

    it('executes at most once per session', async () => {
      vi.useFakeTimers();

      scheduleStartupDivergenceCheck();
      scheduleStartupDivergenceCheck(); // second call should be ignored

      await vi.advanceTimersByTimeAsync(5000);

      expect(getLastDivergenceReport()).not.toBeNull();
      vi.useRealTimers();
    });

    it('logs console.warn only when divergentTypes is non-empty', async () => {
      vi.useFakeTimers();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Add a divergent local item
      testStorage.setItem(
        STORAGE_KEYS.ITEMS,
        JSON.stringify([{ id: 'DIV-1', name: 'Unsynced' }])
      );

      scheduleStartupDivergenceCheck();
      await vi.advanceTimersByTimeAsync(5000);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DivergenceReport] LocalStorage vs PouchDB divergence detected at startup:'),
        ['item']
      );

      vi.useRealTimers();
    });
  });
});
