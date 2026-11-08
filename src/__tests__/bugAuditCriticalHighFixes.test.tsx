import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { db } from '../services/db.ts';
import { auditTrail } from '../services/auditTrail.ts';
import { Party } from '../models/party.ts';
import { InventoryItem } from '../models/item.ts';
import { ItemFormModal } from '../components/Inventory/ItemFormModal.tsx';
import { AddEditPartyModal } from '../components/Parties/AddEditPartyModal.tsx';
import { SelectPartyModal } from '../components/Parties/SelectPartyModal.tsx';
import { WhatsAppShareModal } from '../components/Common/WhatsAppShareModal.tsx';

// Mock storage
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
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { value: testStorage, writable: true, configurable: true });
}

vi.mock('../services/pouchdb.ts', () => ({
  pouch: {
    putDoc: vi.fn().mockResolvedValue({ ok: true }),
    deleteDoc: vi.fn().mockResolvedValue({ ok: true }),
    getAllDocs: vi.fn().mockResolvedValue([]),
    getAllDocsWithMeta: vi.fn().mockResolvedValue([]),
    getConflicts: vi.fn().mockResolvedValue([]),
    getTombstones: vi.fn().mockResolvedValue([]),
    switchDb: vi.fn(),
    migrateFromLocalStorage: vi.fn().mockResolvedValue(undefined),
  },
}));

function setInputValue(input: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (nativeSetter) {
    nativeSetter.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('Bug Audit Critical & High Fixes Verification', () => {
  beforeEach(() => {
    testStorage.clear();
    (db as any).set('gst_parties', []);
    (db as any).set('gst_items', []);
  });

  describe('BUG-CRIT-01: Party mutations audit trail logging', () => {
    it('saveParty logs PARTY_CREATE and PARTY_UPDATE to auditTrail', async () => {
      const logSpy = vi.spyOn(auditTrail, 'logEvent');

      const party: Party = {
        id: 'PTY-101',
        name: 'Sharma Electronics',
        type: 'CUSTOMER',
        phone: '9876543210',
        billingAddress: 'Chandni Chowk, Delhi',
        stateCode: '07',
        currentBalance: 500,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      db.saveParty(party);

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'PARTY_CREATE',
          documentId: 'PTY-101',
          documentType: 'PARTY',
        })
      );

      // Update party
      const updatedParty: Party = {
        ...party,
        name: 'Sharma Electronics Pvt Ltd',
      };
      db.saveParty(updatedParty);

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'PARTY_UPDATE',
          documentId: 'PTY-101',
          documentType: 'PARTY',
        })
      );

      logSpy.mockRestore();
    });

    it('clearPartyOpeningBalance and deleteParty emit audit records', async () => {
      const logSpy = vi.spyOn(auditTrail, 'logEvent');

      const party: Party = {
        id: 'PTY-102',
        name: 'Verma Hardware',
        type: 'SUPPLIER',
        phone: '9876543211',
        billingAddress: 'Connaught Place',
        stateCode: '07',
        openingBalance: 1500,
        openingBalanceType: 'TO_PAY',
        currentBalance: -1500,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      db.saveParty(party);
      logSpy.mockClear();

      db.clearPartyOpeningBalance('PTY-102');

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'OPENING_BALANCE_CLEAR',
          documentId: 'PTY-102',
          documentType: 'PARTY',
        })
      );

      logSpy.mockClear();
      db.deleteParty('PTY-102');

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'PARTY_DELETE',
          documentId: 'PTY-102',
          documentType: 'PARTY',
        })
      );

      logSpy.mockRestore();
    });
  });

  describe('BUG-CRIT-02: Item mutations audit trail logging', () => {
    it('saveItem and deleteItem emit audit records', async () => {
      const logSpy = vi.spyOn(auditTrail, 'logEvent');

      const item: InventoryItem = {
        id: 'ITM-201',
        name: 'Basmati Rice 5kg',
        sku: 'SKU-RICE-5',
        unit: 'BAG',
        category: 'Grains',
        salePrice: 450,
        purchasePrice: 380,
        gstRate: 5,
        hsnSacCode: '1006',
        currentStock: 20,
        minStockAlert: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      db.saveItem(item);

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'ITEM_CREATE',
          documentId: 'ITM-201',
          documentType: 'ITEM',
        })
      );

      // Update item
      db.saveItem({ ...item, salePrice: 480 });
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'ITEM_UPDATE',
          documentId: 'ITM-201',
          documentType: 'ITEM',
        })
      );

      logSpy.mockClear();
      db.deleteItem('ITM-201');

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'ITEM_DELETE',
          documentId: 'ITM-201',
          documentType: 'ITEM',
        })
      );

      logSpy.mockRestore();
    });
  });

  describe('BUG-HIGH-01: Blocking duplicate item name in ItemFormModal', () => {
    it('renders warning badge for duplicate name and disables Save button', () => {
      const existing: InventoryItem = {
        id: 'ITM-1',
        name: 'Fortune Mustard Oil 1L',
        sku: 'SKU-OIL-1',
        unit: 'PCS',
        category: 'Oil',
        salePrice: 160,
        purchasePrice: 130,
        gstRate: 5,
        hsnSacCode: '1508',
        currentStock: 10,
        minStockAlert: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      act(() => {
        root.render(
          <ItemFormModal
            isOpen={true}
            editingItem={null}
            onSaveItem={() => {}}
            onClose={() => {}}
            existingItems={[existing]}
          />
        );
      });

      const nameInput = container.querySelector('input[placeholder*="Basmati Rice"]') as HTMLInputElement;
      expect(nameInput).not.toBeNull();

      // Enter matching duplicate name
      act(() => {
        setInputValue(nameInput, 'Fortune Mustard Oil 1L');
      });

      // Submit button should BE disabled when duplicate name is entered
      const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(true);

      // Warning badge should be rendered
      expect(container.textContent).toContain('An item with this name already exists');

      act(() => {
        root.unmount();
      });
      container.remove();
    });
  });

  describe('BUG-HIGH-02: Real-time duplicate party name in AddEditPartyModal', () => {
    it('shows warning alert under Name input when duplicate name is typed', () => {
      const existingParties: Party[] = [
        {
          id: 'PTY-1',
          name: 'Gupta Enterprises',
          type: 'CUSTOMER',
          phone: '9999911111',
          billingAddress: 'Noida',
          stateCode: '09',
          currentBalance: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      act(() => {
        root.render(
          <AddEditPartyModal
            isOpen={true}
            editingParty={null}
            onClose={() => {}}
            onSave={() => {}}
            parties={existingParties}
          />
        );
      });

      const nameInput = container.querySelector('input[placeholder*="Ramesh Hardware"]') as HTMLInputElement;
      expect(nameInput).not.toBeNull();

      act(() => {
        setInputValue(nameInput, 'gupta enterprises');
      });

      expect(container.textContent).toContain('Another party Gupta Enterprises already exists with this name.');

      act(() => {
        root.unmount();
      });
      container.remove();
    });
  });

  describe('BUG-HIGH-03: Word-level search tokenization in SelectPartyModal', () => {
    it('matches customer when search words appear in different fields out of order', () => {
      const testParties: Party[] = [
        {
          id: 'PTY-10',
          name: 'Rahul Kumar',
          type: 'CUSTOMER',
          phone: '9811002233',
          billingAddress: 'Rohini, Delhi',
          stateCode: '07',
          currentBalance: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'PTY-20',
          name: 'Suresh Patel',
          type: 'CUSTOMER',
          phone: '9822003344',
          billingAddress: 'Ahmedabad, Gujarat',
          stateCode: '24',
          currentBalance: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      act(() => {
        root.render(
          <SelectPartyModal
            isOpen={true}
            onClose={() => {}}
            onSelectParty={() => {}}
            parties={testParties}
          />
        );
      });

      const searchInput = container.querySelector('input[placeholder*="Search by"]') as HTMLInputElement;
      expect(searchInput).not.toBeNull();

      // Multi-word search across name ("Rahul") and city ("Delhi")
      act(() => {
        setInputValue(searchInput, 'delhi rahul');
      });

      expect(container.textContent).toContain('Rahul Kumar');
      expect(container.textContent).not.toContain('Suresh Patel');

      act(() => {
        root.unmount();
      });
      container.remove();
    });
  });

  describe('BUG-HIGH-04 & BUG-HIGH-05: WhatsAppShareModal isOpen guard and copy timeout cleanup', () => {
    it('returns null when isOpen is false', () => {
      const company = db.getCompany();
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      act(() => {
        root.render(
          <WhatsAppShareModal
            isOpen={false}
            onClose={() => {}}
            company={company}
          />
        );
      });

      expect(container.innerHTML).toBe('');

      act(() => {
        root.unmount();
      });
      container.remove();
    });
  });
});
