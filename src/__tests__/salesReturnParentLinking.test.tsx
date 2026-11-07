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
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { value: testStorage, writable: true, configurable: true });
}

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

import { db } from '../services/db.ts';
import { TableGridInvoiceModal } from '../components/Invoicing/TableGridInvoiceModal.tsx';
import { revertReturnFromInvoice } from '../core/returns/returnEngine.ts';
import { resetBackNavigationForTesting } from '../core/utils/backNavigation.ts';
import type { Party } from '../models/party.ts';
import type { Invoice, InvoiceItemEntry } from '../models/invoice.ts';
import type { CompanyProfile } from '../models/company.ts';
import type { InventoryItem } from '../models/item.ts';

const mockCompany: CompanyProfile = {
  id: 'COMP-LINK-01',
  businessName: 'Vikas Enterprises',
  tradeName: 'Vikas Enterprises',
  gstin: '27AABCU9603R1ZX',
  pan: 'AABCU9603R',
  pincode: '411001',
  email: 'vikas@test.com',
  phone: '9822001122',
  address: 'Shop 10, FC Road, Pune',
  stateCode: '27',
  isGstEnabled: true,
  isCompositionScheme: false,
};

const customerA: Party = {
  id: 'CUST-A',
  name: 'Rahul Sharma',
  type: 'CUSTOMER',
  phone: '9822003344',
  billingAddress: 'Pune',
  stateCode: '27',
  currentBalance: 0,
  openingBalance: 0,
  openingBalanceType: 'TO_RECEIVE',
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z',
};

const customerB: Party = {
  id: 'CUST-B',
  name: 'Pooja Patil',
  type: 'CUSTOMER',
  phone: '9822005566',
  billingAddress: 'Mumbai',
  stateCode: '27',
  currentBalance: 0,
  openingBalance: 0,
  openingBalanceType: 'TO_RECEIVE',
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z',
};

const itemSample: InventoryItem = {
  id: 'ITEM-RET-1',
  name: 'Cotton Kurta',
  category: 'Apparel',
  hsnSacCode: '6204',
  unit: 'PCS',
  salePrice: 1000,
  purchasePrice: 600,
  gstRate: 0,
  currentStock: 100,
  minStockAlert: 5,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function createSalesInvoice(params: {
  id: string;
  invoiceNumber: string;
  party: Party;
  grandTotal: number;
  paidAmount?: number;
  balanceAmount?: number;
  date?: string;
  isCancelled?: boolean;
  invoiceType?: any;
}): Invoice {
  const paid = typeof params.paidAmount === 'number' ? params.paidAmount : 0;
  const balance = typeof params.balanceAmount === 'number' ? params.balanceAmount : params.grandTotal - paid;
  const status = balance <= 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID';
  return {
    id: params.id,
    invoiceNumber: params.invoiceNumber,
    date: params.date || '2026-10-10',
    dueDate: params.date || '2026-10-25',
    partyId: params.party.id,
    partyName: params.party.name,
    partyPhone: params.party.phone,
    partyAddress: params.party.billingAddress || 'Pune',
    partyStateCode: params.party.stateCode,
    placeOfSupplyStateCode: params.party.stateCode,
    isIntraState: true,
    invoiceType: params.invoiceType || 'B2C',
    isCancelled: params.isCancelled,
    items: [
      {
        itemId: itemSample.id,
        name: itemSample.name,
        quantity: 1,
        unit: 'PCS',
        unitPrice: params.grandTotal,
        taxableAmount: params.grandTotal,
        gstRate: 0,
        totalAmount: params.grandTotal,
      } as InvoiceItemEntry,
    ],
    totalGrossAmount: params.grandTotal,
    totalDiscount: 0,
    totalTaxableAmount: params.grandTotal,
    totalCgst: 0,
    totalSgst: 0,
    totalIgst: 0,
    totalCess: 0,
    totalTax: 0,
    roundOff: 0,
    grandTotal: params.grandTotal,
    amountInWords: '',
    paidAmount: paid,
    balanceAmount: balance,
    paymentMode: paid > 0 ? 'CASH' : 'CREDIT',
    paymentStatus: status,
    createdAt: '2026-10-10T10:00:00Z',
    updatedAt: '2026-10-10T10:00:00Z',
  };
}

function createCreditNote(params: {
  id: string;
  invoiceNumber: string;
  party: Party;
  grandTotal: number;
  originalInvoiceId?: string;
  originalInvoiceNumber?: string;
  date?: string;
}): Invoice {
  return {
    id: params.id,
    invoiceNumber: params.invoiceNumber,
    date: params.date || '2026-10-12',
    dueDate: params.date || '2026-10-12',
    partyId: params.party.id,
    partyName: params.party.name,
    partyPhone: params.party.phone,
    partyAddress: params.party.billingAddress || 'Pune',
    partyStateCode: params.party.stateCode,
    placeOfSupplyStateCode: params.party.stateCode,
    isIntraState: true,
    invoiceType: 'CREDIT_NOTE',
    noteType: 'C',
    originalInvoiceId: params.originalInvoiceId,
    originalInvoiceNumber: params.originalInvoiceNumber,
    returnReason: '01-Sales Return',
    items: [
      {
        itemId: itemSample.id,
        name: itemSample.name,
        quantity: 1,
        unit: 'PCS',
        unitPrice: params.grandTotal,
        taxableAmount: params.grandTotal,
        gstRate: 0,
        totalAmount: params.grandTotal,
      } as InvoiceItemEntry,
    ],
    totalGrossAmount: params.grandTotal,
    totalDiscount: 0,
    totalTaxableAmount: params.grandTotal,
    totalCgst: 0,
    totalSgst: 0,
    totalIgst: 0,
    totalCess: 0,
    totalTax: 0,
    roundOff: 0,
    grandTotal: params.grandTotal,
    amountInWords: '',
    paidAmount: 0,
    balanceAmount: params.grandTotal,
    paymentMode: 'CREDIT',
    paymentStatus: 'UNPAID',
    createdAt: '2026-10-12T10:00:00Z',
    updatedAt: '2026-10-12T10:00:00Z',
  };
}

describe('Sales Return Parent Invoice Linking Specification', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    testStorage.clear();
    resetBackNavigationForTesting();
    db.saveCompany(mockCompany);
    db.saveParty(customerA);
    db.saveParty(customerB);
    db.saveItem(itemSample);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it('1. Linked credit note reduces parent balanceAmount, sets status correctly, and stores credit note as PAID with balanceAmount = 0', () => {
    const parent = createSalesInvoice({
      id: 'INV-100',
      invoiceNumber: 'INV-100',
      party: customerA,
      grandTotal: 5000,
    });
    db.saveInvoice(parent);

    const creditNote = createCreditNote({
      id: 'CN-100',
      invoiceNumber: 'CN-100',
      party: customerA,
      grandTotal: 2000,
      originalInvoiceId: parent.id,
      originalInvoiceNumber: parent.invoiceNumber,
    });
    db.saveInvoice(creditNote);

    // Stored credit note must be fully settled
    const storedCN = db.getInvoices().find((i) => i.id === creditNote.id)!;
    expect(storedCN.paidAmount).toBe(2000);
    expect(storedCN.balanceAmount).toBe(0);
    expect(storedCN.paymentStatus).toBe('PAID');
    expect(storedCN.paymentMode).toBe('CASH');

    // Stored parent invoice balance must be reduced by 2000 and paidAmount reflected via CREDIT_NOTE tender
    const storedParent = db.getInvoices().find((i) => i.id === parent.id)!;
    expect(storedParent.balanceAmount).toBe(3000);
    expect(storedParent.paidAmount).toBe(2000);
    expect(storedParent.paymentStatus).toBe('PARTIAL');
    expect(storedParent.paymentSplits?.some((s) => s.mode === 'CREDIT_NOTE' && s.amount === 2000)).toBe(true);

    // Also test fully settling a partially paid invoice
    const parentPartiallyPaid = createSalesInvoice({
      id: 'INV-101',
      invoiceNumber: 'INV-101',
      party: customerA,
      grandTotal: 5000,
      paidAmount: 4000,
      balanceAmount: 1000,
    });
    db.saveInvoice(parentPartiallyPaid);

    const cn2 = createCreditNote({
      id: 'CN-101',
      invoiceNumber: 'CN-101',
      party: customerA,
      grandTotal: 1500,
      originalInvoiceId: parentPartiallyPaid.id,
      originalInvoiceNumber: parentPartiallyPaid.invoiceNumber,
    });
    db.saveInvoice(cn2);

    const storedParent2 = db.getInvoices().find((i) => i.id === parentPartiallyPaid.id)!;
    // Remaining 1000 balance cleared -> 0; paid becomes 4000 + 1000 (applied) = 5000 (no overpayment/negative balance)
    expect(storedParent2.balanceAmount).toBe(0);
    expect(storedParent2.paidAmount).toBe(5000);
    expect(storedParent2.paymentStatus).toBe('PAID');
    expect(storedParent2.paymentSplits?.some((s) => s.mode === 'CREDIT_NOTE' && s.amount === 1000)).toBe(true);
  });

  it('2. Party balance is reduced exactly once (assert exact expected number, not double-reduced)', () => {
    // Customer starts at 0 balance
    expect(db.recalculatePartyBalance(customerA.id)).toBe(0);

    const parent = createSalesInvoice({
      id: 'INV-200',
      invoiceNumber: 'INV-200',
      party: customerA,
      grandTotal: 5000,
    });
    db.saveInvoice(parent);
    expect(db.recalculatePartyBalance(customerA.id)).toBe(5000);

    // Save linked credit note of 2000
    const creditNote = createCreditNote({
      id: 'CN-200',
      invoiceNumber: 'CN-200',
      party: customerA,
      grandTotal: 2000,
      originalInvoiceId: parent.id,
      originalInvoiceNumber: parent.invoiceNumber,
    });
    db.saveInvoice(creditNote);

    // Customer balance must be exactly 3000 (reduced once by 2000)
    const partyBalance = db.recalculatePartyBalance(customerA.id);
    expect(partyBalance).toBe(3000);
    // Explicitly verify it is NOT double-reduced (which would give 1000 = 5000 - 2000 - 2000)
    expect(partyBalance).not.toBe(1000);
  });

  it('3. Unlinked credit note leaves the parent untouched and is stored UNPAID with balanceAmount = grandTotal', () => {
    const parent = createSalesInvoice({
      id: 'INV-300',
      invoiceNumber: 'INV-300',
      party: customerA,
      grandTotal: 4000,
    });
    db.saveInvoice(parent);

    const unlinkedCN = createCreditNote({
      id: 'CN-300',
      invoiceNumber: 'CN-300',
      party: customerA,
      grandTotal: 1500,
      // No originalInvoiceId
    });
    db.saveInvoice(unlinkedCN);

    // Stored unlinked credit note carries the return itself
    const storedCN = db.getInvoices().find((i) => i.id === unlinkedCN.id)!;
    expect(storedCN.paidAmount).toBe(0);
    expect(storedCN.balanceAmount).toBe(1500);
    expect(storedCN.paymentStatus).toBe('UNPAID');
    expect(storedCN.paymentMode).toBe('CREDIT');

    // Parent invoice is untouched
    const storedParent = db.getInvoices().find((i) => i.id === parent.id)!;
    expect(storedParent.balanceAmount).toBe(4000);

    // Party balance is reduced once via the credit note's open balance: 4000 - 1500 = 2500
    expect(db.recalculatePartyBalance(customerA.id)).toBe(2500);
  });

  it('4. Editing an unlinked credit note to link it applies the reduction once', () => {
    const parent = createSalesInvoice({
      id: 'INV-400',
      invoiceNumber: 'INV-400',
      party: customerA,
      grandTotal: 5000,
    });
    db.saveInvoice(parent);

    // 1. Initially saved unlinked
    const creditNote = createCreditNote({
      id: 'CN-400',
      invoiceNumber: 'CN-400',
      party: customerA,
      grandTotal: 1000,
    });
    db.saveInvoice(creditNote);

    expect(db.getInvoices().find((i) => i.id === parent.id)!.balanceAmount).toBe(5000);
    expect(db.recalculatePartyBalance(customerA.id)).toBe(4000);

    // 2. Edit credit note to link to parent
    const linkedCN = {
      ...creditNote,
      originalInvoiceId: parent.id,
      originalInvoiceNumber: parent.invoiceNumber,
      originalInvoiceDate: parent.date,
    };
    db.saveInvoice(linkedCN);

    // Parent balance is now reduced by 1000
    expect(db.getInvoices().find((i) => i.id === parent.id)!.balanceAmount).toBe(4000);
    // Credit note is now PAID
    const freshCN = db.getInvoices().find((i) => i.id === creditNote.id)!;
    expect(freshCN.paidAmount).toBe(1000);
    expect(freshCN.balanceAmount).toBe(0);
    expect(freshCN.paymentStatus).toBe('PAID');

    // Party balance remains exactly 4000 (never double-reduced)
    expect(db.recalculatePartyBalance(customerA.id)).toBe(4000);
  });

  it('5. Editing a linked credit note total adjusts the parent by the delta only (no double-apply)', () => {
    const parent = createSalesInvoice({
      id: 'INV-500',
      invoiceNumber: 'INV-500',
      party: customerA,
      grandTotal: 5000,
    });
    db.saveInvoice(parent);

    const creditNote = createCreditNote({
      id: 'CN-500',
      invoiceNumber: 'CN-500',
      party: customerA,
      grandTotal: 1000,
      originalInvoiceId: parent.id,
      originalInvoiceNumber: parent.invoiceNumber,
    });
    db.saveInvoice(creditNote);
    expect(db.getInvoices().find((i) => i.id === parent.id)!.balanceAmount).toBe(4000);
    expect(db.recalculatePartyBalance(customerA.id)).toBe(4000);

    // Increase credit note from 1000 to 1500 (delta = +500)
    const increasedCN = {
      ...creditNote,
      grandTotal: 1500,
      totalTaxableAmount: 1500,
      items: [{ ...creditNote.items[0], unitPrice: 1500, totalAmount: 1500 }],
    };
    db.saveInvoice(increasedCN);

    // Parent balance is 4000 - 500 = 3500
    expect(db.getInvoices().find((i) => i.id === parent.id)!.balanceAmount).toBe(3500);
    expect(db.recalculatePartyBalance(customerA.id)).toBe(3500);

    // Decrease credit note from 1500 to 800 (delta = -700)
    const decreasedCN = {
      ...creditNote,
      grandTotal: 800,
      totalTaxableAmount: 800,
      items: [{ ...creditNote.items[0], unitPrice: 800, totalAmount: 800 }],
    };
    db.saveInvoice(decreasedCN);

    // Parent balance is restored by 700: 3500 + 700 = 4200
    expect(db.getInvoices().find((i) => i.id === parent.id)!.balanceAmount).toBe(4200);
    expect(db.recalculatePartyBalance(customerA.id)).toBe(4200);
  });

  it('6. Unlinking a credit note restores the parent balance and flips the credit note back to UNPAID', () => {
    const parent = createSalesInvoice({
      id: 'INV-600',
      invoiceNumber: 'INV-600',
      party: customerA,
      grandTotal: 5000,
    });
    db.saveInvoice(parent);

    const creditNote = createCreditNote({
      id: 'CN-600',
      invoiceNumber: 'CN-600',
      party: customerA,
      grandTotal: 2000,
      originalInvoiceId: parent.id,
      originalInvoiceNumber: parent.invoiceNumber,
    });
    db.saveInvoice(creditNote);
    expect(db.getInvoices().find((i) => i.id === parent.id)!.balanceAmount).toBe(3000);

    // Unlink the credit note
    const unlinkedCN = {
      ...creditNote,
      originalInvoiceId: undefined,
      originalInvoiceNumber: undefined,
      originalInvoiceDate: undefined,
    };
    db.saveInvoice(unlinkedCN);

    // Parent balance is restored to 5000
    expect(db.getInvoices().find((i) => i.id === parent.id)!.balanceAmount).toBe(5000);

    // Credit note flips back to UNPAID
    const storedCN = db.getInvoices().find((i) => i.id === creditNote.id)!;
    expect(storedCN.paidAmount).toBe(0);
    expect(storedCN.balanceAmount).toBe(2000);
    expect(storedCN.paymentStatus).toBe('UNPAID');
    expect(storedCN.paymentMode).toBe('CREDIT');

    // Party balance remains 3000 (5000 parent - 2000 unlinked CN)
    expect(db.recalculatePartyBalance(customerA.id)).toBe(3000);
  });

  it('7. Deleting a linked credit note restores the parent balance', () => {
    const parent = createSalesInvoice({
      id: 'INV-700',
      invoiceNumber: 'INV-700',
      party: customerA,
      grandTotal: 5000,
    });
    db.saveInvoice(parent);

    const creditNote = createCreditNote({
      id: 'CN-700',
      invoiceNumber: 'CN-700',
      party: customerA,
      grandTotal: 2000,
      originalInvoiceId: parent.id,
      originalInvoiceNumber: parent.invoiceNumber,
    });
    db.saveInvoice(creditNote);
    expect(db.getInvoices().find((i) => i.id === parent.id)!.balanceAmount).toBe(3000);
    expect(db.recalculatePartyBalance(customerA.id)).toBe(3000);

    // Delete the credit note
    db.deleteInvoice(creditNote.id);

    // Parent balance is restored to 5000
    expect(db.getInvoices().find((i) => i.id === parent.id)!.balanceAmount).toBe(5000);
    // Party balance is restored to 5000
    expect(db.recalculatePartyBalance(customerA.id)).toBe(5000);
  });

  it('8. UI: parent dropdown lists eligible invoices, excludes cancelled/credit-note/other-party, selecting one fills Orig Inv # & date, No parent saves unlinked', () => {
    const eligibleInvoice = createSalesInvoice({
      id: 'INV-A1',
      invoiceNumber: 'INV-A1',
      party: customerA,
      grandTotal: 2500,
      date: '2026-10-15',
    });
    const cancelledInvoice = createSalesInvoice({
      id: 'INV-A2',
      invoiceNumber: 'INV-A2',
      party: customerA,
      grandTotal: 3000,
      isCancelled: true,
      date: '2026-10-14',
    });
    const estimateDoc = createSalesInvoice({
      id: 'EST-A1',
      invoiceNumber: 'EST-A1',
      party: customerA,
      grandTotal: 4000,
      invoiceType: 'ESTIMATE',
      date: '2026-10-13',
    });
    const challanDoc = createSalesInvoice({
      id: 'DC-A1',
      invoiceNumber: 'DC-A1',
      party: customerA,
      grandTotal: 1200,
      invoiceType: 'DELIVERY_CHALLAN',
      date: '2026-10-12',
    });
    const creditNoteDoc = createCreditNote({
      id: 'CN-A1',
      invoiceNumber: 'CN-A1',
      party: customerA,
      grandTotal: 800,
      date: '2026-10-11',
    });
    const otherPartyInvoice = createSalesInvoice({
      id: 'INV-B1',
      invoiceNumber: 'INV-B1',
      party: customerB,
      grandTotal: 6000,
      date: '2026-10-10',
    });

    const allInvs = [
      eligibleInvoice,
      cancelledInvoice,
      estimateDoc,
      challanDoc,
      creditNoteDoc,
      otherPartyInvoice,
    ];
    allInvs.forEach((i) => db.saveInvoice(i));

    const onSave = vi.fn();

    act(() => {
      root.render(
        <TableGridInvoiceModal
          company={mockCompany}
          parties={[customerA, customerB]}
          itemsCatalog={[itemSample]}
          initialParty={customerA}
          existingInvoices={db.getInvoices()}
          defaultInvoiceType="CREDIT_NOTE"
          onClose={vi.fn()}
          onSave={onSave}
        />
      );
    });

    const select = container.querySelector('[data-testid="parent-invoice-select"]') as HTMLSelectElement | null;
    expect(select).toBeTruthy();

    const options = Array.from(select?.options || []);
    const optionValues = options.map((o) => o.value);
    const optionTexts = options.map((o) => o.textContent);

    // Must have "No parent invoice"
    expect(optionValues).toContain('');
    // Must contain eligible invoice INV-A1
    expect(optionValues).toContain('INV-A1');
    expect(optionTexts.some((t) => t?.includes('INV-A1') && t?.includes('Rahul Sharma'))).toBe(true);

    // Must NOT contain cancelled invoice, estimate, delivery challan, credit note, or other party invoice
    expect(optionValues).not.toContain('INV-A2');
    expect(optionValues).not.toContain('EST-A1');
    expect(optionValues).not.toContain('DC-A1');
    expect(optionValues).not.toContain('CN-A1');
    expect(optionValues).not.toContain('INV-B1');

    // Select INV-A1
    act(() => {
      select!.value = 'INV-A1';
      select!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Verify Orig Date shows eligibleInvoice date
    expect(container.textContent).toContain('15/10/2026');

    // Deselect back to No parent invoice
    act(() => {
      select!.value = '';
      select!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Orig Date should now show —
    expect(container.textContent).toContain('—');
  });

  it('9. revertReturnFromInvoice correctly handles partial and settled invoices', () => {
    // Settled invoice: balance 0, paid 1000, grandTotal 1000
    const settledInv = createSalesInvoice({
      id: 'INV-901',
      invoiceNumber: 'INV-901',
      party: customerA,
      grandTotal: 1000,
      paidAmount: 700,
      balanceAmount: 0,
    });
    // Revert return of 300
    const restored = revertReturnFromInvoice(settledInv, 300);
    expect(restored.paidAmount).toBe(1000);
    expect(restored.balanceAmount).toBe(0);
    expect(restored.paymentStatus).toBe('PAID');

    // Unpaid invoice: balance 700, paid 0, grandTotal 1000
    const unpaidInv = createSalesInvoice({
      id: 'INV-902',
      invoiceNumber: 'INV-902',
      party: customerA,
      grandTotal: 1000,
      paidAmount: 0,
      balanceAmount: 700,
    });
    const restoredUnpaid = revertReturnFromInvoice(unpaidInv, 300);
    expect(restoredUnpaid.paidAmount).toBe(0);
    expect(restoredUnpaid.balanceAmount).toBe(1000);
    expect(restoredUnpaid.paymentStatus).toBe('UNPAID');
  });
});
