import { describe, it, expect, beforeEach } from 'vitest';

class TestStorage implements Storage {
  private store: Map<string, string> = new Map();
  get length(): number { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  key(index: number): string | null { return Array.from(this.store.keys())[index] ?? null; }
  removeItem(key: string): void { this.store.delete(key); }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
}

const testStorage = new TestStorage();
Object.defineProperty(globalThis, 'localStorage', { value: testStorage, writable: true, configurable: true });

import {
  normalizeEntityName,
  findDuplicateItem,
  findDuplicateParty,
  DuplicateEntityNameError,
} from '../core/utils/entityUniqueness.ts';
import { db } from '../services/db.ts';
import type { InventoryItem } from '../models/item.ts';
import type { Party } from '../models/party.ts';

describe('Entity Uniqueness Utilities & Storage Guards', () => {
  beforeEach(() => {
    testStorage.clear();
  });

  describe('normalizeEntityName', () => {
    it('collapses internal whitespace, trims, lowercases, and NFC normalizes', () => {
      expect(normalizeEntityName('   Fortune   Mustard   Oil  1L   ')).toBe('fortune mustard oil 1l');
      expect(normalizeEntityName('Café')).toBe('café');
      // Decomposed e + acute accent vs composed e with acute
      const decomposed = 'Cafe\u0301';
      const composed = 'Caf\u00e9';
      expect(normalizeEntityName(decomposed)).toBe(normalizeEntityName(composed));
      expect(normalizeEntityName('')).toBe('');
      expect(normalizeEntityName(null)).toBe('');
      expect(normalizeEntityName(undefined)).toBe('');
      expect(normalizeEntityName('   \t  \n  ')).toBe('');
    });
  });

  describe('findDuplicateItem & findDuplicateParty', () => {
    const items: InventoryItem[] = [
      {
        id: 'itm-1',
        name: 'Basmati Rice 5kg',
        sku: 'SKU-1',
        unit: 'PCS',
        category: 'Grains',
        salePrice: 500,
        purchasePrice: 400,
        gstRate: 5,
        hsnSacCode: '1006',
        currentStock: 10,
        minStockAlert: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const parties: Party[] = [
      {
        id: 'pty-1',
        name: 'Sharma Traders',
        type: 'CUSTOMER',
        phone: '9876543210',
        billingAddress: 'Delhi',
        stateCode: '07',
        currentBalance: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    it('detects duplicate items case-insensitively and whitespace-collapsed', () => {
      expect(findDuplicateItem('  basmati   rice   5kg  ', items)).toBe(items[0]);
      expect(findDuplicateItem('BASMATI RICE 5KG', items)).toBe(items[0]);
      expect(findDuplicateItem('Basmati Rice 10kg', items)).toBeUndefined();
    });

    it('excludes own item when currentItemId is passed', () => {
      expect(findDuplicateItem('Basmati Rice 5kg', items, 'itm-1')).toBeUndefined();
      expect(findDuplicateItem('Basmati Rice 5kg', items, 'itm-other')).toBe(items[0]);
    });

    it('detects duplicate parties case-insensitively and whitespace-collapsed', () => {
      expect(findDuplicateParty('  sharma   traders  ', parties)).toBe(parties[0]);
      expect(findDuplicateParty('SHARMA TRADERS', parties)).toBe(parties[0]);
      expect(findDuplicateParty('Verma Traders', parties)).toBeUndefined();
    });

    it('excludes own party when currentPartyId is passed', () => {
      expect(findDuplicateParty('Sharma Traders', parties, 'pty-1')).toBeUndefined();
      expect(findDuplicateParty('Sharma Traders', parties, 'pty-other')).toBe(parties[0]);
    });
  });

  describe('db.saveItem duplicate name guards', () => {
    it('blocks duplicate item creation by throwing DuplicateEntityNameError', () => {
      const item1: InventoryItem = {
        id: 'ITM-U1',
        name: 'Royal Tea 250g',
        sku: 'SKU-TEA-1',
        unit: 'PCS',
        category: 'Beverages',
        salePrice: 120,
        purchasePrice: 90,
        gstRate: 5,
        hsnSacCode: '0902',
        currentStock: 50,
        minStockAlert: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.saveItem(item1);

      const itemDup: InventoryItem = {
        id: 'ITM-U2',
        name: '  royal   tea   250g  ',
        sku: 'SKU-TEA-2',
        unit: 'PCS',
        category: 'Beverages',
        salePrice: 130,
        purchasePrice: 95,
        gstRate: 5,
        hsnSacCode: '0902',
        currentStock: 20,
        minStockAlert: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(() => db.saveItem(itemDup)).toThrow(DuplicateEntityNameError);
      try {
        db.saveItem(itemDup);
      } catch (err) {
        expect(err).toBeInstanceOf(DuplicateEntityNameError);
        const dupErr = err as DuplicateEntityNameError;
        expect(dupErr.entityType).toBe('item');
        expect(dupErr.conflictingId).toBe('ITM-U1');
      }
    });

    it('blocks item rename collision with an existing item', () => {
      const item1: InventoryItem = {
        id: 'ITM-R1',
        name: 'Item Alpha',
        sku: 'SKU-A',
        unit: 'PCS',
        category: 'General',
        salePrice: 10,
        purchasePrice: 8,
        gstRate: 0,
        hsnSacCode: '0000',
        currentStock: 10,
        minStockAlert: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const item2: InventoryItem = {
        id: 'ITM-R2',
        name: 'Item Beta',
        sku: 'SKU-B',
        unit: 'PCS',
        category: 'General',
        salePrice: 20,
        purchasePrice: 15,
        gstRate: 0,
        hsnSacCode: '0000',
        currentStock: 10,
        minStockAlert: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.saveItem(item1);
      db.saveItem(item2);

      // Attempt to rename item2 to "Item Alpha"
      expect(() => db.saveItem({ ...item2, name: 'Item Alpha' })).toThrow(DuplicateEntityNameError);
    });

    it('allows updating an existing item when its name is unchanged', () => {
      const item1: InventoryItem = {
        id: 'ITM-SAME',
        name: 'Constant Name Item',
        sku: 'SKU-CONST',
        unit: 'PCS',
        category: 'General',
        salePrice: 50,
        purchasePrice: 40,
        gstRate: 5,
        hsnSacCode: '1234',
        currentStock: 15,
        minStockAlert: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.saveItem(item1);

      // Update price and stock without changing name
      expect(() => {
        db.saveItem({ ...item1, salePrice: 65, currentStock: 25 });
      }).not.toThrow();

      const updated = db.getItems().find((i) => i.id === 'ITM-SAME');
      expect(updated?.salePrice).toBe(65);
      expect(updated?.currentStock).toBe(25);
    });

    it('bypasses duplicate check when allowDuplicateName is true', () => {
      const item1: InventoryItem = {
        id: 'ITM-BYPASS-1',
        name: 'Duplicate Allowed Item',
        sku: 'SKU-B1',
        unit: 'PCS',
        category: 'General',
        salePrice: 100,
        purchasePrice: 80,
        gstRate: 5,
        hsnSacCode: '1111',
        currentStock: 10,
        minStockAlert: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.saveItem(item1);

      const item2: InventoryItem = {
        id: 'ITM-BYPASS-2',
        name: 'Duplicate Allowed Item',
        sku: 'SKU-B2',
        unit: 'PCS',
        category: 'General',
        salePrice: 110,
        purchasePrice: 85,
        gstRate: 5,
        hsnSacCode: '1111',
        currentStock: 5,
        minStockAlert: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(() => db.saveItem(item2, true)).not.toThrow();
      expect(() => db.saveItem({ ...item2, id: 'ITM-BYPASS-3' }, { allowDuplicateName: true })).not.toThrow();
    });
  });

  describe('db.saveParty duplicate name guards', () => {
    it('blocks duplicate party creation by throwing DuplicateEntityNameError', () => {
      const party1: Party = {
        id: 'PTY-P1',
        name: 'Gupta Hardware',
        type: 'SUPPLIER',
        phone: '9811112222',
        billingAddress: 'Jaipur',
        stateCode: '08',
        currentBalance: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.saveParty(party1);

      const partyDup: Party = {
        id: 'PTY-P2',
        name: '  gupta   hardware  ',
        type: 'CUSTOMER',
        phone: '9833334444',
        billingAddress: 'Ajmer',
        stateCode: '08',
        currentBalance: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(() => db.saveParty(partyDup)).toThrow(DuplicateEntityNameError);
      try {
        db.saveParty(partyDup);
      } catch (err) {
        expect(err).toBeInstanceOf(DuplicateEntityNameError);
        const dupErr = err as DuplicateEntityNameError;
        expect(dupErr.entityType).toBe('party');
        expect(dupErr.conflictingId).toBe('PTY-P1');
      }
    });

    it('blocks party rename collision with an existing party', () => {
      const p1: Party = {
        id: 'PTY-REN-1',
        name: 'Party One',
        type: 'CUSTOMER',
        phone: '9800000001',
        billingAddress: 'Delhi',
        stateCode: '07',
        currentBalance: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const p2: Party = {
        id: 'PTY-REN-2',
        name: 'Party Two',
        type: 'CUSTOMER',
        phone: '9800000002',
        billingAddress: 'Delhi',
        stateCode: '07',
        currentBalance: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.saveParty(p1);
      db.saveParty(p2);

      expect(() => db.saveParty({ ...p2, name: 'Party One' })).toThrow(DuplicateEntityNameError);
    });

    it('allows updating an existing party when its name is unchanged', () => {
      const p1: Party = {
        id: 'PTY-SAME',
        name: 'Unchanged Party Name',
        type: 'CUSTOMER',
        phone: '9877777777',
        billingAddress: 'Kolkata',
        stateCode: '19',
        currentBalance: 1500,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.saveParty(p1);

      expect(() => {
        db.saveParty({ ...p1, phone: '9899999999', email: 'updated@example.com' });
      }).not.toThrow();

      const updated = db.getParties().find((p) => p.id === 'PTY-SAME');
      expect(updated?.phone).toBe('9899999999');
      expect(updated?.email).toBe('updated@example.com');
    });

    it('bypasses duplicate check when allowDuplicateName is true', () => {
      const p1: Party = {
        id: 'PTY-DUP-1',
        name: 'Duplicate Allowed Party',
        type: 'CUSTOMER',
        phone: '9900000001',
        billingAddress: 'Mumbai',
        stateCode: '27',
        currentBalance: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.saveParty(p1);

      const p2: Party = {
        id: 'PTY-DUP-2',
        name: 'Duplicate Allowed Party',
        type: 'CUSTOMER',
        phone: '9900000002',
        billingAddress: 'Pune',
        stateCode: '27',
        currentBalance: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(() => db.saveParty(p2, true)).not.toThrow();
      expect(() => db.saveParty({ ...p2, id: 'PTY-DUP-3' }, { allowDuplicateName: true })).not.toThrow();
    });
  });
});
