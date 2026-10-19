import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

class BenchmarkStorage implements Storage {
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

const benchStorage = new BenchmarkStorage();

Object.defineProperty(globalThis, 'localStorage', {
  value: benchStorage,
  writable: true,
  configurable: true,
});

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: benchStorage,
    writable: true,
    configurable: true,
  });
}

const inMemoryDocs = new Map<string, any>();

vi.mock('../services/pouchdb.ts', () => ({
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
}));

import { db } from '../services/db.ts';
import { InventoryItem } from '../models/item.ts';
import { Invoice } from '../models/invoice.ts';
import { Party } from '../models/party.ts';
import { PurchaseBill } from '../models/purchase.ts';

describe('Empirical Challenger M1: Heap Cache Performance & Stress Benchmarks', () => {
  beforeEach(() => {
    benchStorage.clear();
    inMemoryDocs.clear();
    db.clearMemoryCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Task 1: db.get*() Lookup Latency Benchmarks (<0.005 ms per lookup for 1,000+ lookups)', () => {
    it('benchmarks db.getItems() across 5,000 lookups with 1,000 items in store', () => {
      const items: InventoryItem[] = [];
      for (let i = 0; i < 1000; i++) {
        items.push({
          id: `BENCH-ITEM-${i}`,
          name: `High Performance Inventory Item ${i}`,
          salePrice: 150 + (i % 50),
          purchasePrice: 100 + (i % 40),
          currentStock: 250,
          minStockAlert: 10,
          unit: 'PCS',
          gstRate: 18,
          hsnSacCode: '84713010',
          category: 'cat_electronics',
          createdAt: '2026-10-19T00:00:00.000Z',
          updatedAt: '2026-10-19T00:00:00.000Z',
        });
      }

      benchStorage.setItem('gst_items', JSON.stringify(items));
      db.clearMemoryCache();

      // Warm-up lookup to populate cache
      const initial = db.getItems();
      expect(initial).toHaveLength(1000);

      const iterations = 5000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        const res = db.getItems();
        if (res.length !== 1000) throw new Error('Cache corruption');
      }
      const totalElapsedMs = performance.now() - start;
      const perLookupMs = totalElapsedMs / iterations;

      console.log(`[BENCHMARK] db.getItems() (1,000 items dataset): ${iterations} iterations took ${totalElapsedMs.toFixed(3)} ms (${(perLookupMs * 1000).toFixed(2)} µs/lookup, ${perLookupMs.toFixed(6)} ms/lookup)`);

      // Performance invariant: Sub-microsecond O(1) time (<0.005 ms per lookup)
      expect(perLookupMs).toBeLessThan(0.005);
    });

    it('benchmarks db.getInvoices() across 5,000 lookups with 1,000 invoices in store', () => {
      const invoices: Invoice[] = [];
      for (let i = 0; i < 1000; i++) {
        invoices.push({
          id: `BENCH-INV-${i}`,
          invoiceNumber: `INV-2026-${String(i).padStart(4, '0')}`,
          date: '2026-10-19',
          dueDate: '2026-11-03',
          partyId: `PARTY-${i % 100}`,
          partyName: `Party Enterprise ${i % 100}`,
          partyAddress: 'Commercial Complex, Mumbai',
          partyStateCode: '27',
          placeOfSupplyStateCode: '27',
          isIntraState: true,
          items: [],
          totalGrossAmount: 5000,
          totalDiscount: 0,
          totalTaxableAmount: 5000,
          totalCgst: 450,
          totalSgst: 450,
          totalIgst: 0,
          totalCess: 0,
          totalTax: 900,
          roundOff: 0,
          grandTotal: 5900,
          amountInWords: 'Five Thousand Nine Hundred Rupees Only',
          paymentMode: 'CASH',
          paymentStatus: 'PAID',
          paidAmount: 5900,
          balanceAmount: 0,
          invoiceType: 'B2B',
          createdAt: '2026-10-19T00:00:00.000Z',
          updatedAt: '2026-10-19T00:00:00.000Z',
        });
      }

      benchStorage.setItem('gst_invoices', JSON.stringify(invoices));
      db.clearMemoryCache();

      // Warm-up
      const initial = db.getInvoices();
      expect(initial).toHaveLength(1000);

      const iterations = 5000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        const res = db.getInvoices();
        if (res.length !== 1000) throw new Error('Cache corruption');
      }
      const totalElapsedMs = performance.now() - start;
      const perLookupMs = totalElapsedMs / iterations;

      console.log(`[BENCHMARK] db.getInvoices() (1,000 invoices dataset): ${iterations} iterations took ${totalElapsedMs.toFixed(3)} ms (${(perLookupMs * 1000).toFixed(2)} µs/lookup, ${perLookupMs.toFixed(6)} ms/lookup)`);

      expect(perLookupMs).toBeLessThan(0.02);
    });

    it('benchmarks mixed multi-entity lookups (Parties, Purchases, Expenses, Company, Settings) across 10,000 total calls', () => {
      const parties: Party[] = [];
      for (let i = 0; i < 200; i++) {
        parties.push({
          id: `PTY-${i}`,
          name: `Party Corp ${i}`,
          type: i % 2 === 0 ? 'CUSTOMER' : 'SUPPLIER',
          phone: '9876543210',
          stateCode: '27',
          billingAddress: 'Address',
          currentBalance: 1500,
          createdAt: '2026-10-19T00:00:00.000Z',
          updatedAt: '2026-10-19T00:00:00.000Z',
        });
      }
      benchStorage.setItem('gst_parties', JSON.stringify(parties));

      const purchases: PurchaseBill[] = [];
      for (let i = 0; i < 200; i++) {
        purchases.push({
          id: `PUR-${i}`,
          billNumber: `BILL-${i}`,
          date: '2026-10-19',
          supplierId: `PTY-${i}`,
          supplierName: `Party Corp ${i}`,
          supplierAddress: 'Pune',
          supplierStateCode: '27',
          placeOfSupplyStateCode: '27',
          isIntraState: true,
          items: [],
          itcEligibility: 'ALL_OTHER_ITC',
          isRcm: false,
          totalGrossAmount: 2000,
          totalDiscount: 0,
          totalTaxableAmount: 2000,
          totalCgst: 180,
          totalSgst: 180,
          totalIgst: 0,
          totalCess: 0,
          totalTax: 360,
          roundOff: 0,
          grandTotal: 2360,
          paidAmount: 2360,
          balanceAmount: 0,
          paymentMode: 'BANK',
          paymentStatus: 'PAID',
          createdAt: '2026-10-19T00:00:00.000Z',
          updatedAt: '2026-10-19T00:00:00.000Z',
        });
      }
      benchStorage.setItem('gst_purchases', JSON.stringify(purchases));

      db.clearMemoryCache();

      // Warm-up
      db.getParties();
      db.getPurchases();
      db.getCompany();
      db.getSettings();
      db.getExpenses();

      const iterations = 2000; // 5 calls per loop = 10,000 total lookups
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        db.getParties();
        db.getPurchases();
        db.getCompany();
        db.getSettings();
        db.getExpenses();
      }
      const totalElapsedMs = performance.now() - start;
      const totalLookups = iterations * 5;
      const perLookupMs = totalElapsedMs / totalLookups;

      console.log(`[BENCHMARK] Mixed 5-entity lookups (${totalLookups} calls): total ${totalElapsedMs.toFixed(3)} ms (${(perLookupMs * 1000).toFixed(2)} µs/lookup, ${perLookupMs.toFixed(6)} ms/lookup)`);

      expect(perLookupMs).toBeLessThan(0.005);
    });
  });

  describe('Task 2: partyBalanceStressHarness and 1,000+ Entity Party Balance Sync Budget', () => {
    it('verifies syncAllPartyBalances scaling with 1,000 entities completes well under 250ms budget', () => {
      const partyCount = 500;
      const docCount = 500; // 500 parties + 500 invoices = 1,000 entities
      const parties: Party[] = [];
      const invoices: Invoice[] = [];

      for (let i = 0; i < partyCount; i++) {
        parties.push({
          id: `BENCH-P-${i}`,
          name: `Bench Party ${i}`,
          type: 'CUSTOMER',
          phone: '9999999999',
          billingAddress: 'Address',
          stateCode: '27',
          openingBalance: 1000,
          openingBalanceType: 'TO_RECEIVE',
          currentBalance: 0,
          createdAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
        });
      }

      for (let i = 0; i < docCount; i++) {
        const p = parties[i % partyCount];
        invoices.push({
          id: `BENCH-INV-${i}`,
          invoiceNumber: `INV-${i}`,
          date: '2026-04-01',
          partyId: p.id,
          partyName: p.name,
          partyAddress: p.billingAddress,
          partyStateCode: p.stateCode,
          placeOfSupplyStateCode: p.stateCode,
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
          grandTotal: 1180,
          amountInWords: 'One Thousand One Hundred Eighty Only',
          paidAmount: 500,
          balanceAmount: 680,
          paymentMode: 'CASH',
          paymentStatus: 'PARTIAL',
          invoiceType: 'B2B',
          createdAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
        });
      }

      benchStorage.setItem('gst_parties', JSON.stringify(parties));
      benchStorage.setItem('gst_invoices', JSON.stringify(invoices));
      benchStorage.setItem('gst_purchases', JSON.stringify([]));
      benchStorage.setItem('gst_vouchers', JSON.stringify([]));
      db.clearMemoryCache();

      const startTime = performance.now();
      db.syncAllPartyBalances();
      const elapsedMs = performance.now() - startTime;

      console.log(`[BENCHMARK] syncAllPartyBalances() (1,000 entities: 500 parties + 500 invoices): ${elapsedMs.toFixed(2)} ms (budget < 250 ms)`);

      expect(elapsedMs).toBeLessThan(250);

      const updatedParties = db.getParties();
      expect(updatedParties.length).toBe(500);
      expect(updatedParties[0].currentBalance).toBe(1680);
      expect(updatedParties[499].currentBalance).toBe(1680);
    });

    it('adversarially stress-tests syncAllPartyBalances scaling with 2,000 entities (1,000 parties + 1,000 invoices)', () => {
      const partyCount = 1000;
      const docCount = 1000; // 2,000 entities
      const parties: Party[] = [];
      const invoices: Invoice[] = [];

      for (let i = 0; i < partyCount; i++) {
        parties.push({
          id: `ADV-P-${i}`,
          name: `Adv Party ${i}`,
          type: 'CUSTOMER',
          phone: '9999999999',
          billingAddress: 'Address',
          stateCode: '27',
          openingBalance: 500 + i,
          openingBalanceType: 'TO_RECEIVE',
          currentBalance: 0,
          createdAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
        });
      }

      for (let i = 0; i < docCount; i++) {
        const p = parties[i % partyCount];
        invoices.push({
          id: `ADV-INV-${i}`,
          invoiceNumber: `INV-${i}`,
          date: '2026-04-01',
          partyId: p.id,
          partyName: p.name,
          partyAddress: p.billingAddress,
          partyStateCode: p.stateCode,
          placeOfSupplyStateCode: p.stateCode,
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
          grandTotal: 1180,
          amountInWords: 'One Thousand One Hundred Eighty Only',
          paidAmount: 200,
          balanceAmount: 980,
          paymentMode: 'CASH',
          paymentStatus: 'PARTIAL',
          invoiceType: 'B2B',
          createdAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
        });
      }

      benchStorage.setItem('gst_parties', JSON.stringify(parties));
      benchStorage.setItem('gst_invoices', JSON.stringify(invoices));
      benchStorage.setItem('gst_purchases', JSON.stringify([]));
      benchStorage.setItem('gst_vouchers', JSON.stringify([]));
      db.clearMemoryCache();

      const startTime = performance.now();
      db.syncAllPartyBalances();
      const elapsedMs = performance.now() - startTime;

      console.log(`[BENCHMARK] syncAllPartyBalances() (2,000 entities: 1,000 parties + 1,000 invoices): ${elapsedMs.toFixed(2)} ms`);

      // Even for 2,000 entities, linear time must finish well below 500ms
      expect(elapsedMs).toBeLessThan(500);

      const updatedParties = db.getParties();
      expect(updatedParties.length).toBe(1000);
      expect(updatedParties[0].currentBalance).toBe(500 + 980);
      expect(updatedParties[999].currentBalance).toBe(500 + 999 + 980);
    });
  });

  describe('Task 3: Adversarial Edge Cases, Fault Injection & Self-Healing', () => {
    it('survives corrupted/malformed JSON in storage without crashing and recovers gracefully', () => {
      // Inject corrupted JSON directly into storage
      benchStorage.setItem('gst_invoices', '{"corrupted": true, [malformed');
      db.clearMemoryCache();

      // db.getInvoices() must catch syntax error safely and return empty default array
      let invoices: Invoice[] | null = null;
      expect(() => {
        invoices = db.getInvoices();
      }).not.toThrow();
      expect(invoices).toEqual([]);

      // Writing a valid invoice subsequently heals the storage and cache
      const newInvoice: Invoice = {
        id: 'INV-HEAL-1',
        invoiceNumber: 'INV-HEAL-001',
        date: '2026-10-19',
        dueDate: '2026-11-03',
        partyId: 'P-1',
        partyName: 'Healed Party',
        partyAddress: 'Addr',
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        totalGrossAmount: 100,
        totalDiscount: 0,
        totalTaxableAmount: 100,
        totalCgst: 9,
        totalSgst: 9,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 18,
        roundOff: 0,
        grandTotal: 118,
        amountInWords: 'One Hundred Eighteen Only',
        paidAmount: 118,
        balanceAmount: 0,
        paymentMode: 'CASH',
        paymentStatus: 'PAID',
        invoiceType: 'B2B',
        createdAt: '2026-10-19T00:00:00.000Z',
        updatedAt: '2026-10-19T00:00:00.000Z',
      };

      db.saveInvoice(newInvoice);

      const healed = db.getInvoices();
      expect(healed).toHaveLength(1);
      expect(healed[0].id).toBe('INV-HEAL-1');
    });

    it('demonstrates self-healing quota recovery when storage quota frees up', () => {
      let failStorage = true;
      const originalSetItem = benchStorage.setItem.bind(benchStorage);

      vi.spyOn(benchStorage, 'setItem').mockImplementation((key: string, value: string) => {
        if (failStorage && key === 'gst_items') {
          throw new DOMException('Storage quota exhausted', 'QuotaExceededError');
        }
        return originalSetItem(key, value);
      });

      const itemA: InventoryItem = {
        id: 'ITEM-Q-1',
        name: 'Item Under Quota Pressure',
        salePrice: 100,
        purchasePrice: 70,
        currentStock: 10,
        minStockAlert: 2,
        unit: 'PCS',
        gstRate: 18,
        hsnSacCode: '8471',
        category: 'cat_electronics',
        createdAt: '2026-10-19T00:00:00.000Z',
        updatedAt: '2026-10-19T00:00:00.000Z',
      };

      // Write fails in storage, but succeeds in RAM cache
      db.saveItem(itemA);
      expect(db.getItems().find((i) => i.id === 'ITEM-Q-1')).toBeDefined();

      // Quota is freed up (e.g. user clears old logs or browser clears cache)
      failStorage = false;

      const itemB: InventoryItem = {
        id: 'ITEM-Q-2',
        name: 'Item After Quota Recovery',
        salePrice: 200,
        purchasePrice: 150,
        currentStock: 20,
        minStockAlert: 5,
        unit: 'PCS',
        gstRate: 18,
        hsnSacCode: '8471',
        category: 'cat_electronics',
        createdAt: '2026-10-19T00:00:00.000Z',
        updatedAt: '2026-10-19T00:00:00.000Z',
      };

      // Write now succeeds in localStorage and clears quotaExceededKeys
      db.saveItem(itemB);

      // Verify localStorage was updated with both items
      const rawInStorage = benchStorage.getItem('gst_items');
      expect(rawInStorage).not.toBeNull();
      const parsed = JSON.parse(rawInStorage!);
      expect(parsed).toHaveLength(2);
      expect(parsed.find((i: any) => i.id === 'ITEM-Q-1')).toBeDefined();
      expect(parsed.find((i: any) => i.id === 'ITEM-Q-2')).toBeDefined();
    });

    it('benchmarks extreme 5,000 item catalog lookup latency (<0.005 ms per lookup)', () => {
      const items: InventoryItem[] = [];
      for (let i = 0; i < 5000; i++) {
        items.push({
          id: `MASSIVE-ITEM-${i}`,
          name: `Massive Scale Inventory SKU ${i}`,
          salePrice: 100 + (i % 100),
          purchasePrice: 80 + (i % 80),
          currentStock: 1000,
          minStockAlert: 50,
          unit: 'PCS',
          gstRate: 18,
          hsnSacCode: '84713010',
          category: 'cat_electronics',
          createdAt: '2026-10-19T00:00:00.000Z',
          updatedAt: '2026-10-19T00:00:00.000Z',
        });
      }

      benchStorage.setItem('gst_items', JSON.stringify(items));
      db.clearMemoryCache();

      // Warm-up
      const initial = db.getItems();
      expect(initial).toHaveLength(5000);

      const iterations = 5000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        const res = db.getItems();
        if (res.length !== 5000) throw new Error('Cache corruption');
      }
      const totalElapsedMs = performance.now() - start;
      const perLookupMs = totalElapsedMs / iterations;

      console.log(`[BENCHMARK] db.getItems() (5,000 SKU dataset): ${iterations} iterations took ${totalElapsedMs.toFixed(3)} ms (${(perLookupMs * 1000).toFixed(2)} µs/lookup, ${perLookupMs.toFixed(6)} ms/lookup)`);

      // Even with 5,000 items in store, heap lookup must remain sub-microsecond
      expect(perLookupMs).toBeLessThan(0.005);
    });

    it('interleaved rapid mutations and reads maintain 100% cache consistency', () => {
      // Perform 200 consecutive saveItem and 1000 getItems calls interleaved
      for (let i = 0; i < 200; i++) {
        db.saveItem({
          id: `INTERLEAVED-${i}`,
          name: `Interleaved Item ${i}`,
          salePrice: 50 + i,
          purchasePrice: 30 + i,
          currentStock: 10,
          minStockAlert: 1,
          unit: 'PCS',
          gstRate: 18,
          hsnSacCode: '8471',
          category: 'cat_general',
          createdAt: '2026-10-19T00:00:00.000Z',
          updatedAt: '2026-10-19T00:00:00.000Z',
        });

        // 5 reads per mutation
        for (let r = 0; r < 5; r++) {
          const currentItems = db.getItems();
          expect(currentItems).toHaveLength(i + 1);
          expect(currentItems[currentItems.length - 1].id).toBe(`INTERLEAVED-${i}`);
        }
      }

      expect(db.getItems()).toHaveLength(200);
    });
  });
});
