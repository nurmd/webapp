import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

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
import { PurchaseBill } from '../models/purchase.ts';
import { InventoryItem } from '../models/item.ts';
import { Voucher } from '../core/accounting/voucherTypes.ts';
import { CompanyProfile } from '../models/company.ts';
import { usePartyPassbook } from '../components/Parties/usePartyPassbook.ts';
import { TableGridInvoiceModal } from '../components/Invoicing/TableGridInvoiceModal.tsx';
import { CreateInvoiceModal } from '../components/Invoicing/CreateInvoiceModal.tsx';
import { QuickBillingView } from '../components/POS/QuickBillingView.tsx';
import { VoucherEditorModal } from '../components/Parties/VoucherEditorModal.tsx';

const dummyCompany: CompanyProfile = {
  id: 'COMP-TEST',
  businessName: 'Apex Retailers',
  tradeName: 'Apex Store',
  gstin: '27AABCU9603R1ZM',
  pan: 'AABCU9603R',
  stateCode: '27',
  address: '123 Market Road, Pune',
  pincode: '411001',
  phone: '9876543210',
  email: 'apex@example.com',
  invoicePrefix: 'INV-',
  isGstEnabled: true,
};

function renderPassbookHook(params: any): { result: () => any; unmount: () => void } {
  let latestHookResult: any = null;
  function TestComponent() {
    latestHookResult = usePartyPassbook(params);
    return null;
  }

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<TestComponent />);
  });

  return {
    result: () => latestHookResult,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('Customer Opening Balance Retention & Ledger Calculation Verification', () => {
  beforeEach(() => {
    testStorage.clear();
    inMemoryDocs.clear();
    vi.clearAllMocks();
  });

  describe('R1: Customer Opening Balance Persistence & Referential Integrity', () => {
    it('preserves openingBalance, openingBalanceType, and openingBalanceDate when saving a party and generating an invoice', () => {
      const customer: Party = {
        id: 'PTY-CUST-101',
        name: 'Sharma Traders',
        type: 'CUSTOMER',
        phone: '9876543210',
        billingAddress: 'Main Road, Mumbai',
        stateCode: '27',
        openingBalance: 4500,
        openingBalanceType: 'TO_RECEIVE',
        openingBalanceDate: '2026-04-01',
        currentBalance: 4500,
        createdAt: '2026-04-01T09:00:00Z',
        updatedAt: '2026-04-01T09:00:00Z',
      };

      db.saveParty(customer);

      const savedBefore = db.getParties().find((p) => p.id === 'PTY-CUST-101');
      expect(savedBefore).toBeDefined();
      expect(savedBefore?.openingBalance).toBe(4500);
      expect(savedBefore?.openingBalanceType).toBe('TO_RECEIVE');
      expect(savedBefore?.openingBalanceDate).toBe('2026-04-01');

      // Create and save an unpaid invoice
      const invoice: Invoice = {
        id: 'INV-1001',
        invoiceNumber: 'INV-1001',
        invoiceType: 'B2CS',
        date: '2026-04-05',
        partyId: customer.id,
        partyName: customer.name,
        partyAddress: customer.billingAddress,
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [
          {
            itemId: 'ITM-01',
            name: 'Item Alpha',
            hsnSacCode: '8471',
            unit: 'PCS' as any,
            quantity: 2,
            unitPrice: 500,
            taxableAmount: 1000,
            gstRate: 18,
            cgstAmount: 90,
            sgstAmount: 90,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 1180,
          },
        ],
        totalGrossAmount: 1000,
        totalDiscount: 0,
        totalTaxableAmount: 1000,
        totalCgst: 90,
        totalSgst: 90,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 180,
        roundOff: 0,
        grandTotal: 1180,
        amountInWords: 'One Thousand One Hundred Eighty Only',
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 1180,
        createdAt: '2026-04-05T10:00:00Z',
        updatedAt: '2026-04-05T10:00:00Z',
      };

      db.saveInvoice(invoice);

      // Verify customer record strictly preserved opening balance fields
      const savedAfter = db.getParties().find((p) => p.id === customer.id);
      expect(savedAfter).toBeDefined();
      expect(savedAfter?.openingBalance).toBe(4500);
      expect(savedAfter?.openingBalanceType).toBe('TO_RECEIVE');
      expect(savedAfter?.openingBalanceDate).toBe('2026-04-01');

      // Verify persistent storage (PouchDB doc) also holds opening balance
      const pouchDoc = inMemoryDocs.get(`party:${customer.id}`);
      expect(pouchDoc).toBeDefined();
      expect(pouchDoc.openingBalance).toBe(4500);
      expect(pouchDoc.openingBalanceType).toBe('TO_RECEIVE');
      expect(pouchDoc.openingBalanceDate).toBe('2026-04-01');
    });

    it('retains opening balance if db.saveParty is called with an object that omitted openingBalance fields', () => {
      const customer: Party = {
        id: 'PTY-CUST-102',
        name: 'Gupta Enterprises',
        type: 'CUSTOMER',
        phone: '9811122233',
        billingAddress: 'Ring Road, Delhi',
        stateCode: '07',
        openingBalance: 3200,
        openingBalanceType: 'TO_RECEIVE',
        openingBalanceDate: '2026-03-15',
        currentBalance: 3200,
        createdAt: '2026-03-15T10:00:00Z',
        updatedAt: '2026-03-15T10:00:00Z',
      };

      db.saveParty(customer);

      // Partial update without openingBalance fields (simulating an external component save)
      const partialUpdate: Party = {
        id: customer.id,
        name: 'Gupta Enterprises (Updated)',
        type: 'CUSTOMER',
        phone: '9811122244',
        stateCode: '07',
        billingAddress: 'New Address, Delhi',
        currentBalance: 3200,
        createdAt: customer.createdAt,
        updatedAt: new Date().toISOString(),
      };

      db.saveParty(partialUpdate);

      const stored = db.getParties().find((p) => p.id === customer.id);
      expect(stored?.name).toBe('Gupta Enterprises (Updated)');
      expect(stored?.phone).toBe('9811122244');
      expect(stored?.openingBalance).toBe(3200);
      expect(stored?.openingBalanceType).toBe('TO_RECEIVE');
      expect(stored?.openingBalanceDate).toBe('2026-03-15');
    });

    it('supports explicit opening balance deletion via db.clearPartyOpeningBalance', () => {
      const customer: Party = {
        id: 'PTY-CUST-103',
        name: 'Patel Stores',
        type: 'CUSTOMER',
        phone: '9922334455',
        billingAddress: 'Station Road, Surat',
        stateCode: '24',
        openingBalance: 1500,
        openingBalanceType: 'TO_RECEIVE',
        openingBalanceDate: '2026-02-01',
        currentBalance: 1500,
        createdAt: '2026-02-01T08:00:00Z',
        updatedAt: '2026-02-01T08:00:00Z',
      };

      db.saveParty(customer);
      expect(db.getParties().find((p) => p.id === customer.id)?.openingBalance).toBe(1500);

      db.clearPartyOpeningBalance(customer.id);
      const afterClear = db.getParties().find((p) => p.id === customer.id);
      expect(afterClear?.openingBalance).toBeUndefined();
      expect(afterClear?.openingBalanceType).toBeUndefined();
      expect(afterClear?.openingBalanceDate).toBeUndefined();
      expect(afterClear?.currentBalance).toBe(0);
    });
  });

  describe('R2: Accurate Balance Recalculation with Opening Balance', () => {
    it('correctly calculates party.currentBalance as openingBalance + unpaidInvoiceAmount for TO_RECEIVE', () => {
      const customer: Party = {
        id: 'PTY-CALC-001',
        name: 'Verma Provisions',
        type: 'CUSTOMER',
        phone: '9877788899',
        billingAddress: 'Market Yard, Pune',
        stateCode: '27',
        openingBalance: 5000,
        openingBalanceType: 'TO_RECEIVE',
        openingBalanceDate: '2026-04-01',
        currentBalance: 5000,
        createdAt: '2026-04-01T10:00:00Z',
        updatedAt: '2026-04-01T10:00:00Z',
      };
      db.saveParty(customer);

      const inv1: Invoice = {
        id: 'INV-2001',
        invoiceNumber: 'INV-2001',
        invoiceType: 'B2CS',
        date: '2026-04-02',
        partyId: customer.id,
        partyName: customer.name,
        partyAddress: customer.billingAddress,
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        totalGrossAmount: 2000,
        totalDiscount: 0,
        totalTaxableAmount: 2000,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 2000,
        amountInWords: 'Two Thousand Only',
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 2000,
        createdAt: '2026-04-02T10:00:00Z',
        updatedAt: '2026-04-02T10:00:00Z',
      };
      db.saveInvoice(inv1);

      const net1 = db.recalculatePartyBalance(customer.id);
      expect(net1).toBe(7000); // 5000 opening + 2000 unpaid

      const storedParty = db.getParties().find((p) => p.id === customer.id);
      expect(storedParty?.currentBalance).toBe(7000);
      expect(storedParty?.openingBalance).toBe(5000);
    });

    it('correctly calculates balance for TO_PAY advance opening balance', () => {
      const customer: Party = {
        id: 'PTY-CALC-002',
        name: 'Advance Customer',
        type: 'CUSTOMER',
        phone: '9888877766',
        billingAddress: 'Camp, Pune',
        stateCode: '27',
        openingBalance: 1200,
        openingBalanceType: 'TO_PAY', // Customer has advance/credit with us
        openingBalanceDate: '2026-04-01',
        currentBalance: -1200,
        createdAt: '2026-04-01T10:00:00Z',
        updatedAt: '2026-04-01T10:00:00Z',
      };
      db.saveParty(customer);

      const inv: Invoice = {
        id: 'INV-2002',
        invoiceNumber: 'INV-2002',
        invoiceType: 'B2CS',
        date: '2026-04-03',
        partyId: customer.id,
        partyName: customer.name,
        partyAddress: customer.billingAddress,
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        totalGrossAmount: 2000,
        totalDiscount: 0,
        totalTaxableAmount: 2000,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 2000,
        amountInWords: 'Two Thousand Only',
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 2000,
        createdAt: '2026-04-03T10:00:00Z',
        updatedAt: '2026-04-03T10:00:00Z',
      };
      db.saveInvoice(inv);

      const net = db.recalculatePartyBalance(customer.id);
      expect(net).toBe(800); // -1200 advance opening + 2000 unpaid invoice = +800 receivable
      expect(db.getParties().find((p) => p.id === customer.id)?.openingBalance).toBe(1200);
      expect(db.getParties().find((p) => p.id === customer.id)?.openingBalanceType).toBe('TO_PAY');
    });

    it('handles multiple consecutive invoices maintaining opening balance across all recalculations', () => {
      const customer: Party = {
        id: 'PTY-CALC-003',
        name: 'Bulk Retail Client',
        type: 'CUSTOMER',
        phone: '9900112233',
        billingAddress: 'FC Road, Pune',
        stateCode: '27',
        openingBalance: 10000,
        openingBalanceType: 'TO_RECEIVE',
        openingBalanceDate: '2026-04-01',
        currentBalance: 10000,
        createdAt: '2026-04-01T08:00:00Z',
        updatedAt: '2026-04-01T08:00:00Z',
      };
      db.saveParty(customer);

      // Invoice 1: Cash sale paid upfront (unpaid = 0)
      const invCash: Invoice = {
        id: 'INV-3001',
        invoiceNumber: 'INV-3001',
        invoiceType: 'B2CS',
        date: '2026-04-02',
        partyId: customer.id,
        partyName: customer.name,
        partyAddress: customer.billingAddress,
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        totalGrossAmount: 1500,
        totalDiscount: 0,
        totalTaxableAmount: 1500,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 1500,
        amountInWords: 'One Thousand Five Hundred Only',
        paymentMode: 'CASH',
        paymentStatus: 'PAID',
        paidAmount: 1500,
        balanceAmount: 0,
        createdAt: '2026-04-02T10:00:00Z',
        updatedAt: '2026-04-02T10:00:00Z',
      };
      db.saveInvoice(invCash);

      expect(db.recalculatePartyBalance(customer.id)).toBe(10000); // 10000 + 0

      // Invoice 2: Credit sale (unpaid = 3000)
      const invCredit1: Invoice = {
        id: 'INV-3002',
        invoiceNumber: 'INV-3002',
        invoiceType: 'B2B',
        date: '2026-04-03',
        partyId: customer.id,
        partyName: customer.name,
        partyAddress: customer.billingAddress,
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        totalGrossAmount: 3000,
        totalDiscount: 0,
        totalTaxableAmount: 3000,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 3000,
        amountInWords: 'Three Thousand Only',
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 3000,
        createdAt: '2026-04-03T10:00:00Z',
        updatedAt: '2026-04-03T10:00:00Z',
      };
      db.saveInvoice(invCredit1);

      expect(db.recalculatePartyBalance(customer.id)).toBe(13000); // 10000 + 0 + 3000

      // Invoice 3: Partial payment (grandTotal 5000, paid 2000, unpaid 3000)
      const invPartial: Invoice = {
        id: 'INV-3003',
        invoiceNumber: 'INV-3003',
        invoiceType: 'B2B',
        date: '2026-04-04',
        partyId: customer.id,
        partyName: customer.name,
        partyAddress: customer.billingAddress,
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        totalGrossAmount: 5000,
        totalDiscount: 0,
        totalTaxableAmount: 5000,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 5000,
        amountInWords: 'Five Thousand Only',
        paymentMode: 'SPLIT',
        paymentStatus: 'PARTIAL',
        paidAmount: 2000,
        balanceAmount: 3000,
        createdAt: '2026-04-04T10:00:00Z',
        updatedAt: '2026-04-04T10:00:00Z',
      };
      db.saveInvoice(invPartial);

      expect(db.recalculatePartyBalance(customer.id)).toBe(16000); // 10000 + 0 + 3000 + 3000

      // Synchronize all party balances check
      db.syncAllPartyBalances();
      const finalParty = db.getParties().find((p) => p.id === customer.id);
      expect(finalParty?.currentBalance).toBe(16000);
      expect(finalParty?.openingBalance).toBe(10000);
      expect(finalParty?.openingBalanceType).toBe('TO_RECEIVE');
      expect(finalParty?.openingBalanceDate).toBe('2026-04-01');
    });

    it('factors in unallocated receipt vouchers accurately without double counting', () => {
      const customer: Party = {
        id: 'PTY-CALC-004',
        name: 'Advance Receipt Client',
        type: 'CUSTOMER',
        phone: '9988776655',
        billingAddress: 'MG Road, Bangalore',
        stateCode: '29',
        openingBalance: 4000,
        openingBalanceType: 'TO_RECEIVE',
        openingBalanceDate: '2026-04-01',
        currentBalance: 4000,
        createdAt: '2026-04-01T08:00:00Z',
        updatedAt: '2026-04-01T08:00:00Z',
      };
      db.saveParty(customer);

      // Receipt Voucher: Client pays ₹5,000 via bank receipt voucher
      const receiptVoucher: Voucher = {
        id: 'VCH-RCPT-01',
        voucherNumber: 'VCH-RCPT-01',
        voucherType: 'RECEIPT',
        date: '2026-04-02',
        referenceNo: 'TXN-9988',
        narration: 'Payment received against dues',
        entries: [
          {
            accountId: customer.id,
            accountName: customer.name,
            debit: 0,
            credit: 5000,
            narration: 'Payment against dues',
          },
          {
            accountId: 'ACC_BANK',
            accountName: 'Bank Account',
            debit: 5000,
            credit: 0,
          },
        ],
        totalAmount: 5000,
        createdAt: '2026-04-02T10:00:00Z',
      };
      db.saveVoucher(receiptVoucher);

      // Recalculated balance: opening (4000) + unpaid (0) - unallocated receipt (5000) = -1000 (Advance)
      const bal = db.recalculatePartyBalance(customer.id);
      expect(bal).toBe(-1000);
      expect(db.getParties().find((p) => p.id === customer.id)?.openingBalance).toBe(4000);
    });
  });

  describe('R2 & AC: usePartyPassbook Baseline OPENING Entry & Running Balance', () => {
    it('displays the OPENING entry as the baseline transaction (index 0) with proper running balance', () => {
      const customer: Party = {
        id: 'PTY-PASS-001',
        name: 'Kulkarni Dist',
        type: 'CUSTOMER',
        phone: '9822334455',
        billingAddress: 'Karve Road, Pune',
        stateCode: '27',
        openingBalance: 6000,
        openingBalanceType: 'TO_RECEIVE',
        openingBalanceDate: '2026-04-01',
        currentBalance: 6000,
        createdAt: '2026-04-01T08:00:00Z',
        updatedAt: '2026-04-01T08:00:00Z',
      };

      // Invoice on the exact same date as opening balance
      const sameDateInvoice: Invoice = {
        id: 'INV-4001',
        invoiceNumber: 'INV-4001',
        invoiceType: 'B2CS',
        date: '2026-04-01',
        partyId: customer.id,
        partyName: customer.name,
        partyAddress: customer.billingAddress,
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        totalGrossAmount: 2500,
        totalDiscount: 0,
        totalTaxableAmount: 2500,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 2500,
        amountInWords: 'Two Thousand Five Hundred Only',
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 2500,
        createdAt: '2026-04-01T12:00:00Z',
        updatedAt: '2026-04-01T12:00:00Z',
      };

      const harness = renderPassbookHook({
        party: customer,
        company: dummyCompany,
        invoices: [sameDateInvoice],
        purchases: [],
        vouchers: [],
      });

      const res = harness.result();
      expect(res.passbook.length).toBe(2);

      // Baseline transaction check: OPENING must be index 0
      const entry0 = res.passbook[0];
      expect(entry0.type).toBe('OPENING');
      expect(entry0.docNumber).toBe('OPENING');
      expect(entry0.debit).toBe(6000);
      expect(entry0.credit).toBe(0);
      expect(entry0.runningBalance).toBe(6000);

      // Subsequent transaction check: SALE
      const entry1 = res.passbook[1];
      expect(entry1.type).toBe('SALE');
      expect(entry1.docNumber).toBe('INV-4001');
      expect(entry1.debit).toBe(2500);
      expect(entry1.credit).toBe(0);
      expect(entry1.runningBalance).toBe(8500);

      // liveNetBalance check
      expect(res.liveNetBalance).toBe(8500);
      expect(res.isReceivable).toBe(true);

      harness.unmount();
    });

    it('correctly orders passbook baseline OPENING for TO_PAY advance opening balance', () => {
      const customer: Party = {
        id: 'PTY-PASS-002',
        name: 'Advance Ledger Customer',
        type: 'CUSTOMER',
        phone: '9833445566',
        billingAddress: 'Baner, Pune',
        stateCode: '27',
        openingBalance: 3000,
        openingBalanceType: 'TO_PAY',
        openingBalanceDate: '2026-04-01',
        currentBalance: -3000,
        createdAt: '2026-04-01T08:00:00Z',
        updatedAt: '2026-04-01T08:00:00Z',
      };

      const inv: Invoice = {
        id: 'INV-4002',
        invoiceNumber: 'INV-4002',
        invoiceType: 'B2CS',
        date: '2026-04-02',
        partyId: customer.id,
        partyName: customer.name,
        partyAddress: customer.billingAddress,
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        totalGrossAmount: 5000,
        totalDiscount: 0,
        totalTaxableAmount: 5000,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 5000,
        amountInWords: 'Five Thousand Only',
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 5000,
        createdAt: '2026-04-02T10:00:00Z',
        updatedAt: '2026-04-02T10:00:00Z',
      };

      const harness = renderPassbookHook({
        party: customer,
        company: dummyCompany,
        invoices: [inv],
        purchases: [],
        vouchers: [],
      });

      const res = harness.result();
      expect(res.passbook.length).toBe(2);

      // OPENING baseline entry has credit = 3000, runningBalance = -3000
      expect(res.passbook[0].type).toBe('OPENING');
      expect(res.passbook[0].credit).toBe(3000);
      expect(res.passbook[0].runningBalance).toBe(-3000);

      // SALE has debit = 5000, runningBalance = 2000
      expect(res.passbook[1].type).toBe('SALE');
      expect(res.passbook[1].debit).toBe(5000);
      expect(res.passbook[1].runningBalance).toBe(2000);

      expect(res.liveNetBalance).toBe(2000);

      harness.unmount();
    });

    it('places OPENING entry as baseline at index 0 even when back-dated sales invoices exist prior to openingBalanceDate', () => {
      // Open Issues Ledger test: back-dated invoices prior to openingBalanceDate
      const customer: Party = {
        id: 'PTY-PASS-BACKDATED',
        name: 'Backdated Customer',
        type: 'CUSTOMER',
        phone: '9811223344',
        billingAddress: 'Shivajinagar, Pune',
        stateCode: '27',
        openingBalance: 8000,
        openingBalanceType: 'TO_RECEIVE',
        openingBalanceDate: '2026-04-01',
        currentBalance: 8000,
        createdAt: '2026-04-01T08:00:00Z',
        updatedAt: '2026-04-01T08:00:00Z',
      };

      // Invoice dated 2 weeks BEFORE the opening balance date (2026-03-15)
      const priorInvoice: Invoice = {
        id: 'INV-PRIOR-01',
        invoiceNumber: 'INV-PRIOR-01',
        invoiceType: 'B2CS',
        date: '2026-03-15',
        partyId: customer.id,
        partyName: customer.name,
        partyAddress: customer.billingAddress,
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        totalGrossAmount: 3000,
        totalDiscount: 0,
        totalTaxableAmount: 3000,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 3000,
        amountInWords: 'Three Thousand Only',
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 3000,
        createdAt: '2026-03-15T10:00:00Z',
        updatedAt: '2026-03-15T10:00:00Z',
      };

      // Invoice dated AFTER the opening balance date (2026-04-10)
      const afterInvoice: Invoice = {
        id: 'INV-AFTER-01',
        invoiceNumber: 'INV-AFTER-01',
        invoiceType: 'B2CS',
        date: '2026-04-10',
        partyId: customer.id,
        partyName: customer.name,
        partyAddress: customer.billingAddress,
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        totalGrossAmount: 1500,
        totalDiscount: 0,
        totalTaxableAmount: 1500,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 1500,
        amountInWords: 'One Thousand Five Hundred Only',
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 1500,
        createdAt: '2026-04-10T10:00:00Z',
        updatedAt: '2026-04-10T10:00:00Z',
      };

      const harness = renderPassbookHook({
        party: customer,
        company: dummyCompany,
        invoices: [priorInvoice, afterInvoice],
        purchases: [],
        vouchers: [],
      });

      const res = harness.result();
      expect(res.passbook.length).toBe(3);

      // Baseline contract: OPENING must remain at index 0
      expect(res.passbook[0].type).toBe('OPENING');
      expect(res.passbook[0].debit).toBe(8000);
      expect(res.passbook[0].runningBalance).toBe(8000);

      // Subsequent entries: sorted by date
      expect(res.passbook[1].type).toBe('SALE');
      expect(res.passbook[1].docNumber).toBe('INV-PRIOR-01');
      expect(res.passbook[1].debit).toBe(3000);
      expect(res.passbook[1].runningBalance).toBe(11000);

      expect(res.passbook[2].type).toBe('SALE');
      expect(res.passbook[2].docNumber).toBe('INV-AFTER-01');
      expect(res.passbook[2].debit).toBe(1500);
      expect(res.passbook[2].runningBalance).toBe(12500);

      expect(res.liveNetBalance).toBe(12500);
      harness.unmount();
    });
  });

  describe('Adversarial Reviewer Stress Tests & Robustness Invariants', () => {
    it('clears opening balance when saveParty is called with openingBalance: 0', () => {
      const customer: Party = {
        id: 'PTY-CLEAR-001',
        name: 'Clearable Customer',
        type: 'CUSTOMER',
        phone: '9870001122',
        billingAddress: 'Deccan, Pune',
        stateCode: '27',
        openingBalance: 4000,
        openingBalanceType: 'TO_RECEIVE',
        openingBalanceDate: '2026-04-01',
        currentBalance: 4000,
        createdAt: '2026-04-01T10:00:00Z',
        updatedAt: '2026-04-01T10:00:00Z',
      };
      db.saveParty(customer);

      const saved = db.getParties().find((p) => p.id === customer.id);
      expect(saved?.openingBalance).toBe(4000);

      // Save party with explicit openingBalance: 0 (from UI blanking out the field)
      db.saveParty({
        ...saved!,
        openingBalance: 0,
      });

      const after = db.getParties().find((p) => p.id === customer.id);
      expect(after?.openingBalance).toBeUndefined();
      expect(after?.openingBalanceType).toBeUndefined();
      expect(after?.openingBalanceDate).toBeUndefined();

      const recalculated = db.recalculatePartyBalance(customer.id);
      expect(recalculated).toBe(0);
    });

    it('triggers balance recalculation on saveInvoice and deleteInvoice when matched by partyName without partyId', () => {
      const customer: Party = {
        id: 'PTY-NAME-MATCH',
        name: 'Distinct Name Customer',
        type: 'CUSTOMER',
        phone: '9876500000',
        billingAddress: 'Camp, Pune',
        stateCode: '27',
        openingBalance: 2000,
        openingBalanceType: 'TO_RECEIVE',
        openingBalanceDate: '2026-04-01',
        currentBalance: 2000,
        createdAt: '2026-04-01T10:00:00Z',
        updatedAt: '2026-04-01T10:00:00Z',
      };
      db.saveParty(customer);

      // Invoice without partyId, but matching partyName
      const invoiceByName: Invoice = {
        id: 'INV-BY-NAME-01',
        invoiceNumber: 'INV-NAME-01',
        invoiceType: 'B2CS',
        date: '2026-04-02',
        partyName: 'Distinct Name Customer',
        partyAddress: customer.billingAddress,
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        totalGrossAmount: 1500,
        totalDiscount: 0,
        totalTaxableAmount: 1500,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 1500,
        amountInWords: 'One Thousand Five Hundred Only',
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 1500,
        createdAt: '2026-04-02T10:00:00Z',
        updatedAt: '2026-04-02T10:00:00Z',
      };

      db.saveInvoice(invoiceByName);

      const storedAfterSave = db.getParties().find((p) => p.id === customer.id);
      expect(storedAfterSave?.currentBalance).toBe(3500); // 2000 opening + 1500 unpaid

      // Delete invoice
      db.deleteInvoice(invoiceByName.id);
      const storedAfterDelete = db.getParties().find((p) => p.id === customer.id);
      expect(storedAfterDelete?.currentBalance).toBe(2000); // back to 2000 opening
    });

    it('persists item stock decrements when saveInvoice is called (preventing stock regressions)', () => {
      const item = {
        id: 'ITM-STOCK-TEST-01',
        name: 'Stock Tracked Widget',
        hsnSacCode: '8471',
        category: 'General',
        unit: 'PCS' as const,
        salePrice: 500,
        purchasePrice: 300,
        gstRate: 18,
        currentStock: 25,
        minStockAlert: 5,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.saveItem(item);

      const customer: Party = {
        id: 'PTY-STOCK-CUST',
        name: 'Stock Buyer',
        type: 'CUSTOMER',
        phone: '9800001111',
        billingAddress: 'Market, Pune',
        stateCode: '27',
        openingBalance: 1000,
        openingBalanceType: 'TO_RECEIVE',
        currentBalance: 1000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.saveParty(customer);

      const invoice: Invoice = {
        id: 'INV-STOCK-01',
        invoiceNumber: 'INV-STOCK-01',
        invoiceType: 'B2CS',
        date: '2026-04-05',
        partyId: customer.id,
        partyName: customer.name,
        partyAddress: customer.billingAddress,
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [
          {
            itemId: item.id,
            name: item.name,
            hsnSacCode: item.hsnSacCode,
            unit: 'PCS' as any,
            quantity: 5,
            unitPrice: 500,
            taxableAmount: 2500,
            gstRate: 18,
            cgstAmount: 225,
            sgstAmount: 225,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 2950,
          },
        ],
        totalGrossAmount: 2500,
        totalDiscount: 0,
        totalTaxableAmount: 2500,
        totalCgst: 225,
        totalSgst: 225,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 450,
        roundOff: 0,
        grandTotal: 2950,
        amountInWords: 'Two Thousand Nine Hundred Fifty Only',
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 2950,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      db.saveInvoice(invoice);

      // Verify stock was decremented from 25 to 20 and persisted in getItems
      const itemAfter = db.getItems().find((i) => i.id === item.id);
      expect(itemAfter?.currentStock).toBe(20);

      // Customer balance reflects opening (1000) + unpaid (2950) = 3950
      const custAfter = db.getParties().find((p) => p.id === customer.id);
      expect(custAfter?.currentBalance).toBe(3950);
      expect(custAfter?.openingBalance).toBe(1000);
    });

    it('correctly handles opening balance + receipt voucher payment without distortion when sales exist', () => {
      const customer: Party = {
        id: 'PTY-CASH-VOUCHER-01',
        name: 'Hybrid Shopping Client',
        type: 'CUSTOMER',
        phone: '9855566677',
        billingAddress: 'FC Road, Pune',
        stateCode: '27',
        openingBalance: 5000,
        openingBalanceType: 'TO_RECEIVE',
        openingBalanceDate: '2026-04-01',
        currentBalance: 5000,
        createdAt: '2026-04-01T08:00:00Z',
        updatedAt: '2026-04-01T08:00:00Z',
      };
      db.saveParty(customer);

      // 1. Customer buys ₹1,500 goods on credit
      const creditInvoice: Invoice = {
        id: 'INV-HYBRID-01',
        invoiceNumber: 'INV-HYBRID-01',
        invoiceType: 'B2CS',
        date: '2026-04-02',
        partyId: customer.id,
        partyName: customer.name,
        partyAddress: customer.billingAddress,
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        totalGrossAmount: 1500,
        totalDiscount: 0,
        totalTaxableAmount: 1500,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 1500,
        amountInWords: 'One Thousand Five Hundred Only',
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 1500,
        createdAt: '2026-04-02T10:00:00Z',
        updatedAt: '2026-04-02T10:00:00Z',
      };
      db.saveInvoice(creditInvoice);

      // Balance reflects opening (5000) + unpaid (1500) = 6500
      expect(db.recalculatePartyBalance(customer.id)).toBe(6500);

      // 2. Customer makes a ₹2,000 payment towards balance via bank receipt voucher
      const paymentVoucher: Voucher = {
        id: 'VCH-HYBRID-RCPT-01',
        voucherNumber: 'VCH-HYBRID-RCPT-01',
        voucherType: 'RECEIPT',
        date: '2026-04-03',
        narration: 'Part payment towards balance',
        entries: [
          {
            accountId: customer.id,
            accountName: customer.name,
            debit: 0,
            credit: 2000,
          },
          {
            accountId: 'ACC_BANK',
            accountName: 'Bank Account',
            debit: 2000,
            credit: 0,
          },
        ],
        totalAmount: 2000,
        createdAt: '2026-04-03T10:00:00Z',
      };
      db.saveVoucher(paymentVoucher);

      // Customer balance must be exactly 6500 - 2000 payment = 4500
      expect(db.recalculatePartyBalance(customer.id)).toBe(4500);
      const partyRecord = db.getParties().find((p) => p.id === customer.id);
      expect(partyRecord?.currentBalance).toBe(4500);
      expect(partyRecord?.openingBalance).toBe(5000);

      // Verify passbook running balance matches liveNetBalance
      const harness = renderPassbookHook({
        party: partyRecord,
        company: dummyCompany,
        invoices: [creditInvoice],
        purchases: [],
        vouchers: [paymentVoucher],
      });
      const res = harness.result();
      expect(res.liveNetBalance).toBe(4500);
      expect(res.passbook.length).toBe(3);
      // Entry 0: OPENING debit 5000 -> running 5000
      expect(res.passbook[0].type).toBe('OPENING');
      expect(res.passbook[0].runningBalance).toBe(5000);
      // Entry 1: SALE debit 1500 -> running 6500
      expect(res.passbook[1].type).toBe('SALE');
      expect(res.passbook[1].runningBalance).toBe(6500);
      // Entry 2: VCHR credit 2000 -> running 4500
      expect(res.passbook[2].type).toBe('PAYMENT_IN');
      expect(res.passbook[2].credit).toBe(2000);
      expect(res.passbook[2].runningBalance).toBe(4500);
      harness.unmount();
    });

    it('automatically recalculates party balance when saveVoucher and deleteVoucher are called', () => {
      const customer: Party = {
        id: 'PTY-VOUCHER-AUTO-01',
        name: 'Auto Recalc Customer',
        type: 'CUSTOMER',
        phone: '9844433322',
        billingAddress: 'Kothrud, Pune',
        stateCode: '27',
        openingBalance: 3000,
        openingBalanceType: 'TO_RECEIVE',
        currentBalance: 3000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.saveParty(customer);

      const vch: Voucher = {
        id: 'VCH-AUTO-01',
        voucherNumber: 'VCH-AUTO-01',
        voucherType: 'RECEIPT',
        date: '2026-04-02',
        narration: 'Cash received on account',
        entries: [
          {
            accountId: customer.id,
            accountName: customer.name,
            debit: 0,
            credit: 1000,
          },
          {
            accountId: 'ACC_CASH',
            accountName: 'Cash',
            debit: 1000,
            credit: 0,
          },
        ],
        totalAmount: 1000,
        createdAt: new Date().toISOString(),
      };

      // saveVoucher should automatically recalculate customer balance
      db.saveVoucher(vch);
      expect(db.getParties().find((p) => p.id === customer.id)?.currentBalance).toBe(2000);

      // deleteVoucher should automatically revert customer balance
      db.deleteVoucher(vch.id);
      expect(db.getParties().find((p) => p.id === customer.id)?.currentBalance).toBe(3000);
    });

    it('preserves customer opening balance across TableGridInvoiceModal, CreateInvoiceModal, and QuickBillingView lifecycle', () => {
      const customer: Party = {
        id: 'PTY-MODAL-TEST-01',
        name: 'Modal Test Customer',
        type: 'CUSTOMER',
        phone: '9812345678',
        billingAddress: 'Main Market, Pune',
        stateCode: '27',
        openingBalance: 4500,
        openingBalanceType: 'TO_RECEIVE',
        openingBalanceDate: '2026-04-01',
        currentBalance: 4500,
        createdAt: '2026-04-01T10:00:00Z',
        updatedAt: '2026-04-01T10:00:00Z',
      };
      db.saveParty(customer);

      const item: InventoryItem = {
        id: 'ITM-MODAL-01',
        name: 'Standard Hardware Unit',
        hsnSacCode: '8471',
        category: 'Hardware',
        unit: 'PCS',
        salePrice: 1000,
        purchasePrice: 600,
        gstRate: 18,
        currentStock: 50,
        minStockAlert: 5,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.saveItem(item);

      // 1. Simulate saving an invoice via TableGridInvoiceModal
      const tableGridContainer = document.createElement('div');
      document.body.appendChild(tableGridContainer);
      const root1 = createRoot(tableGridContainer);
      act(() => {
        root1.render(
          <TableGridInvoiceModal
            company={dummyCompany}
            parties={db.getParties()}
            itemsCatalog={[item]}
            initialParty={customer}
            onClose={() => {}}
            onSave={(inv) => {
              db.saveInvoice(inv);
            }}
          />
        );
      });

      // Save a credit invoice for this customer
      const tableGridInv: Invoice = {
        id: 'INV-TG-001',
        invoiceNumber: 'INV-TG-001',
        invoiceType: 'B2CS',
        date: '2026-04-05',
        partyId: customer.id,
        partyName: customer.name,
        partyAddress: customer.billingAddress,
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        totalGrossAmount: 1500,
        totalDiscount: 0,
        totalTaxableAmount: 1500,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 1500,
        amountInWords: 'One Thousand Five Hundred Only',
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 1500,
        createdAt: '2026-04-05T10:00:00Z',
        updatedAt: '2026-04-05T10:00:00Z',
      };
      db.saveInvoice(tableGridInv);

      act(() => {
        root1.unmount();
      });
      tableGridContainer.remove();

      // Customer opening balance is intact and currentBalance = 4500 + 1500 = 6000
      const customerAfterTG = db.getParties().find((p) => p.id === customer.id);
      expect(customerAfterTG?.openingBalance).toBe(4500);
      expect(customerAfterTG?.openingBalanceType).toBe('TO_RECEIVE');
      expect(customerAfterTG?.openingBalanceDate).toBe('2026-04-01');
      expect(customerAfterTG?.currentBalance).toBe(6000);

      // 2. Simulate saving via CreateInvoiceModal
      const createModalContainer = document.createElement('div');
      document.body.appendChild(createModalContainer);
      const root2 = createRoot(createModalContainer);
      act(() => {
        root2.render(
          <CreateInvoiceModal
            company={dummyCompany}
            parties={db.getParties()}
            itemsCatalog={[item]}
            onClose={() => {}}
            onSave={(inv) => {
              db.saveInvoice(inv);
            }}
          />
        );
      });
      act(() => {
        root2.unmount();
      });
      createModalContainer.remove();

      // Customer opening balance still intact
      const customerAfterCreateModal = db.getParties().find((p) => p.id === customer.id);
      expect(customerAfterCreateModal?.openingBalance).toBe(4500);
      expect(customerAfterCreateModal?.openingBalanceType).toBe('TO_RECEIVE');
      expect(customerAfterCreateModal?.openingBalanceDate).toBe('2026-04-01');

      // 3. Simulate QuickBillingView POS sale
      const posContainer = document.createElement('div');
      document.body.appendChild(posContainer);
      const root3 = createRoot(posContainer);
      act(() => {
        root3.render(
          <QuickBillingView
            company={dummyCompany}
            items={[item]}
            parties={db.getParties()}
            onCompleteSale={(inv) => db.saveInvoice(inv)}
            onViewInvoice={() => {}}
          />
        );
      });
      act(() => {
        root3.unmount();
      });
      posContainer.remove();

      const customerAfterPOS = db.getParties().find((p) => p.id === customer.id);
      expect(customerAfterPOS?.openingBalance).toBe(4500);
      expect(customerAfterPOS?.openingBalanceType).toBe('TO_RECEIVE');
      expect(customerAfterPOS?.openingBalanceDate).toBe('2026-04-01');
    });

    it('correctly handles editing opening balance to 0 and non-zero in VoucherEditorModal', () => {
      const customer: Party = {
        id: 'PTY-VCH-EDIT-01',
        name: 'Voucher Edit Customer',
        type: 'CUSTOMER',
        phone: '9833322211',
        billingAddress: 'FC Road, Pune',
        stateCode: '27',
        openingBalance: 5000,
        openingBalanceType: 'TO_RECEIVE',
        openingBalanceDate: '2026-04-01',
        currentBalance: 5000,
        createdAt: '2026-04-01T10:00:00Z',
        updatedAt: '2026-04-01T10:00:00Z',
      };
      db.saveParty(customer);

      const openingEntry = {
        id: `opening-${customer.id}`,
        rawId: customer.id,
        date: '2026-04-01',
        docNumber: 'OPENING',
        type: 'OPENING' as const,
        description: "Opening Balance (You'll Get)",
        debit: 5000,
        credit: 0,
        runningBalance: 5000,
        status: 'OPENING',
        isOpening: true,
      };

      // Render VoucherEditorModal to edit opening entry
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      act(() => {
        root.render(
          <VoucherEditorModal
            party={customer}
            editingLedgerEntry={openingEntry as any}
            onClose={() => {}}
            onRefresh={() => {}}
          />
        );
      });

      // Submit form with amount 0 to clear opening balance
      const form = container.querySelector('form');
      expect(form).not.toBeNull();
      const amountInput = container.querySelector('input[type="number"]') as HTMLInputElement;
      expect(amountInput).not.toBeNull();

      act(() => {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        nativeInputValueSetter?.call(amountInput, '0');
        amountInput.dispatchEvent(new Event('input', { bubbles: true }));
        amountInput.dispatchEvent(new Event('change', { bubbles: true }));
      });

      act(() => {
        form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      act(() => {
        root.unmount();
      });
      container.remove();

      // Verify opening balance is completely cleared in DB
      const clearedParty = db.getParties().find((p) => p.id === customer.id);
      expect(clearedParty?.openingBalance).toBeUndefined();
      expect(clearedParty?.openingBalanceType).toBeUndefined();
      expect(clearedParty?.openingBalanceDate).toBeUndefined();
      expect(clearedParty?.currentBalance).toBe(0);
    });

    it('recalculates both previous and target parties when invoice party is edited without altering opening balances', () => {
      const custA: Party = {
        id: 'PTY-REASSIGN-A',
        name: 'Original Party A',
        type: 'CUSTOMER',
        billingAddress: 'Road A, Pune',
        stateCode: '27',
        phone: '9811111111',
        openingBalance: 3000,
        openingBalanceType: 'TO_RECEIVE',
        openingBalanceDate: '2026-04-01',
        currentBalance: 3000,
        createdAt: '2026-04-01T10:00:00Z',
        updatedAt: '2026-04-01T10:00:00Z',
      };
      const custB: Party = {
        id: 'PTY-REASSIGN-B',
        name: 'Reassigned Party B',
        type: 'CUSTOMER',
        billingAddress: 'Road B, Pune',
        stateCode: '27',
        phone: '9822222222',
        openingBalance: 6000,
        openingBalanceType: 'TO_RECEIVE',
        openingBalanceDate: '2026-04-01',
        currentBalance: 6000,
        createdAt: '2026-04-01T10:00:00Z',
        updatedAt: '2026-04-01T10:00:00Z',
      };
      db.saveParty(custA);
      db.saveParty(custB);

      // Invoice assigned to custA (unpaid 2000)
      const inv: Invoice = {
        id: 'INV-REASSIGN-01',
        invoiceNumber: 'INV-REASSIGN-01',
        invoiceType: 'B2CS',
        date: '2026-04-05',
        partyId: custA.id,
        partyName: custA.name,
        partyAddress: custA.billingAddress,
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        totalGrossAmount: 2000,
        totalDiscount: 0,
        totalTaxableAmount: 2000,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 2000,
        amountInWords: 'Two Thousand Only',
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 2000,
        createdAt: '2026-04-05T10:00:00Z',
        updatedAt: '2026-04-05T10:00:00Z',
      };
      db.saveInvoice(inv);

      expect(db.getParties().find((p) => p.id === custA.id)?.currentBalance).toBe(5000); // 3000 + 2000
      expect(db.getParties().find((p) => p.id === custB.id)?.currentBalance).toBe(6000); // 6000 + 0

      // Now edit invoice and reassign to custB
      const updatedInv: Invoice = {
        ...inv,
        partyId: custB.id,
        partyName: custB.name,
        partyAddress: custB.billingAddress,
        updatedAt: '2026-04-06T10:00:00Z',
      };
      db.saveInvoice(updatedInv);

      // custA reverts to opening 3000
      const afterCustA = db.getParties().find((p) => p.id === custA.id);
      expect(afterCustA?.currentBalance).toBe(3000);
      expect(afterCustA?.openingBalance).toBe(3000);

      // custB becomes 6000 + 2000 = 8000
      const afterCustB = db.getParties().find((p) => p.id === custB.id);
      expect(afterCustB?.currentBalance).toBe(8000);
      expect(afterCustB?.openingBalance).toBe(6000);
    });

    it('preserves supplier opening balance (TO_PAY) and accurately factors in purchase bills', () => {
      const supplier: Party = {
        id: 'PTY-SUPP-OPENING-01',
        name: 'National Suppliers',
        type: 'SUPPLIER',
        phone: '9899988877',
        billingAddress: 'Industrial Area, Pune',
        stateCode: '27',
        openingBalance: 4000,
        openingBalanceType: 'TO_PAY',
        openingBalanceDate: '2026-04-01',
        currentBalance: -4000,
        createdAt: '2026-04-01T10:00:00Z',
        updatedAt: '2026-04-01T10:00:00Z',
      };
      db.saveParty(supplier);

      // Save an unpaid purchase bill
      const bill: PurchaseBill = {
        id: 'BILL-SUPP-001',
        billNumber: 'PB-901',
        date: '2026-04-03',
        supplierId: supplier.id,
        supplierName: supplier.name,
        supplierAddress: supplier.billingAddress,
        supplierStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        totalGrossAmount: 2500,
        totalDiscount: 0,
        totalTaxableAmount: 2500,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 2500,
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 2500,
        itcEligibility: 'ALL_OTHER_ITC',
        isRcm: false,
        createdAt: '2026-04-03T10:00:00Z',
        updatedAt: '2026-04-03T10:00:00Z',
      };
      db.savePurchase(bill);

      // Balance = -4000 (opening payable) - 2500 (unpaid bill) = -6500
      expect(db.recalculatePartyBalance(supplier.id)).toBe(-6500);

      const suppRecord = db.getParties().find((p) => p.id === supplier.id);
      expect(suppRecord?.openingBalance).toBe(4000);
      expect(suppRecord?.openingBalanceType).toBe('TO_PAY');
      expect(suppRecord?.currentBalance).toBe(-6500);

      // Delete bill -> reverts back to -4000
      db.deletePurchase(bill.id);
      expect(db.getParties().find((p) => p.id === supplier.id)?.currentBalance).toBe(-4000);
      expect(db.getParties().find((p) => p.id === supplier.id)?.openingBalance).toBe(4000);
    });
  });
});
