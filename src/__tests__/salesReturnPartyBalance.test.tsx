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
import { usePartyPassbook } from '../components/Parties/usePartyPassbook.ts';
import { PartyDetailModal } from '../components/Parties/PartyDetailModal.tsx';
import { executeSalesReturn, executePurchaseReturn } from '../core/returns/returnEngine.ts';
import type { Party } from '../models/party.ts';
import type { Invoice, InvoiceItemEntry } from '../models/invoice.ts';
import type { PurchaseBill, PurchaseItemEntry } from '../models/purchase.ts';
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
    startContinuousSync: vi.fn(),
    stopContinuousSync: vi.fn(),
    destroyDatabase: vi.fn(),
  },
}));

const mockCompany: CompanyProfile = {
  id: 'COMP-001',
  businessName: 'Acme Traders',
  tradeName: 'Acme Traders',
  gstin: '27AABCU9603R1ZX',
  pan: 'AABCU9603R',
  pincode: '411001',
  email: 'acme@traders.com',
  phone: '9876543210',
  address: 'Shop 1, Market Yard, Pune',
  stateCode: '27',
  isCompositionScheme: false,
};

function renderPassbookHook(params: Parameters<typeof usePartyPassbook>[0]) {
  let hookResult: ReturnType<typeof usePartyPassbook> | null = null;
  const TestComponent: React.FC = () => {
    hookResult = usePartyPassbook(params);
    return null;
  };

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<TestComponent />);
  });

  return {
    result: () => hookResult!,
    unmount: () => {
      act(() => { root.unmount(); });
      container.remove();
    },
  };
}

describe('Sales Return Party Balance & Passbook Ledger Integrity', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    testStorage.clear();
    (db as any).cache = {};
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

  it('1. party with sales return reduces balance by credit note amount, does not increase or show x2', () => {
    const customer: Party = {
      id: 'CUST-RET-01',
      name: 'Sneha Enterprises',
      type: 'CUSTOMER',
      phone: '9822001122',
      billingAddress: 'MG Road, Pune',
      stateCode: '27',
      openingBalance: 0,
      currentBalance: 0,
      createdAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-10-01T10:00:00Z',
    };
    db.saveParty(customer);

    // Initial sale of 5000 (unpaid)
    const saleInvoice = {
      id: 'INV-SNEHA-01',
      invoiceNumber: 'INV-1001',
      date: '2026-10-05',
      partyId: customer.id,
      partyName: customer.name,
      partyStateCode: '27',
      placeOfSupplyStateCode: '27',
      items: [
        {
          itemId: 'ITEM-1',
          name: 'Designer Saree',
          quantity: 5,
          unit: 'PCS',
          unitPrice: 1000,
          taxableAmount: 5000,
          gstRate: 0,
          totalAmount: 5000,
        } as InvoiceItemEntry,
      ],
      totalGrossAmount: 5000,
      totalDiscount: 0,
      totalTaxableAmount: 5000,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 5000,
      amountInWords: 'Five Thousand Only',
      paidAmount: 0,
      balanceAmount: 5000,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
      createdAt: '2026-10-05T10:00:00Z',
      updatedAt: '2026-10-05T10:00:00Z',
    } as any as Invoice;
    db.saveInvoice(saleInvoice);

    // Credit Note (Sales Return) of 2000
    const creditNote = {
      id: 'CN-SNEHA-01',
      invoiceNumber: 'CN-1001',
      date: '2026-10-06',
      partyId: customer.id,
      partyName: customer.name,
      partyStateCode: '27',
      placeOfSupplyStateCode: '27',
      invoiceType: 'CREDIT_NOTE',
      noteType: 'C',
      originalInvoiceId: saleInvoice.id,
      originalInvoiceNumber: saleInvoice.invoiceNumber,
      returnReason: 'Defective material',
      items: [
        {
          itemId: 'ITEM-1',
          name: 'Designer Saree',
          quantity: 2,
          unit: 'PCS',
          unitPrice: 1000,
          taxableAmount: 2000,
          gstRate: 0,
          totalAmount: 2000,
        } as InvoiceItemEntry,
      ],
      totalGrossAmount: 2000,
      totalDiscount: 0,
      totalTaxableAmount: 2000,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 2000,
      amountInWords: 'Two Thousand Only',
      paidAmount: 0,
      balanceAmount: 2000,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
      createdAt: '2026-10-06T10:00:00Z',
      updatedAt: '2026-10-06T10:00:00Z',
    } as any as Invoice;
    db.saveInvoice(creditNote);

    const harness = renderPassbookHook({
      party: customer,
      company: mockCompany,
      invoices: [saleInvoice, creditNote],
      purchases: [],
      vouchers: [],
    });

    const res = harness.result();
    // 5000 sale - 2000 credit note = 3000 balance!
    expect(res.liveNetBalance).toBe(3000);
    // Explicit check: must NOT be 7000 (which is 5000 + 2000) or 4000 (2x return)
    expect(res.liveNetBalance).not.toBe(7000);
    expect(res.liveNetBalance).not.toBe(4000);

    // Total Billed should reflect net billed: 5000 - 2000 = 3000
    expect(res.totalBilled).toBe(3000);
    expect(res.totalPaid).toBe(0);

    // Passbook entries check
    expect(res.passbook.length).toBe(2);

    const saleEntry = res.passbook[0];
    expect(saleEntry.docNumber).toBe('INV-1001');
    expect(saleEntry.debit).toBe(5000);
    expect(saleEntry.credit).toBe(0);
    expect(saleEntry.runningBalance).toBe(5000);

    const cnEntry = res.passbook[1];
    expect(cnEntry.docNumber).toBe('CN-1001');
    expect(cnEntry.debit).toBe(0);
    expect(cnEntry.credit).toBe(2000); // Credit note MUST be credited!
    expect(cnEntry.runningBalance).toBe(3000); // Reduced running balance to 3000!

    harness.unmount();
  });

  it('2. customer with full sales return has settled balance 0 (not 2x)', () => {
    const customer = {
      id: 'CUST-RET-02',
      name: 'Rahul Textiles',
      type: 'CUSTOMER',
      phone: '9822003344',
      billingAddress: 'Laxmi Road, Pune',
      stateCode: '27',
      openingBalance: 0,
      currentBalance: 0,
    } as any as Party;
    db.saveParty(customer);

    const saleInvoice = {
      id: 'INV-RAHUL-01',
      invoiceNumber: 'INV-2001',
      date: '2026-10-10',
      partyId: customer.id,
      partyName: customer.name,
      partyStateCode: '27',
      placeOfSupplyStateCode: '27',
      items: [],
      totalGrossAmount: 1500,
      totalDiscount: 0,
      totalTaxableAmount: 1500,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 1500,
      amountInWords: 'One Thousand Five Hundred Only',
      paidAmount: 0,
      balanceAmount: 1500,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
    } as any as Invoice;

    const creditNote = {
      id: 'CN-RAHUL-01',
      invoiceNumber: 'CN-2001',
      date: '2026-10-11',
      partyId: customer.id,
      partyName: customer.name,
      partyStateCode: '27',
      placeOfSupplyStateCode: '27',
      invoiceType: 'CREDIT_NOTE',
      noteType: 'C',
      items: [],
      totalGrossAmount: 1500,
      totalDiscount: 0,
      totalTaxableAmount: 1500,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 1500,
      amountInWords: 'One Thousand Five Hundred Only',
      paidAmount: 0,
      balanceAmount: 1500,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
    } as any as Invoice;

    const harness = renderPassbookHook({
      party: customer,
      company: mockCompany,
      invoices: [saleInvoice, creditNote],
      purchases: [],
      vouchers: [],
    });

    const res = harness.result();
    expect(res.liveNetBalance).toBe(0);
    // Must NOT be 3000 (which was 2x 1500)
    expect(res.liveNetBalance).not.toBe(3000);
    expect(res.isReceivable).toBe(false);
    expect(res.isPayable).toBe(false);
    expect(res.totalBilled).toBe(0);

    harness.unmount();
  });

  it('3. standalone sales return creates advance/credit (negative balance) for customer', () => {
    const customer = {
      id: 'CUST-RET-03',
      name: 'Pooja Garments',
      type: 'CUSTOMER',
      phone: '9822005566',
      billingAddress: 'FC Road, Pune',
      stateCode: '27',
      openingBalance: 0,
      currentBalance: 0,
    } as any as Party;
    db.saveParty(customer);

    const creditNote = {
      id: 'CN-POOJA-01',
      invoiceNumber: 'CN-3001',
      date: '2026-10-12',
      partyId: customer.id,
      partyName: customer.name,
      partyStateCode: '27',
      placeOfSupplyStateCode: '27',
      invoiceType: 'CREDIT_NOTE',
      noteType: 'C',
      items: [],
      totalGrossAmount: 800,
      totalDiscount: 0,
      totalTaxableAmount: 800,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 800,
      amountInWords: 'Eight Hundred Only',
      paidAmount: 0,
      balanceAmount: 800,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
    } as any as Invoice;

    const harness = renderPassbookHook({
      party: customer,
      company: mockCompany,
      invoices: [creditNote],
      purchases: [],
      vouchers: [],
    });

    const res = harness.result();
    // Customer returned goods without previous bill: store owes customer 800
    expect(res.liveNetBalance).toBe(-800);
    expect(res.isPayable).toBe(true);
    expect(res.isReceivable).toBe(false);
    expect(res.totalBilled).toBe(-800);

    harness.unmount();
  });

  it('4. executeSalesReturn updates invoice balance and party details page shows reduced net balance', () => {
    const customer = {
      id: 'CUST-RET-04',
      name: 'Anand Book Depot',
      type: 'CUSTOMER',
      phone: '9822007788',
      billingAddress: 'Appa Balwant Chowk, Pune',
      stateCode: '27',
      openingBalance: 0,
      currentBalance: 0,
    } as any as Party;
    db.saveParty(customer);

    const sourceInvoice = {
      id: 'INV-ANAND-01',
      invoiceNumber: 'INV-4001',
      date: '2026-10-15',
      partyId: customer.id,
      partyName: customer.name,
      partyStateCode: '27',
      placeOfSupplyStateCode: '27',
      items: [
        {
          itemId: 'ITEM-BOOK-1',
          name: 'Accounting Handbook',
          quantity: 10,
          unit: 'PCS',
          unitPrice: 300,
          taxableAmount: 3000,
          gstRate: 0,
          totalAmount: 3000,
        } as InvoiceItemEntry,
      ],
      totalGrossAmount: 3000,
      totalDiscount: 0,
      totalTaxableAmount: 3000,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 3000,
      amountInWords: 'Three Thousand Only',
      paidAmount: 0,
      balanceAmount: 3000,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
    } as any as Invoice;
    db.saveInvoice(sourceInvoice);

    // Execute linked return of 4 items = 1200
    const { creditNote, updatedSourceInvoice } = executeSalesReturn({
      sourceInvoice,
      returnedItems: [
        {
          item: sourceInvoice.items[0],
          returnQuantity: 4,
        },
      ],
      company: mockCompany,
    });

    expect(creditNote.grandTotal).toBe(1200);
    expect(updatedSourceInvoice.balanceAmount).toBe(1800);

    // Check passbook hook
    const harness = renderPassbookHook({
      party: customer,
      company: mockCompany,
      invoices: db.getInvoices(),
      purchases: [],
      vouchers: [],
    });

    const res = harness.result();
    // Net balance must be 3000 - 1200 = 1800!
    expect(res.liveNetBalance).toBe(1800);
    expect(res.totalBilled).toBe(1800);

    // Verify recalculatePartyBalance also matches exactly 1800
    expect(db.recalculatePartyBalance(customer.id)).toBe(1800);

    harness.unmount();
  });

  it('5. PartyDetailModal renders reduced balance and passbook row with Return and minus prefix', async () => {
    const customer = {
      id: 'CUST-RET-05',
      name: 'Modern Electronics',
      type: 'CUSTOMER',
      phone: '9822009900',
      billingAddress: 'Tilak Road, Pune',
      stateCode: '27',
      openingBalance: 0,
      currentBalance: 0,
    } as any as Party;
    db.saveParty(customer);

    const saleInvoice = {
      id: 'INV-MOD-01',
      invoiceNumber: 'INV-5001',
      date: '2026-10-18',
      partyId: customer.id,
      partyName: customer.name,
      partyStateCode: '27',
      placeOfSupplyStateCode: '27',
      items: [],
      totalGrossAmount: 10000,
      totalDiscount: 0,
      totalTaxableAmount: 10000,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 10000,
      amountInWords: 'Ten Thousand Only',
      paidAmount: 0,
      balanceAmount: 10000,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
    } as any as Invoice;
    db.saveInvoice(saleInvoice);

    const creditNote = {
      id: 'CN-MOD-01',
      invoiceNumber: 'CN-5001',
      date: '2026-10-19',
      partyId: customer.id,
      partyName: customer.name,
      partyStateCode: '27',
      placeOfSupplyStateCode: '27',
      invoiceType: 'CREDIT_NOTE',
      noteType: 'C',
      returnReason: 'Damaged item',
      items: [],
      totalGrossAmount: 4000,
      totalDiscount: 0,
      totalTaxableAmount: 4000,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 4000,
      amountInWords: 'Four Thousand Only',
      paidAmount: 0,
      balanceAmount: 4000,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
    } as any as Invoice;
    db.saveInvoice(creditNote);

    await act(async () => {
      root.render(
        <PartyDetailModal
          party={customer}
          company={mockCompany}
          invoices={[saleInvoice, creditNote]}
          purchases={[]}
          vouchers={[]}
          isOpen={true}
          onEditParty={vi.fn()}
          onRecordPayment={vi.fn()}
        />
      );
    });

    const text = container.textContent || '';
    // Expected net balance is 6000 (10000 - 4000)
    expect(text).toContain('₹ 6,000.00');
    // Must NOT contain 14000 or 8000
    expect(text).not.toContain('14,000');
    expect(text).not.toContain('8,000');

    // Passbook table should show Return on line 1, #CN-5001 on line 2, and balance on line 3
    expect(text).toContain('Return');
    expect(text).toContain('#CN-5001');
    expect(text).toContain('Balance: ₹ 4,000.00');
    expect(text).toContain('- ₹ 4,000.00');
  });

  it('6. supplier purchase return reduces payable balance', () => {
    const supplier = {
      id: 'SUPP-RET-01',
      name: 'Galaxy Wholesalers',
      type: 'SUPPLIER',
      phone: '9822112233',
      billingAddress: 'Marketyard, Pune',
      stateCode: '27',
      openingBalance: 0,
      currentBalance: 0,
    } as any as Party;
    db.saveParty(supplier);

    const bill = {
      id: 'PUR-GAL-01',
      billNumber: 'BILL-101',
      date: '2026-10-20',
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierStateCode: '27',
      placeOfSupplyStateCode: '27',
      items: [],
      purchaseType: 'BILL',
      totalGrossAmount: 8000,
      totalDiscount: 0,
      totalTaxableAmount: 8000,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 8000,
      paidAmount: 0,
      balanceAmount: 8000,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
    } as any as PurchaseBill;
    db.savePurchase(bill);

    const returnBill = {
      id: 'RET-GAL-01',
      billNumber: 'DN-101',
      date: '2026-10-21',
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierStateCode: '27',
      placeOfSupplyStateCode: '27',
      items: [],
      purchaseType: 'RETURN',
      noteType: 'D',
      totalGrossAmount: 3000,
      totalDiscount: 0,
      totalTaxableAmount: 3000,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 3000,
      paidAmount: 0,
      balanceAmount: 3000,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
    } as any as PurchaseBill;
    db.savePurchase(returnBill);

    const harness = renderPassbookHook({
      party: supplier,
      company: mockCompany,
      invoices: [],
      purchases: [bill, returnBill],
      vouchers: [],
    });

    const res = harness.result();
    // Supplier: we owe 8000 - 3000 = 5000 (represented as -5000 in signed balance for payable)
    expect(res.liveNetBalance).toBe(-5000);
    expect(res.isPayable).toBe(true);
    expect(res.isReceivable).toBe(false);
    expect(res.totalBilled).toBe(5000);

    harness.unmount();
  });

  it('7. Passbook table transaction card renders 3 lines of metadata: Line 1 (Type & Date), Line 2 (Voucher # in gray), Line 3 (Balance/Linked info)', async () => {
    const customer = {
      id: 'CUST-3LINE-01',
      name: 'Priyanka Enterprises',
      type: 'CUSTOMER',
      phone: '9822334455',
      billingAddress: 'Shivajinagar, Pune',
      stateCode: '27',
      openingBalance: 0,
      currentBalance: 0,
    } as any as Party;
    db.saveParty(customer);

    const invoice = {
      id: 'INV-3LINE-01',
      invoiceNumber: 'INV-8801',
      date: '2026-10-25',
      partyId: customer.id,
      partyName: customer.name,
      partyStateCode: '27',
      placeOfSupplyStateCode: '27',
      items: [],
      totalGrossAmount: 5000,
      totalDiscount: 0,
      totalTaxableAmount: 5000,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 5000,
      amountInWords: 'Five Thousand Only',
      paidAmount: 2000,
      balanceAmount: 3000,
      paymentMode: 'PARTIAL',
      paymentStatus: 'PARTIAL',
    } as any as Invoice;
    db.saveInvoice(invoice);

    const paymentVoucher = {
      id: 'VCHR-3LINE-01',
      voucherNumber: 'REC-9901',
      voucherType: 'RECEIPT',
      date: '2026-10-26',
      partyId: customer.id,
      partyName: customer.name,
      totalAmount: 2000,
      paymentAllocations: [
        {
          documentType: 'INVOICE',
          documentId: invoice.id,
          documentNumber: invoice.invoiceNumber,
          amount: 2000,
        },
      ],
      entries: [
        { accountId: 'ACC_CASH', debit: 2000, credit: 0 },
        { accountId: customer.id, debit: 0, credit: 2000 },
      ],
    } as any;
    db.savePaymentVoucher(paymentVoucher);

    await act(async () => {
      root.render(
        <PartyDetailModal
          party={customer}
          company={mockCompany}
          invoices={[invoice]}
          purchases={[]}
          vouchers={[paymentVoucher]}
          isOpen={true}
          onEditParty={vi.fn()}
          onRecordPayment={vi.fn()}
        />
      );
    });

    const invoiceCard = container.querySelector(`[data-testid="passbook-entry-sale-${invoice.id}"]`);
    expect(invoiceCard).not.toBeNull();
    const invText = invoiceCard?.textContent || '';
    // Line 1: Type & Date
    expect(invText).toContain('Invoice');
    expect(invText).toContain('2026-10-25');
    // Line 2: Voucher number
    expect(invText).toContain('#INV-8801');
    // Line 3: Voucher balance amount
    expect(invText).toContain('Balance: ₹ 1,000.00');

    const paymentCard = container.querySelector(`[data-testid="passbook-entry-vchr-${paymentVoucher.id}"]`);
    expect(paymentCard).not.toBeNull();
    const payText = paymentCard?.textContent || '';
    // Line 1: Type & Date
    expect(payText).toContain('Payment In');
    expect(payText).toContain('2026-10-26');
    // Line 2: Voucher number
    expect(payText).toContain('#REC-9901');
    // Line 3: Linked voucher number
    expect(payText).toContain('Linked: #INV-8801');
  });
});
