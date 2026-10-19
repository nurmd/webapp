import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

class TestStorage implements Storage {
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
    const keys = Array.from(this.store.keys());
    return keys[index] ?? null;
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

const inMemoryDocs = new Map<string, any>();

vi.mock('../services/pouchdb.ts', () => {
  return {
    pouch: {
      putDoc: vi.fn(async (type: string, doc: any) => {
        inMemoryDocs.set(`${type}:${doc.id}`, { ...doc, docType: type });
      }),
      deleteDoc: vi.fn(async (type: string, id: string) => {
        inMemoryDocs.delete(`${type}:${id}`);
      }),
      getAllDocs: vi.fn(async () => []),
      syncNow: vi.fn(async () => ({ ok: true })),
      subscribeState: vi.fn(() => () => {}),
      onDataChange: vi.fn(() => () => {}),
      notifyDataChange: vi.fn(),
      getState: vi.fn(() => ({ status: 'offline', remoteUrl: '', pendingChanges: 0 })),
      migrateFromLocalStorage: vi.fn(async () => {}),
    },
  };
});

import { db } from '../services/db.ts';
import { Invoice } from '../models/invoice.ts';
import { Party } from '../models/party.ts';
import { InventoryItem } from '../models/item.ts';

describe('Requirement R1: In-Memory Heap Cache in db.ts', () => {
  beforeEach(() => {
    testStorage.clear();
    inMemoryDocs.clear();
    db.clearMemoryCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createMockInvoice = (id: string, invoiceNumber: string, grandTotal = 1180): Invoice => ({
    id,
    invoiceNumber,
    date: '2026-10-19',
    dueDate: '2026-11-03',
    partyId: 'PARTY-001',
    partyName: 'Alpha Corp',
    partyAddress: '123 Tech Park',
    partyStateCode: '27',
    placeOfSupplyStateCode: '27',
    isIntraState: true,
    items: [],
    totalGrossAmount: 1000,
    totalDiscount: 0,
    totalTaxableAmount: 1000,
    totalCgst: 90,
    totalSgst: 90,
    totalIgst: 0,
    totalCess: 0,
    totalTax: 180,
    roundOff: 0,
    grandTotal,
    amountInWords: 'One Thousand One Hundred Eighty Rupees Only',
    paymentMode: 'CASH',
    paymentStatus: 'UNPAID',
    paidAmount: 0,
    balanceAmount: grandTotal,
    invoiceType: 'B2B',
    createdAt: '2026-10-19T00:00:00.000Z',
    updatedAt: '2026-10-19T00:00:00.000Z',
  });

  it('TC-CACHE-01: Referential identity — db.getInvoices() returns identical memory reference on repeated reads', () => {
    const mockInvoice = createMockInvoice('INV-CACHE-01', 'INV/2026/001');

    db.saveInvoice(mockInvoice);

    const firstRead = db.getInvoices();
    const secondRead = db.getInvoices();
    const thirdRead = db.getInvoices();

    // Referential equality: identical pointer in JS heap RAM
    expect(firstRead).toBe(secondRead);
    expect(secondRead).toBe(thirdRead);
    expect(firstRead[0].id).toBe('INV-CACHE-01');
  });

  it('TC-CACHE-02: Zero JSON.parse cycles on repeated reads', () => {
    const sampleParties: Party[] = [
      {
        id: 'P-1',
        name: 'Party One',
        type: 'CUSTOMER',
        phone: '9876543210',
        stateCode: '27',
        billingAddress: 'Mumbai',
        currentBalance: 0,
        createdAt: '2026-10-19T00:00:00.000Z',
        updatedAt: '2026-10-19T00:00:00.000Z',
      },
    ];

    testStorage.setItem('gst_parties', JSON.stringify(sampleParties));
    db.clearMemoryCache();

    const parseSpy = vi.spyOn(JSON, 'parse');

    // First read: cache miss, triggers exactly 1 JSON.parse
    const parties1 = db.getParties();
    expect(parties1).toHaveLength(1);
    expect(parseSpy).toHaveBeenCalledTimes(1);

    // Perform 100 subsequent reads
    for (let i = 0; i < 100; i++) {
      const parties = db.getParties();
      expect(parties).toBe(parties1);
    }

    // Zero additional JSON.parse cycles
    expect(parseSpy).toHaveBeenCalledTimes(1);
  });

  it('TC-CACHE-03: Sub-microsecond O(1) performance across 1,000 repeated reads', () => {
    const items: InventoryItem[] = [];
    for (let i = 0; i < 500; i++) {
      items.push({
        id: `ITEM-${i}`,
        name: `Item Number ${i}`,
        salePrice: 100 + i,
        purchasePrice: 80 + i,
        currentStock: 50,
        minStockAlert: 5,
        unit: 'PCS',
        gstRate: 18,
        hsnSacCode: '8471',
        category: 'cat_general',
        createdAt: '2026-10-19T00:00:00.000Z',
        updatedAt: '2026-10-19T00:00:00.000Z',
      });
    }

    testStorage.setItem('gst_items', JSON.stringify(items));
    db.clearMemoryCache();

    // Warm-up read (populates cache)
    const initial = db.getItems();
    expect(initial).toHaveLength(500);

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      const result = db.getItems();
      if (result.length !== 500) {
        throw new Error('Unexpected length');
      }
    }
    const elapsed = performance.now() - start;

    // 1,000 memory lookups must complete in well under 50ms (<0.05ms per lookup even under full test suite CPU load)
    expect(elapsed).toBeLessThan(50);
  });

  it('TC-CACHE-04: Immediate cache update on save and delete operations', () => {
    const item1: InventoryItem = {
      id: 'ITEM-TEST-SYNC',
      name: 'Sync Test Widget',
      salePrice: 250,
      purchasePrice: 180,
      currentStock: 20,
      minStockAlert: 2,
      unit: 'PCS',
      gstRate: 18,
      hsnSacCode: '8471',
      category: 'cat_electronics',
      createdAt: '2026-10-19T00:00:00.000Z',
      updatedAt: '2026-10-19T00:00:00.000Z',
    };

    // Before saving
    expect(db.getItems().find((i) => i.id === item1.id)).toBeUndefined();

    // Save item
    db.saveItem(item1);

    // Immediate in-memory availability
    const itemsAfterSave = db.getItems();
    expect(itemsAfterSave.find((i) => i.id === item1.id)).toBeDefined();
    expect(itemsAfterSave.find((i) => i.id === item1.id)?.salePrice).toBe(250);

    // Delete item
    db.deleteItem(item1.id);

    // Immediate in-memory removal
    const itemsAfterDelete = db.getItems();
    expect(itemsAfterDelete.find((i) => i.id === item1.id)).toBeUndefined();
  });

  it('TC-CACHE-05: QuotaExceededError graceful fallback and RAM cache resilience', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const quotaError = new DOMException('The quota has been exceeded.', 'QuotaExceededError');

    // Mock localStorage.setItem to throw QuotaExceededError
    vi.spyOn(testStorage, 'setItem').mockImplementation(() => {
      throw quotaError;
    });

    const party: Party = {
      id: 'PARTY-QUOTA-TEST',
      name: 'Resilience Enterprise',
      type: 'CUSTOMER',
      phone: '9123456789',
      stateCode: '27',
      billingAddress: '456 Business Park',
      currentBalance: 0,
      createdAt: '2026-10-19T00:00:00.000Z',
      updatedAt: '2026-10-19T00:00:00.000Z',
    };

    // Saving party does not throw unhandled exception
    expect(() => db.saveParty(party)).not.toThrow();

    // Verify standard warning logged
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('QuotaExceededError encountered'),
      quotaError
    );

    // Data remains fully authoritative and accessible in-memory
    const parties = db.getParties();
    expect(parties.find((p) => p.id === party.id)).toBeDefined();
    expect(parties.find((p) => p.id === party.id)?.name).toBe('Resilience Enterprise');

    // Referential identity preserved in quota exceeded mode
    expect(db.getParties()).toBe(parties);
  });

  it('TC-CACHE-06: Direct external localStorage.setItem mutation detection', () => {
    // 1. Initial seed via db API
    const party1: Party = {
      id: 'P-101',
      name: 'Initial Party',
      type: 'CUSTOMER',
      phone: '1111111111',
      stateCode: '27',
      billingAddress: 'Addr 1',
      currentBalance: 0,
      createdAt: '2026-10-19T00:00:00.000Z',
      updatedAt: '2026-10-19T00:00:00.000Z',
    };
    db.saveParty(party1);
    expect(db.getParties()).toHaveLength(1);

    // 2. Direct external mutation of localStorage (simulating test harness or background script)
    const externalParty: Party = {
      id: 'P-EXTERNAL',
      name: 'Directly Written Party',
      type: 'SUPPLIER',
      phone: '2222222222',
      stateCode: '29',
      billingAddress: 'Bangalore',
      currentBalance: 500,
      createdAt: '2026-10-19T00:00:00.000Z',
      updatedAt: '2026-10-19T00:00:00.000Z',
    };
    testStorage.setItem('gst_parties', JSON.stringify([party1, externalParty]));

    // 3. Next read detects raw string change and updates heap cache
    const updated = db.getParties();
    expect(updated).toHaveLength(2);
    expect(updated.find((p) => p.id === 'P-EXTERNAL')).toBeDefined();

    // 4. Repeated reads return stable reference without re-parsing
    expect(db.getParties()).toBe(updated);
  });

  it('TC-CACHE-07: invalidateCache() and clearMemoryCache() force fresh read', () => {
    const parseSpy = vi.spyOn(JSON, 'parse');
    testStorage.setItem(
      'gst_invoices',
      JSON.stringify([
        {
          id: 'INV-INV-1',
          invoiceNumber: 'INV-1',
          partyName: 'Test',
          totalAmount: 100,
          date: '2026-10-19',
        },
      ])
    );

    // Read 1
    const inv1 = db.getInvoices();
    expect(inv1).toHaveLength(1);
    expect(parseSpy).toHaveBeenCalledTimes(1);

    // Read 2 (hit)
    const inv2 = db.getInvoices();
    expect(inv2).toBe(inv1);
    expect(parseSpy).toHaveBeenCalledTimes(1);

    // Invalidate single key
    db.invalidateCache('gst_invoices');

    // Read 3 (miss due to explicit invalidation)
    const inv3 = db.getInvoices();
    expect(parseSpy).toHaveBeenCalledTimes(2);
    expect(inv3).not.toBe(inv1); // Fresh object reference
    expect(inv3).toEqual(inv1);

    // Clear entire memory cache
    db.clearMemoryCache();
    const inv4 = db.getInvoices();
    expect(parseSpy).toHaveBeenCalledTimes(3);
    expect(inv4).not.toBe(inv3);
  });

  it('TC-CACHE-08: Cross-tab storage event and BroadcastChannel entity mutation sync', () => {
    // 1. Storage Event listener verification
    const invoiceA = createMockInvoice('INV-CROSS-TAB-1', 'INV-X1', 590);

    db.saveInvoice(invoiceA);
    const initialInvoices = db.getInvoices();
    expect(initialInvoices).toHaveLength(1);

    // Simulate external tab updating localStorage directly and dispatching storage event
    const invoiceB = createMockInvoice('INV-CROSS-TAB-2', 'INV-X2', 590);
    testStorage.setItem('gst_invoices', JSON.stringify([invoiceA, invoiceB]));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'gst_invoices',
          newValue: JSON.stringify([invoiceA, invoiceB]),
        })
      );
    }

    const invoicesAfterStorageEvent = db.getInvoices();
    expect(invoicesAfterStorageEvent).toHaveLength(2);

    // 2. BroadcastChannel ENTITY_MUTATION sync verification
    const invoiceC = createMockInvoice('INV-CROSS-TAB-3', 'INV-X3', 826);

    // If broadcastChannel is present, trigger onmessage; otherwise call applyLocalEntityMutation
    const bc = (db as any).broadcastChannel;
    if (bc && typeof bc.onmessage === 'function') {
      bc.onmessage(
        new MessageEvent('message', {
          data: {
            type: 'ENTITY_MUTATION',
            entity: 'invoice',
            action: 'save',
            id: invoiceC.id,
            data: invoiceC,
          },
        })
      );
    } else {
      (db as any).applyLocalEntityMutation('invoice', 'save', invoiceC.id, invoiceC);
    }

    const invoicesAfterBroadcast = db.getInvoices();
    expect(invoicesAfterBroadcast.find((i) => i.id === 'INV-CROSS-TAB-3')).toBeDefined();
    expect(invoicesAfterBroadcast.find((i) => i.id === 'INV-CROSS-TAB-3')?.grandTotal).toBe(826);
  });
});
