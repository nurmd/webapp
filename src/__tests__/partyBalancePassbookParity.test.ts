import { describe, it, expect, beforeEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

// Mock localStorage
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

const { inMemoryDocs } = vi.hoisted(() => {
  return { inMemoryDocs: new Map<string, any>() };
});

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
          .filter(([k]: [string, any]) => k.startsWith(prefix))
          .map(([, v]: [string, any]) => ({ ...v }));
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
import { PurchaseBill } from '../models/purchase.ts';
import { Voucher } from '../core/accounting/voucherTypes.ts';
import { CompanyProfile } from '../models/company.ts';
import { usePartyPassbook, type UsePartyPassbookParams } from '../components/Parties/usePartyPassbook.ts';

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

function makeParty(overrides: Partial<Party> = {}): Party {
  return {
    id: 'CUST-1',
    name: 'Party 1',
    type: 'CUSTOMER',
    phone: '9999999999',
    billingAddress: 'Test Address',
    stateCode: '27',
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
    partyName: 'Party 1',
    partyAddress: 'Test Address',
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
    paidAmount: 0,
    balanceAmount: 1000,
    paymentStatus: 'UNPAID',
    paymentMode: 'CREDIT',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makePurchase(overrides: Partial<PurchaseBill> = {}): PurchaseBill {
  return {
    id: 'PUR-1',
    billNumber: 'BILL-1001',
    purchaseType: 'BILL',
    date: '2026-11-01',
    supplierId: 'SUPP-1',
    supplierName: 'Supplier 1',
    supplierAddress: 'Test Address',
    supplierStateCode: '27',
    placeOfSupplyStateCode: '27',
    isIntraState: true,
    items: [],
    itcEligibility: 'ALL_OTHER_ITC',
    isRcm: false,
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
    paidAmount: 0,
    balanceAmount: 1000,
    paymentStatus: 'UNPAID',
    paymentMode: 'CREDIT',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeVoucher(overrides: Partial<Voucher> = {}): Voucher {
  return {
    id: 'VCH-1',
    voucherNumber: 'VCH-1001',
    voucherType: 'RECEIPT',
    date: '2026-11-01',
    narration: 'Test voucher',
    totalAmount: 1000,
    partyId: 'CUST-1',
    partyName: 'Party 1',
    entries: [],
    paymentAllocations: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderPassbookHook(params: UsePartyPassbookParams): {
  result: () => ReturnType<typeof usePartyPassbook>;
  unmount: () => void;
} {
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

describe('Party Balance and Passbook Parity Suite (Abu Imran & Nitai Bauri fixtures)', () => {
  beforeEach(() => {
    testStorage.clear();
    inMemoryDocs.clear();
  });

  it('1-4. Abu Imran fixture: verifies recalculatePartyBalance, syncAllPartyBalances, liveNetBalance, and runningBalance === 0', () => {
    // 1. Setup Abu Imran
    const abuParty = makeParty({
      id: 'CUST-ABU-001',
      name: 'Abu Imran',
      type: 'CUSTOMER',
      phone: '9876500001',
      billingAddress: 'Bhiwandi',
      openingBalance: 1075,
      openingBalanceType: 'TO_RECEIVE',
      openingBalanceDate: '2026-10-01',
      currentBalance: 0,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    });
    db.saveParty(abuParty);

    // Invoices
    // INV/26-27/2026-001: 5,520 (2026-10-12 08:40) - paid
    const inv1 = makeInvoice({
      id: 'INV-ABU-001',
      invoiceNumber: 'INV/26-27/2026-001',
      date: '2026-10-12',
      createdAt: '2026-10-12T08:40:00.000Z',
      updatedAt: '2026-10-12T08:40:00.000Z',
      partyId: abuParty.id,
      partyName: abuParty.name,
      partyAddress: abuParty.billingAddress,
      totalGrossAmount: 5520,
      totalTaxableAmount: 5520,
      grandTotal: 5520,
      amountInWords: 'Five Thousand Five Hundred Twenty Only',
      paidAmount: 5520,
      balanceAmount: 0,
      paymentStatus: 'PAID',
      paymentMode: 'CASH',
    });
    db.saveInvoice(inv1);

    // INV/26-27/0032: 4,600 (2026-10-29 08:26)
    const inv2 = makeInvoice({
      id: 'INV-ABU-0032',
      invoiceNumber: 'INV/26-27/0032',
      date: '2026-10-29',
      createdAt: '2026-10-29T08:26:00.000Z',
      updatedAt: '2026-10-29T08:26:00.000Z',
      partyId: abuParty.id,
      partyName: abuParty.name,
      partyAddress: abuParty.billingAddress,
      totalGrossAmount: 4600,
      totalTaxableAmount: 4600,
      grandTotal: 4600,
      paidAmount: 0,
      balanceAmount: 4600,
      paymentStatus: 'UNPAID',
      paymentMode: 'CREDIT',
    });
    db.saveInvoice(inv2);

    // INV/26-27/0058: 9,200 (2026-11-06 08:54)
    const inv3 = makeInvoice({
      id: 'INV-ABU-0058',
      invoiceNumber: 'INV/26-27/0058',
      date: '2026-11-06',
      createdAt: '2026-11-06T08:54:00.000Z',
      updatedAt: '2026-11-06T08:54:00.000Z',
      partyId: abuParty.id,
      partyName: abuParty.name,
      partyAddress: abuParty.billingAddress,
      totalGrossAmount: 9200,
      totalTaxableAmount: 9200,
      grandTotal: 9200,
      paidAmount: 0,
      balanceAmount: 9200,
      paymentStatus: 'UNPAID',
      paymentMode: 'CREDIT',
    });
    db.saveInvoice(inv3);

    // INV/26-27/0098: 9,200 (2026-11-18 11:25)
    const inv4 = makeInvoice({
      id: 'INV-ABU-0098',
      invoiceNumber: 'INV/26-27/0098',
      date: '2026-11-18',
      createdAt: '2026-11-18T11:25:00.000Z',
      updatedAt: '2026-11-18T11:25:00.000Z',
      partyId: abuParty.id,
      partyName: abuParty.name,
      partyAddress: abuParty.billingAddress,
      totalGrossAmount: 9200,
      totalTaxableAmount: 9200,
      grandTotal: 9200,
      paidAmount: 0,
      balanceAmount: 9200,
      paymentStatus: 'UNPAID',
      paymentMode: 'CREDIT',
    });
    db.saveInvoice(inv4);

    // Receipts
    // VCH-RCPT-RCPT-765141: 5,520 (2026-10-12 13:09) - legacy receipt, NO allocations
    const rcpt1 = makeVoucher({
      id: 'VCH-RCPT-RCPT-765141',
      voucherNumber: 'RCPT-765141',
      voucherType: 'RECEIPT',
      date: '2026-10-12',
      createdAt: '2026-10-12T13:09:00.000Z',
      totalAmount: 5520,
      narration: 'Legacy receipt for 2026-001',
      partyId: abuParty.id,
      partyName: abuParty.name,
      entries: [
        { accountId: 'ACC-CASH-01', accountName: 'Cash', debit: 5520, credit: 0 },
        { accountId: abuParty.id, accountName: abuParty.name, debit: 0, credit: 5520 },
      ],
      paymentAllocations: [],
    });
    db.savePaymentVoucher(rcpt1);

    // VCH-RCPT-RCPT-477348: 4,600 (2026-10-29 10:00) -> allocated to INV-ABU-0032
    const rcpt2 = makeVoucher({
      id: 'VCH-RCPT-RCPT-477348',
      voucherNumber: 'RCPT-477348',
      voucherType: 'RECEIPT',
      date: '2026-10-29',
      createdAt: '2026-10-29T10:00:00.000Z',
      totalAmount: 4600,
      narration: 'Payment for 0032',
      partyId: abuParty.id,
      partyName: abuParty.name,
      entries: [
        { accountId: 'ACC-BANK-01', accountName: 'Bank', debit: 4600, credit: 0 },
        { accountId: abuParty.id, accountName: abuParty.name, debit: 0, credit: 4600 },
      ],
      paymentAllocations: [
        {
          documentId: inv2.id,
          documentNumber: inv2.invoiceNumber,
          documentType: 'INVOICE',
          amount: 4600,
        },
      ],
    });
    db.savePaymentVoucher(rcpt2);

    // VCH-RCPT-REC-641018: 9,200 (2026-11-06 10:00) -> allocated to INV-ABU-0058
    const rcpt3 = makeVoucher({
      id: 'VCH-RCPT-REC-641018',
      voucherNumber: 'REC-641018',
      voucherType: 'RECEIPT',
      date: '2026-11-06',
      createdAt: '2026-11-06T10:00:00.000Z',
      totalAmount: 9200,
      narration: 'Payment for 0058',
      partyId: abuParty.id,
      partyName: abuParty.name,
      entries: [
        { accountId: 'ACC-BANK-01', accountName: 'Bank', debit: 9200, credit: 0 },
        { accountId: abuParty.id, accountName: abuParty.name, debit: 0, credit: 9200 },
      ],
      paymentAllocations: [
        {
          documentId: inv3.id,
          documentNumber: inv3.invoiceNumber,
          documentType: 'INVOICE',
          amount: 9200,
        },
      ],
    });
    db.savePaymentVoucher(rcpt3);

    // VCH-RCPT-REC-470200: 10,275 (2026-11-18 12:00) -> allocated 9,200 to 0098 + 1,075 to OPENING-BALANCE
    const rcpt4 = makeVoucher({
      id: 'VCH-RCPT-REC-470200',
      voucherNumber: 'REC-470200',
      voucherType: 'RECEIPT',
      date: '2026-11-18',
      createdAt: '2026-11-18T12:00:00.000Z',
      totalAmount: 10275,
      narration: 'Payment for 0098 and Opening Balance',
      partyId: abuParty.id,
      partyName: abuParty.name,
      entries: [
        { accountId: 'ACC-BANK-01', accountName: 'Bank', debit: 10275, credit: 0 },
        { accountId: abuParty.id, accountName: abuParty.name, debit: 0, credit: 10275 },
      ],
      paymentAllocations: [
        {
          documentId: inv4.id,
          documentNumber: inv4.invoiceNumber,
          documentType: 'INVOICE',
          amount: 9200,
        },
        {
          documentId: `OPENING-BALANCE-${abuParty.id}`,
          documentNumber: 'Opening Balance',
          documentType: 'INVOICE',
          amount: 1075,
        },
      ],
    });
    db.savePaymentVoucher(rcpt4);

    // Assertion 1: db.recalculatePartyBalance(partyId) === 0
    const recalcedBalance = db.recalculatePartyBalance(abuParty.id);
    expect(recalcedBalance).toBe(0);

    // Assertion 2: After db.syncAllPartyBalances(), storedParty.currentBalance === 0
    db.syncAllPartyBalances();
    const storedAbu = db.getParties().find((p) => p.id === abuParty.id);
    expect(storedAbu).toBeDefined();
    expect(storedAbu!.currentBalance).toBe(0);

    // Assertion 3 & 4: usePartyPassbook liveNetBalance === 0 and passbook runningBalance === 0
    const hook = renderPassbookHook({
      party: storedAbu!,
      company: dummyCompany,
      invoices: db.getInvoices(),
      purchases: db.getPurchases(),
      vouchers: db.getVouchers(),
    });

    try {
      const hookResult = hook.result();
      expect(hookResult.liveNetBalance).toBe(0);
      expect(hookResult.passbook.length).toBeGreaterThan(0);
      const lastEntry = hookResult.passbook[hookResult.passbook.length - 1];
      expect(lastEntry.runningBalance).toBe(0);
    } finally {
      hook.unmount();
    }
  });

  it('1-4. Nitai Bauri fixture: verifies recalculatePartyBalance, syncAllPartyBalances, liveNetBalance, and runningBalance === 0', () => {
    // Setup Nitai Bauri
    const nitaiParty = makeParty({
      id: 'CUST-NITAI-001',
      name: 'Nitai Bauri',
      type: 'CUSTOMER',
      phone: '9876500002',
      billingAddress: 'Durgapur',
      openingBalance: 2600,
      openingBalanceType: 'TO_RECEIVE',
      openingBalanceDate: '2026-10-01',
      currentBalance: 0,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    });
    db.saveParty(nitaiParty);

    // Invoice INV/26-27/0006: 650
    const inv = makeInvoice({
      id: 'INV-NITAI-0006',
      invoiceNumber: 'INV/26-27/0006',
      date: '2026-10-15',
      createdAt: '2026-10-15T09:00:00.000Z',
      updatedAt: '2026-10-15T09:00:00.000Z',
      partyId: nitaiParty.id,
      partyName: nitaiParty.name,
      partyAddress: nitaiParty.billingAddress,
      totalGrossAmount: 650,
      totalTaxableAmount: 650,
      grandTotal: 650,
      amountInWords: 'Six Hundred Fifty Only',
      paidAmount: 0,
      balanceAmount: 650,
      paymentStatus: 'UNPAID',
      paymentMode: 'CREDIT',
    });
    db.saveInvoice(inv);

    // Receipt VCH-RCPT-REC-208647: 3,250 -> 2,600 to OPENING-BALANCE + 650 to INV-NITAI-0006
    const rcpt = makeVoucher({
      id: 'VCH-RCPT-REC-208647',
      voucherNumber: 'REC-208647',
      voucherType: 'RECEIPT',
      date: '2026-10-16',
      createdAt: '2026-10-16T10:00:00.000Z',
      totalAmount: 3250,
      narration: 'Settlement of invoice and opening balance',
      partyId: nitaiParty.id,
      partyName: nitaiParty.name,
      entries: [
        { accountId: 'ACC-BANK-01', accountName: 'Bank', debit: 3250, credit: 0 },
        { accountId: nitaiParty.id, accountName: nitaiParty.name, debit: 0, credit: 3250 },
      ],
      paymentAllocations: [
        {
          documentId: `OPENING-BALANCE-${nitaiParty.id}`,
          documentNumber: 'Opening Balance',
          documentType: 'INVOICE',
          amount: 2600,
        },
        {
          documentId: inv.id,
          documentNumber: inv.invoiceNumber,
          documentType: 'INVOICE',
          amount: 650,
        },
      ],
    });
    db.savePaymentVoucher(rcpt);

    // Assertion 1: db.recalculatePartyBalance(partyId) === 0
    const recalcedBalance = db.recalculatePartyBalance(nitaiParty.id);
    expect(recalcedBalance).toBe(0);

    // Assertion 2: After db.syncAllPartyBalances(), storedParty.currentBalance === 0
    db.syncAllPartyBalances();
    const storedNitai = db.getParties().find((p) => p.id === nitaiParty.id);
    expect(storedNitai).toBeDefined();
    expect(storedNitai!.currentBalance).toBe(0);

    // Assertion 3 & 4: usePartyPassbook liveNetBalance === 0 and passbook runningBalance === 0
    const hook = renderPassbookHook({
      party: storedNitai!,
      company: dummyCompany,
      invoices: db.getInvoices(),
      purchases: db.getPurchases(),
      vouchers: db.getVouchers(),
    });

    try {
      const hookResult = hook.result();
      expect(hookResult.liveNetBalance).toBe(0);
      expect(hookResult.passbook.length).toBeGreaterThan(0);
      const lastEntry = hookResult.passbook[hookResult.passbook.length - 1];
      expect(lastEntry.runningBalance).toBe(0);
    } finally {
      hook.unmount();
    }
  });

  it('5. Parity guard: seed 3 arbitrary parties and assert syncAllPartyBalances() === recalculatePartyBalance(id) for every party', () => {
    // Party A: Customer with opening balance, partially paid invoices, and partial receipts
    const partyA = makeParty({
      id: 'CUST-PARITY-A',
      name: 'Alpha Customer',
      type: 'CUSTOMER',
      openingBalance: 3000,
      openingBalanceType: 'TO_RECEIVE',
      currentBalance: 0,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    });
    db.saveParty(partyA);

    const invA = makeInvoice({
      id: 'INV-PARITY-A1',
      invoiceNumber: 'INV/PARITY/A1',
      date: '2026-11-02',
      partyId: partyA.id,
      partyName: partyA.name,
      partyAddress: partyA.billingAddress,
      grandTotal: 5000,
      paidAmount: 2000,
      balanceAmount: 3000,
      paymentStatus: 'PARTIAL',
      paymentMode: 'SPLIT',
      createdAt: '2026-11-02T10:00:00.000Z',
      updatedAt: '2026-11-02T10:00:00.000Z',
      totalGrossAmount: 5000,
      totalTaxableAmount: 5000,
    });
    db.saveInvoice(invA);

    const rcptA = makeVoucher({
      id: 'VCH-PARITY-A1',
      voucherNumber: 'RCPT-PARITY-A1',
      voucherType: 'RECEIPT',
      date: '2026-11-03',
      totalAmount: 1500,
      partyId: partyA.id,
      partyName: partyA.name,
      entries: [
        { accountId: 'ACC-CASH-01', accountName: 'Cash', debit: 1500, credit: 0 },
        { accountId: partyA.id, accountName: partyA.name, debit: 0, credit: 1500 },
      ],
      createdAt: '2026-11-03T10:00:00.000Z',
    });
    db.saveVoucher(rcptA);

    // Party B: Supplier with opening balance, purchases, debit note, and payment
    const partyB = makeParty({
      id: 'SUPP-PARITY-B',
      name: 'Beta Vendor',
      type: 'SUPPLIER',
      openingBalance: 4000,
      openingBalanceType: 'TO_PAY',
      currentBalance: 0,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    });
    db.saveParty(partyB);

    const purB = makePurchase({
      id: 'PUR-PARITY-B1',
      billNumber: 'BILL/PARITY/B1',
      purchaseType: 'BILL',
      date: '2026-11-02',
      supplierId: partyB.id,
      supplierName: partyB.name,
      supplierAddress: partyB.billingAddress,
      grandTotal: 8000,
      paidAmount: 3000,
      balanceAmount: 5000,
      paymentStatus: 'PARTIAL',
      paymentMode: 'SPLIT',
      createdAt: '2026-11-02T10:00:00.000Z',
      updatedAt: '2026-11-02T10:00:00.000Z',
      totalGrossAmount: 8000,
      totalTaxableAmount: 8000,
    });
    db.savePurchase(purB);

    const retB = makePurchase({
      ...purB,
      id: 'PUR-PARITY-B2-RET',
      billNumber: 'RET/PARITY/B2',
      purchaseType: 'RETURN',
      grandTotal: 1200,
      paidAmount: 0,
      balanceAmount: 1200,
      paymentStatus: 'UNPAID',
    });
    db.savePurchase(retB);

    const pmtB = makeVoucher({
      id: 'VCH-PARITY-B1',
      voucherNumber: 'PMT-PARITY-B1',
      voucherType: 'PAYMENT',
      date: '2026-11-03',
      totalAmount: 2500,
      partyId: partyB.id,
      partyName: partyB.name,
      entries: [
        { accountId: partyB.id, accountName: partyB.name, debit: 2500, credit: 0 },
        { accountId: 'ACC-BANK-01', accountName: 'Bank', debit: 0, credit: 2500 },
      ],
      createdAt: '2026-11-03T10:00:00.000Z',
    });
    db.saveVoucher(pmtB);

    // Party C: Customer with no opening balance, multiple invoices, and advance receipt exceeding invoice total
    const partyC = makeParty({
      id: 'CUST-PARITY-C',
      name: 'Gamma Customer',
      type: 'CUSTOMER',
      openingBalance: 0,
      currentBalance: 0,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    });
    db.saveParty(partyC);

    const invC1 = makeInvoice({
      id: 'INV-PARITY-C1',
      invoiceNumber: 'INV/PARITY/C1',
      partyId: partyC.id,
      partyName: partyC.name,
      partyAddress: partyC.billingAddress,
      grandTotal: 2000,
      paidAmount: 2000,
      balanceAmount: 0,
      paymentStatus: 'PAID',
      paymentMode: 'CASH',
      totalGrossAmount: 2000,
      totalTaxableAmount: 2000,
    });
    db.saveInvoice(invC1);

    const rcptC = makeVoucher({
      id: 'VCH-PARITY-C1',
      voucherNumber: 'RCPT-PARITY-C1',
      voucherType: 'RECEIPT',
      date: '2026-11-04',
      totalAmount: 3500, // 2000 settled + 1500 unallocated advance
      partyId: partyC.id,
      partyName: partyC.name,
      entries: [
        { accountId: 'ACC-CASH-01', accountName: 'Cash', debit: 3500, credit: 0 },
        { accountId: partyC.id, accountName: partyC.name, debit: 0, credit: 3500 },
      ],
      createdAt: '2026-11-04T10:00:00.000Z',
    });
    db.saveVoucher(rcptC);

    // Calculate oracle balances for all parties
    const allParties = db.getParties();
    const oracleMap = new Map<string, number>();
    for (const p of allParties) {
      oracleMap.set(p.id, db.recalculatePartyBalance(p.id));
    }

    // Run syncAllPartyBalances
    db.syncAllPartyBalances();

    // Verify 100% exact parity across every single party
    const syncedParties = db.getParties();
    for (const p of syncedParties) {
      const expected = oracleMap.get(p.id);
      expect(p.currentBalance).toBe(expected);
    }
  });

  it('6. Regression: a truly unallocated receipt still reduces the balance (receipt 1,000, no allocations, no invoice) -> -1,000 (credit 1,000)', () => {
    const unallocatedCust = makeParty({
      id: 'CUST-REGRESSION-UNALLOC',
      name: 'Unallocated Advance Customer',
      type: 'CUSTOMER',
      openingBalance: 0,
      currentBalance: 0,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    });
    db.saveParty(unallocatedCust);

    // Receipt voucher of 1,000 with no allocations and no invoice
    const rcpt = makeVoucher({
      id: 'VCH-REGRESSION-ADV-1',
      voucherNumber: 'RCPT-ADV-1000',
      voucherType: 'RECEIPT',
      date: '2026-11-05',
      totalAmount: 1000,
      narration: 'Advance deposit from customer',
      partyId: unallocatedCust.id,
      partyName: unallocatedCust.name,
      entries: [
        { accountId: 'ACC-CASH-01', accountName: 'Cash', debit: 1000, credit: 0 },
        { accountId: unallocatedCust.id, accountName: unallocatedCust.name, debit: 0, credit: 1000 },
      ],
      paymentAllocations: [],
      createdAt: '2026-11-05T10:00:00.000Z',
    });
    db.saveVoucher(rcpt);

    // Recalculate balance -> must be -1000 (credit 1,000)
    const recalced = db.recalculatePartyBalance(unallocatedCust.id);
    expect(recalced).toBe(-1000);

    // Sync all balances -> stored currentBalance must be -1000
    db.syncAllPartyBalances();
    const stored = db.getParties().find((p) => p.id === unallocatedCust.id);
    expect(stored).toBeDefined();
    expect(stored!.currentBalance).toBe(-1000);

    // Passbook liveNetBalance -> must be -1000
    const hook = renderPassbookHook({
      party: stored!,
      company: dummyCompany,
      invoices: db.getInvoices(),
      purchases: db.getPurchases(),
      vouchers: db.getVouchers(),
    });

    try {
      const hookResult = hook.result();
      expect(hookResult.liveNetBalance).toBe(-1000);
      expect(hookResult.passbook.length).toBe(1);
      expect(hookResult.passbook[0].runningBalance).toBe(-1000);
    } finally {
      hook.unmount();
    }
  });
});
