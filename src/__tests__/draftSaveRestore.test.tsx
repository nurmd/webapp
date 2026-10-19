import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

// Mock Storage
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

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
globalThis.alert = vi.fn();
if (typeof window !== 'undefined') {
  window.alert = vi.fn();
}

vi.mock('../services/pouchdb.ts', () => ({
  pouch: {
    putDoc: vi.fn(),
    deleteDoc: vi.fn(),
    getAllDocs: vi.fn(async () => []),
    getSyncState: vi.fn(() => ({ isSyncing: false, isOnline: true })),
    subscribeSync: vi.fn(() => () => {}),
    syncNow: vi.fn(),
    startSync: vi.fn(),
    stopSync: vi.fn(),
    migrateFromLocalStorage: vi.fn(async () => {}),
  },
}));

import { draftService, InvoiceDraft, PurchaseDraft } from '../services/draftService.ts';
import { TableGridInvoiceModal } from '../components/Invoicing/TableGridInvoiceModal.tsx';
import { TableGridPurchaseModal } from '../components/Purchases/TableGridPurchaseModal.tsx';
import { CompanyProfile } from '../models/company.ts';
import { Party } from '../models/party.ts';
import { InventoryItem } from '../models/item.ts';

const mockCompany: CompanyProfile = {
  id: 'COMP-1',
  businessName: 'Apex Retailers',
  tradeName: 'Apex Store',
  gstin: '27AABCU9603R1ZM',
  pan: 'AABCU9603R',
  email: 'apex@store.in',
  phone: '9876543210',
  address: '101 Market Yard, Pune',
  city: 'Pune',
  stateCode: '27',
  pincode: '411037',
  isGstEnabled: true,
  isCompositionScheme: false,
  invoicePrefix: 'INV',
  documentSeries: {
    SALES_INVOICE: { prefix: 'INV', separator: '-', yearFormat: 'YYYY', paddingDigits: 4, startingNumber: 1 },
    PURCHASE_BILL: { prefix: 'PB', separator: '-', yearFormat: 'YYYY', paddingDigits: 4, startingNumber: 1 },
  },
};

const mockParties: Party[] = [
  {
    id: 'PARTY-1',
    name: 'Bharat Enterprises',
    phone: '9123456780',
    email: 'bharat@ent.com',
    billingAddress: '45 Industrial Area, Pune',
    stateCode: '27',
    type: 'CUSTOMER',
    currentBalance: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'SUPP-1',
    name: 'National Suppliers Ltd',
    phone: '9988776655',
    email: 'contact@national.com',
    billingAddress: '10 Port Road, Mumbai',
    stateCode: '27',
    type: 'SUPPLIER',
    currentBalance: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const mockCatalog: InventoryItem[] = [
  {
    id: 'ITEM-1',
    name: 'Wireless Ergonomic Mouse',
    hsnSacCode: '847160',
    salePrice: 1200,
    purchasePrice: 800,
    mrp: 1500,
    gstRate: 18,
    unit: 'PCS',
    currentStock: 50,
    minStockAlert: 5,
    category: 'Electronics',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

describe('Draft Auto-Save & Restoration Service & Modals', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    testStorage.clear();
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    testStorage.clear();
  });

  describe('draftService Unit Operations', () => {
    it('accurately identifies empty vs non-empty invoice drafts', () => {
      expect(draftService.isInvoiceDraftNotEmpty(null)).toBe(false);
      expect(draftService.isInvoiceDraftNotEmpty(undefined)).toBe(false);
      expect(draftService.isInvoiceDraftNotEmpty({ rows: [] })).toBe(false);
      expect(
        draftService.isInvoiceDraftNotEmpty({
          rows: [{ name: '', quantity: 0, unitPrice: 0, discountPercent: 0, gstRate: 0 } as any],
        })
      ).toBe(false);

      expect(
        draftService.isInvoiceDraftNotEmpty({
          selectedParty: mockParties[0],
          rows: [],
        })
      ).toBe(true);

      expect(
        draftService.isInvoiceDraftNotEmpty({
          rows: [{ name: 'Test Widget', quantity: 1, sellingPrice: 100 } as any],
        })
      ).toBe(true);

      expect(
        draftService.isInvoiceDraftNotEmpty({
          shippingAmount: 50,
          rows: [],
        })
      ).toBe(true);
    });

    it('saves and retrieves invoice drafts from localStorage', () => {
      const draftData: Omit<InvoiceDraft, 'updatedAt'> = {
        invoiceNumber: 'INV-2026-DRAFT',
        invoiceDate: '2026-10-19',
        dueDate: '2026-11-03',
        selectedParty: mockParties[0],
        posStateCode: '27',
        rows: [
          {
            itemId: 'ITEM-1',
            name: 'Wireless Ergonomic Mouse',
            hsnSacCode: '847160',
            unit: 'PCS',
            quantity: 2,
            unitPrice: 1200,
            discountPercent: 0,
            gstRate: 18,
          },
        ],
      };

      draftService.saveInvoiceDraft(draftData);
      expect(draftService.hasInvoiceDraft()).toBe(true);

      const retrieved = draftService.getInvoiceDraft();
      expect(retrieved).not.toBeNull();
      expect(retrieved?.invoiceNumber).toBe('INV-2026-DRAFT');
      expect(retrieved?.selectedParty?.name).toBe('Bharat Enterprises');
      expect(retrieved?.rows.length).toBe(1);
      expect(retrieved?.rows[0].name).toBe('Wireless Ergonomic Mouse');

      draftService.clearInvoiceDraft();
      expect(draftService.hasInvoiceDraft()).toBe(false);
      expect(draftService.getInvoiceDraft()).toBeNull();
    });

    it('saves and retrieves purchase drafts from localStorage', () => {
      const purchaseDraftData: Omit<PurchaseDraft, 'updatedAt'> = {
        billNumber: 'PB-SUPP-999',
        billDate: '2026-10-19',
        dueDate: '2026-11-18',
        selectedSupplier: mockParties[1],
        supplierStateCode: '27',
        rows: [
          {
            itemId: 'ITEM-1',
            name: 'Wireless Ergonomic Mouse',
            hsnSacCode: '847160',
            unit: 'PCS',
            quantity: 10,
            unitPrice: 800,
            discountPercent: 5,
            gstRate: 18,
          },
        ],
      };

      draftService.savePurchaseDraft(purchaseDraftData);
      expect(draftService.hasPurchaseDraft()).toBe(true);

      const retrieved = draftService.getPurchaseDraft();
      expect(retrieved).not.toBeNull();
      expect(retrieved?.billNumber).toBe('PB-SUPP-999');
      expect(retrieved?.selectedSupplier?.name).toBe('National Suppliers Ltd');
      expect(retrieved?.rows.length).toBe(1);

      draftService.clearPurchaseDraft();
      expect(draftService.hasPurchaseDraft()).toBe(false);
    });
  });

  describe('TableGridInvoiceModal Draft Integration', () => {
    it('restores existing draft on modal mount and allows user to discard it', () => {
      // Pre-seed an invoice draft
      draftService.saveInvoiceDraft({
        invoiceNumber: 'INV-RESTORE-TEST',
        invoiceDate: '2026-10-19',
        dueDate: '2026-11-03',
        selectedParty: mockParties[0],
        posStateCode: '27',
        rows: [
          {
            itemId: 'ITEM-1',
            name: 'Draft Restored Item',
            hsnSacCode: '847160',
            unit: 'PCS',
            quantity: 3,
            unitPrice: 1500,
            discountPercent: 0,
            gstRate: 18,
          },
        ],
      });

      const handleClose = vi.fn();
      const handleSave = vi.fn();

      act(() => {
        root.render(
          <TableGridInvoiceModal
            company={mockCompany}
            parties={mockParties}
            itemsCatalog={mockCatalog}
            onClose={handleClose}
            onSave={handleSave}
          />
        );
      });

      // Verify draft banner rendered
      expect(container.querySelector('[data-testid="invoice-draft-banner"]')).not.toBeNull();
      expect(container.textContent).toContain('Restored Unsaved Draft');
      expect(container.textContent).toContain('Bharat Enterprises');

      // Verify row is rendered in the invoice line items
      expect(container.textContent).toContain('Draft Restored Item');

      // Click "Discard Draft"
      const discardBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Discard Draft')
      );
      expect(discardBtn).toBeDefined();
      act(() => {
        discardBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Draft banner should disappear and storage cleared
      expect(container.querySelector('[data-testid="invoice-draft-banner"]')).toBeNull();
      expect(draftService.hasInvoiceDraft()).toBe(false);
    });

    it('clears draft when invoice is successfully saved', () => {
      draftService.saveInvoiceDraft({
        invoiceNumber: 'INV-TO-SAVE',
        selectedParty: mockParties[0],
        rows: [
          {
            itemId: 'ITEM-1',
            name: 'Item to Save',
            hsnSacCode: '847160',
            unit: 'PCS',
            quantity: 1,
            unitPrice: 1000,
            discountPercent: 0,
            gstRate: 18,
          },
        ],
      });

      expect(draftService.hasInvoiceDraft()).toBe(true);

      const handleClose = vi.fn();
      const handleSave = vi.fn();

      act(() => {
        root.render(
          <TableGridInvoiceModal
            company={mockCompany}
            parties={mockParties}
            itemsCatalog={mockCatalog}
            onClose={handleClose}
            onSave={handleSave}
          />
        );
      });

      // Click "Save Invoice" directly
      const saveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Save Invoice')
      );
      expect(saveBtn).toBeDefined();
      act(() => {
        saveBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(handleSave).toHaveBeenCalledTimes(1);
      // Draft must be purged upon successful invoice creation
      expect(draftService.hasInvoiceDraft()).toBe(false);
    });

    it('does not restore or overwrite draft when editing an existing invoice', () => {
      // Pre-seed an invoice draft
      draftService.saveInvoiceDraft({
        invoiceNumber: 'DRAFT-IN-BACKGROUND',
        selectedParty: mockParties[0],
        rows: [{ itemId: 'ITEM-1', name: 'Pending Draft Row', hsnSacCode: '847160', unit: 'PCS', quantity: 5, unitPrice: 200, discountPercent: 0, gstRate: 18 }],
      });

      const existingInvoice: any = {
        id: 'EXISTING-INV-1',
        invoiceNumber: 'INV-REAL-001',
        date: '2026-10-10',
        partyId: mockParties[0].id,
        partyName: mockParties[0].name,
        partyStateCode: '29',
        placeOfSupplyStateCode: '29',
        items: [
          {
            itemId: 'ITEM-1',
            name: 'Original Existing Item',
            quantity: 1,
            unitPrice: 500,
            totalAmount: 590,
            gstRate: 18,
          },
        ],
        grandTotal: 590,
      };

      act(() => {
        root.render(
          <TableGridInvoiceModal
            company={mockCompany}
            parties={mockParties}
            itemsCatalog={mockCatalog}
            initialInvoice={existingInvoice}
            onClose={vi.fn()}
            onSave={vi.fn()}
          />
        );
      });

      // Should not show draft banner
      expect(container.querySelector('[data-testid="invoice-draft-banner"]')).toBeNull();
      // Should show the existing invoice item, not draft item
      expect(container.textContent).toContain('Original Existing Item');
      expect(container.textContent).not.toContain('Pending Draft Row');

      // Background draft must remain untouched
      expect(draftService.hasInvoiceDraft()).toBe(true);
      expect(draftService.getInvoiceDraft()?.invoiceNumber).toBe('DRAFT-IN-BACKGROUND');
    });
  });

  describe('TableGridPurchaseModal Draft Integration', () => {
    it('restores existing purchase draft on mount and allows discarding it', () => {
      draftService.savePurchaseDraft({
        billNumber: 'PB-DRAFT-001',
        billDate: '2026-10-19',
        selectedSupplier: mockParties[1],
        supplierStateCode: '27',
        rows: [
          {
            itemId: 'ITEM-1',
            name: 'Raw Materials Batch A',
            hsnSacCode: '847160',
            unit: 'PCS',
            quantity: 20,
            unitPrice: 400,
            discountPercent: 0,
            gstRate: 18,
          },
        ],
      });

      act(() => {
        root.render(
          <TableGridPurchaseModal
            company={mockCompany}
            parties={mockParties}
            itemsCatalog={mockCatalog}
            onClose={vi.fn()}
            onSave={vi.fn()}
          />
        );
      });

      // Verify purchase draft banner rendered
      expect(container.querySelector('[data-testid="purchase-draft-banner"]')).not.toBeNull();
      expect(container.textContent).toContain('Restored Unsaved Draft');
      expect(container.textContent).toContain('Raw Materials Batch A');

      // Click "Discard Draft"
      const discardBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Discard Draft')
      );
      expect(discardBtn).toBeDefined();
      act(() => {
        discardBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(container.querySelector('[data-testid="purchase-draft-banner"]')).toBeNull();
      expect(draftService.hasPurchaseDraft()).toBe(false);
    });

    it('clears purchase draft upon saving purchase bill', () => {
      draftService.savePurchaseDraft({
        billNumber: 'PB-DRAFT-SAVE',
        selectedSupplier: mockParties[1],
        rows: [
          {
            itemId: 'ITEM-1',
            name: 'Raw Materials Save',
            hsnSacCode: '847160',
            unit: 'PCS',
            quantity: 10,
            unitPrice: 500,
            discountPercent: 0,
            gstRate: 18,
          },
        ],
      });

      expect(draftService.hasPurchaseDraft()).toBe(true);
      const handleSave = vi.fn();

      act(() => {
        root.render(
          <TableGridPurchaseModal
            company={mockCompany}
            parties={mockParties}
            itemsCatalog={mockCatalog}
            onClose={vi.fn()}
            onSave={handleSave}
          />
        );
      });

      const saveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Save Purchase Bill')
      );
      expect(saveBtn).toBeDefined();
      act(() => {
        saveBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(handleSave).toHaveBeenCalledTimes(1);
      expect(draftService.hasPurchaseDraft()).toBe(false);
    });
  });
});
