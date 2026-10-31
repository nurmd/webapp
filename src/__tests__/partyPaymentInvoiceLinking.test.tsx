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
import { RecordPaymentModal } from '../components/Parties/RecordPaymentModal.tsx';
import { PartyDetailModal } from '../components/Parties/PartyDetailModal.tsx';
import { VoucherEditorModal } from '../components/Parties/VoucherEditorModal.tsx';
import { resetBackNavigationForTesting } from '../core/utils/backNavigation.ts';
import type { Party } from '../models/party.ts';
import type { Invoice } from '../models/invoice.ts';
import type { BankAccount } from '../models/bankAccount.ts';
import type { CompanyProfile } from '../models/company.ts';
import type { Voucher } from '../core/accounting/voucherTypes.ts';

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

describe('Party Details Payment Linking to Invoices Specification', () => {
  let container: HTMLDivElement;
  let root: Root;

  const sampleCompany: CompanyProfile = {
    id: 'COMP-01',
    businessName: 'Apex Technologies',
    gstin: '27AAAAA0000A1Z5',
    pan: 'AAAAA0000A',
    pincode: '400001',
    stateCode: '27',
    address: 'Andheri East, Mumbai',
    email: 'contact@apex.com',
    phone: '9820098200',
  };

  const sampleCustomer: Party = {
    id: 'CUST-LINK-1',
    name: 'Rajesh Enterprise',
    type: 'CUSTOMER',
    phone: '9876543210',
    billingAddress: 'Bandra, Mumbai',
    stateCode: '27',
    openingBalance: 0,
    currentBalance: 0,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };

  const mockAccounts: BankAccount[] = [
    {
      id: 'ACC_BANK_1',
      accountName: 'HDFC Current',
      accountType: 'BANK',
      openingBalance: 50000,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      isDefault: true,
    },
  ];

  const makeInvoice = (id: string, num: string, date: string, total: number, paid = 0): Invoice => ({
    id,
    invoiceNumber: num,
    invoiceType: 'B2B',
    date,
    partyId: sampleCustomer.id,
    partyName: sampleCustomer.name,
    partyAddress: sampleCustomer.billingAddress,
    partyStateCode: sampleCustomer.stateCode,
    placeOfSupplyStateCode: sampleCustomer.stateCode,
    isIntraState: true,
    items: [
      {
        id: `item-${id}`,
        itemId: `item-${id}`,
        name: 'Hardware Service',
        hsnSacCode: '9987',
        quantity: 1,
        unit: 'NOS',
        unitPrice: total,
        taxableAmount: total,
        gstRate: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        cessAmount: 0,
        totalAmount: total,
        total: total,
      },
    ],
    totalGrossAmount: total,
    totalDiscount: 0,
    totalTaxableAmount: total,
    totalCgst: 0,
    totalSgst: 0,
    totalIgst: 0,
    totalCess: 0,
    totalTax: 0,
    roundOff: 0,
    grandTotal: total,
    paidAmount: paid,
    balanceAmount: Math.max(0, Number((total - paid).toFixed(2))),
    paymentStatus: paid >= total ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID',
    paymentMode: paid > 0 ? 'UPI' : 'CREDIT',
    amountInWords: 'Rupees Only',
    isCancelled: false,
    createdAt: `${date}T10:00:00Z`,
    updatedAt: `${date}T10:00:00Z`,
  });

  beforeEach(() => {
    testStorage.clear();
    vi.clearAllMocks();
    resetBackNavigationForTesting();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    db.saveCompany(sampleCompany);
    db.saveParty(sampleCustomer);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('1. Linking a partial payment to an invoice updates balanceAmount, paidAmount, and paymentStatus to PARTIAL', () => {
    const inv = makeInvoice('INV-01', 'INV-001', '2026-10-15', 1000, 0);
    db.saveInvoice(inv);

    const voucher: Voucher = {
      id: 'VCH-P1',
      voucherNumber: 'RCPT-0001',
      voucherType: 'RECEIPT',
      date: '2026-10-16',
      partyId: sampleCustomer.id,
      partyName: sampleCustomer.name,
      totalAmount: 400,
      narration: 'Partial payment',
      allocationMode: 'MANUAL',
      paymentAllocations: [
        {
          documentType: 'INVOICE',
          documentId: inv.id,
          documentNumber: inv.invoiceNumber,
          amount: 400,
          date: inv.date,
        },
      ],
      entries: [
        { accountId: 'ACC_BANK_1', accountName: 'HDFC Current', debit: 400, credit: 0 },
        { accountId: sampleCustomer.id, accountName: sampleCustomer.name, debit: 0, credit: 400 },
      ],
      createdAt: '2026-10-16T10:00:00.000Z',
    };

    db.savePaymentVoucher(voucher);

    const updatedInv = db.getInvoices().find((i) => i.id === inv.id);
    expect(updatedInv).toBeDefined();
    expect(updatedInv?.paidAmount).toBe(400);
    expect(updatedInv?.balanceAmount).toBe(600);
    expect(updatedInv?.paymentStatus).toBe('PARTIAL');
  });

  it('2. Linking multiple cumulative payments to the same invoice updates paidAmount cumulatively and sets PAID when fully settled', () => {
    const inv = makeInvoice('INV-02', 'INV-002', '2026-10-10', 1000, 0);
    db.saveInvoice(inv);

    // Payment 1: 400
    const v1: Voucher = {
      id: 'VCH-MULTI-1',
      voucherNumber: 'RCPT-0011',
      voucherType: 'RECEIPT',
      date: '2026-10-11',
      partyId: sampleCustomer.id,
      partyName: sampleCustomer.name,
      totalAmount: 400,
      narration: 'First tranche',
      allocationMode: 'MANUAL',
      paymentAllocations: [
        { documentType: 'INVOICE', documentId: inv.id, documentNumber: inv.invoiceNumber, amount: 400, date: inv.date },
      ],
      entries: [
        { accountId: 'ACC_CASH', accountName: 'Cash-in-hand', debit: 400, credit: 0 },
        { accountId: sampleCustomer.id, accountName: sampleCustomer.name, debit: 0, credit: 400 },
      ],
      createdAt: '2026-10-11T10:00:00.000Z',
    };
    db.savePaymentVoucher(v1);

    let currentInv = db.getInvoices().find((i) => i.id === inv.id);
    expect(currentInv?.paidAmount).toBe(400);
    expect(currentInv?.balanceAmount).toBe(600);
    expect(currentInv?.paymentStatus).toBe('PARTIAL');

    // Payment 2: 400
    const v2: Voucher = {
      id: 'VCH-MULTI-2',
      voucherNumber: 'RCPT-0012',
      voucherType: 'RECEIPT',
      date: '2026-10-12',
      partyId: sampleCustomer.id,
      partyName: sampleCustomer.name,
      totalAmount: 400,
      narration: 'Second tranche',
      allocationMode: 'MANUAL',
      paymentAllocations: [
        { documentType: 'INVOICE', documentId: inv.id, documentNumber: inv.invoiceNumber, amount: 400, date: inv.date },
      ],
      entries: [
        { accountId: 'ACC_CASH', accountName: 'Cash-in-hand', debit: 400, credit: 0 },
        { accountId: sampleCustomer.id, accountName: sampleCustomer.name, debit: 0, credit: 400 },
      ],
      createdAt: '2026-10-12T10:00:00.000Z',
    };
    db.savePaymentVoucher(v2);

    currentInv = db.getInvoices().find((i) => i.id === inv.id);
    expect(currentInv?.paidAmount).toBe(800);
    expect(currentInv?.balanceAmount).toBe(200);
    expect(currentInv?.paymentStatus).toBe('PARTIAL');

    // Payment 3: 200 (final settlement)
    const v3: Voucher = {
      id: 'VCH-MULTI-3',
      voucherNumber: 'RCPT-0013',
      voucherType: 'RECEIPT',
      date: '2026-10-13',
      partyId: sampleCustomer.id,
      partyName: sampleCustomer.name,
      totalAmount: 200,
      narration: 'Final tranche',
      allocationMode: 'MANUAL',
      paymentAllocations: [
        { documentType: 'INVOICE', documentId: inv.id, documentNumber: inv.invoiceNumber, amount: 200, date: inv.date },
      ],
      entries: [
        { accountId: 'ACC_CASH', accountName: 'Cash-in-hand', debit: 200, credit: 0 },
        { accountId: sampleCustomer.id, accountName: sampleCustomer.name, debit: 0, credit: 200 },
      ],
      createdAt: '2026-10-13T10:00:00.000Z',
    };
    db.savePaymentVoucher(v3);

    currentInv = db.getInvoices().find((i) => i.id === inv.id);
    expect(currentInv?.paidAmount).toBe(1000);
    expect(currentInv?.balanceAmount).toBe(0);
    expect(currentInv?.paymentStatus).toBe('PAID');
  });

  it('3. Manual linking UI shows each outstanding invoice with its available (remaining) balance', async () => {
    const inv = makeInvoice('INV-03', 'INV-003', '2026-10-10', 2500, 500); // 2000 remaining
    db.saveInvoice(inv);

    const onRecordPaymentMock = vi.fn().mockReturnValue(true);

    await act(async () => {
      root.render(
        <RecordPaymentModal
          isOpen={true}
          onClose={() => {}}
          party={sampleCustomer}
          parties={[sampleCustomer]}
          invoices={[inv]}
          bankAccounts={mockAccounts}
          onRecordPayment={onRecordPaymentMock}
          initialPaymentType="IN"
        />
      );
    });

    // Verify invoice number and available (remaining) balance are displayed
    expect(container.textContent).toContain('#INV-003');
    expect(container.textContent).toContain('Bal: ₹ 2,000.00');
    expect(container.textContent).toContain('Available (Remaining): ₹ 2,000.00');
  });

  it('4. Manual linking UI clamps entered value to available balance and rejects over-allocation', async () => {
    const inv = makeInvoice('INV-04', 'INV-004', '2026-10-10', 1000, 0);
    db.saveInvoice(inv);

    const onRecordPaymentMock = vi.fn().mockReturnValue(true);

    await act(async () => {
      root.render(
        <RecordPaymentModal
          isOpen={true}
          onClose={() => {}}
          party={sampleCustomer}
          parties={[sampleCustomer]}
          invoices={[inv]}
          bankAccounts={mockAccounts}
          onRecordPayment={onRecordPaymentMock}
          initialPaymentType="IN"
        />
      );
    });

    // Find the allocation amount input for the invoice
    const inputs = Array.from(container.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
    const docAllocInput = inputs.find((i) => i.getAttribute('max') === '1000');
    expect(docAllocInput).toBeDefined();

    // Type 1500 which exceeds the invoice balance 1000
    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      nativeSetter?.call(docAllocInput, '1500');
      docAllocInput?.dispatchEvent(new Event('input', { bubbles: true }));
      docAllocInput?.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // The input value must be clamped to 1000 (available balance)
    expect(docAllocInput?.value).toBe('1000');
    expect(container.textContent).toContain('Available (Remaining): ₹ 0.00');
  });

  it('5. Opening balance pseudo-documents continue to work as before and can be linked up to openingBalance', async () => {
    const custWithOp: Party = {
      id: 'CUST-OP-01',
      name: 'Verma Traders',
      type: 'CUSTOMER',
      phone: '9876543299',
      billingAddress: 'Pune',
      stateCode: '27',
      openingBalance: 3500,
      openingBalanceType: 'TO_RECEIVE',
      currentBalance: 3500,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    db.saveParty(custWithOp);

    const onRecordPaymentMock = vi.fn().mockReturnValue(true);

    await act(async () => {
      root.render(
        <RecordPaymentModal
          isOpen={true}
          onClose={() => {}}
          party={custWithOp}
          parties={[custWithOp]}
          invoices={[]}
          bankAccounts={mockAccounts}
          onRecordPayment={onRecordPaymentMock}
          initialPaymentType="IN"
        />
      );
    });

    // Auto-FIFO allocates all 3500 from the payment amount (3500)
    expect(container.textContent).toContain('Opening Balance');
    expect(container.textContent).not.toContain('#Opening Balance');
    expect(container.textContent).toContain('Bal: ₹ 3,500.00');
    expect(container.textContent).toContain('Available (Remaining): ₹ 0.00');
    expect(container.textContent).toContain('Allocated: ₹ 3,500.00');

    // Click "Clear" to unallocate and verify available balance resets to 3500
    const clearBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Clear');
    expect(clearBtn).toBeDefined();
    act(() => {
      clearBtn?.click();
    });
    expect(container.textContent).toContain('Available (Remaining): ₹ 3,500.00');
    expect(container.textContent).toContain('Unallocated / Advance: ₹ 3,500.00');

    // Click "Auto FIFO" again to allocate
    const autoBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Auto FIFO');
    act(() => {
      autoBtn?.click();
    });
    expect(container.textContent).toContain('Available (Remaining): ₹ 0.00');

    // Submit payment
    const form = container.querySelector('form');
    act(() => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(onRecordPaymentMock).toHaveBeenCalledTimes(1);
    const passedAllocations = onRecordPaymentMock.mock.calls[0][8];
    expect(passedAllocations).toHaveLength(1);
    expect(passedAllocations[0].documentId).toBe(`OPENING-BALANCE-${custWithOp.id}`);
    expect(passedAllocations[0].amount).toBe(3500);
  });

  it('6. PartyDetailModal records linked payment and immediately reflects updated balance and transaction ledger', async () => {
    const inv = makeInvoice('INV-06', 'INV-006', '2026-10-15', 5000, 0);
    db.saveInvoice(inv);
    sampleCustomer.currentBalance = 5000;
    db.saveParty(sampleCustomer);

    await act(async () => {
      root.render(
        <PartyDetailModal
          party={sampleCustomer}
          company={sampleCompany}
          invoices={[inv]}
          purchases={[]}
          vouchers={[]}
          bankAccounts={mockAccounts}
          mode="page"
          isOpen={true}
          onEditParty={() => {}}
          onRecordPayment={() => {}}
          onRefresh={() => {}}
        />
      );
    });

    // Initial state: shows Sale and Unpaid
    expect(container.textContent).toContain('INV-006');
    expect(container.textContent).toContain('UNPAID');

    // Record payment directly to db
    const voucher: Voucher = {
      id: 'VCH-PAGE-1',
      voucherNumber: 'RCPT-0099',
      voucherType: 'RECEIPT',
      date: '2026-10-16',
      partyId: sampleCustomer.id,
      partyName: sampleCustomer.name,
      totalAmount: 2000,
      narration: 'Payment via ledger',
      allocationMode: 'MANUAL',
      paymentAllocations: [
        {
          documentType: 'INVOICE',
          documentId: inv.id,
          documentNumber: inv.invoiceNumber,
          amount: 2000,
          date: inv.date,
        },
      ],
      entries: [
        { accountId: 'ACC_BANK_1', accountName: 'HDFC Current', debit: 2000, credit: 0 },
        { accountId: sampleCustomer.id, accountName: sampleCustomer.name, debit: 0, credit: 2000 },
      ],
      createdAt: '2026-10-16T10:00:00.000Z',
    };

    await act(async () => {
      db.savePaymentVoucher(voucher);
      await new Promise((r) => setTimeout(r, 50));
    });

    // The invoice is now PARTIAL with 2000 paid and 3000 due
    const updatedInv = db.getInvoices().find((i) => i.id === inv.id);
    expect(updatedInv?.paidAmount).toBe(2000);
    expect(updatedInv?.balanceAmount).toBe(3000);
    expect(updatedInv?.paymentStatus).toBe('PARTIAL');

    // PartyDetailModal subscribed to db updates and re-renders with PARTIAL and updated paid/due
    expect(container.textContent).toContain('PARTIAL');
    expect(container.textContent).toContain('Paid: ₹ 2,000.00');
    expect(container.textContent).toContain('Due: ₹ 3,000.00');
  });
});
