import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

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

import {
  DEFAULT_PAYMENT_MODE_KEY,
  getDefaultPaymentMode,
  setDefaultPaymentMode,
} from '../services/paymentSettingsService.ts';
import { InvoiceActionDock } from '../components/Invoicing/components/InvoiceActionDock.tsx';
import { TableGridInvoiceModal } from '../components/Invoicing/TableGridInvoiceModal.tsx';
import { BillingInvoicesTab } from '../components/Settings/tabs/BillingInvoicesTab.tsx';
import { CompanyProfile } from '../models/company.ts';
import { Party } from '../models/party.ts';
import { InventoryItem } from '../models/item.ts';
import { Invoice } from '../models/invoice.ts';
import { draftService } from '../services/draftService.ts';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockCompany: CompanyProfile = {
  id: 'COMP-001',
  businessName: 'Apex Retailers',
  tradeName: 'Apex Store',
  gstin: '27AABCU9603R1ZM',
  pan: 'AABCU9603R',
  phone: '9876543210',
  email: 'apex@store.in',
  address: '101 Market Yard, Pune',
  pincode: '411037',
  stateCode: '27',
};

const mockParty: Party = {
  id: 'PARTY-001',
  name: 'Rahul Sharma',
  phone: '9822012345',
  type: 'CUSTOMER',
  stateCode: '27',
  billingAddress: 'FC Road, Pune',
  openingBalance: 0,
  openingBalanceType: 'TO_RECEIVE',
  currentBalance: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const mockItem: InventoryItem = {
  id: 'ITM-001',
  name: 'Wireless Keyboard',
  salePrice: 1000,
  purchasePrice: 700,
  unit: 'PCS',
  hsnSacCode: '847160',
  gstRate: 0,
  currentStock: 50,
  minStockAlert: 5,
  category: 'Electronics',
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function changeInput(input: HTMLInputElement, val: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  nativeSetter?.call(input, val);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function changeSelect(select: HTMLSelectElement, val: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
  nativeSetter?.call(select, val);
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function seedDraftWithItem(qty = 1, price = 1000) {
  draftService.saveInvoiceDraft({
    invoiceNumber: 'INV-INLINE-01',
    invoiceDate: '2026-10-15',
    selectedParty: mockParty,
    posStateCode: '27',
    rows: [
      {
        itemId: mockItem.id,
        name: mockItem.name,
        unit: 'PCS',
        quantity: qty,
        unitPrice: price,
        unitPriceInclusive: price,
        priceMode: 'EXCLUSIVE',
        cessRate: 0,
        mrp: price,
        discountPercent: 0,
        hsnSacCode: '847160',
        gstRate: 0,
      },
    ],
  });
}

describe('Sales Invoice Inline Payment & Default Tender Suite', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    testStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  describe('1. paymentSettingsService', () => {
    it('returns CASH when unset, returns stored UPI, and ignores garbage and SPLIT', () => {
      expect(getDefaultPaymentMode()).toBe('CASH');

      setDefaultPaymentMode('UPI');
      expect(getDefaultPaymentMode()).toBe('UPI');

      testStorage.setItem(DEFAULT_PAYMENT_MODE_KEY, 'INVALID_GARBAGE');
      expect(getDefaultPaymentMode()).toBe('CASH');

      testStorage.setItem(DEFAULT_PAYMENT_MODE_KEY, 'SPLIT');
      expect(getDefaultPaymentMode()).toBe('CASH');
    });
  });

  describe('2. InvoiceActionDock hidePrintAndPay', () => {
    it('hides Save & Print and Pay & Save when hidePrintAndPay is true, keeping Save Invoice', () => {
      act(() => {
        root.render(
          <InvoiceActionDock
            finalGrandTotal={1500}
            onSaveInvoice={vi.fn()}
            hidePrintAndPay={true}
          />
        );
      });
      expect(container.textContent).not.toContain('Save & Print');
      expect(container.textContent).not.toContain('Pay & Save');
      expect(container.textContent).toContain('Save Invoice');
    });

    it('renders all three buttons when hidePrintAndPay is omitted', () => {
      act(() => {
        root.render(
          <InvoiceActionDock
            finalGrandTotal={1500}
            onSaveAndPrint={vi.fn()}
            onSaveInvoice={vi.fn()}
            onPayAndSave={vi.fn()}
          />
        );
      });
      expect(container.textContent).toContain('Save & Print');
      expect(container.textContent).toContain('Pay & Save');
      expect(container.textContent).toContain('Save Invoice');
    });
  });

  describe('3-6. TableGridInvoiceModal inline payment settlement', () => {
    it('renders Payment Settlement inline with no InvoicePaymentModal, starts at 0 / Unpaid, keeps 0 on mode change, updates status on partial/full, and adds split row', () => {
      seedDraftWithItem(1, 1000);

      act(() => {
        root.render(
          <TableGridInvoiceModal
            company={mockCompany}
            parties={[mockParty]}
            itemsCatalog={[mockItem]}
            initialInvoice={null}
            onClose={vi.fn()}
            onSave={vi.fn()}
          />
        );
      });

      // Inline Payment Settlement present; no popup modal ("Confirm & Save" / "Payment Tender Breakdown")
      expect(container.textContent).toContain('Payment Settlement');
      expect(container.textContent).not.toContain('Payment Tender Breakdown');
      expect(container.textContent).not.toContain('Save & Print');
      expect(container.textContent).not.toContain('Pay & Save');

      // Starts at ₹0 (value='' in number input) and Unpaid
      const dock = container.querySelector('[data-testid="payment-settlement-dock"]')!;
      expect(dock).not.toBeNull();
      const amountInputsBefore = Array.from(dock.querySelectorAll('input[type="number"][placeholder="0.00"]')) as HTMLInputElement[];
      expect(amountInputsBefore).toHaveLength(1);
      expect(amountInputsBefore[0].value).toBe('');
      expect(dock.textContent).toContain('Unpaid');

      // Change mode select to UPI -> amount stays 0
      const modeSelect = Array.from(dock.querySelectorAll('select')).find((s) =>
        Array.from(s.options).some((o) => o.value === 'UPI')
      ) as HTMLSelectElement;
      expect(modeSelect).toBeTruthy();
      act(() => {
        changeSelect(modeSelect, 'UPI');
      });
      expect(modeSelect.value).toBe('UPI');
      expect(amountInputsBefore[0].value).toBe('');
      expect(dock.textContent).toContain('Unpaid');

      // Enter partial amount 400 -> Partial
      act(() => {
        changeInput(amountInputsBefore[0], '400');
      });
      expect(dock.textContent).toContain('Partial');

      // Enter full amount 1000 -> Paid
      act(() => {
        changeInput(amountInputsBefore[0], '1000');
      });
      expect(dock.textContent).toContain('Paid');

      // Click "Add payment mode" -> adds a second row
      const addModeBtn = Array.from(dock.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Add payment mode')
      );
      expect(addModeBtn).toBeTruthy();
      act(() => {
        addModeBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      const amountInputsAfter = Array.from(dock.querySelectorAll('input[type="number"][placeholder="0.00"]')) as HTMLInputElement[];
      expect(amountInputsAfter).toHaveLength(2);
    });

    it('saves with partial split writing paidAmount, balanceAmount, paymentStatus PARTIAL, paymentMode SPLIT and split breakdown', () => {
      seedDraftWithItem(1, 1000);
      let savedInvoice: Invoice | null = null;
      const onSave = vi.fn((inv: Invoice) => {
        savedInvoice = inv;
      });

      act(() => {
        root.render(
          <TableGridInvoiceModal
            company={mockCompany}
            parties={[mockParty]}
            itemsCatalog={[mockItem]}
            initialInvoice={null}
            onClose={vi.fn()}
            onSave={onSave}
          />
        );
      });

      const dock = container.querySelector('[data-testid="payment-settlement-dock"]')!;
      const amountInput = dock.querySelector('input[type="number"][placeholder="0.00"]') as HTMLInputElement;
      act(() => {
        changeInput(amountInput, '400');
      });

      const addModeBtn = Array.from(dock.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Add payment mode')
      );
      act(() => {
        addModeBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Set second split amount to 200 (total paid = 600, balance = 400)
      const amountInputs = Array.from(dock.querySelectorAll('input[type="number"][placeholder="0.00"]')) as HTMLInputElement[];
      expect(amountInputs).toHaveLength(2);
      act(() => {
        changeInput(amountInputs[1], '200');
      });

      const saveBtn = container.querySelector('[data-testid="invoice-save-btn"]') as HTMLButtonElement;
      act(() => {
        saveBtn.click();
      });

      expect(onSave).toHaveBeenCalledTimes(1);
      expect(savedInvoice).not.toBeNull();
      expect(savedInvoice!.paymentStatus).toBe('PARTIAL');
      expect(savedInvoice!.paymentMode).toBe('SPLIT');
      expect(savedInvoice!.paidAmount).toBe(600);
      expect(savedInvoice!.balanceAmount).toBe(400);
      expect(savedInvoice!.paymentSplits).toHaveLength(2);
    });

    it('saves with amount 0 writing UNPAID, paidAmount 0, balanceAmount grandTotal, paymentMode CREDIT', () => {
      seedDraftWithItem(1, 1000);
      let savedInvoice: Invoice | null = null;
      const onSave = vi.fn((inv: Invoice) => {
        savedInvoice = inv;
      });

      act(() => {
        root.render(
          <TableGridInvoiceModal
            company={mockCompany}
            parties={[mockParty]}
            itemsCatalog={[mockItem]}
            initialInvoice={null}
            onClose={vi.fn()}
            onSave={onSave}
          />
        );
      });

      const saveBtn = container.querySelector('[data-testid="invoice-save-btn"]') as HTMLButtonElement;
      act(() => {
        saveBtn.click();
      });

      expect(onSave).toHaveBeenCalledTimes(1);
      expect(savedInvoice).not.toBeNull();
      expect(savedInvoice!.paymentStatus).toBe('UNPAID');
      expect(savedInvoice!.paidAmount).toBe(0);
      expect(savedInvoice!.balanceAmount).toBe(savedInvoice!.grandTotal);
      expect(savedInvoice!.paymentMode).toBe('CREDIT');
      expect(savedInvoice!.paymentSplits).toEqual([
        expect.objectContaining({ mode: 'CREDIT', amount: savedInvoice!.grandTotal }),
      ]);
      expect(savedInvoice!.paymentSplits!.some((s) => s.mode !== 'CREDIT')).toBe(false);
    });

    it('initialises the dock from saved splits when editing an existing invoice', () => {
      const existingInv: Invoice = {
        id: 'INV-EDIT-01',
        invoiceNumber: 'INV-EDIT-01',
        invoiceType: 'B2CS',
        date: '2026-10-10',
        partyId: mockParty.id,
        partyName: mockParty.name,
        partyAddress: mockParty.billingAddress,
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [
          {
            itemId: mockItem.id,
            name: mockItem.name,
            unit: 'PCS',
            quantity: 1,
            unitPrice: 1000,
            discountPercent: 0,
            discountAmount: 0,
            taxableAmount: 1000,
            gstRate: 0,
            cgstAmount: 0,
            sgstAmount: 0,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 1000,
            hsnSacCode: '847160',
          },
        ],
        totalGrossAmount: 1000,
        totalDiscount: 0,
        totalTaxableAmount: 1000,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 1000,
        amountInWords: 'One Thousand Only',
        paymentMode: 'SPLIT',
        paymentStatus: 'PARTIAL',
        paidAmount: 700,
        balanceAmount: 300,
        paymentSplits: [
          { id: 'sp-1', mode: 'UPI', amount: 500 },
          { id: 'sp-2', mode: 'CASH', amount: 200 },
        ],
        createdAt: '2026-10-10T10:00:00Z',
        updatedAt: '2026-10-10T10:00:00Z',
      };

      act(() => {
        root.render(
          <TableGridInvoiceModal
            company={mockCompany}
            parties={[mockParty]}
            itemsCatalog={[mockItem]}
            initialInvoice={existingInv}
            onClose={vi.fn()}
            onSave={vi.fn()}
          />
        );
      });

      const dock = container.querySelector('[data-testid="payment-settlement-dock"]')!;
      const amountInputs = Array.from(dock.querySelectorAll('input[type="number"][placeholder="0.00"]')) as HTMLInputElement[];
      expect(amountInputs).toHaveLength(2);
      expect(amountInputs[0].value).toBe('500');
      expect(amountInputs[1].value).toBe('200');
      expect(dock.textContent).toContain('Partial');
    });
  });

  describe('7. BillingInvoicesTab default payment mode setting', () => {
    it('renders the default payment mode select and persists the choice', () => {
      act(() => {
        root.render(
          <BillingInvoicesTab
            profile={mockCompany}
            defaultPrintOption="A4"
            handleDefaultPrintOptionChange={vi.fn()}
            setIsQrModalOpen={vi.fn()}
          />
        );
      });

      const select = container.querySelector('[data-testid="default-payment-mode-select"]') as HTMLSelectElement;
      expect(select).not.toBeNull();
      expect(select.value).toBe('CASH');

      act(() => {
        changeSelect(select, 'UPI');
      });

      expect(select.value).toBe('UPI');
      expect(getDefaultPaymentMode()).toBe('UPI');
    });
  });
});
