import { describe, it, expect, beforeEach } from 'vitest';

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
import {
  getOutstandingDocuments,
  allocateOldestFirst,
  validateAllocations,
  applyAllocations,
  reverseAllocations,
  OutstandingDocument,
} from '../core/accounting/paymentAllocation.ts';
import { Party } from '../models/party.ts';
import { Invoice } from '../models/invoice.ts';
import { PurchaseBill } from '../models/purchase.ts';
import {
  createPaymentReceiptVoucher,
  createPaymentOutVoucher,
} from '../core/accounting/ledger.ts';
import { PaymentAllocation } from '../core/accounting/voucherTypes.ts';

describe('Payment Allocation to Party Opening Balance', () => {
  beforeEach(() => {
    testStorage.clear();
  });

  const customerWithOpBal: Party = {
    id: 'CUST-OP-01',
    name: 'Ramesh Trading',
    type: 'CUSTOMER',
    phone: '9876543210',
    billingAddress: 'Main Market, Mumbai',
    stateCode: '27',
    openingBalance: 5000,
    openingBalanceType: 'TO_RECEIVE',
    openingBalanceDate: '2026-08-01',
    currentBalance: 5000,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };

  const supplierWithOpBal: Party = {
    id: 'SUPP-OP-01',
    name: 'Sharma Wholesalers',
    type: 'SUPPLIER',
    phone: '9123456780',
    billingAddress: 'Industrial Area, Delhi',
    stateCode: '07',
    openingBalance: 8000,
    openingBalanceType: 'TO_PAY',
    openingBalanceDate: '2026-08-05',
    currentBalance: -8000,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  };

  const makeInvoice = (id: string, num: string, date: string, total: number, paid = 0): Invoice => ({
    id,
    invoiceNumber: num,
    invoiceType: 'B2B',
    date,
    partyId: customerWithOpBal.id,
    partyName: customerWithOpBal.name,
    partyGstin: customerWithOpBal.gstin,
    partyAddress: customerWithOpBal.billingAddress,
    partyStateCode: customerWithOpBal.stateCode,
    placeOfSupplyStateCode: customerWithOpBal.stateCode,
    isIntraState: true,
    items: [],
    totalGrossAmount: total,
    totalDiscount: 0,
    totalTaxableAmount: Math.round((total / 1.18) * 100) / 100,
    totalCgst: 0,
    totalSgst: 0,
    totalIgst: Math.round((total - Math.round((total / 1.18) * 100) / 100) * 100) / 100,
    totalCess: 0,
    totalTax: Math.round((total - Math.round((total / 1.18) * 100) / 100) * 100) / 100,
    roundOff: 0,
    grandTotal: total,
    paidAmount: paid,
    balanceAmount: Math.max(0, Math.round((total - paid) * 100) / 100),
    paymentStatus: paid >= total ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID',
    paymentMode: paid > 0 ? 'UPI' : 'CREDIT',
    amountInWords: 'Rupees Only',
    isCancelled: false,
    createdAt: `${date}T10:00:00Z`,
    updatedAt: `${date}T10:00:00Z`,
  });

  const makePurchase = (id: string, num: string, date: string, total: number, paid = 0): PurchaseBill => ({
    id,
    billNumber: num,
    purchaseType: 'BILL',
    date,
    supplierId: supplierWithOpBal.id,
    supplierName: supplierWithOpBal.name,
    supplierGstin: supplierWithOpBal.gstin,
    supplierAddress: supplierWithOpBal.billingAddress,
    supplierStateCode: supplierWithOpBal.stateCode,
    placeOfSupplyStateCode: supplierWithOpBal.stateCode,
    isIntraState: true,
    items: [],
    itcEligibility: 'ALL_OTHER_ITC',
    isRcm: false,
    totalGrossAmount: total,
    totalDiscount: 0,
    totalTaxableAmount: Math.round((total / 1.18) * 100) / 100,
    totalCgst: 0,
    totalSgst: 0,
    totalIgst: Math.round((total - Math.round((total / 1.18) * 100) / 100) * 100) / 100,
    totalCess: 0,
    totalTax: Math.round((total - Math.round((total / 1.18) * 100) / 100) * 100) / 100,
    roundOff: 0,
    grandTotal: total,
    paidAmount: paid,
    balanceAmount: Math.max(0, Math.round((total - paid) * 100) / 100),
    paymentStatus: paid >= total ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID',
    paymentMode: paid > 0 ? 'BANK' : 'CREDIT',
    createdAt: `${date}T10:00:00Z`,
    updatedAt: `${date}T10:00:00Z`,
  });

  const sampleInvoice: Invoice = makeInvoice('INV-TEST-01', 'INV-2026-001', '2026-08-15', 2000, 0);
  const samplePurchase: PurchaseBill = makePurchase('PUR-TEST-01', 'BILL-2026-001', '2026-08-20', 4000, 0);

  describe('1. getOutstandingDocuments Opening Balance Pseudo-Doc Resolution', () => {
    it('includes pseudo-doc for CUSTOMER with TO_RECEIVE opening balance in INVOICE flow', () => {
      const docs = getOutstandingDocuments({
        partyId: customerWithOpBal.id,
        partyName: customerWithOpBal.name,
        documentType: 'INVOICE',
        invoices: [sampleInvoice],
        parties: [customerWithOpBal],
      });

      expect(docs).toHaveLength(2);
      // Pseudo-doc is first
      const opDoc = docs[0];
      expect(opDoc.id).toBe(`OPENING-BALANCE-${customerWithOpBal.id}`);
      expect(opDoc.documentNumber).toBe('Opening Balance');
      expect(opDoc.number).toBe('Opening Balance');
      expect(opDoc.date).toBe('2026-08-01');
      expect(opDoc.grandTotal).toBe(5000);
      expect(opDoc.paidAmount).toBe(0);
      expect(opDoc.balanceAmount).toBe(5000);
      expect(opDoc.documentType).toBe('INVOICE');
      expect(opDoc.partyId).toBe(customerWithOpBal.id);
      expect(opDoc.partyName).toBe(customerWithOpBal.name);
      expect(opDoc.rawInvoice).toBeUndefined();

      // Real invoice is second
      expect(docs[1].id).toBe(sampleInvoice.id);
      expect(docs[1].documentNumber).toBe(sampleInvoice.invoiceNumber);
    });

    it('infers TO_RECEIVE for CUSTOMER when openingBalanceType is undefined and openingBalance > 0', () => {
      const custInferred: Party = {
        ...customerWithOpBal,
        id: 'CUST-INFER-01',
        openingBalance: 3500,
        openingBalanceType: undefined,
      };

      const docs = getOutstandingDocuments({
        partyId: custInferred.id,
        documentType: 'INVOICE',
        invoices: [],
        parties: [custInferred],
      });

      expect(docs).toHaveLength(1);
      expect(docs[0].id).toBe(`OPENING-BALANCE-${custInferred.id}`);
      expect(docs[0].balanceAmount).toBe(3500);
    });

    it('excludes pseudo-doc for CUSTOMER if opening balance is TO_PAY (advance from customer)', () => {
      const custAdvance: Party = {
        ...customerWithOpBal,
        openingBalance: 2000,
        openingBalanceType: 'TO_PAY',
      };

      const docs = getOutstandingDocuments({
        partyId: custAdvance.id,
        documentType: 'INVOICE',
        invoices: [sampleInvoice],
        parties: [custAdvance],
      });

      expect(docs).toHaveLength(1);
      expect(docs[0].id).toBe(sampleInvoice.id);
    });

    it('excludes pseudo-doc for CUSTOMER if opening balance <= 0.01', () => {
      const custZero: Party = {
        ...customerWithOpBal,
        openingBalance: 0,
      };

      const docs = getOutstandingDocuments({
        partyId: custZero.id,
        documentType: 'INVOICE',
        invoices: [sampleInvoice],
        parties: [custZero],
      });

      expect(docs).toHaveLength(1);
      expect(docs[0].id).toBe(sampleInvoice.id);
    });

    it('excludes pseudo-doc for CUSTOMER when documentType is PURCHASE', () => {
      const docs = getOutstandingDocuments({
        partyId: customerWithOpBal.id,
        documentType: 'PURCHASE',
        purchases: [],
        parties: [customerWithOpBal],
      });

      expect(docs).toHaveLength(0);
    });

    it('includes pseudo-doc for SUPPLIER with TO_PAY opening balance in PURCHASE flow', () => {
      const docs = getOutstandingDocuments({
        partyId: supplierWithOpBal.id,
        partyName: supplierWithOpBal.name,
        documentType: 'PURCHASE',
        purchases: [samplePurchase],
        parties: [supplierWithOpBal],
      });

      expect(docs).toHaveLength(2);
      const opDoc = docs[0];
      expect(opDoc.id).toBe(`OPENING-BALANCE-${supplierWithOpBal.id}`);
      expect(opDoc.documentNumber).toBe('Opening Balance');
      expect(opDoc.date).toBe('2026-08-05');
      expect(opDoc.grandTotal).toBe(8000);
      expect(opDoc.balanceAmount).toBe(8000);
      expect(opDoc.documentType).toBe('PURCHASE');
      expect(opDoc.partyId).toBe(supplierWithOpBal.id);
      expect(opDoc.rawPurchase).toBeUndefined();

      expect(docs[1].id).toBe(samplePurchase.id);
    });

    it('infers TO_PAY for SUPPLIER when openingBalanceType is undefined and openingBalance > 0', () => {
      const suppInferred: Party = {
        ...supplierWithOpBal,
        id: 'SUPP-INFER-01',
        openingBalance: 4200,
        openingBalanceType: undefined,
      };

      const docs = getOutstandingDocuments({
        partyId: suppInferred.id,
        documentType: 'PURCHASE',
        purchases: [],
        parties: [suppInferred],
      });

      expect(docs).toHaveLength(1);
      expect(docs[0].id).toBe(`OPENING-BALANCE-${suppInferred.id}`);
      expect(docs[0].balanceAmount).toBe(4200);
    });

    it('excludes pseudo-doc for SUPPLIER if opening balance is TO_RECEIVE (advance to supplier)', () => {
      const suppAdvance: Party = {
        ...supplierWithOpBal,
        openingBalance: 1500,
        openingBalanceType: 'TO_RECEIVE',
      };

      const docs = getOutstandingDocuments({
        partyId: suppAdvance.id,
        documentType: 'PURCHASE',
        purchases: [samplePurchase],
        parties: [suppAdvance],
      });

      expect(docs).toHaveLength(1);
      expect(docs[0].id).toBe(samplePurchase.id);
    });

    it('excludes pseudo-doc for SUPPLIER when documentType is INVOICE', () => {
      const docs = getOutstandingDocuments({
        partyId: supplierWithOpBal.id,
        documentType: 'INVOICE',
        invoices: [],
        parties: [supplierWithOpBal],
      });

      expect(docs).toHaveLength(0);
    });

    it('does NOT include pseudo-doc when params.parties is omitted (backward compatibility)', () => {
      const docs = getOutstandingDocuments({
        partyId: customerWithOpBal.id,
        partyName: customerWithOpBal.name,
        documentType: 'INVOICE',
        invoices: [sampleInvoice],
        // parties omitted
      });

      expect(docs).toHaveLength(1);
      expect(docs[0].id).toBe(sampleInvoice.id);
    });

    it('defaults to today for openingBalanceDate if undefined on party', () => {
      const custNoDate: Party = {
        ...customerWithOpBal,
        openingBalanceDate: undefined,
      };

      const docs = getOutstandingDocuments({
        partyId: custNoDate.id,
        documentType: 'INVOICE',
        invoices: [],
        parties: [custNoDate],
      });

      expect(docs).toHaveLength(1);
      const today = new Date().toISOString().split('T')[0];
      expect(docs[0].date).toBe(today);
    });

    it('resolves party by partyName when partyId is omitted', () => {
      const docs = getOutstandingDocuments({
        partyName: 'Ramesh Trading',
        documentType: 'INVOICE',
        invoices: [],
        parties: [customerWithOpBal],
      });

      expect(docs).toHaveLength(1);
      expect(docs[0].id).toBe(`OPENING-BALANCE-${customerWithOpBal.id}`);
    });
  });

  describe('2. allocateOldestFirst with Opening Balance Pseudo-Doc', () => {
    it('allocates opening balance pseudo-doc first before real documents in FIFO order', () => {
      const docs = getOutstandingDocuments({
        partyId: customerWithOpBal.id,
        documentType: 'INVOICE',
        invoices: [sampleInvoice],
        parties: [customerWithOpBal],
      });

      // Customer pays 6000: 5000 opening balance + 1000 on invoice
      const allocs = allocateOldestFirst(docs, 6000);
      expect(allocs).toHaveLength(2);
      expect(allocs[0].documentId).toBe(`OPENING-BALANCE-${customerWithOpBal.id}`);
      expect(allocs[0].amount).toBe(5000);
      expect(allocs[0].documentNumber).toBe('Opening Balance');

      expect(allocs[1].documentId).toBe(sampleInvoice.id);
      expect(allocs[1].amount).toBe(1000);
      expect(allocs[1].documentNumber).toBe(sampleInvoice.invoiceNumber);
    });

    it('allocates partially to opening balance when payment amount is less than opening balance', () => {
      const docs = getOutstandingDocuments({
        partyId: customerWithOpBal.id,
        documentType: 'INVOICE',
        invoices: [sampleInvoice],
        parties: [customerWithOpBal],
      });

      const allocs = allocateOldestFirst(docs, 3000);
      expect(allocs).toHaveLength(1);
      expect(allocs[0].documentId).toBe(`OPENING-BALANCE-${customerWithOpBal.id}`);
      expect(allocs[0].amount).toBe(3000);
    });
  });

  describe('3. validateAllocations with Opening Balance Pseudo-Doc', () => {
    it('validates successfully when allocation is <= opening balance and sum <= totalSettled', () => {
      const docs = getOutstandingDocuments({
        partyId: customerWithOpBal.id,
        documentType: 'INVOICE',
        invoices: [sampleInvoice],
        parties: [customerWithOpBal],
      });

      const result = validateAllocations({
        allocations: [
          {
            documentType: 'INVOICE',
            documentId: `OPENING-BALANCE-${customerWithOpBal.id}`,
            documentNumber: 'Opening Balance',
            amount: 4000,
          },
        ],
        documents: docs,
        totalSettled: 4000,
        partyId: customerWithOpBal.id,
        partyName: customerWithOpBal.name,
      });

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('rejects allocation exceeding opening balance amount', () => {
      const docs = getOutstandingDocuments({
        partyId: customerWithOpBal.id,
        documentType: 'INVOICE',
        invoices: [sampleInvoice],
        parties: [customerWithOpBal],
      });

      const result = validateAllocations({
        allocations: [
          {
            documentType: 'INVOICE',
            documentId: `OPENING-BALANCE-${customerWithOpBal.id}`,
            documentNumber: 'Opening Balance',
            amount: 5500, // exceeds 5000
          },
        ],
        documents: docs,
        totalSettled: 5500,
        partyId: customerWithOpBal.id,
        partyName: customerWithOpBal.name,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds balance ₹5000.00 on Opening Balance');
    });

    it('rejects duplicate allocation for opening balance', () => {
      const docs = getOutstandingDocuments({
        partyId: customerWithOpBal.id,
        documentType: 'INVOICE',
        invoices: [sampleInvoice],
        parties: [customerWithOpBal],
      });

      const result = validateAllocations({
        allocations: [
          {
            documentType: 'INVOICE',
            documentId: `OPENING-BALANCE-${customerWithOpBal.id}`,
            documentNumber: 'Opening Balance',
            amount: 2000,
          },
          {
            documentType: 'INVOICE',
            documentId: `OPENING-BALANCE-${customerWithOpBal.id}`,
            documentNumber: 'Opening Balance',
            amount: 1000,
          },
        ],
        documents: docs,
        totalSettled: 3000,
        partyId: customerWithOpBal.id,
        partyName: customerWithOpBal.name,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Duplicate document allocation detected for Opening Balance');
    });
  });

  describe('4. applyAllocations and reverseAllocations Guard Against Pseudo-Docs', () => {
    it('applyAllocations skips pseudo-docs and leaves real invoices untouched', () => {
      const invoices = [{ ...sampleInvoice }];
      const allocs: PaymentAllocation[] = [
        {
          documentType: 'INVOICE',
          documentId: `OPENING-BALANCE-${customerWithOpBal.id}`,
          documentNumber: 'Opening Balance',
          amount: 5000,
        },
      ];

      const updated = applyAllocations(invoices, allocs);
      expect(updated).toHaveLength(1);
      expect(updated[0].paidAmount).toBe(0);
      expect(updated[0].balanceAmount).toBe(2000);
      expect(updated[0].paymentStatus).toBe('UNPAID');
    });

    it('reverseAllocations skips pseudo-docs and leaves real invoices untouched', () => {
      const invoices = [{ ...sampleInvoice, paidAmount: 1000, balanceAmount: 1000, paymentStatus: 'PARTIAL' as const }];
      const allocs: PaymentAllocation[] = [
        {
          documentType: 'INVOICE',
          documentId: `OPENING-BALANCE-${customerWithOpBal.id}`,
          documentNumber: 'Opening Balance',
          amount: 5000,
        },
      ];

      const updated = reverseAllocations(invoices, allocs);
      expect(updated).toHaveLength(1);
      expect(updated[0].paidAmount).toBe(1000);
      expect(updated[0].balanceAmount).toBe(1000);
    });
  });

  describe('5. End-to-End Voucher Persistence with Opening Balance Allocation', () => {
    it('records Payment In allocated to Opening Balance, updates party balance, and leaves invoices intact', () => {
      db.saveParty(customerWithOpBal);
      db.saveInvoice(sampleInvoice);

      // Verify initial party balance: 5000 (opening) + 2000 (invoice) = 7000
      expect(db.recalculatePartyBalance(customerWithOpBal.id)).toBe(7000);

      // Create Receipt voucher allocating 5000 to Opening Balance
      const voucher = createPaymentReceiptVoucher({
        receiptNumber: 'RCPT-001',
        date: '2026-08-25',
        customerName: customerWithOpBal.name,
        customerId: customerWithOpBal.id,
        amount: 5000,
        paymentMode: 'UPI',
        narration: 'Settlement for Opening Balance',
      });
      voucher.partyId = customerWithOpBal.id;
      voucher.partyName = customerWithOpBal.name;
      voucher.allocationMode = 'MANUAL';
      voucher.paymentAllocations = [
        {
          documentType: 'INVOICE',
          documentId: `OPENING-BALANCE-${customerWithOpBal.id}`,
          documentNumber: 'Opening Balance',
          amount: 5000,
          date: '2026-08-01',
        },
      ];

      db.savePaymentVoucher(voucher);

      // 1. Voucher saved correctly with allocations
      const savedVoucher = db.getVouchers().find((v) => v.id === voucher.id);
      expect(savedVoucher).toBeDefined();
      expect(savedVoucher?.paymentAllocations).toHaveLength(1);
      expect(savedVoucher?.paymentAllocations?.[0].documentId).toBe(`OPENING-BALANCE-${customerWithOpBal.id}`);

      // 2. Invoice balance is NOT touched
      const savedInvoice = db.getInvoices().find((i) => i.id === sampleInvoice.id)!;
      expect(savedInvoice.paidAmount).toBe(0);
      expect(savedInvoice.balanceAmount).toBe(2000);
      expect(savedInvoice.paymentStatus).toBe('UNPAID');

      // 3. Party currentBalance reduced from 7000 to 2000 (5000 paid)
      const updatedParty = db.getParties().find((p) => p.id === customerWithOpBal.id)!;
      expect(updatedParty.currentBalance).toBe(2000);
      expect(db.recalculatePartyBalance(customerWithOpBal.id)).toBe(2000);
    });

    it('records Payment Out allocated to Supplier Opening Balance, updates party balance, and leaves bills intact', () => {
      db.saveParty(supplierWithOpBal);
      db.savePurchase(samplePurchase);

      // Verify initial supplier balance: -8000 (opening) - 4000 (purchase) = -12000
      expect(db.recalculatePartyBalance(supplierWithOpBal.id)).toBe(-12000);

      // Create Payment Out voucher allocating 8000 to Opening Balance
      const voucher = createPaymentOutVoucher({
        voucherNumber: 'PAY-001',
        date: '2026-08-25',
        supplierName: supplierWithOpBal.name,
        supplierId: supplierWithOpBal.id,
        amount: 8000,
        paymentMode: 'BANK',
        narration: 'Settlement for Opening Balance',
      });
      voucher.partyId = supplierWithOpBal.id;
      voucher.partyName = supplierWithOpBal.name;
      voucher.allocationMode = 'MANUAL';
      voucher.paymentAllocations = [
        {
          documentType: 'PURCHASE',
          documentId: `OPENING-BALANCE-${supplierWithOpBal.id}`,
          documentNumber: 'Opening Balance',
          amount: 8000,
          date: '2026-08-05',
        },
      ];

      db.savePaymentVoucher(voucher);

      // 1. Voucher saved correctly
      const savedVoucher = db.getVouchers().find((v) => v.id === voucher.id);
      expect(savedVoucher).toBeDefined();
      expect(savedVoucher?.paymentAllocations).toHaveLength(1);

      // 2. Purchase bill is untouched
      const savedPurchase = db.getPurchases().find((p) => p.id === samplePurchase.id)!;
      expect(savedPurchase.paidAmount).toBe(0);
      expect(savedPurchase.balanceAmount).toBe(4000);

      // 3. Supplier currentBalance reduced from -12000 to -4000
      const updatedSupplier = db.getParties().find((p) => p.id === supplierWithOpBal.id)!;
      expect(updatedSupplier.currentBalance).toBe(-4000);
      expect(db.recalculatePartyBalance(supplierWithOpBal.id)).toBe(-4000);
    });

    it('deleting a payment voucher allocated to opening balance restores party balance without touching invoices', () => {
      db.saveParty(customerWithOpBal);
      db.saveInvoice(sampleInvoice);

      const voucher = createPaymentReceiptVoucher({
        receiptNumber: 'RCPT-002',
        date: '2026-08-25',
        customerName: customerWithOpBal.name,
        customerId: customerWithOpBal.id,
        amount: 3000,
        paymentMode: 'CASH',
        narration: 'Partial settlement',
      });
      voucher.partyId = customerWithOpBal.id;
      voucher.partyName = customerWithOpBal.name;
      voucher.paymentAllocations = [
        {
          documentType: 'INVOICE',
          documentId: `OPENING-BALANCE-${customerWithOpBal.id}`,
          documentNumber: 'Opening Balance',
          amount: 3000,
          date: '2026-08-01',
        },
      ];

      db.savePaymentVoucher(voucher);
      expect(db.recalculatePartyBalance(customerWithOpBal.id)).toBe(4000); // 7000 - 3000 = 4000

      // Delete the voucher
      db.deleteVoucher(voucher.id);

      // Party balance is restored back to 7000
      expect(db.recalculatePartyBalance(customerWithOpBal.id)).toBe(7000);
      // Invoice remains untouched
      const savedInvoice = db.getInvoices().find((i) => i.id === sampleInvoice.id)!;
      expect(savedInvoice.balanceAmount).toBe(2000);
      expect(savedInvoice.paidAmount).toBe(0);
    });
  });
});
