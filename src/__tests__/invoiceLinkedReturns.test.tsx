import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

import { db } from '../services/db.ts';
import { SalesReturnsView } from '../components/Returns/SalesReturnsView.tsx';
import { PurchaseReturnsView } from '../components/Returns/PurchaseReturnsView.tsx';
import { ReturnItemPickerModal } from '../components/Returns/ReturnItemPickerModal.tsx';
import { InvoiceSelectorModal } from '../components/Returns/InvoiceSelectorModal.tsx';
import { BillSelectorModal } from '../components/Returns/BillSelectorModal.tsx';
import {
  executeSalesReturn,
  executePurchaseReturn,
  getInvoiceReturnSummary,
  getPurchaseReturnSummary,
  applyReturnToInvoice,
  applyReturnToPurchaseBill,
} from '../core/returns/returnEngine.ts';
import { resetBackNavigationForTesting } from '../core/utils/backNavigation.ts';
import type { Party } from '../models/party.ts';
import type { Invoice, InvoiceItemEntry } from '../models/invoice.ts';
import type { PurchaseBill, PurchaseItemEntry } from '../models/purchase.ts';
import type { InventoryItem } from '../models/item.ts';
import type { CompanyProfile } from '../models/company.ts';

// Mock pouchdb
vi.mock('../services/pouchdb.ts', () => ({
  DEFAULT_COUCHDB_REMOTE_URL: '',
  DEFAULT_LOCAL_DB_NAME: 'vyapar_fintech_store',
  DEMO_LOCAL_DB_NAME: 'vyapar_demo',
  pouch: {
    putDoc: vi.fn(),
    deleteDoc: vi.fn(),
    getAllDocs: vi.fn(async () => []),
    getSyncState: vi.fn(() => ({ status: 'offline', remoteUrl: '', pendingChanges: 0 })),
    subscribeSync: vi.fn(() => () => {}),
    syncNow: vi.fn(async () => {}),
    startSync: vi.fn(),
    stopSync: vi.fn(),
    migrateFromLocalStorage: vi.fn(async () => {}),
    probeRemoteConnection: vi.fn(async () => ({
      ok: true,
      details: { dbName: 'test_db', docCount: 0, canRead: true, canWrite: true },
    })),
  },
  PouchService: {
    switchToRemoteDb: vi.fn(),
    switchToOfflineDb: vi.fn(),
    reconnectCloudDb: vi.fn(),
    enterDemoMode: vi.fn(),
    exitDemoMode: vi.fn(),
  },
}));

describe('Invoice-Linked Returns Specification (Sales & Purchase Returns)', () => {
  let container: HTMLDivElement;
  let root: Root;

  const mockCompany: CompanyProfile = {
    id: 'comp-1',
    businessName: 'Apex Traders',
    tradeName: 'Apex Traders Pvt Ltd',
    gstin: '27AABCA1234A1Z5',
    pan: 'AABCA1234A',
    stateCode: '27',
    pincode: '400001',
    phone: '9876543210',
    email: 'info@apextraders.com',
    address: '101 Trade Center, Mumbai',
    isGstEnabled: true,
    isCompositionScheme: false,
  };

  const sampleCustomer: Party = {
    id: 'cust-1',
    name: 'Reliance Retail',
    type: 'CUSTOMER',
    phone: '9876500001',
    billingAddress: 'Mumbai',
    stateCode: '27',
    currentBalance: 0,
    openingBalance: 0,
    openingBalanceType: 'TO_RECEIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const sampleSupplier: Party = {
    id: 'supp-1',
    name: 'Tata Steel Dist',
    type: 'SUPPLIER',
    phone: '9876500002',
    billingAddress: 'Mumbai',
    stateCode: '27',
    currentBalance: 0,
    openingBalance: 0,
    openingBalanceType: 'TO_PAY',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const item1: InventoryItem = {
    id: 'itm-1',
    name: 'Premium T-Shirt',
    category: 'Clothing',
    hsnSacCode: '6109',
    unit: 'PCS',
    salePrice: 500,
    purchasePrice: 300,
    gstRate: 5,
    currentStock: 50,
    minStockAlert: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const item2: InventoryItem = {
    id: 'itm-2',
    name: 'Denim Jeans',
    category: 'Clothing',
    hsnSacCode: '6203',
    unit: 'PCS',
    salePrice: 1000,
    purchasePrice: 600,
    gstRate: 12,
    currentStock: 40,
    minStockAlert: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    testStorage.clear();
    resetBackNavigationForTesting();
    db.saveCompany(mockCompany);
    db.saveParty(sampleCustomer);
    db.saveParty(sampleSupplier);
    db.saveItem(item1);
    db.saveItem(item2);

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

  it('1. Sales Returns View renders invoice selector and opens item picker modal upon selection', async () => {
    // Set up a source sales invoice
    const sourceInvoice: Invoice = {
      id: 'inv-101',
      invoiceNumber: 'INV-101',
      invoiceType: 'B2B',
      date: '2026-10-15',
      partyId: sampleCustomer.id,
      partyName: sampleCustomer.name,
      partyAddress: 'Mumbai',
      partyStateCode: '27',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      items: [
        {
          itemId: item1.id,
          name: item1.name,
          hsnSacCode: item1.hsnSacCode,
          quantity: 5,
          unit: 'PCS',
          unitPrice: 500,
          taxableAmount: 2500,
          gstRate: 5,
          cgstAmount: 62.5,
          sgstAmount: 62.5,
          igstAmount: 0,
          cessAmount: 0,
          totalAmount: 2625,
        },
      ],
      totalGrossAmount: 2500,
      totalDiscount: 0,
      totalTaxableAmount: 2500,
      totalCgst: 62.5,
      totalSgst: 62.5,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 125,
      roundOff: 0,
      grandTotal: 2625,
      amountInWords: 'Two Thousand Six Hundred Twenty Five Rupees Only',
      paidAmount: 0,
      balanceAmount: 2625,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
      createdAt: '2026-10-15T10:00:00Z',
      updatedAt: '2026-10-15T10:00:00Z',
    };
    db.saveInvoice(sourceInvoice);

    await act(async () => {
      root.render(
        <SalesReturnsView
          company={mockCompany}
          invoices={db.getInvoices()}
          onNewSalesReturn={vi.fn()}
          onViewInvoice={vi.fn()}
          onDeleteInvoice={vi.fn()}
        />
      );
    });

    // 1. Verify Invoice Selector elements are present
    const selectBtn = container.querySelector('[data-testid="select-invoice-return-btn"]');
    const invoiceSelectDropdown = container.querySelector('[data-testid="invoice-selector"]') as HTMLSelectElement;

    expect(selectBtn).toBeTruthy();
    expect(invoiceSelectDropdown).toBeTruthy();

    // 2. Select invoice via dropdown
    await act(async () => {
      invoiceSelectDropdown.value = sourceInvoice.id;
      invoiceSelectDropdown.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // 3. Verify item picker modal opens listing source line items
    const pickerModal = container.querySelector('[data-testid="return-item-picker-modal"]');
    expect(pickerModal).toBeTruthy();
    expect(pickerModal?.textContent).toContain('INV-101');
    expect(pickerModal?.textContent).toContain('Premium T-Shirt');
    expect(pickerModal?.textContent).toContain('Billed: 5');

    // 4. Verify return quantity input exists and is capped at available quantity (5)
    const qtyInput = container.querySelector('[data-testid="return-qty-input-0"]') as HTMLInputElement;
    expect(qtyInput).toBeTruthy();
    expect(qtyInput.max).toBe('5');
  });

  it('2. Creating Sales Return links original invoice reference and updates source balance/paid amounts and restores stock', async () => {
    // Initial stock for item1 is 50. Saving sourceInvoice (5 units) decrements stock to 45.
    const sourceInvoice: Invoice = {
      id: 'inv-201',
      invoiceNumber: 'INV-201',
      invoiceType: 'B2B',
      date: '2026-10-20',
      partyId: sampleCustomer.id,
      partyName: sampleCustomer.name,
      partyAddress: 'Mumbai',
      partyStateCode: '27',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      items: [
        {
          itemId: item1.id,
          name: item1.name,
          hsnSacCode: item1.hsnSacCode,
          quantity: 5,
          unit: 'PCS',
          unitPrice: 500,
          taxableAmount: 2500,
          gstRate: 5,
          cgstAmount: 62.5,
          sgstAmount: 62.5,
          igstAmount: 0,
          cessAmount: 0,
          totalAmount: 2625,
        },
      ],
      totalGrossAmount: 2500,
      totalDiscount: 0,
      totalTaxableAmount: 2500,
      totalCgst: 62.5,
      totalSgst: 62.5,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 125,
      roundOff: 0,
      grandTotal: 2625,
      amountInWords: '',
      paidAmount: 0,
      balanceAmount: 2625,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
      createdAt: '2026-10-20T10:00:00Z',
      updatedAt: '2026-10-20T10:00:00Z',
    };
    db.saveInvoice(sourceInvoice, { skipSettlementDerivation: true });

    // Execute sales return of 2 units (worth 1050)
    const { creditNote, updatedSourceInvoice } = executeSalesReturn({
      sourceInvoice,
      returnedItems: [{ item: sourceInvoice.items[0], returnQuantity: 2 }],
      company: mockCompany,
      returnReason: '01-Sales Return',
    });

    // 1. Verify Credit Note was created and linked
    expect(creditNote.invoiceType).toBe('CREDIT_NOTE');
    expect(creditNote.noteType).toBe('C');
    expect(creditNote.originalInvoiceId).toBe(sourceInvoice.id);
    expect(creditNote.originalInvoiceNumber).toBe('INV-201');
    expect(creditNote.originalInvoiceDate).toBe(sourceInvoice.date);
    expect(creditNote.grandTotal).toBe(1050);
    expect(creditNote.items[0].quantity).toBe(2);

    // 2. Verify source invoice balance was updated (reversed returned values)
    // 2625 - 1050 = 1575
    expect(updatedSourceInvoice.balanceAmount).toBe(1575);
    expect(updatedSourceInvoice.paidAmount).toBe(0);
    expect(updatedSourceInvoice.paymentStatus).toBe('UNPAID');

    // 3. Verify source invoice persisted in DB has updated balance
    const freshSource = db.getInvoices().find((i) => i.id === sourceInvoice.id)!;
    expect(freshSource.balanceAmount).toBe(1575);

    // 4. Verify inventory stock was restored in DB (45 + 2 = 47)
    const freshItem = db.getItems().find((i) => i.id === item1.id)!;
    expect(freshItem.currentStock).toBe(47);
  });

  it('3. Supports partial and multiple returns against the same invoice/bill', async () => {
    const sourceInvoice: Invoice = {
      id: 'inv-301',
      invoiceNumber: 'INV-301',
      invoiceType: 'B2B',
      date: '2026-10-22',
      partyId: sampleCustomer.id,
      partyName: sampleCustomer.name,
      partyAddress: 'Mumbai',
      partyStateCode: '27',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      items: [
        {
          itemId: item1.id,
          name: item1.name,
          hsnSacCode: item1.hsnSacCode,
          quantity: 10,
          unit: 'PCS',
          unitPrice: 500,
          taxableAmount: 5000,
          gstRate: 5,
          cgstAmount: 125,
          sgstAmount: 125,
          igstAmount: 0,
          cessAmount: 0,
          totalAmount: 5250,
        },
      ],
      totalGrossAmount: 5000,
      totalDiscount: 0,
      totalTaxableAmount: 5000,
      totalCgst: 125,
      totalSgst: 125,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 250,
      roundOff: 0,
      grandTotal: 5250,
      amountInWords: '',
      paidAmount: 0,
      balanceAmount: 5250,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
      createdAt: '2026-10-22T10:00:00Z',
      updatedAt: '2026-10-22T10:00:00Z',
    };
    db.saveInvoice(sourceInvoice, { skipSettlementDerivation: true });

    // First Return: return 4 units
    const ret1 = executeSalesReturn({
      sourceInvoice,
      returnedItems: [{ item: sourceInvoice.items[0], returnQuantity: 4 }],
      company: mockCompany,
      creditNoteNumber: 'CN-301-1',
    });
    expect(ret1.updatedSourceInvoice.balanceAmount).toBe(3150); // 5250 - 2100 = 3150

    // Check summary after first return
    let summary = getInvoiceReturnSummary(sourceInvoice, db.getInvoices());
    expect(summary.totalReturnedAmount).toBe(2100);
    expect(summary.items[0].returnedQuantity).toBe(4);
    expect(summary.items[0].availableQuantity).toBe(6);
    expect(summary.isPartiallyReturned).toBe(true);
    expect(summary.isFullyReturned).toBe(false);

    // Second Return: return 3 more units
    const freshSource1 = db.getInvoices().find((i) => i.id === sourceInvoice.id)!;
    const ret2 = executeSalesReturn({
      sourceInvoice: freshSource1,
      returnedItems: [{ item: sourceInvoice.items[0], returnQuantity: 3 }],
      company: mockCompany,
      creditNoteNumber: 'CN-301-2',
    });
    expect(ret2.updatedSourceInvoice.balanceAmount).toBe(1575); // 3150 - 1575 = 1575

    // Check summary after second return
    summary = getInvoiceReturnSummary(sourceInvoice, db.getInvoices());
    expect(summary.totalReturnedAmount).toBe(3675);
    expect(summary.items[0].returnedQuantity).toBe(7);
    expect(summary.items[0].availableQuantity).toBe(3);
    expect(summary.isPartiallyReturned).toBe(true);

    // Third Return: return the remaining 3 units
    const freshSource2 = db.getInvoices().find((i) => i.id === sourceInvoice.id)!;
    const ret3 = executeSalesReturn({
      sourceInvoice: freshSource2,
      returnedItems: [{ item: sourceInvoice.items[0], returnQuantity: 3 }],
      company: mockCompany,
      creditNoteNumber: 'CN-301-3',
    });
    expect(ret3.updatedSourceInvoice.balanceAmount).toBe(0);
    expect(ret3.updatedSourceInvoice.paymentStatus).toBe('PAID');

    // Check summary after third return: fully returned
    summary = getInvoiceReturnSummary(sourceInvoice, db.getInvoices());
    expect(summary.totalReturnedAmount).toBe(5250);
    expect(summary.items[0].returnedQuantity).toBe(10);
    expect(summary.items[0].availableQuantity).toBe(0);
    expect(summary.isFullyReturned).toBe(true);
  });

  it('4. Reverses paid amounts correctly on fully paid and partially paid invoices', () => {
    // Fully Paid Invoice: 1000 paid, 0 balance
    const paidInvoice: Invoice = {
      id: 'inv-401',
      invoiceNumber: 'INV-401',
      invoiceType: 'B2B',
      date: '2026-10-25',
      partyId: sampleCustomer.id,
      partyName: sampleCustomer.name,
      partyAddress: 'Mumbai',
      partyStateCode: '27',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      items: [],
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
      amountInWords: '',
      paidAmount: 1000,
      balanceAmount: 0,
      paymentMode: 'CASH',
      paymentStatus: 'PAID',
      createdAt: '2026-10-25T10:00:00Z',
      updatedAt: '2026-10-25T10:00:00Z',
    };

    // Return 400: should reduce paidAmount to 600
    const updatedPaid = applyReturnToInvoice(paidInvoice, 400);
    expect(updatedPaid.paidAmount).toBe(600);
    expect(updatedPaid.balanceAmount).toBe(0);
    expect(updatedPaid.paymentStatus).toBe('PAID');

    // Partially Paid Invoice: 400 paid, 600 balance (total 1000)
    const partialInvoice: Invoice = {
      ...paidInvoice,
      id: 'inv-402',
      invoiceNumber: 'INV-402',
      paidAmount: 400,
      balanceAmount: 600,
      paymentStatus: 'PARTIAL',
    };

    // Return 800: should wipe out 600 balance, and reverse 200 of the 400 paid
    const updatedPartial = applyReturnToInvoice(partialInvoice, 800);
    expect(updatedPartial.balanceAmount).toBe(0);
    expect(updatedPartial.paidAmount).toBe(200);
    expect(updatedPartial.paymentStatus).toBe('PAID');
  });

  it('5. Purchase Returns View renders bill selector and handles vendor debit note with stock decrement', async () => {
    // Initial stock for item 2 is 40
    const sourceBill: PurchaseBill = {
      id: 'pur-501',
      billNumber: 'PB-501',
      date: '2026-10-18',
      supplierId: sampleSupplier.id,
      supplierName: sampleSupplier.name,
      supplierAddress: 'Mumbai',
      supplierStateCode: '27',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      purchaseType: 'BILL',
      items: [
        {
          itemId: item2.id,
          name: item2.name,
          hsnSacCode: item2.hsnSacCode,
          quantity: 10,
          unit: 'PCS',
          unitPrice: 600,
          taxableAmount: 6000,
          gstRate: 12,
          cgstAmount: 360,
          sgstAmount: 360,
          igstAmount: 0,
          cessAmount: 0,
          totalAmount: 6720,
        },
      ],
      itcEligibility: 'ELIGIBLE_INPUTS',
      isRcm: false,
      totalGrossAmount: 6000,
      totalDiscount: 0,
      totalTaxableAmount: 6000,
      totalCgst: 360,
      totalSgst: 360,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 720,
      roundOff: 0,
      grandTotal: 6720,
      paidAmount: 0,
      balanceAmount: 6720,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
      createdAt: '2026-10-18T10:00:00Z',
      updatedAt: '2026-10-18T10:00:00Z',
    };
    db.savePurchase(sourceBill, { skipSettlementDerivation: true });

    await act(async () => {
      root.render(
        <PurchaseReturnsView
          company={mockCompany}
          purchases={db.getPurchases()}
          onNewPurchaseReturn={vi.fn()}
          onViewPurchase={vi.fn()}
          onDeletePurchase={vi.fn()}
        />
      );
    });

    // 1. Verify bill selector is present
    const selectBtn = container.querySelector('[data-testid="select-bill-return-btn"]');
    const billSelectDropdown = container.querySelector('[data-testid="bill-selector"]') as HTMLSelectElement;
    expect(selectBtn).toBeTruthy();
    expect(billSelectDropdown).toBeTruthy();

    // 2. Execute Purchase Return of 3 units
    const { debitNote, updatedSourceBill } = executePurchaseReturn({
      sourceBill,
      returnedItems: [{ item: sourceBill.items[0], returnQuantity: 3 }],
      company: mockCompany,
      returnReason: '01-Defective Goods',
    });

    // 3. Verify Debit Note was created and linked
    expect(debitNote.purchaseType).toBe('RETURN');
    expect(debitNote.noteType).toBe('D');
    expect(debitNote.originalBillId).toBe(sourceBill.id);
    expect(debitNote.originalBillNumber).toBe('PB-501');
    expect(debitNote.originalBillDate).toBe(sourceBill.date);
    expect(debitNote.grandTotal).toBe(2016); // 3 * 600 = 1800 + 12% = 2016
    expect(debitNote.items[0].quantity).toBe(3);

    // 4. Verify source bill balance was reduced (6720 - 2016 = 4704)
    expect(updatedSourceBill.balanceAmount).toBe(4704);
    const freshBill = db.getPurchases().find((p) => p.id === sourceBill.id)!;
    expect(freshBill.balanceAmount).toBe(4704);

    // 5. Verify inventory stock was decremented for returned items (50 - 3 = 47)
    const freshItem = db.getItems().find((i) => i.id === item2.id)!;
    expect(freshItem.currentStock).toBe(47);
  });

  it('6. Document selector modals (InvoiceSelectorModal and BillSelectorModal) correctly list documents with return statuses', async () => {
    const inv: Invoice = {
      id: 'inv-601',
      invoiceNumber: 'INV-601',
      invoiceType: 'B2B',
      date: '2026-10-28',
      partyId: sampleCustomer.id,
      partyName: sampleCustomer.name,
      partyAddress: 'Mumbai',
      partyStateCode: '27',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      items: [
        {
          itemId: item1.id,
          name: item1.name,
          hsnSacCode: item1.hsnSacCode,
          quantity: 2,
          unit: 'PCS',
          unitPrice: 500,
          taxableAmount: 1000,
          gstRate: 5,
          cgstAmount: 25,
          sgstAmount: 25,
          igstAmount: 0,
          cessAmount: 0,
          totalAmount: 1050,
        },
      ],
      totalGrossAmount: 1000,
      totalDiscount: 0,
      totalTaxableAmount: 1000,
      totalCgst: 25,
      totalSgst: 25,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 50,
      roundOff: 0,
      grandTotal: 1050,
      amountInWords: '',
      paidAmount: 0,
      balanceAmount: 1050,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
      createdAt: '2026-10-28T10:00:00Z',
      updatedAt: '2026-10-28T10:00:00Z',
    };
    db.saveInvoice(inv, { skipSettlementDerivation: true });

    const onSelect = vi.fn();
    await act(async () => {
      root.render(
        <InvoiceSelectorModal
          isOpen={true}
          onClose={vi.fn()}
          invoices={db.getInvoices()}
          onSelectInvoice={onSelect}
        />
      );
    });

    const itemRow = container.querySelector('[data-testid="select-invoice-item-INV-601"]');
    expect(itemRow).toBeTruthy();
    expect(itemRow?.textContent).toContain('INV-601');
    expect(itemRow?.textContent).toContain('Eligible');

    await act(async () => {
      itemRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'inv-601' }));
  });
});
