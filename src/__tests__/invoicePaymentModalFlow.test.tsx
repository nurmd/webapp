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

import { TableGridInvoiceModal } from '../components/Invoicing/TableGridInvoiceModal.tsx';
import { InvoiceActionDock } from '../components/Invoicing/components/InvoiceActionDock.tsx';
import { InvoicePaymentModal } from '../components/Invoicing/components/InvoicePaymentModal.tsx';
import { CompanyProfile } from '../models/company.ts';
import { Party } from '../models/party.ts';
import { InventoryItem } from '../models/item.ts';
import { Invoice } from '../models/invoice.ts';

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
  salePrice: 1200,
  purchasePrice: 900,
  unit: 'PCS',
  hsnSacCode: '847160',
  gstRate: 18,
  currentStock: 50,
  minStockAlert: 5,
  category: 'Electronics',
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('Invoice Payment Modal & Action Dock Flow', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    testStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('TC-DOCK-01: Action dock renders Save & Print, Save Invoice, and Pay & Save without Save & WhatsApp', () => {
    const onSaveAndPrint = vi.fn();
    const onSaveInvoice = vi.fn();
    const onPayAndSave = vi.fn();

    act(() => {
      root.render(
        <InvoiceActionDock
          finalGrandTotal={1500}
          onSaveAndPrint={onSaveAndPrint}
          onSaveInvoice={onSaveInvoice}
          onPayAndSave={onPayAndSave}
        />
      );
    });

    // Check presence of Save & Print
    expect(container.textContent).toContain('Save & Print');
    // Check presence of Save Invoice
    expect(container.textContent).toContain('Save Invoice');
    // Check presence of Pay & Save
    expect(container.textContent).toContain('Pay & Save');
    // Save & WhatsApp must be removed
    expect(container.textContent).not.toContain('Save & WhatsApp');
    expect(container.textContent).not.toContain('WhatsApp');
  });

  it('TC-BILL-01: Bill body does not display inline Payment Settlement Dock', () => {
    act(() => {
      root.render(
        <TableGridInvoiceModal
          company={mockCompany}
          parties={[mockParty]}
          itemsCatalog={[mockItem]}
          initialParty={mockParty}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );
    });

    // Main bill body should not contain inline Payment Settlement dock
    const paymentSettlementHeader = Array.from(container.querySelectorAll('span')).find(
      (s) => s.textContent === 'Payment Settlement'
    );
    expect(paymentSettlementHeader).toBeFalsy();
  });

  it('TC-BILL-02: Save & Print saves invoice as UNPAID and triggers print option', () => {
    let savedInvoice: Invoice | null = null;
    let savedOptions: { openPrint?: boolean } | undefined = undefined;

    const onSave = vi.fn((inv: Invoice, opts?: { openPrint?: boolean }) => {
      savedInvoice = inv;
      savedOptions = opts;
    });

    const initialInv: Invoice = {
      id: 'INV-TEST-01',
      invoiceNumber: 'INV-TEST-01',
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
          quantity: 2,
          unitPrice: 1200,
          discountPercent: 0,
          discountAmount: 0,
          taxableAmount: 2400,
          gstRate: 18,
          cgstAmount: 216,
          sgstAmount: 216,
          igstAmount: 0,
          cessAmount: 0,
          totalAmount: 2832,
          hsnSacCode: '847160',
        },
      ],
      totalGrossAmount: 2400,
      totalDiscount: 0,
      totalTaxableAmount: 2400,
      totalCgst: 216,
      totalSgst: 216,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 432,
      roundOff: 0,
      grandTotal: 2832,
      amountInWords: 'Two Thousand Eight Hundred Thirty Two',
      paymentMode: 'CASH',
      paymentStatus: 'PAID',
      paidAmount: 2832,
      balanceAmount: 0,
      createdAt: '2026-10-10T10:00:00Z',
      updatedAt: '2026-10-10T10:00:00Z',
    };

    act(() => {
      root.render(
        <TableGridInvoiceModal
          company={mockCompany}
          parties={[mockParty]}
          itemsCatalog={[mockItem]}
          initialInvoice={initialInv}
          onClose={vi.fn()}
          onSave={onSave}
        />
      );
    });

    // Find and click "Save & Print" button
    const saveAndPrintBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save & Print')
    );
    expect(saveAndPrintBtn).toBeTruthy();

    act(() => {
      saveAndPrintBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSave).toHaveBeenCalled();
    expect(savedInvoice).not.toBeNull();
    // Strictly saved with unpaid / credit
    expect(savedInvoice!.paymentStatus).toBe('UNPAID');
    expect(savedInvoice!.paymentMode).toBe('CREDIT');
    expect(savedInvoice!.paidAmount).toBe(0);
    expect(savedInvoice!.balanceAmount).toBe(savedInvoice!.grandTotal);
    expect(savedOptions).toEqual({ openPrint: true });
  });

  it('TC-BILL-03: Pay & Save opens payment modal to configure split payments and saves settled invoice', () => {
    let savedInvoice: Invoice | null = null;
    const onSave = vi.fn((inv: Invoice) => {
      savedInvoice = inv;
    });

    const initialInv: Invoice = {
      id: 'INV-TEST-02',
      invoiceNumber: 'INV-TEST-02',
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
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
      paidAmount: 0,
      balanceAmount: 1000,
      createdAt: '2026-10-10T10:00:00Z',
      updatedAt: '2026-10-10T10:00:00Z',
    };

    act(() => {
      root.render(
        <TableGridInvoiceModal
          company={mockCompany}
          parties={[mockParty]}
          itemsCatalog={[mockItem]}
          initialInvoice={initialInv}
          onClose={vi.fn()}
          onSave={onSave}
        />
      );
    });

    // Click "Pay & Save"
    const payAndSaveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Pay & Save')
    );
    expect(payAndSaveBtn).toBeTruthy();

    act(() => {
      payAndSaveBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Payment Settlement modal is now open!
    expect(container.textContent).toContain('Payment Settlement');
    expect(container.textContent).toContain('Payment Tender Breakdown');

    // Inside Payment Modal, click "+ Add Tender"
    const addTenderBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('+ Add Tender')
    );
    expect(addTenderBtn).toBeTruthy();
    act(() => {
      addTenderBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Click "Confirm & Save"
    const confirmAndSaveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirm & Save')
    );
    expect(confirmAndSaveBtn).toBeTruthy();

    act(() => {
      confirmAndSaveBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSave).toHaveBeenCalled();
    expect(savedInvoice).not.toBeNull();
  });

  it('TC-MODAL-01: InvoicePaymentModal handles quick 1-tap tenders, partial splits, and custom notes', () => {
    const onConfirmPayment = vi.fn();
    const onClose = vi.fn();

    act(() => {
      root.render(
        <InvoicePaymentModal
          isOpen={true}
          onClose={onClose}
          finalGrandTotal={2000}
          invoiceNumber="INV-100"
          partyName="Rahul Sharma"
          onConfirmPayment={onConfirmPayment}
        />
      );
    });

    expect(container.textContent).toContain('Payment Settlement');
    expect(container.textContent).toContain('₹ 2,000.00');

    // 1-tap UPI tender
    const upiChip = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('UPI')
    );
    expect(upiChip).toBeTruthy();
    act(() => {
      upiChip?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    function changeInput(input: HTMLInputElement, val: string) {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      nativeSetter?.call(input, val);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Enter custom reference note
    const notesInput = container.querySelector('input[placeholder*="UPI Ref #"]') as HTMLInputElement;
    expect(notesInput).toBeTruthy();
    act(() => {
      changeInput(notesInput, 'UPI-TXN-998877');
    });

    // Click Confirm & Save
    const confirmBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirm & Save')
    );
    act(() => {
      confirmBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onConfirmPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMode: 'UPI',
        paymentStatus: 'PAID',
        paidAmount: 2000,
        balanceAmount: 0,
        paymentNotes: expect.stringContaining('UPI-TXN-998877'),
      }),
      false
    );
  });

  it('TC-MODAL-02: does not render instant cash denomination helpers on invoice modal and caps saved cash to bill amount when change is given', () => {
    const onConfirmPayment = vi.fn();
    const onClose = vi.fn();

    act(() => {
      root.render(
        <InvoicePaymentModal
          isOpen={true}
          onClose={onClose}
          finalGrandTotal={420}
          invoiceNumber="INV-420"
          partyName="Cash Customer"
          onConfirmPayment={onConfirmPayment}
        />
      );
    });

    // Verify instant cash denomination helper chips are NOT rendered
    const exactBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Exact (')
    );
    expect(exactBtn).toBeUndefined();

    const note500Btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === '₹500' || b.textContent?.trim() === '₹ 500'
    );
    expect(note500Btn).toBeUndefined();

    function changeInput(input: HTMLInputElement, val: string) {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      nativeSetter?.call(input, val);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Cashier enters 500 for a 420 bill
    const amountInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    expect(amountInput).toBeTruthy();
    act(() => {
      changeInput(amountInput, '500');
    });

    // Shows change calculation on screen (500 - 420 = 80)
    expect(container.textContent).toContain('Change to Return');
    expect(container.textContent).toContain('₹ 80.00');

    // Click Confirm & Save
    const confirmBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirm & Save')
    );
    act(() => {
      confirmBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Must save paidAmount = 420 (NOT 500!) and saved split cash amount = 420 (NOT 500!)
    // so total cash balance in ledger is never higher than expected
    expect(onConfirmPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMode: 'CASH',
        paymentStatus: 'PAID',
        paidAmount: 420,
        balanceAmount: 0,
        paymentSplits: expect.arrayContaining([
          expect.objectContaining({
            mode: 'CASH',
            amount: 420,
          }),
        ]),
        paymentNotes: expect.stringContaining('Change Returned: ₹ 80.00'),
      }),
      false
    );
  });
});
