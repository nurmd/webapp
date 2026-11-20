import { describe, it, expect, beforeEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

// Setup Mock Storage
class TestStorage implements Storage {
  private store: Map<string, string> = new Map();

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
    return Array.from(this.store.keys())[index] ?? null;
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
      getAllDocs: vi.fn(async (type: string) => {
        const prefix = `${type}:`;
        return Array.from(inMemoryDocs.entries())
          .filter(([k]) => k.startsWith(prefix))
          .map(([, v]) => ({ ...v }));
      }),
      syncNow: vi.fn(async () => ({ ok: true })),
      subscribeState: vi.fn(() => () => {}),
      onDataChange: vi.fn(() => () => {}),
      notifyDataChange: vi.fn(),
      getState: vi.fn(() => ({ status: 'offline', remoteUrl: '', pendingChanges: 0 })),
      migrateFromLocalStorage: vi.fn(async () => {}),
    },
  };
});

import { db } from '../services/db.ts';
import { Party } from '../models/party.ts';
import { Invoice } from '../models/invoice.ts';
import { Voucher } from '../core/accounting/voucherTypes.ts';
import { CompanyProfile } from '../models/company.ts';
import { usePartyPassbook, type UsePartyPassbookParams } from '../components/Parties/usePartyPassbook.ts';
import { getOutstandingDocuments } from '../core/accounting/paymentAllocation.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const dummyCompany: CompanyProfile = {
  id: 'COMP-TEST',
  businessName: 'Test Enterprises',
  gstin: '27AABCU9603R1ZM',
  pan: 'AABCU9603R',
  stateCode: '27',
  address: '123 Test St',
  pincode: '400001',
  phone: '9876543210',
  email: 'test@example.com',
  isGstEnabled: true,
};

function makeCustomer(overrides: Partial<Party> = {}): Party {
  return {
    id: 'CUST-1',
    name: 'Customer 1',
    type: 'CUSTOMER',
    phone: '9999999999',
    stateCode: '27',
    billingAddress: 'Test Address',
    openingBalance: 0,
    currentBalance: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'INV-1',
    invoiceNumber: 'INV-1001',
    invoiceType: 'B2B',
    date: '2026-11-01',
    partyId: 'CUST-1',
    partyName: 'Customer 1',
    partyAddress: '123 Market Rd',
    partyStateCode: '27',
    placeOfSupplyStateCode: '27',
    isIntraState: true,
    items: [],
    totalGrossAmount: 10000,
    totalDiscount: 0,
    totalTaxableAmount: 10000,
    totalCgst: 0,
    totalSgst: 0,
    totalIgst: 0,
    totalCess: 0,
    totalTax: 0,
    roundOff: 0,
    grandTotal: 10000,
    amountInWords: 'Ten Thousand Rupees Only',
    paidAmount: 10000,
    balanceAmount: 0,
    paymentStatus: 'PAID',
    paymentMode: 'CASH',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeReceiptVoucher(overrides: Partial<Voucher> = {}): Voucher {
  return {
    id: 'VCHR-1',
    voucherNumber: 'REC-001',
    voucherType: 'RECEIPT',
    date: '2026-11-02',
    narration: 'Receipt payment',
    totalAmount: 2000,
    partyId: 'CUST-1',
    partyName: 'Customer 1',
    allocationMode: 'MANUAL',
    paymentAllocations: [],
    entries: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderPassbookHook(params: UsePartyPassbookParams): { result: () => ReturnType<typeof usePartyPassbook>; unmount: () => void } {
  let latestHookResult: ReturnType<typeof usePartyPassbook> | null = null;
  function TestComponent() {
    latestHookResult = usePartyPassbook(params);
    return null;
  }

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(TestComponent));
  });

  return {
    result: () => latestHookResult!,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('Opening Balance Payment Link Suite', () => {
  beforeEach(() => {
    testStorage.clear();
    inMemoryDocs.clear();
    localStorage.setItem('gst_parties', JSON.stringify([]));
    localStorage.setItem('gst_invoices', JSON.stringify([]));
    localStorage.setItem('gst_purchases', JSON.stringify([]));
    localStorage.setItem('gst_vouchers', JSON.stringify([]));
  });

  // 1. Exact repro: customer openingBalance 5000 TO_RECEIVE, invoice 10000 paid at sale time, receipt 2000 allocated to Opening Balance
  it('1. Exact repro: balance becomes 3000 and openingBalance stays 5000 (not mutated)', () => {
    const customer = makeCustomer({
      id: 'CUST-REPRO-1',
      name: 'Repro Customer',
      openingBalance: 5000,
      openingBalanceType: 'TO_RECEIVE',
      currentBalance: 5000,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    });
    db.saveParty(customer);

    const invoice = makeInvoice({
      id: 'INV-REPRO-1',
      invoiceNumber: 'INV-1001',
      date: '2026-11-01',
      partyId: customer.id,
      partyName: customer.name,
      grandTotal: 10000,
      paidAmount: 10000,
      balanceAmount: 0,
      paymentStatus: 'PAID',
      paymentMode: 'CASH',
      paymentSplits: [{ id: 's1', mode: 'CASH', amount: 10000 }],
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-01T10:00:00Z',
    });
    db.saveInvoice(invoice);

    const voucher = makeReceiptVoucher({
      id: 'VCHR-REPRO-1',
      voucherNumber: 'REC-001',
      date: '2026-11-02',
      totalAmount: 2000,
      partyId: customer.id,
      partyName: customer.name,
      allocationMode: 'MANUAL',
      paymentAllocations: [
        {
          documentType: 'INVOICE',
          documentId: `OPENING-BALANCE-${customer.id}`,
          documentNumber: 'Opening Balance',
          amount: 2000,
        },
      ],
      entries: [
        {
          accountId: customer.id,
          accountName: customer.name,
          debit: 0,
          credit: 2000,
        },
        {
          accountId: 'ACC_CASH',
          accountName: 'Cash',
          debit: 2000,
          credit: 0,
        },
      ],
      createdAt: '2026-11-02T10:00:00Z',
    });
    db.savePaymentVoucher(voucher);

    // Recalculate and assert balance
    const recalculated = db.recalculatePartyBalance(customer.id);
    expect(recalculated).toBe(3000);

    const storedParty = db.getParties().find((p) => p.id === customer.id)!;
    expect(storedParty.currentBalance).toBe(3000);
    expect(storedParty.openingBalance).toBe(5000);
    expect(storedParty.openingBalanceType).toBe('TO_RECEIVE');
  });

  // 2. Control case (no invoice): still 3000
  it('2. Control case (no invoice): still 3000', () => {
    const customer = makeCustomer({
      id: 'CUST-CTRL-1',
      name: 'Control Customer',
      openingBalance: 5000,
      openingBalanceType: 'TO_RECEIVE',
      currentBalance: 5000,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    });
    db.saveParty(customer);

    const voucher = makeReceiptVoucher({
      id: 'VCHR-CTRL-1',
      voucherNumber: 'REC-002',
      date: '2026-11-02',
      totalAmount: 2000,
      partyId: customer.id,
      partyName: customer.name,
      allocationMode: 'MANUAL',
      paymentAllocations: [
        {
          documentType: 'INVOICE',
          documentId: `OPENING-BALANCE-${customer.id}`,
          documentNumber: 'Opening Balance',
          amount: 2000,
        },
      ],
      entries: [
        {
          accountId: customer.id,
          accountName: customer.name,
          debit: 0,
          credit: 2000,
        },
        {
          accountId: 'ACC_CASH',
          accountName: 'Cash',
          debit: 2000,
          credit: 0,
        },
      ],
      createdAt: '2026-11-02T10:00:00Z',
    });
    db.savePaymentVoucher(voucher);

    expect(db.recalculatePartyBalance(customer.id)).toBe(3000);
    const stored = db.getParties().find((p) => p.id === customer.id)!;
    expect(stored.currentBalance).toBe(3000);
    expect(stored.openingBalance).toBe(5000);
  });

  // 3. Partially allocated receipt: 5000 receipt with 3000 to an invoice + 2000 unallocated, invoice unpaid reduced by 3000, balance correct
  it('3. Partially allocated receipt: 5000 receipt with 3000 to an invoice + 2000 unallocated, invoice unpaid reduced by 3000, balance correct', () => {
    const customer = makeCustomer({
      id: 'CUST-PART-1',
      name: 'Partial Customer',
      openingBalance: 0,
      currentBalance: 0,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    });
    db.saveParty(customer);

    const invoice = makeInvoice({
      id: 'INV-PART-1',
      invoiceNumber: 'INV-2001',
      date: '2026-11-01',
      partyId: customer.id,
      partyName: customer.name,
      grandTotal: 10000,
      paidAmount: 0,
      balanceAmount: 10000,
      paymentStatus: 'UNPAID',
      paymentMode: 'CREDIT',
      paymentSplits: [{ id: 's1', mode: 'CREDIT', amount: 10000 }],
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-01T10:00:00Z',
    });
    db.saveInvoice(invoice);
    expect(db.recalculatePartyBalance(customer.id)).toBe(10000);

    const voucher = makeReceiptVoucher({
      id: 'VCHR-PART-1',
      voucherNumber: 'REC-003',
      date: '2026-11-03',
      totalAmount: 5000,
      partyId: customer.id,
      partyName: customer.name,
      allocationMode: 'MANUAL',
      paymentAllocations: [
        {
          documentType: 'INVOICE',
          documentId: invoice.id,
          documentNumber: invoice.invoiceNumber,
          amount: 3000,
        },
      ],
      entries: [
        { accountId: customer.id, accountName: customer.name, debit: 0, credit: 5000 },
        { accountId: 'ACC_CASH', accountName: 'Cash', debit: 5000, credit: 0 },
      ],
      createdAt: '2026-11-03T10:00:00Z',
    });
    db.savePaymentVoucher(voucher);

    // Invoice unpaid reduced by 3000 -> 7000
    const updatedInv = db.getInvoices().find((i) => i.id === invoice.id)!;
    expect(updatedInv.paidAmount).toBe(3000);
    expect(updatedInv.balanceAmount).toBe(7000);
    expect(updatedInv.paymentStatus).toBe('PARTIAL');

    // Customer balance: 7000 unpaid invoice - 2000 unallocated portion of receipt = 5000
    expect(db.recalculatePartyBalance(customer.id)).toBe(5000);
    const storedParty = db.getParties().find((p) => p.id === customer.id)!;
    expect(storedParty.currentBalance).toBe(5000);
  });

  // 4. Suppress: fully allocated receipt to an invoice leaves balance unchanged beyond the invoice's own reduction
  it('4. Suppress: fully allocated receipt to an invoice leaves balance unchanged beyond the invoices own reduction', () => {
    const customer = makeCustomer({
      id: 'CUST-FULL-1',
      name: 'Full Customer',
      openingBalance: 0,
      currentBalance: 0,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    });
    db.saveParty(customer);

    const invoice = makeInvoice({
      id: 'INV-FULL-1',
      invoiceNumber: 'INV-3001',
      date: '2026-11-01',
      partyId: customer.id,
      partyName: customer.name,
      grandTotal: 10000,
      paidAmount: 0,
      balanceAmount: 10000,
      paymentStatus: 'UNPAID',
      paymentMode: 'CREDIT',
      paymentSplits: [{ id: 's1', mode: 'CREDIT', amount: 10000 }],
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-01T10:00:00Z',
    });
    db.saveInvoice(invoice);
    expect(db.recalculatePartyBalance(customer.id)).toBe(10000);

    const voucher = makeReceiptVoucher({
      id: 'VCHR-FULL-1',
      voucherNumber: 'REC-004',
      date: '2026-11-04',
      totalAmount: 3000,
      partyId: customer.id,
      partyName: customer.name,
      allocationMode: 'MANUAL',
      paymentAllocations: [
        {
          documentType: 'INVOICE',
          documentId: invoice.id,
          documentNumber: invoice.invoiceNumber,
          amount: 3000,
        },
      ],
      entries: [
        { accountId: customer.id, accountName: customer.name, debit: 0, credit: 3000 },
        { accountId: 'ACC_CASH', accountName: 'Cash', debit: 3000, credit: 0 },
      ],
      createdAt: '2026-11-04T10:00:00Z',
    });
    db.savePaymentVoucher(voucher);

    // Invoice unpaid reduced by 3000 -> 7000
    const updatedInv = db.getInvoices().find((i) => i.id === invoice.id)!;
    expect(updatedInv.paidAmount).toBe(3000);
    expect(updatedInv.balanceAmount).toBe(7000);

    // Party balance is exactly 7000 (not reduced a second time)
    expect(db.recalculatePartyBalance(customer.id)).toBe(7000);
    const storedParty = db.getParties().find((p) => p.id === customer.id)!;
    expect(storedParty.currentBalance).toBe(7000);
  });

  // 5. Deleting the opening-balance receipt restores 5000
  it('5. Deleting the opening-balance receipt restores 5000', () => {
    const customer = makeCustomer({
      id: 'CUST-DEL-1',
      name: 'Delete Customer',
      openingBalance: 5000,
      openingBalanceType: 'TO_RECEIVE',
      currentBalance: 5000,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    });
    db.saveParty(customer);

    const voucher = makeReceiptVoucher({
      id: 'VCHR-DEL-1',
      voucherNumber: 'REC-005',
      date: '2026-11-02',
      totalAmount: 2000,
      partyId: customer.id,
      partyName: customer.name,
      allocationMode: 'MANUAL',
      paymentAllocations: [
        {
          documentType: 'INVOICE',
          documentId: `OPENING-BALANCE-${customer.id}`,
          documentNumber: 'Opening Balance',
          amount: 2000,
        },
      ],
      entries: [
        { accountId: customer.id, accountName: customer.name, debit: 0, credit: 2000 },
        { accountId: 'ACC_CASH', accountName: 'Cash', debit: 2000, credit: 0 },
      ],
      createdAt: '2026-11-02T10:00:00Z',
    });
    db.savePaymentVoucher(voucher);
    expect(db.recalculatePartyBalance(customer.id)).toBe(3000);

    // Delete the receipt voucher
    db.deleteVoucher(voucher.id);

    // Balance restores to 5000
    expect(db.recalculatePartyBalance(customer.id)).toBe(5000);
    const storedParty = db.getParties().find((p) => p.id === customer.id)!;
    expect(storedParty.currentBalance).toBe(5000);
    expect(storedParty.openingBalance).toBe(5000);
  });

  // 6. Passbook: running balance for the repro ends at 3000 and still contains the OPENING and PAYMENT_IN rows
  it('6. Passbook: running balance for the repro ends at 3000 and still contains the OPENING and PAYMENT_IN rows', () => {
    const customer = makeCustomer({
      id: 'CUST-PB-1',
      name: 'Passbook Customer',
      openingBalance: 5000,
      openingBalanceType: 'TO_RECEIVE',
      openingBalanceDate: '2026-11-01',
      currentBalance: 3000,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    });

    const invoice = makeInvoice({
      id: 'INV-PB-1',
      invoiceNumber: 'INV-4001',
      date: '2026-11-02',
      partyId: customer.id,
      partyName: customer.name,
      grandTotal: 10000,
      paidAmount: 10000,
      balanceAmount: 0,
      paymentStatus: 'PAID',
      paymentMode: 'CASH',
      paymentSplits: [{ id: 's1', mode: 'CASH', amount: 10000 }],
      createdAt: '2026-11-02T10:00:00Z',
      updatedAt: '2026-11-02T10:00:00Z',
    });

    const voucher = makeReceiptVoucher({
      id: 'VCHR-PB-1',
      voucherNumber: 'REC-006',
      date: '2026-11-03',
      totalAmount: 2000,
      partyId: customer.id,
      partyName: customer.name,
      allocationMode: 'MANUAL',
      paymentAllocations: [
        {
          documentType: 'INVOICE',
          documentId: `OPENING-BALANCE-${customer.id}`,
          documentNumber: 'Opening Balance',
          amount: 2000,
        },
      ],
      entries: [
        { accountId: customer.id, accountName: customer.name, debit: 0, credit: 2000 },
        { accountId: 'ACC_CASH', accountName: 'Cash', debit: 2000, credit: 0 },
      ],
      createdAt: '2026-11-03T10:00:00Z',
    });

    const hook = renderPassbookHook({
      party: customer,
      company: dummyCompany,
      invoices: [invoice],
      purchases: [],
      vouchers: [voucher],
    });

    const pb = hook.result();
    expect(pb.liveNetBalance).toBe(3000);
    expect(pb.totalPaid).toBe(12000); // 10000 upfront on invoice + 2000 voucher

    const entries = pb.passbook; // Chronological (OLDEST first)
    expect(entries.length).toBeGreaterThanOrEqual(3);

    // 1. OPENING row
    const opEntry = entries.find((e) => e.type === 'OPENING');
    expect(opEntry).toBeDefined();
    expect(opEntry!.debit).toBe(5000);
    expect(opEntry!.runningBalance).toBe(5000);

    // 2. SALE row
    const saleEntry = entries.find((e) => e.type === 'SALE');
    expect(saleEntry).toBeDefined();
    expect(saleEntry!.debit).toBe(10000);

    // 3. PAYMENT_IN from voucher
    const vchrEntry = entries.find((e) => e.id === `vchr-${voucher.id}`);
    expect(vchrEntry).toBeDefined();
    expect(vchrEntry!.type).toBe('PAYMENT_IN');
    expect(vchrEntry!.credit).toBe(2000);

    // 4. PAYMENT_IN from upfront invoice payment
    const invPayEntry = entries.find((e) => e.id === `pay-inv-${invoice.id}`);
    expect(invPayEntry).toBeDefined();
    expect(invPayEntry!.type).toBe('PAYMENT_IN');
    expect(invPayEntry!.credit).toBe(10000);

    // Last chronological entry must have runningBalance === 3000
    const lastEntry = entries[entries.length - 1];
    expect(lastEntry.runningBalance).toBe(3000);

    hook.unmount();
  });

  // 7. getOutstandingDocuments with vouchers hides/nets the opening doc; the save path rejects over-allocation
  it('7. getOutstandingDocuments with vouchers hides/nets the opening doc; the save path rejects over-allocation', () => {
    const customer = makeCustomer({
      id: 'CUST-NET-1',
      name: 'Netted Customer',
      openingBalance: 5000,
      openingBalanceType: 'TO_RECEIVE',
      currentBalance: 5000,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    });
    db.saveParty(customer);

    // Initial outstanding docs without vouchers
    const initialDocs = getOutstandingDocuments({
      partyId: customer.id,
      documentType: 'INVOICE',
      invoices: [],
      parties: [customer],
    });
    expect(initialDocs).toHaveLength(1);
    expect(initialDocs[0].id).toBe(`OPENING-BALANCE-${customer.id}`);
    expect(initialDocs[0].grandTotal).toBe(5000);
    expect(initialDocs[0].paidAmount).toBe(0);
    expect(initialDocs[0].balanceAmount).toBe(5000);

    // Create first partial voucher of 2000
    const voucher1 = makeReceiptVoucher({
      id: 'VCHR-NET-1',
      voucherNumber: 'REC-007',
      date: '2026-11-02',
      totalAmount: 2000,
      partyId: customer.id,
      partyName: customer.name,
      allocationMode: 'MANUAL',
      paymentAllocations: [
        {
          documentType: 'INVOICE',
          documentId: `OPENING-BALANCE-${customer.id}`,
          documentNumber: 'Opening Balance',
          amount: 2000,
        },
      ],
      entries: [
        { accountId: customer.id, accountName: customer.name, debit: 0, credit: 2000 },
        { accountId: 'ACC_CASH', accountName: 'Cash', debit: 2000, credit: 0 },
      ],
      createdAt: '2026-11-02T10:00:00Z',
    });
    db.savePaymentVoucher(voucher1);

    // Outstanding docs with vouchers: nets the opening doc
    const nettedDocs = getOutstandingDocuments({
      partyId: customer.id,
      documentType: 'INVOICE',
      invoices: [],
      parties: [customer],
      vouchers: db.getVouchers(),
    });
    expect(nettedDocs).toHaveLength(1);
    expect(nettedDocs[0].id).toBe(`OPENING-BALANCE-${customer.id}`);
    expect(nettedDocs[0].grandTotal).toBe(5000);
    expect(nettedDocs[0].paidAmount).toBe(2000);
    expect(nettedDocs[0].balanceAmount).toBe(3000);

    // Save-path rejects over-allocation: trying to allocate 4000 when only 3000 remains
    const voucher2Over = makeReceiptVoucher({
      id: 'VCHR-NET-OVER',
      voucherNumber: 'REC-008',
      date: '2026-11-03',
      totalAmount: 4000,
      partyId: customer.id,
      partyName: customer.name,
      allocationMode: 'MANUAL',
      paymentAllocations: [
        {
          documentType: 'INVOICE',
          documentId: `OPENING-BALANCE-${customer.id}`,
          documentNumber: 'Opening Balance',
          amount: 4000,
        },
      ],
      entries: [
        { accountId: customer.id, accountName: customer.name, debit: 0, credit: 4000 },
        { accountId: 'ACC_CASH', accountName: 'Cash', debit: 4000, credit: 0 },
      ],
      createdAt: '2026-11-03T10:00:00Z',
    });
    expect(() => db.savePaymentVoucher(voucher2Over)).toThrow(
      'Allocation amount ₹4000.00 exceeds balance ₹3000.00 on Opening Balance.'
    );

    // Valid second voucher for remaining 3000 succeeds
    const voucher2Valid: Voucher = {
      ...voucher2Over,
      id: 'VCHR-NET-2',
      totalAmount: 3000,
      paymentAllocations: [
        {
          documentType: 'INVOICE',
          documentId: `OPENING-BALANCE-${customer.id}`,
          documentNumber: 'Opening Balance',
          amount: 3000,
        },
      ],
      entries: [
        { accountId: customer.id, accountName: customer.name, debit: 0, credit: 3000 },
        { accountId: 'ACC_CASH', accountName: 'Cash', debit: 3000, credit: 0 },
      ],
    };
    db.savePaymentVoucher(voucher2Valid);

    // Now remaining opening balance is 0. getOutstandingDocuments hides/omits the opening doc
    const fullySettledDocs = getOutstandingDocuments({
      partyId: customer.id,
      documentType: 'INVOICE',
      invoices: [],
      parties: [customer],
      vouchers: db.getVouchers(),
    });
    expect(fullySettledDocs).toHaveLength(0);

    // A third voucher attempting to allocate to opening balance is rejected
    const voucher3Over = makeReceiptVoucher({
      id: 'VCHR-NET-3',
      voucherNumber: 'REC-009',
      date: '2026-11-04',
      totalAmount: 500,
      partyId: customer.id,
      partyName: customer.name,
      allocationMode: 'MANUAL',
      paymentAllocations: [
        {
          documentType: 'INVOICE',
          documentId: `OPENING-BALANCE-${customer.id}`,
          documentNumber: 'Opening Balance',
          amount: 500,
        },
      ],
      entries: [
        { accountId: customer.id, accountName: customer.name, debit: 0, credit: 500 },
        { accountId: 'ACC_CASH', accountName: 'Cash', debit: 500, credit: 0 },
      ],
      createdAt: '2026-11-04T10:00:00Z',
    });
    expect(() => db.savePaymentVoucher(voucher3Over)).toThrow(
      'Allocation amount ₹500.00 exceeds balance ₹0.00 on Opening Balance.'
    );
  });

  // 8. syncAllPartyBalances() returns the same party currentBalance as recalculatePartyBalance for the repro (parity guard)
  it('8. syncAllPartyBalances() returns the same party currentBalance as recalculatePartyBalance for the repro (parity guard)', () => {
    const customer = makeCustomer({
      id: 'CUST-PARITY-1',
      name: 'Parity Customer',
      openingBalance: 5000,
      openingBalanceType: 'TO_RECEIVE',
      currentBalance: 5000,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    });
    db.saveParty(customer);

    const invoice = makeInvoice({
      id: 'INV-PARITY-1',
      invoiceNumber: 'INV-5001',
      date: '2026-11-01',
      partyId: customer.id,
      partyName: customer.name,
      grandTotal: 10000,
      paidAmount: 10000,
      balanceAmount: 0,
      paymentStatus: 'PAID',
      paymentMode: 'CASH',
      paymentSplits: [{ id: 's1', mode: 'CASH', amount: 10000 }],
      createdAt: '2026-11-01T10:00:00Z',
      updatedAt: '2026-11-01T10:00:00Z',
    });
    db.saveInvoice(invoice);

    const voucher = makeReceiptVoucher({
      id: 'VCHR-PARITY-1',
      voucherNumber: 'REC-010',
      date: '2026-11-02',
      totalAmount: 2000,
      partyId: customer.id,
      partyName: customer.name,
      allocationMode: 'MANUAL',
      paymentAllocations: [
        {
          documentType: 'INVOICE',
          documentId: `OPENING-BALANCE-${customer.id}`,
          documentNumber: 'Opening Balance',
          amount: 2000,
        },
      ],
      entries: [
        { accountId: customer.id, accountName: customer.name, debit: 0, credit: 2000 },
        { accountId: 'ACC_CASH', accountName: 'Cash', debit: 2000, credit: 0 },
      ],
      createdAt: '2026-11-02T10:00:00Z',
    });
    db.savePaymentVoucher(voucher);

    // Call syncAllPartyBalances
    db.syncAllPartyBalances();

    const storedAfterSync = db.getParties().find((p) => p.id === customer.id)!;
    const individualRecalc = db.recalculatePartyBalance(customer.id);

    expect(storedAfterSync.currentBalance).toBe(3000);
    expect(individualRecalc).toBe(3000);
    expect(storedAfterSync.currentBalance).toBe(individualRecalc);
  });
});
