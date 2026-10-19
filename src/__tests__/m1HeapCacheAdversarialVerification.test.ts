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

import { db, DEFAULT_INVOICES } from '../services/db.ts';
import { Invoice } from '../models/invoice.ts';
import { Party } from '../models/party.ts';
import { InventoryItem } from '../models/item.ts';

describe('Empirical Verification: In-Memory Heap Cache (M1 / R1)', () => {
  beforeEach(() => {
    testStorage.clear();
    inMemoryDocs.clear();
    DEFAULT_INVOICES.length = 0;
    db.clearMemoryCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockInvoice = (id: string, num: string): Invoice => ({
    id,
    invoiceNumber: num,
    date: '2026-10-19',
    dueDate: '2026-11-03',
    partyId: 'PTY-1',
    partyName: 'Test Party',
    partyAddress: '123 Test St',
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
    grandTotal: 1180,
    amountInWords: 'One Thousand One Hundred Eighty Rupees',
    paymentMode: 'CASH',
    paymentStatus: 'PAID',
    paidAmount: 1180,
    balanceAmount: 0,
    invoiceType: 'B2B',
    createdAt: '2026-10-19T00:00:00.000Z',
    updatedAt: '2026-10-19T00:00:00.000Z',
  });

  const mockItem = (id: string, name: string): InventoryItem => ({
    id,
    name,
    salePrice: 100,
    purchasePrice: 70,
    currentStock: 10,
    minStockAlert: 2,
    unit: 'PCS',
    gstRate: 18,
    hsnSacCode: '8471',
    category: 'cat_general',
    createdAt: '2026-10-19T00:00:00.000Z',
    updatedAt: '2026-10-19T00:00:00.000Z',
  });

  const mockParty = (id: string, name: string): Party => ({
    id,
    name,
    type: 'CUSTOMER',
    phone: '9988776655',
    stateCode: '27',
    billingAddress: 'Pune',
    currentBalance: 0,
    createdAt: '2026-10-19T00:00:00.000Z',
    updatedAt: '2026-10-19T00:00:00.000Z',
  });

  // =========================================================================
  // TASK 1: Comprehensive Entity Zero JSON.parse Verification
  // =========================================================================
  describe('Task 1: Zero JSON.parse Cycles Across All Entities', () => {
    beforeEach(() => {
      // Seed storage with valid JSON for all entity collections
      testStorage.setItem('gst_invoices', JSON.stringify([mockInvoice('INV-1', 'INV-001')]));
      testStorage.setItem('gst_items', JSON.stringify([mockItem('ITM-1', 'Item One')]));
      testStorage.setItem('gst_parties', JSON.stringify([mockParty('PTY-1', 'Party One')]));
      testStorage.setItem('gst_company_profile', JSON.stringify({ businessName: 'Test Corp', gstin: '27ABCDE1234F1Z5' }));
      testStorage.setItem('gst_app_settings', JSON.stringify({ id: 'app_settings', defaultGstRate: 18 }));
      testStorage.setItem('gst_purchases', JSON.stringify([{ id: 'PUR-1', billNumber: 'PB-1', totalAmount: 500 }]));
      testStorage.setItem('gst_expenses', JSON.stringify([{ id: 'EXP-1', category: 'Rent', amount: 2000 }]));
      testStorage.setItem('gst_stock_adjustments', JSON.stringify([{ id: 'ADJ-1', itemId: 'ITM-1', quantity: 5, type: 'STOCK_IN' }]));
      testStorage.setItem('gst_vouchers', JSON.stringify([{ id: 'VOU-1', voucherNumber: 'V-1', voucherType: 'PAYMENT', totalAmount: 100 }]));
      testStorage.setItem('gst_bank_accounts', JSON.stringify([{ id: 'ACC-1', accountName: 'HDFC', openingBalance: 1000 }]));
      testStorage.setItem('gst_cash_bank_transactions', JSON.stringify([{ id: 'TXN-1', accountId: 'ACC-1', amount: 500 }]));
      testStorage.setItem('gst_loans', JSON.stringify([{ id: 'LN-1', lenderName: 'SBI', principalAmount: 50000 }]));
      testStorage.setItem('gst_loan_transactions', JSON.stringify([{ id: 'LTX-1', loanId: 'LN-1', amount: 1000 }]));
      db.clearMemoryCache();
    });

    it('VERIFY-01A: Invoices, Items, Parties, Company, Purchases, Expenses, Adjustments, Vouchers, Bank, Loans have 0 parse on repeated reads', () => {
      const parseSpy = vi.spyOn(JSON, 'parse');

      const inv1 = db.getInvoices();
      const itm1 = db.getItems();
      const pty1 = db.getParties();
      const comp1 = db.getCompany();
      const pur1 = db.getPurchases();
      const exp1 = db.getExpenses();
      const adj1 = db.getStockAdjustments();
      const vou1 = db.getVouchers();
      const bnk1 = db.getBankAccounts();
      const cbt1 = db.getCashBankTransactions();
      const lns1 = db.getLoans();
      const ltx1 = db.getLoanTransactions();

      const parseCountAfterFirstReads = parseSpy.mock.calls.length;

      for (let i = 0; i < 50; i++) {
        expect(db.getInvoices()).toBe(inv1);
        expect(db.getItems()).toBe(itm1);
        expect(db.getParties()).toBe(pty1);
        expect(db.getCompany()).toBe(comp1);
        expect(db.getPurchases()).toBe(pur1);
        expect(db.getExpenses()).toBe(exp1);
        expect(db.getStockAdjustments()).toBe(adj1);
        expect(db.getVouchers()).toBe(vou1);
        expect(db.getBankAccounts()).toBe(bnk1);
        expect(db.getCashBankTransactions()).toBe(cbt1);
        expect(db.getLoans()).toBe(lns1);
        expect(db.getLoanTransactions()).toBe(ltx1);
      }

      // Zero additional parses across all these collections
      expect(parseSpy.mock.calls.length).toBe(parseCountAfterFirstReads);
    });

    it('VERIFY-01B: db.getSettings() and db.getAllowNegativeStock() redundant JSON.parse audit', () => {
      const parseSpy = vi.spyOn(JSON, 'parse');

      // First read: miss, parses
      const set1 = db.getSettings();
      const initialCount = parseSpy.mock.calls.length;

      // 10 repeated reads
      for (let i = 0; i < 10; i++) {
        db.getSettings();
      }

      // BUG REPRODUCTION: Does db.getSettings() trigger redundant JSON.parse on repeated reads?
      const additionalParses = parseSpy.mock.calls.length - initialCount;
      expect(additionalParses).toBe(0);
    });
  });

  // =========================================================================
  // TASK 2: Rapid Mutation Stress & Synchronization
  // =========================================================================
  describe('Task 2: Rapid Mutation & High-Frequency Synchronization', () => {
    it('VERIFY-02: 150 interleaved rapid save/delete operations maintain 100% cache-storage sync and listener notification', async () => {
      let listenerCallCount = 0;
      const unsubscribe = db.subscribe(() => {
        listenerCallCount++;
      });

      // Rapidly interleave mutations across items, invoices, and parties
      for (let i = 1; i <= 50; i++) {
        db.saveItem(mockItem(`ITEM-RAPID-${i}`, `Widget ${i}`));
        db.saveInvoice(mockInvoice(`INV-RAPID-${i}`, `INV-R-${i}`));
        db.saveParty(mockParty(`PTY-RAPID-${i}`, `Customer ${i}`));
      }

      // Verify immediate in-memory availability
      expect(db.getItems()).toHaveLength(50);
      expect(db.getInvoices()).toHaveLength(50);
      expect(db.getParties()).toHaveLength(50);

      // Verify localStorage sync matches memory cache
      const storedItems = JSON.parse(testStorage.getItem('gst_items')!);
      const storedInvoices = JSON.parse(testStorage.getItem('gst_invoices')!);
      const storedParties = JSON.parse(testStorage.getItem('gst_parties')!);

      expect(storedItems).toHaveLength(50);
      expect(storedInvoices).toHaveLength(50);
      expect(storedParties).toHaveLength(50);

      // Delete half of them in rapid succession
      for (let i = 1; i <= 25; i++) {
        db.deleteItem(`ITEM-RAPID-${i}`);
        db.deleteInvoice(`INV-RAPID-${i}`);
        db.deleteParty(`PTY-RAPID-${i}`);
      }

      // Immediate in-memory reflection
      expect(db.getItems()).toHaveLength(25);
      expect(db.getInvoices()).toHaveLength(25);
      expect(db.getParties()).toHaveLength(25);

      // Verify specific items deleted
      expect(db.getItems().find((i) => i.id === 'ITEM-RAPID-1')).toBeUndefined();
      expect(db.getItems().find((i) => i.id === 'ITEM-RAPID-50')).toBeDefined();

      // Wait for debounced listener batch to fire (>16ms)
      await new Promise((resolve) => setTimeout(resolve, 35));
      expect(listenerCallCount).toBeGreaterThan(0);

      unsubscribe();
    });
  });

  // =========================================================================
  // TASK 3: Edge Cases: Empty Storage, Corrupted JSON, Quota, Direct Writes
  // =========================================================================
  describe('Task 3: Adversarial Edge Cases', () => {
    it('VERIFY-03A: Empty storage returns cloned defaults and shields module constants from mutation', () => {
      testStorage.clear();
      db.clearMemoryCache();

      // 1. Initial read on empty storage
      const initialInvoices = db.getInvoices();
      expect(initialInvoices).toEqual([]);

      // 2. Adversarial caller mutates the returned array
      initialInvoices.push(mockInvoice('INV-MUTATION-TEST', 'INV-MUT-01'));
      expect(db.getInvoices()).toHaveLength(1);

      // 3. Verify module-level DEFAULT_INVOICES was NOT polluted
      expect(DEFAULT_INVOICES).toHaveLength(0);

      // 4. Invalidate memory cache and re-read from empty storage
      db.clearMemoryCache();
      const freshInvoices = db.getInvoices();
      expect(freshInvoices).toEqual([]);
      expect(freshInvoices).toHaveLength(0);
    });

    it('VERIFY-03B: Corrupted JSON strings in storage are gracefully handled without unhandled crashes', () => {
      // Inject corrupted JSON strings across storage keys
      testStorage.setItem('gst_invoices', '{"broken_json": true, unterminated');
      testStorage.setItem('gst_items', '<<<Not Even JSON>>>');
      testStorage.setItem('gst_parties', 'undefined');
      testStorage.setItem('gst_company_profile', 'NaN');

      db.clearMemoryCache();

      // Reading should not crash
      expect(() => db.getInvoices()).not.toThrow();
      expect(() => db.getItems()).not.toThrow();
      expect(() => db.getParties()).not.toThrow();
      expect(() => db.getCompany()).not.toThrow();

      expect(Array.isArray(db.getInvoices())).toBe(true);
      expect(Array.isArray(db.getItems())).toBe(true);
      expect(Array.isArray(db.getParties())).toBe(true);
      expect(typeof db.getCompany()).toBe('object');

      // BUG CHECK: Does catch { return defaultValue } return un-cloned DEFAULT_INVOICES reference?
      const corruptedInvoices = db.getInvoices();
      corruptedInvoices.push(mockInvoice('INV-CORRUPT-POLLUTE', 'INV-CP-1'));
      // If DEFAULT_INVOICES was polluted, its length would be 1!
      expect(DEFAULT_INVOICES).toHaveLength(0);

      // Self-healing: saving valid entity overwrites the corrupted storage string
      const newInv = mockInvoice('INV-HEAL-1', 'INV-H1');
      db.saveInvoice(newInv);

      // Storage now contains valid parseable JSON
      const repairedRaw = testStorage.getItem('gst_invoices');
      expect(repairedRaw).not.toBeNull();
      expect(() => JSON.parse(repairedRaw!)).not.toThrow();

      // Next read uses valid cache
      expect(db.getInvoices()).toHaveLength(1);
      expect(db.getInvoices()[0].id).toBe('INV-HEAL-1');
    });

    it('VERIFY-03C: QuotaExceededError multi-key endurance and recovery', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      let throwQuota = true;

      vi.spyOn(testStorage, 'setItem').mockImplementation((key: string, value: string) => {
        if (throwQuota) {
          throw new DOMException('QuotaExceeded', 'QuotaExceededError');
        }
        testStorage['store'].set(key, String(value));
      });

      // Write under quota exhaustion
      db.saveItem(mockItem('ITM-Q1', 'Item Q1'));
      db.saveParty(mockParty('PTY-Q1', 'Party Q1'));
      db.saveInvoice(mockInvoice('INV-Q1', 'INV-Q1'));

      // In-memory cache is fully authoritative
      expect(db.getItems().find((i) => i.id === 'ITM-Q1')).toBeDefined();
      expect(db.getParties().find((p) => p.id === 'PTY-Q1')).toBeDefined();
      expect(db.getInvoices().find((i) => i.id === 'INV-Q1')).toBeDefined();

      // Referential stability preserved
      expect(db.getItems()).toBe(db.getItems());

      // Quota clears (e.g. user freed space or cleanup occurred)
      throwQuota = false;

      // New write succeeds and clears quota flag
      db.saveItem(mockItem('ITM-Q2', 'Item Q2'));
      expect(testStorage.getItem('gst_items')).toContain('ITM-Q2');
    });

    it('VERIFY-03D: External direct modifications and deletions are immediately detected on next read', () => {
      // 1. Initial write through db
      db.saveItem(mockItem('ITM-INIT', 'Initial Item'));
      expect(db.getItems()).toHaveLength(1);

      // 2. External direct setItem bypassing db API
      const externalItems = [mockItem('ITM-EXT-1', 'External 1'), mockItem('ITM-EXT-2', 'External 2')];
      testStorage.setItem('gst_items', JSON.stringify(externalItems));

      // Next read detects change in raw string and re-hydrates
      const updatedItems = db.getItems();
      expect(updatedItems).toHaveLength(2);
      expect(updatedItems.find((i) => i.id === 'ITM-EXT-1')).toBeDefined();

      // 3. External direct removeItem
      testStorage.removeItem('gst_items');
      const resetItems = db.getItems();
      expect(resetItems).toHaveLength(0);
    });

    it('VERIFY-03E: Multi-tab storage event invalidation and re-hydration', () => {
      const initialParties = [mockParty('P-1', 'Alpha')];
      db.saveParty(initialParties[0]);
      expect(db.getParties()).toHaveLength(1);

      // Simulate external window modifying localStorage directly and firing storage event
      const updatedParties = [mockParty('P-1', 'Alpha'), mockParty('P-2', 'Beta')];
      testStorage.setItem('gst_parties', JSON.stringify(updatedParties));

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: 'gst_parties',
            newValue: JSON.stringify(updatedParties),
          })
        );
      }

      // Cache is invalidated by storage event listener; next read re-hydrates
      const partiesAfterEvent = db.getParties();
      expect(partiesAfterEvent).toHaveLength(2);
      expect(partiesAfterEvent.find((p) => p.id === 'P-2')).toBeDefined();

      // Simulate external window calling localStorage.clear()
      testStorage.clear();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: null,
          })
        );
      }

      const partiesAfterClear = db.getParties();
      expect(partiesAfterClear).toHaveLength(0);
    });
  });
});
