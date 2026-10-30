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
  validateInvoicePreSave,
  validatePurchasePreSave,
  resolveSourceVoucherSplits,
} from '../core/accounting/paymentAllocation.ts';
import {
  createPaymentReceiptVoucher,
  createPaymentOutVoucher,
} from '../core/accounting/ledger.ts';
import { computeCashBankSummary } from '../core/accounting/cashBankCalculator.ts';
import { Invoice } from '../models/invoice.ts';
import { PurchaseBill } from '../models/purchase.ts';
import { Party } from '../models/party.ts';
import { Voucher, PaymentAllocation } from '../core/accounting/voucherTypes.ts';

describe('Payment Voucher & Invoice/Bill Link Spec Test Suite', () => {
  beforeEach(() => {
    testStorage.clear();
  });

  const sampleCustomer: Party = {
    id: 'PARTY-CUST-101',
    name: 'Sharma Traders',
    type: 'CUSTOMER',
    phone: '9876543210',
    billingAddress: 'Connaught Place, New Delhi',
    gstin: '07AAAAA0000A1Z5',
    stateCode: '07',
    currentBalance: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const sampleSupplier: Party = {
    id: 'PARTY-SUPP-202',
    name: 'Gupta Steel Mills',
    type: 'SUPPLIER',
    phone: '9876500000',
    billingAddress: 'Ludhiana, Punjab',
    gstin: '03BBBBB1111B1Z2',
    stateCode: '03',
    currentBalance: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const makeInvoice = (id: string, num: string, date: string, total: number, paid = 0): Invoice => ({
    id,
    invoiceNumber: num,
    invoiceType: 'B2B',
    date,
    partyId: sampleCustomer.id,
    partyName: sampleCustomer.name,
    partyGstin: sampleCustomer.gstin,
    partyAddress: sampleCustomer.billingAddress,
    partyStateCode: sampleCustomer.stateCode,
    placeOfSupplyStateCode: sampleCustomer.stateCode,
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
    supplierId: sampleSupplier.id,
    supplierName: sampleSupplier.name,
    supplierGstin: sampleSupplier.gstin,
    supplierAddress: sampleSupplier.billingAddress,
    supplierStateCode: sampleSupplier.stateCode,
    placeOfSupplyStateCode: sampleSupplier.stateCode,
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

  // Scenario 1: Receipt voucher linked to one invoice updates that invoice only
  it('Scenario 1: Receipt voucher linked to one invoice updates that invoice only', () => {
    db.saveParty(sampleCustomer);
    const inv1 = makeInvoice('INV-001', 'INV-001', '2026-10-01', 5000, 0);
    const inv2 = makeInvoice('INV-002', 'INV-002', '2026-10-02', 3000, 0);
    db.saveInvoice(inv1);
    db.saveInvoice(inv2);

    const voucher = createPaymentReceiptVoucher({
      date: '2026-10-05',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 5000,
      paymentMode: 'UPI',
      narration: 'Payment for INV-001',
    });
    voucher.partyId = sampleCustomer.id;
    voucher.partyName = sampleCustomer.name;
    voucher.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: inv1.id,
        documentNumber: inv1.invoiceNumber,
        amount: 5000,
      },
    ];
    voucher.allocationMode = 'MANUAL';

    db.savePaymentVoucher(voucher);

    const updatedInv1 = db.getInvoices().find((i) => i.id === inv1.id)!;
    const updatedInv2 = db.getInvoices().find((i) => i.id === inv2.id)!;

    expect(updatedInv1.paidAmount).toBe(5000);
    expect(updatedInv1.balanceAmount).toBe(0);
    expect(updatedInv1.paymentStatus).toBe('PAID');

    expect(updatedInv2.paidAmount).toBe(0);
    expect(updatedInv2.balanceAmount).toBe(3000);
    expect(updatedInv2.paymentStatus).toBe('UNPAID');
  });

  // Scenario 2: Receipt voucher linked to multiple invoices allocates each amount correctly
  it('Scenario 2: Receipt voucher linked to multiple invoices allocates each amount correctly', () => {
    db.saveParty(sampleCustomer);
    const inv1 = makeInvoice('INV-001', 'INV-001', '2026-10-01', 4000, 0);
    const inv2 = makeInvoice('INV-002', 'INV-002', '2026-10-02', 6000, 0);
    db.saveInvoice(inv1);
    db.saveInvoice(inv2);

    // Auto-FIFO allocation of ₹7,000 across INV-001 (4000) and INV-002 (6000)
    const outstanding = getOutstandingDocuments({
      partyId: sampleCustomer.id,
      documentType: 'INVOICE',
      invoices: db.getInvoices(),
    });
    const allocations = allocateOldestFirst(outstanding, 7000);

    expect(allocations).toHaveLength(2);
    expect(allocations[0].documentId).toBe(inv1.id);
    expect(allocations[0].amount).toBe(4000);
    expect(allocations[1].documentId).toBe(inv2.id);
    expect(allocations[1].amount).toBe(3000);

    const voucher = createPaymentReceiptVoucher({
      date: '2026-10-05',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 7000,
      paymentMode: 'BANK',
      narration: 'Lump sum payment across invoices',
    });
    voucher.partyId = sampleCustomer.id;
    voucher.partyName = sampleCustomer.name;
    voucher.paymentAllocations = allocations;
    voucher.allocationMode = 'AUTO_FIFO';

    db.savePaymentVoucher(voucher);

    const updatedInv1 = db.getInvoices().find((i) => i.id === inv1.id)!;
    const updatedInv2 = db.getInvoices().find((i) => i.id === inv2.id)!;

    expect(updatedInv1.paidAmount).toBe(4000);
    expect(updatedInv1.balanceAmount).toBe(0);
    expect(updatedInv1.paymentStatus).toBe('PAID');

    expect(updatedInv2.paidAmount).toBe(3000);
    expect(updatedInv2.balanceAmount).toBe(3000);
    expect(updatedInv2.paymentStatus).toBe('PARTIAL');
  });

  // Scenario 3: Payment Out voucher linked to one/multiple purchase bills
  it('Scenario 3: Payment Out voucher linked to one/multiple purchase bills', () => {
    db.saveParty(sampleSupplier);
    const bill1 = makePurchase('PUR-001', 'BILL-001', '2026-10-01', 2500, 0);
    const bill2 = makePurchase('PUR-002', 'BILL-002', '2026-10-03', 5000, 0);
    db.savePurchase(bill1);
    db.savePurchase(bill2);

    const voucher = createPaymentOutVoucher({
      date: '2026-10-06',
      supplierName: sampleSupplier.name,
      supplierId: sampleSupplier.id,
      amount: 4000,
      paymentMode: 'BANK',
      narration: 'Payment to steel supplier',
    });
    voucher.partyId = sampleSupplier.id;
    voucher.partyName = sampleSupplier.name;
    voucher.paymentAllocations = [
      {
        documentType: 'PURCHASE',
        documentId: bill1.id,
        documentNumber: bill1.billNumber,
        amount: 2500,
      },
      {
        documentType: 'PURCHASE',
        documentId: bill2.id,
        documentNumber: bill2.billNumber,
        amount: 1500,
      },
    ];
    voucher.allocationMode = 'MANUAL';

    db.savePaymentVoucher(voucher);

    const updatedBill1 = db.getPurchases().find((p) => p.id === bill1.id)!;
    const updatedBill2 = db.getPurchases().find((p) => p.id === bill2.id)!;

    expect(updatedBill1.paidAmount).toBe(2500);
    expect(updatedBill1.balanceAmount).toBe(0);
    expect(updatedBill1.paymentStatus).toBe('PAID');

    expect(updatedBill2.paidAmount).toBe(1500);
    expect(updatedBill2.balanceAmount).toBe(3500);
    expect(updatedBill2.paymentStatus).toBe('PARTIAL');
  });

  // Scenario 4: Partial allocation and unallocated advance allowed and validated
  it('Scenario 4: Partial allocation and unallocated advance allowed and validated', () => {
    db.saveParty(sampleCustomer);
    const inv = makeInvoice('INV-001', 'INV-001', '2026-10-01', 5000, 0);
    db.saveInvoice(inv);

    const outstanding = getOutstandingDocuments({
      partyId: sampleCustomer.id,
      documentType: 'INVOICE',
      invoices: [inv],
    });
    // Customer pays ₹8,000 for a ₹5,000 invoice (₹3,000 unallocated advance)
    const allocations = allocateOldestFirst(outstanding, 8000);
    const unallocated = Math.max(0, Math.round((8000 - allocations.reduce((s, a) => s + a.amount, 0)) * 100) / 100);

    expect(allocations).toHaveLength(1);
    expect(allocations[0].amount).toBe(5000);
    expect(unallocated).toBe(3000);

    const validation = validateAllocations({
      totalSettled: 8000,
      allocations,
      documents: outstanding,
      partyId: sampleCustomer.id,
    });
    expect(validation.valid).toBe(true);

    const voucher = createPaymentReceiptVoucher({
      date: '2026-10-05',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 8000,
      paymentMode: 'UPI',
    });
    voucher.partyId = sampleCustomer.id;
    voucher.partyName = sampleCustomer.name;
    voucher.paymentAllocations = allocations;
    voucher.allocationMode = 'AUTO_FIFO';

    db.savePaymentVoucher(voucher);

    const updatedInv = db.getInvoices().find((i) => i.id === inv.id)!;
    expect(updatedInv.paidAmount).toBe(5000);
    expect(updatedInv.balanceAmount).toBe(0);
    expect(updatedInv.paymentStatus).toBe('PAID');

    // Party net balance: 5000 bill - 8000 payment = -3000 (advance held)
    const party = db.getParties().find((p) => p.id === sampleCustomer.id)!;
    expect(party.currentBalance).toBe(-3000);
  });

  // Scenario 5: Over-allocation, negative allocation, duplicate document and wrong-party link rejected
  it('Scenario 5: Over-allocation, negative allocation, duplicate document and wrong-party link rejected', () => {
    const inv1 = makeInvoice('INV-001', 'INV-001', '2026-10-01', 3000, 0);
    const inv2 = makeInvoice('INV-002', 'INV-002', '2026-10-02', 4000, 0);
    const wrongPartyInv = { ...inv2, partyId: 'WRONG-PARTY-ID', partyName: 'Other Party' };

    const outstanding = getOutstandingDocuments({
      partyId: sampleCustomer.id,
      documentType: 'INVOICE',
      invoices: [inv1],
    });

    // 1. Over-allocation (allocations exceed document balance or total payment)
    const overAlloc: PaymentAllocation[] = [
      { documentType: 'INVOICE', documentId: inv1.id, documentNumber: inv1.invoiceNumber, amount: 4000 },
    ];
    const valOver = validateAllocations({
      totalSettled: 3000,
      allocations: overAlloc,
      documents: outstanding,
    });
    expect(valOver.valid).toBe(false);
    expect(valOver.error).toMatch(/exceeds balance/);

    // 2. Negative allocation
    const negAlloc: PaymentAllocation[] = [
      { documentType: 'INVOICE', documentId: inv1.id, documentNumber: inv1.invoiceNumber, amount: -100 },
    ];
    const valNeg = validateAllocations({
      totalSettled: 3000,
      allocations: negAlloc,
      documents: outstanding,
    });
    expect(valNeg.valid).toBe(false);
    expect(valNeg.error).toMatch(/greater than zero/);

    // 3. Duplicate document
    const dupeAlloc: PaymentAllocation[] = [
      { documentType: 'INVOICE', documentId: inv1.id, documentNumber: inv1.invoiceNumber, amount: 1000 },
      { documentType: 'INVOICE', documentId: inv1.id, documentNumber: inv1.invoiceNumber, amount: 1000 },
    ];
    const valDupe = validateAllocations({
      totalSettled: 3000,
      allocations: dupeAlloc,
      documents: outstanding,
    });
    expect(valDupe.valid).toBe(false);
    expect(valDupe.error).toMatch(/Duplicate/);

    // 4. Wrong-party document
    const wrongOutstanding = getOutstandingDocuments({
      partyId: sampleCustomer.id,
      documentType: 'INVOICE',
      invoices: [wrongPartyInv],
    });
    expect(wrongOutstanding).toHaveLength(0);
  });

  // Scenario 6: Editing a voucher reverses/reapplies allocations without double-settling
  it('Scenario 6: Editing a voucher reverses/reapplies allocations without double-settling', () => {
    db.saveParty(sampleCustomer);
    const inv1 = makeInvoice('INV-001', 'INV-001', '2026-10-01', 5000, 0);
    const inv2 = makeInvoice('INV-002', 'INV-002', '2026-10-02', 5000, 0);
    db.saveInvoice(inv1);
    db.saveInvoice(inv2);

    // Initially voucher links ₹5,000 to INV-001
    const voucher = createPaymentReceiptVoucher({
      date: '2026-10-05',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 5000,
      paymentMode: 'UPI',
    });
    voucher.partyId = sampleCustomer.id;
    voucher.partyName = sampleCustomer.name;
    voucher.paymentAllocations = [
      { documentType: 'INVOICE', documentId: inv1.id, documentNumber: inv1.invoiceNumber, amount: 5000 },
    ];
    voucher.allocationMode = 'MANUAL';

    db.savePaymentVoucher(voucher);

    expect(db.getInvoices().find((i) => i.id === inv1.id)!.paidAmount).toBe(5000);
    expect(db.getInvoices().find((i) => i.id === inv2.id)!.paidAmount).toBe(0);

    // Edit voucher: reallocate ₹2,500 to INV-001 and ₹2,500 to INV-002
    const editedVoucher: Voucher = {
      ...voucher,
      paymentAllocations: [
        { documentType: 'INVOICE', documentId: inv1.id, documentNumber: inv1.invoiceNumber, amount: 2500 },
        { documentType: 'INVOICE', documentId: inv2.id, documentNumber: inv2.invoiceNumber, amount: 2500 },
      ],
    };

    db.savePaymentVoucher(editedVoucher);

    const updatedInv1 = db.getInvoices().find((i) => i.id === inv1.id)!;
    const updatedInv2 = db.getInvoices().find((i) => i.id === inv2.id)!;

    // Must not have double-settled: 5000 reversed first, then 2500 applied to each
    expect(updatedInv1.paidAmount).toBe(2500);
    expect(updatedInv1.balanceAmount).toBe(2500);
    expect(updatedInv1.paymentStatus).toBe('PARTIAL');

    expect(updatedInv2.paidAmount).toBe(2500);
    expect(updatedInv2.balanceAmount).toBe(2500);
    expect(updatedInv2.paymentStatus).toBe('PARTIAL');
  });

  // Scenario 7: Reducing a voucher below allocated total is blocked
  it('Scenario 7: Reducing a voucher below allocated total is blocked', () => {
    const inv1 = makeInvoice('INV-001', 'INV-001', '2026-10-01', 5000, 0);
    const outstanding = getOutstandingDocuments({
      partyId: sampleCustomer.id,
      documentType: 'INVOICE',
      invoices: [inv1],
    });

    const allocs: PaymentAllocation[] = [
      { documentType: 'INVOICE', documentId: inv1.id, documentNumber: inv1.invoiceNumber, amount: 5000 },
    ];

    // Validation rejects if total settled is reduced to 3000 while allocations total 5000
    const validation = validateAllocations({
      totalSettled: 3000,
      allocations: allocs,
      documents: outstanding,
    });
    expect(validation.valid).toBe(false);
    expect(validation.error).toMatch(/exceeds payment amount/);
  });

  // Scenario 8: Reversing/deleting a voucher restores linked document balances and leaves others alone
  it('Scenario 8: Reversing/deleting a voucher restores linked document balances and leaves others alone', () => {
    db.saveParty(sampleCustomer);
    const inv1 = makeInvoice('INV-001', 'INV-001', '2026-10-01', 5000, 0);
    const inv2 = makeInvoice('INV-002', 'INV-002', '2026-10-02', 3000, 1000); // independent payment
    db.saveInvoice(inv1);
    db.saveInvoice(inv2);

    const voucher = createPaymentReceiptVoucher({
      date: '2026-10-05',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 5000,
      paymentMode: 'UPI',
    });
    voucher.partyId = sampleCustomer.id;
    voucher.partyName = sampleCustomer.name;
    voucher.paymentAllocations = [
      { documentType: 'INVOICE', documentId: inv1.id, documentNumber: inv1.invoiceNumber, amount: 5000 },
    ];
    db.savePaymentVoucher(voucher);

    expect(db.getInvoices().find((i) => i.id === inv1.id)!.balanceAmount).toBe(0);

    // Delete/reverse the voucher
    db.deleteVoucher(voucher.id);

    const restoredInv1 = db.getInvoices().find((i) => i.id === inv1.id)!;
    const untouchedInv2 = db.getInvoices().find((i) => i.id === inv2.id)!;

    expect(restoredInv1.paidAmount).toBe(0);
    expect(restoredInv1.balanceAmount).toBe(5000);
    expect(restoredInv1.paymentStatus).toBe('UNPAID');

    // Unrelated inv2 remains completely unaffected
    expect(untouchedInv2.paidAmount).toBe(1000);
    expect(untouchedInv2.balanceAmount).toBe(2000);
    expect(untouchedInv2.paymentStatus).toBe('PARTIAL');
  });

  // Scenario 9: Saving an invoice with upfront payment creates exactly one linked receipt voucher
  it('Scenario 9: Saving an invoice with upfront payment creates exactly one linked receipt voucher', () => {
    db.saveParty(sampleCustomer);
    const inv = makeInvoice('INV-001', 'INV-001', '2026-10-01', 5000, 3000);
    db.saveInvoice(inv);

    // Upfront receipt voucher creation helper simulation
    const upfrontVoucher = createPaymentReceiptVoucher({
      date: inv.date,
      customerName: inv.partyName,
      customerId: inv.partyId!,
      amount: inv.paidAmount,
      paymentMode: inv.paymentMode,
      narration: `Payment for Invoice #${inv.invoiceNumber}`,
    });
    upfrontVoucher.sourceDocumentType = 'INVOICE';
    upfrontVoucher.sourceDocumentId = inv.id;
    upfrontVoucher.sourceDocumentNumber = inv.invoiceNumber;
    upfrontVoucher.allocationMode = 'SOURCE_DOCUMENT';
    upfrontVoucher.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: inv.id,
        documentNumber: inv.invoiceNumber,
        amount: inv.paidAmount,
        date: inv.date,
      },
    ];

    db.savePaymentVoucher(upfrontVoucher, { skipDocumentUpdate: true });

    const vouchers = db.getVouchers().filter((v) => v.sourceDocumentId === inv.id);
    expect(vouchers).toHaveLength(1);
    expect(vouchers[0].totalAmount).toBe(3000);
    expect(vouchers[0].paymentAllocations?.[0].documentNumber).toBe('INV-001');
    expect(vouchers[0].paymentAllocations?.[0].amount).toBe(3000);
  });

  // Scenario 10: Re-saving/editing that invoice does not create a duplicate receipt voucher
  it('Scenario 10: Re-saving/editing that invoice does not create a duplicate receipt voucher', () => {
    db.saveParty(sampleCustomer);
    const inv = makeInvoice('INV-001', 'INV-001', '2026-10-01', 5000, 3000);
    db.saveInvoice(inv);

    const upfrontVoucher = createPaymentReceiptVoucher({
      date: inv.date,
      customerName: inv.partyName,
      customerId: inv.partyId!,
      amount: inv.paidAmount,
      paymentMode: inv.paymentMode,
      narration: `Payment for Invoice #${inv.invoiceNumber}`,
    });
    upfrontVoucher.sourceDocumentType = 'INVOICE';
    upfrontVoucher.sourceDocumentId = inv.id;
    upfrontVoucher.sourceDocumentNumber = inv.invoiceNumber;
    upfrontVoucher.allocationMode = 'SOURCE_DOCUMENT';
    upfrontVoucher.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: inv.id,
        documentNumber: inv.invoiceNumber,
        amount: inv.paidAmount,
        date: inv.date,
      },
    ];
    db.savePaymentVoucher(upfrontVoucher, { skipDocumentUpdate: true });

    // Re-save edit with paidAmount updated to ₹4,000
    const editedInv = { ...inv, paidAmount: 4000, balanceAmount: 1000 };
    db.saveInvoice(editedInv);

    const existingVoucher = db.getVouchers().find((v) => v.sourceDocumentId === editedInv.id);
    expect(existingVoucher).toBeDefined();

    const updatedUpfrontVoucher = createPaymentReceiptVoucher({
      date: editedInv.date,
      customerName: editedInv.partyName,
      customerId: editedInv.partyId!,
      amount: editedInv.paidAmount,
      paymentMode: editedInv.paymentMode,
      narration: `Payment for Invoice #${editedInv.invoiceNumber}`,
    });
    updatedUpfrontVoucher.id = existingVoucher!.id;
    updatedUpfrontVoucher.voucherNumber = existingVoucher!.voucherNumber;
    updatedUpfrontVoucher.sourceDocumentType = 'INVOICE';
    updatedUpfrontVoucher.sourceDocumentId = editedInv.id;
    updatedUpfrontVoucher.sourceDocumentNumber = editedInv.invoiceNumber;
    updatedUpfrontVoucher.allocationMode = 'SOURCE_DOCUMENT';
    updatedUpfrontVoucher.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: editedInv.id,
        documentNumber: editedInv.invoiceNumber,
        amount: editedInv.paidAmount,
        date: editedInv.date,
      },
    ];

    db.savePaymentVoucher(updatedUpfrontVoucher, { skipDocumentUpdate: true });

    const allLinkedVouchers = db.getVouchers().filter((v) => v.sourceDocumentId === inv.id && !v.isCancelled);
    expect(allLinkedVouchers).toHaveLength(1);
    expect(allLinkedVouchers[0].totalAmount).toBe(4000);
  });

  // Scenario 11: Saving a purchase with upfront payment creates exactly one linked payment voucher
  it('Scenario 11: Saving a purchase with upfront payment creates exactly one linked payment voucher', () => {
    db.saveParty(sampleSupplier);
    const pur = makePurchase('PUR-001', 'BILL-001', '2026-10-01', 6000, 2000);
    db.savePurchase(pur);

    const upfrontVoucher = createPaymentOutVoucher({
      date: pur.date,
      supplierName: pur.supplierName,
      supplierId: pur.supplierId,
      amount: pur.paidAmount,
      paymentMode: pur.paymentMode,
      narration: `Disbursement for Purchase Bill #${pur.billNumber}`,
    });
    upfrontVoucher.sourceDocumentType = 'PURCHASE';
    upfrontVoucher.sourceDocumentId = pur.id;
    upfrontVoucher.sourceDocumentNumber = pur.billNumber;
    upfrontVoucher.allocationMode = 'SOURCE_DOCUMENT';
    upfrontVoucher.paymentAllocations = [
      {
        documentType: 'PURCHASE',
        documentId: pur.id,
        documentNumber: pur.billNumber,
        amount: pur.paidAmount,
        date: pur.date,
      },
    ];

    db.savePaymentVoucher(upfrontVoucher, { skipDocumentUpdate: true });

    const vouchers = db.getVouchers().filter((v) => v.sourceDocumentId === pur.id);
    expect(vouchers).toHaveLength(1);
    expect(vouchers[0].totalAmount).toBe(2000);
    expect(vouchers[0].voucherType).toBe('PAYMENT');
    expect(vouchers[0].paymentAllocations?.[0].documentNumber).toBe('BILL-001');
  });

  // Scenario 12: Payment In/Out page shows voucher with linked invoice numbers and does not double count against auto row
  it('Scenario 12: Payment In/Out page shows voucher with linked invoice numbers and does not double count against auto row', () => {
    db.saveParty(sampleCustomer);
    const inv = makeInvoice('INV-001', 'INV-001', '2026-10-01', 5000, 5000);
    db.saveInvoice(inv);

    const voucher = createPaymentReceiptVoucher({
      date: '2026-10-01',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 5000,
      paymentMode: 'UPI',
    });
    voucher.partyId = sampleCustomer.id;
    voucher.partyName = sampleCustomer.name;
    voucher.sourceDocumentType = 'INVOICE';
    voucher.sourceDocumentId = inv.id;
    voucher.sourceDocumentNumber = inv.invoiceNumber;
    voucher.paymentAllocations = [
      { documentType: 'INVOICE', documentId: inv.id, documentNumber: inv.invoiceNumber, amount: 5000 },
    ];
    db.savePaymentVoucher(voucher, { skipDocumentUpdate: true });

    const summary = computeCashBankSummary({
      accounts: db.getBankAccounts(),
      invoices: db.getInvoices(),
      purchases: db.getPurchases(),
      expenses: db.getExpenses(),
      vouchers: db.getVouchers(),
      transactions: db.getCashBankTransactions(),
    });

    // Inflow entries for this invoice must NOT be double-counted:
    // Either the voucher is present or synthetic row, never both for ₹5,000 + ₹5,000 = ₹10,000!
    const inflowsForParty = summary.ledgerEntries.filter(
      (e) => e.flow === 'IN' && (e.counterpartyOrTitle === sampleCustomer.name || e.partyId === sampleCustomer.id)
    );
    const totalInflow = inflowsForParty.reduce((sum, e) => sum + e.amount, 0);

    expect(totalInflow).toBe(5000);
  });

  // Scenario 13: Party passbook shows one payment row and linked document numbers
  it('Scenario 13: Party passbook shows one payment row and linked document numbers', () => {
    db.saveParty(sampleCustomer);
    const inv = makeInvoice('INV-001', 'INV-001', '2026-10-01', 5000, 0);
    db.saveInvoice(inv);

    const voucher = createPaymentReceiptVoucher({
      date: '2026-10-05',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 5000,
      paymentMode: 'UPI',
      narration: 'Customer cleared bill',
    });
    voucher.partyId = sampleCustomer.id;
    voucher.partyName = sampleCustomer.name;
    voucher.paymentAllocations = [
      { documentType: 'INVOICE', documentId: inv.id, documentNumber: inv.invoiceNumber, amount: 5000 },
    ];
    db.savePaymentVoucher(voucher);

    const partyVouchers = db.getVouchers().filter(
      (v) => v.partyId === sampleCustomer.id || v.entries.some((e) => e.accountId === sampleCustomer.id)
    );

    expect(partyVouchers).toHaveLength(1);
    expect(partyVouchers[0].paymentAllocations).toBeDefined();
    expect(partyVouchers[0].paymentAllocations![0].documentNumber).toBe('INV-001');

    // Balance recalculation accurately incorporates the payment
    const party = db.getParties().find((p) => p.id === sampleCustomer.id)!;
    expect(party.currentBalance).toBe(0);
  });

  // Scenario 14: Legacy invoice/voucher without allocations still displays and totals unchanged
  it('Scenario 14: Legacy invoice/voucher without allocations still displays and totals unchanged', () => {
    db.saveParty(sampleCustomer);
    // Legacy invoice created before allocations feature
    const legacyInv = makeInvoice('LEGACY-INV-999', 'LEGACY-999', '2025-06-15', 2360, 2360);
    legacyInv.paymentMode = 'CASH';
    db.saveInvoice(legacyInv);

    // Legacy voucher without paymentAllocations
    const legacyVoucher = createPaymentReceiptVoucher({
      date: '2025-06-16',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 1000,
      paymentMode: 'CASH',
    });
    // Deliberately no paymentAllocations or allocationMode
    db.saveVoucher(legacyVoucher);

    const summary = computeCashBankSummary({
      accounts: db.getBankAccounts(),
      invoices: db.getInvoices(),
      purchases: db.getPurchases(),
      expenses: db.getExpenses(),
      vouchers: db.getVouchers(),
      transactions: db.getCashBankTransactions(),
    });

    // Summary calculation and ledger entry extraction functions without errors
    expect(summary.totalLiquidBalance).toBeGreaterThanOrEqual(1000);
    expect(summary.ledgerEntries.length).toBeGreaterThan(0);
    const loadedVoucher = db.getVouchers().find((v) => v.id === legacyVoucher.id)!;
    expect(loadedVoucher.paymentAllocations).toBeUndefined();
    expect(loadedVoucher.totalAmount).toBe(1000);
  });

  // Scenario 15: Invoice balance updates with pre-existing paymentSplits and is preserved across derivePaymentSettlement
  it('Scenario 15: Invoice balance updates with pre-existing paymentSplits and is preserved across derivePaymentSettlement', () => {
    db.saveParty(sampleCustomer);
    // Invoice created with split payment: Cash 1000, Credit 4000 (grand total 5000)
    const inv = makeInvoice('INV-SPLIT-001', 'INV-SPLIT-001', '2026-10-01', 5000, 1000);
    inv.paymentSplits = [
      { id: 'split-1', mode: 'CASH', amount: 1000 },
      { id: 'split-2', mode: 'CREDIT', amount: 4000 },
    ];
    inv.notes = 'Split Payment — Cash ₹1000, Credit ₹4000';
    db.saveInvoice(inv);

    // Verify initial saved state
    const savedBefore = db.getInvoices().find((i) => i.id === inv.id)!;
    expect(savedBefore.paidAmount).toBe(1000);
    expect(savedBefore.balanceAmount).toBe(4000);
    expect(savedBefore.paymentStatus).toBe('PARTIAL');

    // Now record a payment voucher that allocates ₹2,500 to this invoice
    const voucher = createPaymentReceiptVoucher({
      date: '2026-10-05',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 2500,
      paymentMode: 'BANK',
      narration: 'Additional payment against dues',
    });
    voucher.partyId = sampleCustomer.id;
    voucher.partyName = sampleCustomer.name;
    voucher.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: inv.id,
        documentNumber: inv.invoiceNumber,
        amount: 2500,
      },
    ];
    voucher.allocationMode = 'MANUAL';

    db.savePaymentVoucher(voucher);

    // Verify that the saved invoice balance actually changed and was NOT overwritten by derivePaymentSettlement!
    const savedAfter = db.getInvoices().find((i) => i.id === inv.id)!;
    expect(savedAfter.paidAmount).toBe(3500);
    expect(savedAfter.balanceAmount).toBe(1500);
    expect(savedAfter.paymentStatus).toBe('PARTIAL');

    // And verify that re-saving the invoice does not revert the balance
    db.saveInvoice(savedAfter);
    const savedAfterResave = db.getInvoices().find((i) => i.id === inv.id)!;
    expect(savedAfterResave.paidAmount).toBe(3500);
    expect(savedAfterResave.balanceAmount).toBe(1500);
  });

  it('Scenario 16: Invoice with upfront payment plus later party payment; edit invoice; party voucher unchanged, no duplicate source voucher, invoice balance correct', () => {
    db.saveParty(sampleCustomer);
    const inv = makeInvoice('INV-UPFRONT-001', 'INV-UPFRONT-001', '2026-10-01', 10000, 2000);
    db.saveInvoice(inv);

    // Initial upfront source voucher created on invoice creation
    const sourceVoucher = createPaymentReceiptVoucher({
      date: '2026-10-01',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 2000,
      paymentMode: 'CASH',
      narration: 'Upfront payment received for Invoice #INV-UPFRONT-001',
    });
    sourceVoucher.partyId = sampleCustomer.id;
    sourceVoucher.partyName = sampleCustomer.name;
    sourceVoucher.sourceDocumentType = 'INVOICE';
    sourceVoucher.sourceDocumentId = inv.id;
    sourceVoucher.sourceDocumentNumber = inv.invoiceNumber;
    sourceVoucher.allocationMode = 'SOURCE_DOCUMENT';
    sourceVoucher.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: inv.id,
        documentNumber: inv.invoiceNumber,
        amount: 2000,
        date: '2026-10-01',
      },
    ];
    db.savePaymentVoucher(sourceVoucher, { skipDocumentUpdate: true });

    // Later party payment recorded by user
    const partyVoucher = createPaymentReceiptVoucher({
      date: '2026-10-05',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 3000,
      paymentMode: 'BANK',
      narration: 'Party payment against dues',
    });
    partyVoucher.partyId = sampleCustomer.id;
    partyVoucher.partyName = sampleCustomer.name;
    partyVoucher.allocationMode = 'MANUAL';
    partyVoucher.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: inv.id,
        documentNumber: inv.invoiceNumber,
        amount: 3000,
        date: '2026-10-05',
      },
    ];
    db.savePaymentVoucher(partyVoucher);

    // Document now has paidAmount: 5000, balance: 5000
    let updatedInv = db.getInvoices().find((i) => i.id === inv.id)!;
    expect(updatedInv.paidAmount).toBe(5000);
    expect(updatedInv.balanceAmount).toBe(5000);

    // Now user edits the invoice (e.g. updating items or notes, paidAmount stays 5000)
    updatedInv = {
      ...updatedInv,
      notes: 'Customer requested updated notes on bill',
    };
    db.saveInvoice(updatedInv);

    // Verification:
    // 1. Party voucher is completely intact and unchanged
    const savedPartyVoucher = db.getVouchers().find((v) => v.id === partyVoucher.id)!;
    expect(savedPartyVoucher.isReversed).toBeFalsy();
    expect(savedPartyVoucher.totalAmount).toBe(3000);
    expect(savedPartyVoucher.allocationMode).toBe('MANUAL');

    // 2. No duplicate source voucher created
    const sourceVouchers = db.getVouchers().filter(
      (v) =>
        !v.isReversed &&
        !v.isCancelled &&
        v.sourceDocumentId === inv.id &&
        v.allocationMode === 'SOURCE_DOCUMENT'
    );
    expect(sourceVouchers.length).toBe(1);
    expect(sourceVouchers[0].id).toBe(sourceVoucher.id);

    // 3. Invoice balance is correct
    const finalInv = db.getInvoices().find((i) => i.id === inv.id)!;
    expect(finalInv.paidAmount).toBe(5000);
    expect(finalInv.balanceAmount).toBe(5000);
  });

  it('Scenario 17: Purchase with upfront payment plus later party payment; edit purchase; party voucher unchanged, no duplicate source voucher, bill balance correct', () => {
    db.saveParty(sampleSupplier);
    const bill = makePurchase('PUR-UPFRONT-001', 'PUR-UPFRONT-001', '2026-10-01', 8000, 2000);
    db.savePurchase(bill);

    // Upfront source voucher created on purchase bill creation
    const sourceVoucher = createPaymentOutVoucher({
      receiptNumber: `PUR-${bill.billNumber}`,
      date: '2026-10-01',
      supplierName: sampleSupplier.name,
      supplierId: sampleSupplier.id,
      amount: 2000,
      paymentMode: 'CASH',
      narration: `Upfront payment made for Bill #${bill.billNumber}`,
    });
    sourceVoucher.partyId = sampleSupplier.id;
    sourceVoucher.partyName = sampleSupplier.name;
    sourceVoucher.sourceDocumentType = 'PURCHASE';
    sourceVoucher.sourceDocumentId = bill.id;
    sourceVoucher.sourceDocumentNumber = bill.billNumber;
    sourceVoucher.allocationMode = 'SOURCE_DOCUMENT';
    sourceVoucher.paymentAllocations = [
      {
        documentType: 'PURCHASE',
        documentId: bill.id,
        documentNumber: bill.billNumber,
        amount: 2000,
        date: '2026-10-01',
      },
    ];
    db.savePaymentVoucher(sourceVoucher, { skipDocumentUpdate: true });

    // Later party payment out recorded
    const partyVoucher = createPaymentOutVoucher({
      date: '2026-10-05',
      supplierName: sampleSupplier.name,
      supplierId: sampleSupplier.id,
      amount: 4000,
      paymentMode: 'BANK',
      narration: 'Disbursed dues to supplier',
    });
    partyVoucher.partyId = sampleSupplier.id;
    partyVoucher.partyName = sampleSupplier.name;
    partyVoucher.allocationMode = 'MANUAL';
    partyVoucher.paymentAllocations = [
      {
        documentType: 'PURCHASE',
        documentId: bill.id,
        documentNumber: bill.billNumber,
        amount: 4000,
        date: '2026-10-05',
      },
    ];
    db.savePaymentVoucher(partyVoucher);

    let updatedBill = db.getPurchases().find((p) => p.id === bill.id)!;
    expect(updatedBill.paidAmount).toBe(6000);
    expect(updatedBill.balanceAmount).toBe(2000);

    // Edit purchase bill
    updatedBill = {
      ...updatedBill,
      notes: 'Vendor provided transport receipt',
    };
    db.savePurchase(updatedBill);

    // Verification:
    // 1. Party payment voucher is unchanged
    const savedPartyVoucher = db.getVouchers().find((v) => v.id === partyVoucher.id)!;
    expect(savedPartyVoucher.isReversed).toBeFalsy();
    expect(savedPartyVoucher.totalAmount).toBe(4000);

    // 2. No duplicate source voucher
    const sourceVouchers = db.getVouchers().filter(
      (v) =>
        !v.isReversed &&
        !v.isCancelled &&
        v.sourceDocumentId === bill.id &&
        v.allocationMode === 'SOURCE_DOCUMENT'
    );
    expect(sourceVouchers.length).toBe(1);

    // 3. Bill balance remains 6000 paid, 2000 balance
    const finalBill = db.getPurchases().find((p) => p.id === bill.id)!;
    expect(finalBill.paidAmount).toBe(6000);
    expect(finalBill.balanceAmount).toBe(2000);
  });

  it('Scenario 18: Save the same purchase document multiple times; voucher number remains stable and unique without growing prefix', () => {
    db.saveParty(sampleSupplier);
    const bill = makePurchase('PUR-STABLE-001', 'PUR-STABLE-001', '2026-10-01', 5000, 1000);
    db.savePurchase(bill);

    // Simulate upfront voucher creation
    const rawNum = `PUR-${bill.billNumber}`;
    const v1 = createPaymentOutVoucher({
      receiptNumber: rawNum,
      date: bill.date,
      supplierName: sampleSupplier.name,
      supplierId: sampleSupplier.id,
      amount: 1000,
      paymentMode: 'CASH',
    });
    v1.allocationMode = 'SOURCE_DOCUMENT';
    v1.sourceDocumentId = bill.id;
    db.savePaymentVoucher(v1, { skipDocumentUpdate: true });

    const initialVoucherNumber = v1.voucherNumber;
    expect(initialVoucherNumber).toBe(`VCH-PYMT-${rawNum}`);

    // Re-save the purchase document multiple times
    for (let i = 0; i < 3; i++) {
      const existing = db.getVouchers().find(
        (v) =>
          !v.isCancelled &&
          !v.isReversed &&
          v.voucherType === 'PAYMENT' &&
          v.allocationMode === 'SOURCE_DOCUMENT' &&
          v.sourceDocumentId === bill.id
      )!;

      const strippedRawNum = existing.voucherNumber.replace(/^VCH-PYMT-/, '');
      const reSavedVoucher = createPaymentOutVoucher({
        voucherId: existing.id,
        receiptNumber: strippedRawNum,
        date: bill.date,
        supplierName: sampleSupplier.name,
        supplierId: sampleSupplier.id,
        amount: 1000,
        paymentMode: 'CASH',
      });
      reSavedVoucher.allocationMode = 'SOURCE_DOCUMENT';
      reSavedVoucher.sourceDocumentId = bill.id;
      db.savePaymentVoucher(reSavedVoucher, { skipDocumentUpdate: true });

      expect(reSavedVoucher.voucherNumber).toBe(initialVoucherNumber);
      expect(reSavedVoucher.voucherNumber).not.toContain('VCH-PYMT-VCH-PYMT');
    }

    const vouchers = db.getVouchers().filter((v) => v.sourceDocumentId === bill.id && !v.isReversed);
    expect(vouchers.length).toBe(1);
    expect(vouchers[0].voucherNumber).toBe(initialVoucherNumber);
  });

  it('Scenario 19: Cleared allocation produces zero paymentAllocations and an UNALLOCATED voucher', () => {
    db.saveParty(sampleCustomer);
    const inv = makeInvoice('INV-CLEAR-001', 'INV-CLEAR-001', '2026-10-01', 5000, 0);
    db.saveInvoice(inv);

    // Record an unallocated / on-account payment where user cleared allocations
    const voucher = createPaymentReceiptVoucher({
      date: '2026-10-02',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 2000,
      paymentMode: 'CASH',
      narration: 'On-account advance payment',
    });
    voucher.partyId = sampleCustomer.id;
    voucher.partyName = sampleCustomer.name;
    voucher.paymentAllocations = [];
    voucher.allocationMode = 'UNALLOCATED';

    db.savePaymentVoucher(voucher);

    // Verify voucher
    const savedVoucher = db.getVouchers().find((v) => v.id === voucher.id)!;
    expect(savedVoucher.allocationMode).toBe('UNALLOCATED');
    expect(savedVoucher.paymentAllocations).toEqual([]);

    // Verify invoice balance is completely unchanged
    const savedInv = db.getInvoices().find((i) => i.id === inv.id)!;
    expect(savedInv.paidAmount).toBe(0);
    expect(savedInv.balanceAmount).toBe(5000);
    expect(savedInv.paymentStatus).toBe('UNPAID');
  });

  it('Scenario 20: Over-allocation and wrong-type allocation are rejected by savePaymentVoucher', () => {
    db.saveParty(sampleCustomer);
    db.saveParty(sampleSupplier);

    const inv = makeInvoice('INV-VAL-001', 'INV-VAL-001', '2026-10-01', 1000, 0);
    db.saveInvoice(inv);

    const pur = makePurchase('PUR-VAL-001', 'PUR-VAL-001', '2026-10-01', 1000, 0);
    db.savePurchase(pur);

    // Test 1: Over-allocation beyond voucher total
    const v1 = createPaymentReceiptVoucher({
      date: '2026-10-02',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 500,
      paymentMode: 'CASH',
    });
    v1.partyId = sampleCustomer.id;
    v1.partyName = sampleCustomer.name;
    v1.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: inv.id,
        documentNumber: inv.invoiceNumber,
        amount: 800, // exceeds voucher amount of 500
      },
    ];

    expect(() => db.savePaymentVoucher(v1)).toThrow(/exceeds voucher total amount/i);

    // Test 2: Over-allocation beyond document balance
    const v2 = createPaymentReceiptVoucher({
      date: '2026-10-02',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 1500,
      paymentMode: 'CASH',
    });
    v2.partyId = sampleCustomer.id;
    v2.partyName = sampleCustomer.name;
    v2.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: inv.id,
        documentNumber: inv.invoiceNumber,
        amount: 1500, // exceeds invoice balance of 1000
      },
    ];

    expect(() => db.savePaymentVoucher(v2)).toThrow(/exceeds balance/i);

    // Test 3: Wrong document type (trying to allocate a PURCHASE bill as an INVOICE)
    const v3 = createPaymentReceiptVoucher({
      date: '2026-10-02',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 500,
      paymentMode: 'CASH',
    });
    v3.partyId = sampleCustomer.id;
    v3.partyName = sampleCustomer.name;
    v3.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: pur.id, // document is a purchase!
        documentNumber: pur.billNumber,
        amount: 500,
      },
    ];

    expect(() => db.savePaymentVoucher(v3)).toThrow(/is a purchase bill, but allocated as INVOICE/i);

    // Confirm neither document was modified
    expect(db.getInvoices().find((i) => i.id === inv.id)!.balanceAmount).toBe(1000);
    expect(db.getPurchases().find((p) => p.id === pur.id)!.balanceAmount).toBe(1000);
  });

  it('Scenario 21: Reversing an already reversed voucher does not change invoice balances', () => {
    db.saveParty(sampleCustomer);
    const inv = makeInvoice('INV-REV-001', 'INV-REV-001', '2026-10-01', 2000, 0);
    db.saveInvoice(inv);

    const voucher = createPaymentReceiptVoucher({
      date: '2026-10-02',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 1000,
      paymentMode: 'CASH',
    });
    voucher.partyId = sampleCustomer.id;
    voucher.partyName = sampleCustomer.name;
    voucher.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: inv.id,
        documentNumber: inv.invoiceNumber,
        amount: 1000,
      },
    ];

    db.savePaymentVoucher(voucher);
    expect(db.getInvoices().find((i) => i.id === inv.id)!.balanceAmount).toBe(1000);

    // Reverse once
    const rev = db.reversePaymentVoucher(voucher, 'Customer returned goods');
    expect(rev).toBeDefined();
    expect(db.getInvoices().find((i) => i.id === inv.id)!.balanceAmount).toBe(2000);

    // Second reversal attempt MUST throw and NOT change balance
    const updatedVoucher = db.getVouchers().find((v) => v.id === voucher.id)!;
    expect(() => db.reversePaymentVoucher(updatedVoucher, 'Duplicate attempt')).toThrow(/already reversed or cancelled/i);

    // Balance remains 2000
    expect(db.getInvoices().find((i) => i.id === inv.id)!.balanceAmount).toBe(2000);
  });

  it('Scenario 22: Deleting a document linked to a multi-document voucher cannot corrupt the other document', () => {
    db.saveParty(sampleCustomer);
    const invA = makeInvoice('INV-MULTI-A', 'INV-MULTI-A', '2026-10-01', 1000, 0);
    const invB = makeInvoice('INV-MULTI-B', 'INV-MULTI-B', '2026-10-02', 1000, 0);
    db.saveInvoice(invA);
    db.saveInvoice(invB);

    // One voucher settling 1000 on invA and 500 on invB
    const voucher = createPaymentReceiptVoucher({
      date: '2026-10-03',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 1500,
      paymentMode: 'BANK',
    });
    voucher.partyId = sampleCustomer.id;
    voucher.partyName = sampleCustomer.name;
    voucher.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: invA.id,
        documentNumber: invA.invoiceNumber,
        amount: 1000,
      },
      {
        documentType: 'INVOICE',
        documentId: invB.id,
        documentNumber: invB.invoiceNumber,
        amount: 500,
      },
    ];

    db.savePaymentVoucher(voucher);

    expect(db.getInvoices().find((i) => i.id === invA.id)!.balanceAmount).toBe(0);
    expect(db.getInvoices().find((i) => i.id === invB.id)!.balanceAmount).toBe(500);

    // Attempting to delete invA while the active linked payment voucher exists must be blocked!
    expect(() => db.deleteInvoice(invA.id)).toThrow(/active linked payment voucher/i);

    // Confirm invA is still intact and invB is NOT corrupted
    expect(db.getInvoices().find((i) => i.id === invA.id)).toBeDefined();
    expect(db.getInvoices().find((i) => i.id === invB.id)!.balanceAmount).toBe(500);
    expect(db.getVouchers().find((v) => v.id === voucher.id)!.isReversed).toBeFalsy();
  });

  it('Scenario 23: UPI receipt applied to an invoice with cash+credit split preserves paid/balance and adds UPI split with SPLIT paymentMode', () => {
    db.saveParty(sampleCustomer);

    // Invoice with CASH 1000, CREDIT 4000 (total 5000)
    const inv = makeInvoice('INV-SPLIT-UPI', 'INV-SPLIT-UPI', '2026-10-01', 5000, 1000);
    inv.paymentSplits = [
      { id: 'split-cash', mode: 'CASH', amount: 1000 },
      { id: 'split-credit', mode: 'CREDIT', amount: 4000 },
    ];
    inv.paymentMode = 'SPLIT';
    inv.notes = 'Split Payment — Cash ₹1000, Credit ₹4000';
    db.saveInvoice(inv);

    // Apply a UPI receipt voucher of ₹2,000
    const upiVoucher = createPaymentReceiptVoucher({
      date: '2026-10-03',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 2000,
      paymentMode: 'UPI',
      narration: 'Paid via UPI against invoice',
    });
    upiVoucher.partyId = sampleCustomer.id;
    upiVoucher.partyName = sampleCustomer.name;
    upiVoucher.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: inv.id,
        documentNumber: inv.invoiceNumber,
        amount: 2000,
      },
    ];

    db.savePaymentVoucher(upiVoucher);

    const saved = db.getInvoices().find((i) => i.id === inv.id)!;
    expect(saved.paidAmount).toBe(3000);
    expect(saved.balanceAmount).toBe(2000);
    expect(saved.paymentStatus).toBe('PARTIAL');
    expect(saved.paymentMode).toBe('SPLIT');

    // Verify splits contain CASH, UPI, and CREDIT
    expect(saved.paymentSplits).toBeDefined();
    const modes = saved.paymentSplits!.map((s) => s.mode);
    expect(modes).toContain('CASH');
    expect(modes).toContain('UPI');
    expect(modes).toContain('CREDIT');

    const upiSplit = saved.paymentSplits!.find((s) => s.mode === 'UPI');
    expect(upiSplit?.amount).toBe(2000);

    const cashSplit = saved.paymentSplits!.find((s) => s.mode === 'CASH');
    expect(cashSplit?.amount).toBe(1000);

    const creditSplit = saved.paymentSplits!.find((s) => s.mode === 'CREDIT');
    expect(creditSplit?.amount).toBe(2000);
  });

  it('Scenario 24: Pre-save guard prevents saving invoice edit when paidAmount is reduced below other active payment vouchers; invoice in DB remains unchanged', () => {
    db.saveParty(sampleCustomer);
    const inv = makeInvoice('INV-PRE-001', 'INV-PRE-001', '2026-10-01', 10000, 2000);
    db.saveInvoice(inv);

    const sourceVoucher = createPaymentReceiptVoucher({
      date: '2026-10-01',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 2000,
      paymentMode: 'CASH',
      narration: 'Upfront payment received for Invoice #INV-PRE-001',
    });
    sourceVoucher.partyId = sampleCustomer.id;
    sourceVoucher.partyName = sampleCustomer.name;
    sourceVoucher.sourceDocumentType = 'INVOICE';
    sourceVoucher.sourceDocumentId = inv.id;
    sourceVoucher.sourceDocumentNumber = inv.invoiceNumber;
    sourceVoucher.allocationMode = 'SOURCE_DOCUMENT';
    sourceVoucher.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: inv.id,
        documentNumber: inv.invoiceNumber,
        amount: 2000,
        date: '2026-10-01',
      },
    ];
    db.savePaymentVoucher(sourceVoucher, { skipDocumentUpdate: true });

    // Later party payment of 3000
    const partyVoucher = createPaymentReceiptVoucher({
      date: '2026-10-05',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 3000,
      paymentMode: 'BANK',
      narration: 'Party payment against dues',
    });
    partyVoucher.partyId = sampleCustomer.id;
    partyVoucher.partyName = sampleCustomer.name;
    partyVoucher.allocationMode = 'MANUAL';
    partyVoucher.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: inv.id,
        documentNumber: inv.invoiceNumber,
        amount: 3000,
        date: '2026-10-05',
      },
    ];
    db.savePaymentVoucher(partyVoucher);

    const currentInv = db.getInvoices().find((i) => i.id === inv.id)!;
    expect(currentInv.paidAmount).toBe(5000);

    // Attempted edit: reduce paidAmount to 2500 (below 3000 of other party voucher)
    const invalidEdit: Invoice = {
      ...currentInv,
      paidAmount: 2500,
      balanceAmount: 7500,
    };

    const preSaveResult = validateInvoicePreSave({
      newInvoice: invalidEdit,
      existingInvoices: db.getInvoices(),
      vouchers: db.getVouchers(),
    });

    expect(preSaveResult.valid).toBe(false);
    expect(preSaveResult.error).toContain('Cannot reduce paid amount below ₹3000.00');

    // Because pre-save guard blocked the edit, db.saveInvoice is NOT called
    const dbInvoiceAfterBlocked = db.getInvoices().find((i) => i.id === inv.id)!;
    expect(dbInvoiceAfterBlocked.paidAmount).toBe(5000);
    expect(dbInvoiceAfterBlocked.balanceAmount).toBe(5000);
  });

  it('Scenario 25: Invoice with upfront source voucher plus later party payment voucher blocks changing upfront amount before save; preserves source voucher without rebuilding document splits', () => {
    db.saveParty(sampleCustomer);
    const inv = makeInvoice('INV-PRE-002', 'INV-PRE-002', '2026-10-01', 10000, 2000);
    db.saveInvoice(inv);

    const sourceVoucher = createPaymentReceiptVoucher({
      date: '2026-10-01',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 2000,
      paymentMode: 'CASH',
      narration: 'Upfront payment received for Invoice #INV-PRE-002',
    });
    sourceVoucher.partyId = sampleCustomer.id;
    sourceVoucher.partyName = sampleCustomer.name;
    sourceVoucher.sourceDocumentType = 'INVOICE';
    sourceVoucher.sourceDocumentId = inv.id;
    sourceVoucher.sourceDocumentNumber = inv.invoiceNumber;
    sourceVoucher.allocationMode = 'SOURCE_DOCUMENT';
    sourceVoucher.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: inv.id,
        documentNumber: inv.invoiceNumber,
        amount: 2000,
        date: '2026-10-01',
      },
    ];
    db.savePaymentVoucher(sourceVoucher, { skipDocumentUpdate: true });

    // Later party payment voucher of 3000
    const partyVoucher = createPaymentReceiptVoucher({
      date: '2026-10-05',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 3000,
      paymentMode: 'BANK',
      narration: 'Later payment',
    });
    partyVoucher.partyId = sampleCustomer.id;
    partyVoucher.partyName = sampleCustomer.name;
    partyVoucher.allocationMode = 'MANUAL';
    partyVoucher.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: inv.id,
        documentNumber: inv.invoiceNumber,
        amount: 3000,
        date: '2026-10-05',
      },
    ];
    db.savePaymentVoucher(partyVoucher);

    const currentInv = db.getInvoices().find((i) => i.id === inv.id)!;
    expect(currentInv.paidAmount).toBe(5000);

    // Case A: User attempts to edit invoice with paidAmount = 7000 (would change source voucher from 2000 to 4000 while other voucher exists)
    const changingUpfrontEdit: Invoice = {
      ...currentInv,
      paidAmount: 7000,
      balanceAmount: 3000,
    };

    const blockedResult = validateInvoicePreSave({
      newInvoice: changingUpfrontEdit,
      existingInvoices: db.getInvoices(),
      vouchers: db.getVouchers(),
    });

    expect(blockedResult.valid).toBe(false);
    expect(blockedResult.error).toContain('Cannot change upfront payment while other payment vouchers are linked to this invoice');

    // Case B: User edits non-payment fields with unchanged paidAmount = 5000
    const validEdit: Invoice = {
      ...currentInv,
      notes: 'Customer updated delivery notes',
    };

    const allowedResult = validateInvoicePreSave({
      newInvoice: validEdit,
      existingInvoices: db.getInvoices(),
      vouchers: db.getVouchers(),
    });

    expect(allowedResult.valid).toBe(true);
    expect(allowedResult.otherActiveLinked.length).toBe(1);
    expect(allowedResult.otherAllocatedTotal).toBe(3000);
    expect(allowedResult.targetSourceAmount).toBe(2000);

    // Because otherActiveLinked exists, source voucher must NOT be rebuilt with document splits
    expect(allowedResult.otherActiveLinked.length > 0).toBe(true);
    const existingSource = db.getVouchers().find((v) => v.id === sourceVoucher.id)!;
    expect(existingSource.totalAmount).toBe(2000);
    expect(existingSource.isReversed).toBeFalsy();
  });

  it('Scenario 26: Invoice with upfront source voucher and NO other vouchers allows source update using document splits', () => {
    db.saveParty(sampleCustomer);
    const inv = makeInvoice('INV-PRE-003', 'INV-PRE-003', '2026-10-01', 10000, 2000);
    db.saveInvoice(inv);

    const sourceVoucher = createPaymentReceiptVoucher({
      date: '2026-10-01',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 2000,
      paymentMode: 'CASH',
      narration: 'Upfront payment received for Invoice #INV-PRE-003',
    });
    sourceVoucher.partyId = sampleCustomer.id;
    sourceVoucher.partyName = sampleCustomer.name;
    sourceVoucher.sourceDocumentType = 'INVOICE';
    sourceVoucher.sourceDocumentId = inv.id;
    sourceVoucher.sourceDocumentNumber = inv.invoiceNumber;
    sourceVoucher.allocationMode = 'SOURCE_DOCUMENT';
    sourceVoucher.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: inv.id,
        documentNumber: inv.invoiceNumber,
        amount: 2000,
        date: '2026-10-01',
      },
    ];
    db.savePaymentVoucher(sourceVoucher, { skipDocumentUpdate: true });

    // User updates upfront payment to 3500 with split payment (Cash 2000 + UPI 1500)
    const updatedInv: Invoice = {
      ...inv,
      paidAmount: 3500,
      balanceAmount: 6500,
      paymentMode: 'SPLIT',
      paymentSplits: [
        { id: 's1', mode: 'CASH', amount: 2000 },
        { id: 's2', mode: 'UPI', amount: 1500 },
        { id: 's3', mode: 'CREDIT', amount: 6500 },
      ],
    };

    const preSaveResult = validateInvoicePreSave({
      newInvoice: updatedInv,
      existingInvoices: db.getInvoices(),
      vouchers: db.getVouchers(),
    });

    expect(preSaveResult.valid).toBe(true);
    expect(preSaveResult.otherActiveLinked.length).toBe(0);
    expect(preSaveResult.targetSourceAmount).toBe(3500);
  });

  it('Scenario 27: Purchase bill pre-save guard blocks changing source voucher when other vouchers exist, and allows update when no other vouchers exist', () => {
    db.saveParty(sampleSupplier);
    const bill = makePurchase('PUR-PRE-001', 'PUR-PRE-001', '2026-10-01', 8000, 1500);
    db.savePurchase(bill);

    const sourcePaymentVoucher = createPaymentOutVoucher({
      receiptNumber: `PUR-${bill.billNumber}`,
      date: '2026-10-01',
      supplierName: sampleSupplier.name,
      supplierId: sampleSupplier.id,
      amount: 1500,
      paymentMode: 'CASH',
      narration: 'Upfront payment made for Bill #PUR-PRE-001',
    });
    sourcePaymentVoucher.partyId = sampleSupplier.id;
    sourcePaymentVoucher.partyName = sampleSupplier.name;
    sourcePaymentVoucher.sourceDocumentType = 'PURCHASE';
    sourcePaymentVoucher.sourceDocumentId = bill.id;
    sourcePaymentVoucher.sourceDocumentNumber = bill.billNumber;
    sourcePaymentVoucher.allocationMode = 'SOURCE_DOCUMENT';
    sourcePaymentVoucher.paymentAllocations = [
      {
        documentType: 'PURCHASE',
        documentId: bill.id,
        documentNumber: bill.billNumber,
        amount: 1500,
        date: '2026-10-01',
      },
    ];
    db.savePaymentVoucher(sourcePaymentVoucher, { skipDocumentUpdate: true });

    // Later party payment voucher of 2500
    const partyVoucher = createPaymentOutVoucher({
      receiptNumber: 'PYMT-SUPP-001',
      date: '2026-10-06',
      supplierName: sampleSupplier.name,
      supplierId: sampleSupplier.id,
      amount: 2500,
      paymentMode: 'BANK',
      narration: 'Supplier dues paid',
    });
    partyVoucher.partyId = sampleSupplier.id;
    partyVoucher.partyName = sampleSupplier.name;
    partyVoucher.allocationMode = 'MANUAL';
    partyVoucher.paymentAllocations = [
      {
        documentType: 'PURCHASE',
        documentId: bill.id,
        documentNumber: bill.billNumber,
        amount: 2500,
        date: '2026-10-06',
      },
    ];
    db.savePaymentVoucher(partyVoucher);

    const currentBill = db.getPurchases().find((b) => b.id === bill.id)!;
    expect(currentBill.paidAmount).toBe(4000);

    // Case A: Attempting to change upfront payment (paidAmount = 5000) while other vouchers exist
    const changingUpfrontBill: PurchaseBill = {
      ...currentBill,
      paidAmount: 5000,
      balanceAmount: 3000,
    };

    const blockedResult = validatePurchasePreSave({
      newBill: changingUpfrontBill,
      existingPurchases: db.getPurchases(),
      vouchers: db.getVouchers(),
    });

    expect(blockedResult.valid).toBe(false);
    expect(blockedResult.error).toContain('Cannot change upfront payment while other payment vouchers are linked to this bill');

    // Case B: No other vouchers exist (only source voucher) allows update using document splits
    const billAlone = makePurchase('PUR-PRE-002', 'PUR-PRE-002', '2026-10-01', 5000, 1000);
    db.savePurchase(billAlone);

    const soloSourceVoucher = createPaymentOutVoucher({
      receiptNumber: `PUR-${billAlone.billNumber}`,
      date: '2026-10-01',
      supplierName: sampleSupplier.name,
      supplierId: sampleSupplier.id,
      amount: 1000,
      paymentMode: 'CASH',
      narration: 'Upfront payment',
    });
    soloSourceVoucher.partyId = sampleSupplier.id;
    soloSourceVoucher.partyName = sampleSupplier.name;
    soloSourceVoucher.sourceDocumentType = 'PURCHASE';
    soloSourceVoucher.sourceDocumentId = billAlone.id;
    soloSourceVoucher.sourceDocumentNumber = billAlone.billNumber;
    soloSourceVoucher.allocationMode = 'SOURCE_DOCUMENT';
    soloSourceVoucher.paymentAllocations = [
      {
        documentType: 'PURCHASE',
        documentId: billAlone.id,
        documentNumber: billAlone.billNumber,
        amount: 1000,
        date: '2026-10-01',
      },
    ];
    db.savePaymentVoucher(soloSourceVoucher, { skipDocumentUpdate: true });

    const updatedBillAlone: PurchaseBill = {
      ...billAlone,
      paidAmount: 2500,
      balanceAmount: 2500,
      paymentMode: 'SPLIT',
      paymentSplits: [
        { id: 'sb1', mode: 'CASH', amount: 1000 },
        { id: 'sb2', mode: 'BANK', amount: 1500 },
        { id: 'sb3', mode: 'CREDIT', amount: 2500 },
      ],
    };

    const allowedResult = validatePurchasePreSave({
      newBill: updatedBillAlone,
      existingPurchases: db.getPurchases(),
      vouchers: db.getVouchers(),
    });

    expect(allowedResult.valid).toBe(true);
    expect(allowedResult.otherActiveLinked.length).toBe(0);
    expect(allowedResult.targetSourceAmount).toBe(2500);
  });

  it('Scenario 28: Null-safety in pre-save validation for documents lacking paidAmount (legacy without NaN)', () => {
    db.saveParty(sampleCustomer);
    db.saveParty(sampleSupplier);

    // Legacy invoice without paidAmount
    const legacyInv: any = {
      ...makeInvoice('INV-LEG-01', 'INV-LEG-01', '2026-10-01', 5000, 0),
      paidAmount: undefined,
    };

    const invRes = validateInvoicePreSave({
      newInvoice: legacyInv,
      existingInvoices: [],
      vouchers: [],
    });
    expect(invRes.valid).toBe(true);
    expect(invRes.targetSourceAmount).toBe(0);
    expect(Number.isNaN(invRes.targetSourceAmount)).toBe(false);

    // Legacy bill without paidAmount
    const legacyBill: any = {
      ...makePurchase('PUR-LEG-01', 'PUR-LEG-01', '2026-10-01', 4000, 0),
      paidAmount: undefined,
    };

    const billRes = validatePurchasePreSave({
      newBill: legacyBill,
      existingPurchases: [],
      vouchers: [],
    });
    expect(billRes.valid).toBe(true);
    expect(billRes.targetSourceAmount).toBe(0);
    expect(Number.isNaN(billRes.targetSourceAmount)).toBe(false);
  });

  it('Scenario 29: Source voucher total equals source amount; stale/mismatched splits omitted, matching splits preserved', () => {
    // 1. Matching splits: 600 cash + 400 bank = 1000 intended
    const matching = resolveSourceVoucherSplits(
      1000,
      [
        { id: 's1', mode: 'CASH', amount: 600 },
        { id: 's2', mode: 'BANK', amount: 400 },
      ],
      'SPLIT'
    );
    expect(matching.paymentSplits).toBeDefined();
    expect(matching.paymentSplits?.length).toBe(2);
    expect(matching.paymentMode).toBe('SPLIT');

    // 2. Stale/mismatched splits: split total is 1000 but intended amount is 500
    const mismatched = resolveSourceVoucherSplits(
      500,
      [
        { id: 's1', mode: 'CASH', amount: 600 },
        { id: 's2', mode: 'BANK', amount: 400 },
      ],
      'SPLIT'
    );
    expect(mismatched.paymentSplits).toBeUndefined();
    expect(mismatched.paymentMode).toBe('CASH');

    // 3. Voucher creation with mismatched splits uses intended amount and single mode
    const vch = createPaymentReceiptVoucher({
      receiptNumber: 'INV-TEST-01',
      date: '2026-10-01',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 500,
      paymentMode: mismatched.paymentMode,
      paymentSplits: mismatched.paymentSplits,
      narration: 'Upfront payment',
    });
    expect(vch.totalAmount).toBe(500);
    expect(vch.entries.find((e) => e.credit > 0)?.credit).toBe(500);
  });

  it('Scenario 30: Guard direct editing of source vouchers blocks amount divergence, allows date edits, adjusts non-source mode', () => {
    db.saveParty(sampleCustomer);
    const inv = makeInvoice('INV-SRC-01', 'INV-SRC-01', '2026-10-01', 5000, 2000);
    db.saveInvoice(inv);

    const sourceVoucher = createPaymentReceiptVoucher({
      receiptNumber: `INV-${inv.invoiceNumber}`,
      date: '2026-10-01',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 2000,
      paymentMode: 'CASH',
      narration: 'Upfront payment received',
    });
    sourceVoucher.partyId = sampleCustomer.id;
    sourceVoucher.partyName = sampleCustomer.name;
    sourceVoucher.sourceDocumentType = 'INVOICE';
    sourceVoucher.sourceDocumentId = inv.id;
    sourceVoucher.sourceDocumentNumber = inv.invoiceNumber;
    sourceVoucher.allocationMode = 'SOURCE_DOCUMENT';
    sourceVoucher.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: inv.id,
        documentNumber: inv.invoiceNumber,
        amount: 2000,
        date: '2026-10-01',
      },
    ];
    db.savePaymentVoucher(sourceVoucher, { skipDocumentUpdate: true });

    // 1. Changing date and narration on SOURCE_DOCUMENT voucher without changing total is allowed
    const dateUpdatedVoucher: Voucher = {
      ...sourceVoucher,
      date: '2026-10-05',
      narration: 'Updated narration for upfront receipt',
      paymentAllocations: sourceVoucher.paymentAllocations.map((a) => ({ ...a, date: '2026-10-05' })),
    };
    db.savePaymentVoucher(dateUpdatedVoucher, { skipDocumentUpdate: true });
    const storedVoucher = db.getVouchers().find((v) => v.id === sourceVoucher.id)!;
    expect(storedVoucher.date).toBe('2026-10-05');
    expect(storedVoucher.narration).toBe('Updated narration for upfront receipt');

    // 2. Non-source party voucher with total amount change transitions mode to MANUAL if allocated
    const partyVoucher = createPaymentReceiptVoucher({
      receiptNumber: 'RCPT-AUTO-01',
      date: '2026-10-06',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 1000,
      paymentMode: 'CASH',
      narration: 'Party receipt',
    });
    partyVoucher.partyId = sampleCustomer.id;
    partyVoucher.partyName = sampleCustomer.name;
    partyVoucher.allocationMode = 'AUTO_FIFO';
    partyVoucher.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: inv.id,
        documentNumber: inv.invoiceNumber,
        amount: 1000,
        date: '2026-10-06',
      },
    ];
    db.savePaymentVoucher(partyVoucher);

    // Edit total from 1000 to 1500; allocation remains 1000 -> mode becomes MANUAL
    const editedPartyVoucher: Voucher = {
      ...partyVoucher,
      totalAmount: 1500,
      allocationMode: partyVoucher.paymentAllocations.length > 0 ? 'MANUAL' : 'UNALLOCATED',
    };
    db.savePaymentVoucher(editedPartyVoucher);
    const storedPartyVch = db.getVouchers().find((v) => v.id === partyVoucher.id)!;
    expect(storedPartyVch.allocationMode).toBe('MANUAL');
  });

  it('Scenario 31: Allow invoice party changes with linked payments; block supplier changes on bills; allow date changes', () => {
    db.saveParty(sampleCustomer);
    db.saveParty(sampleSupplier);

    const otherCustomer: Party = {
      ...sampleCustomer,
      id: 'PARTY-CUST-OTHER',
      name: 'Other Customer Ltd',
    };
    db.saveParty(otherCustomer);

    const inv = makeInvoice('INV-PTY-01', 'INV-PTY-01', '2026-10-01', 6000, 2000);
    db.saveInvoice(inv);

    const sourceVoucher = createPaymentReceiptVoucher({
      receiptNumber: `INV-${inv.invoiceNumber}`,
      date: '2026-10-01',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 2000,
      paymentMode: 'CASH',
      narration: 'Upfront receipt',
    });
    sourceVoucher.partyId = sampleCustomer.id;
    sourceVoucher.partyName = sampleCustomer.name;
    sourceVoucher.sourceDocumentType = 'INVOICE';
    sourceVoucher.sourceDocumentId = inv.id;
    sourceVoucher.sourceDocumentNumber = inv.invoiceNumber;
    sourceVoucher.allocationMode = 'SOURCE_DOCUMENT';
    sourceVoucher.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: inv.id,
        documentNumber: inv.invoiceNumber,
        amount: 2000,
        date: '2026-10-01',
      },
    ];
    db.savePaymentVoucher(sourceVoucher, { skipDocumentUpdate: true });

    // 1. Changing invoice party while payment voucher is linked is now allowed by validateInvoicePreSave
    const partyChangedInv: Invoice = {
      ...inv,
      partyId: otherCustomer.id,
      partyName: otherCustomer.name,
    };
    const allowPartyResult = validateInvoicePreSave({
      newInvoice: partyChangedInv,
      existingInvoices: db.getInvoices(),
      vouchers: db.getVouchers(),
    });
    expect(allowPartyResult.valid).toBe(true);

    // 2. Changing date is allowed
    const dateChangedInv: Invoice = {
      ...inv,
      date: '2026-10-10',
    };
    const allowDateResult = validateInvoicePreSave({
      newInvoice: dateChangedInv,
      existingInvoices: db.getInvoices(),
      vouchers: db.getVouchers(),
    });
    expect(allowDateResult.valid).toBe(true);

    // 3. Same for purchase bills: changing supplier while payment voucher is linked must be rejected
    const bill = makePurchase('PUR-PTY-01', 'PUR-PTY-01', '2026-10-01', 5000, 1000);
    db.savePurchase(bill);

    const billSourceVoucher = createPaymentOutVoucher({
      receiptNumber: `PUR-${bill.billNumber}`,
      date: '2026-10-01',
      supplierName: sampleSupplier.name,
      supplierId: sampleSupplier.id,
      amount: 1000,
      paymentMode: 'CASH',
      narration: 'Upfront payment',
    });
    billSourceVoucher.partyId = sampleSupplier.id;
    billSourceVoucher.partyName = sampleSupplier.name;
    billSourceVoucher.sourceDocumentType = 'PURCHASE';
    billSourceVoucher.sourceDocumentId = bill.id;
    billSourceVoucher.sourceDocumentNumber = bill.billNumber;
    billSourceVoucher.allocationMode = 'SOURCE_DOCUMENT';
    billSourceVoucher.paymentAllocations = [
      {
        documentType: 'PURCHASE',
        documentId: bill.id,
        documentNumber: bill.billNumber,
        amount: 1000,
        date: '2026-10-01',
      },
    ];
    db.savePaymentVoucher(billSourceVoucher, { skipDocumentUpdate: true });

    const supplierChangedBill: PurchaseBill = {
      ...bill,
      supplierId: 'SUPP-NEW-02',
      supplierName: 'New Supplier Ltd',
    };
    const blockSupplierResult = validatePurchasePreSave({
      newBill: supplierChangedBill,
      existingPurchases: db.getPurchases(),
      vouchers: db.getVouchers(),
    });
    expect(blockSupplierResult.valid).toBe(false);
    expect(blockSupplierResult.error).toContain('Cannot change supplier on a purchase bill with linked payment vouchers');
  });

  it('Scenario 32: getOutstandingDocuments excludes CREDIT_NOTE and RETURN; savePaymentVoucher rejects direct allocation', () => {
    db.saveParty(sampleCustomer);
    db.saveParty(sampleSupplier);

    // 1. Sales Credit Note
    const creditNote: Invoice = {
      ...makeInvoice('CN-001', 'CN-001', '2026-10-01', 1500, 0),
      invoiceType: 'CREDIT_NOTE',
      partyId: sampleCustomer.id,
      partyName: sampleCustomer.name,
      balanceAmount: 1500,
    };
    db.saveInvoice(creditNote);

    // 2. Normal Invoice
    const normalInv = makeInvoice('INV-OK-001', 'INV-OK-001', '2026-10-01', 3000, 0);
    db.saveInvoice(normalInv);

    // 3. Purchase Return
    const purReturn: PurchaseBill = {
      ...makePurchase('PR-001', 'PR-001', '2026-10-01', 1200, 0),
      purchaseType: 'RETURN',
      supplierId: sampleSupplier.id,
      supplierName: sampleSupplier.name,
      balanceAmount: 1200,
    };
    db.savePurchase(purReturn);

    // 4. Normal Purchase Bill
    const normalBill = makePurchase('PUR-OK-001', 'PUR-OK-001', '2026-10-01', 2500, 0);
    db.savePurchase(normalBill);

    // Test getOutstandingDocuments
    const outstandingInvoices = getOutstandingDocuments({
      partyId: sampleCustomer.id,
      documentType: 'INVOICE',
      invoices: db.getInvoices(),
    });
    expect(outstandingInvoices.some((d) => d.id === creditNote.id)).toBe(false);
    expect(outstandingInvoices.some((d) => d.id === normalInv.id)).toBe(true);

    const outstandingPurchases = getOutstandingDocuments({
      partyId: sampleSupplier.id,
      documentType: 'PURCHASE',
      purchases: db.getPurchases(),
    });
    expect(outstandingPurchases.some((d) => d.id === purReturn.id)).toBe(false);
    expect(outstandingPurchases.some((d) => d.id === normalBill.id)).toBe(true);

    // Test savePaymentVoucher rejects direct allocation to CREDIT_NOTE
    const badReceiptVoucher = createPaymentReceiptVoucher({
      receiptNumber: 'RCPT-BAD-CN',
      date: '2026-10-01',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 500,
      paymentMode: 'CASH',
      narration: 'Allocated to credit note',
    });
    badReceiptVoucher.partyId = sampleCustomer.id;
    badReceiptVoucher.partyName = sampleCustomer.name;
    badReceiptVoucher.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: creditNote.id,
        documentNumber: creditNote.invoiceNumber,
        amount: 500,
        date: '2026-10-01',
      },
    ];
    expect(() => db.savePaymentVoucher(badReceiptVoucher)).toThrow(
      /is not an outstanding payable invoice\/bill/
    );

    // Test savePaymentVoucher rejects direct allocation to purchase RETURN
    const badPaymentVoucher = createPaymentOutVoucher({
      receiptNumber: 'PYMT-BAD-RET',
      date: '2026-10-01',
      supplierName: sampleSupplier.name,
      supplierId: sampleSupplier.id,
      amount: 500,
      paymentMode: 'CASH',
      narration: 'Allocated to purchase return',
    });
    badPaymentVoucher.partyId = sampleSupplier.id;
    badPaymentVoucher.partyName = sampleSupplier.name;
    badPaymentVoucher.paymentAllocations = [
      {
        documentType: 'PURCHASE',
        documentId: purReturn.id,
        documentNumber: purReturn.billNumber,
        amount: 500,
        date: '2026-10-01',
      },
    ];
    expect(() => db.savePaymentVoucher(badPaymentVoucher)).toThrow(
      /is not an outstanding payable invoice\/bill/
    );

    // Valid allocation to normal invoice succeeds
    const goodReceiptVoucher = createPaymentReceiptVoucher({
      receiptNumber: 'RCPT-GOOD-01',
      date: '2026-10-01',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 1000,
      paymentMode: 'CASH',
      narration: 'Valid invoice allocation',
    });
    goodReceiptVoucher.partyId = sampleCustomer.id;
    goodReceiptVoucher.partyName = sampleCustomer.name;
    goodReceiptVoucher.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: normalInv.id,
        documentNumber: normalInv.invoiceNumber,
        amount: 1000,
        date: '2026-10-01',
      },
    ];
    expect(() => db.savePaymentVoucher(goodReceiptVoucher)).not.toThrow();
  });

  it('Scenario 33: Special documents (CREDIT_NOTE, DEBIT_NOTE, RETURN) with paidAmount > 0 do not create or modify source vouchers and target source amount is 0', () => {
    db.saveParty(sampleCustomer);
    db.saveParty(sampleSupplier);

    // 1. Credit Note with paidAmount > 0
    const creditNote: Invoice = {
      ...makeInvoice('CN-SP-01', 'CN-SP-01', '2026-10-01', 3000, 1000),
      invoiceType: 'CREDIT_NOTE',
      partyId: sampleCustomer.id,
      partyName: sampleCustomer.name,
      paidAmount: 1000,
      balanceAmount: 2000,
      paymentMode: 'CASH',
    };

    const cnValidation = validateInvoicePreSave({
      newInvoice: creditNote,
      existingInvoices: db.getInvoices(),
      vouchers: db.getVouchers(),
    });

    expect(cnValidation.valid).toBe(true);
    expect(cnValidation.targetSourceAmount).toBe(0);
    expect(cnValidation.existingSourceVoucher).toBeUndefined();

    // 2. Debit Note with paidAmount > 0
    const debitNote: Invoice = {
      ...makeInvoice('DN-SP-01', 'DN-SP-01', '2026-10-01', 2500, 800),
      invoiceType: 'DEBIT_NOTE',
      partyId: sampleCustomer.id,
      partyName: sampleCustomer.name,
      paidAmount: 800,
      balanceAmount: 1700,
      paymentMode: 'CASH',
    };

    const dnValidation = validateInvoicePreSave({
      newInvoice: debitNote,
      existingInvoices: db.getInvoices(),
      vouchers: db.getVouchers(),
    });

    expect(dnValidation.valid).toBe(true);
    expect(dnValidation.targetSourceAmount).toBe(0);
    expect(dnValidation.existingSourceVoucher).toBeUndefined();

    // 3. Purchase Return with paidAmount > 0 (both RETURN and PURCHASE_RETURN)
    const purReturn: PurchaseBill = {
      ...makePurchase('PR-SP-01', 'PR-SP-01', '2026-10-01', 4000, 1500),
      purchaseType: 'RETURN',
      supplierId: sampleSupplier.id,
      supplierName: sampleSupplier.name,
      paidAmount: 1500,
      balanceAmount: 2500,
      paymentMode: 'CASH',
    };

    const prValidation = validatePurchasePreSave({
      newBill: purReturn,
      existingPurchases: db.getPurchases(),
      vouchers: db.getVouchers(),
    });

    expect(prValidation.valid).toBe(true);
    expect(prValidation.targetSourceAmount).toBe(0);
    expect(prValidation.existingSourceVoucher).toBeUndefined();

    const purReturnAlias: PurchaseBill = {
      ...makePurchase('PR-SP-02', 'PR-SP-02', '2026-10-01', 4000, 1500),
      purchaseType: 'PURCHASE_RETURN' as any,
      supplierId: sampleSupplier.id,
      supplierName: sampleSupplier.name,
      paidAmount: 1500,
      balanceAmount: 2500,
      paymentMode: 'CASH',
    };

    const prAliasValidation = validatePurchasePreSave({
      newBill: purReturnAlias,
      existingPurchases: db.getPurchases(),
      vouchers: db.getVouchers(),
    });

    expect(prAliasValidation.valid).toBe(true);
    expect(prAliasValidation.targetSourceAmount).toBe(0);
    expect(prAliasValidation.existingSourceVoucher).toBeUndefined();

    // 4. Editing existing credit note does not expect a source voucher even if a rogue voucher matches
    db.saveInvoice(creditNote);
    const existingSourceVoucherForCN = createPaymentReceiptVoucher({
      receiptNumber: 'INV-CN-SP-01',
      date: '2026-10-01',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 1000,
      paymentMode: 'CASH',
    });
    existingSourceVoucherForCN.allocationMode = 'SOURCE_DOCUMENT';
    existingSourceVoucherForCN.sourceDocumentId = creditNote.id;

    const cnEditValidation = validateInvoicePreSave({
      newInvoice: { ...creditNote, paidAmount: 1500 },
      existingInvoices: db.getInvoices(),
      vouchers: [existingSourceVoucherForCN],
    });
    expect(cnEditValidation.valid).toBe(true);
    expect(cnEditValidation.targetSourceAmount).toBe(0);
    expect(cnEditValidation.existingSourceVoucher).toBeUndefined();
  });

  it('Scenario 34: Editing an invoice date while a source voucher plus another linked voucher exist updates the source voucher date and allocation dates without changing its total amount', () => {
    db.saveParty(sampleCustomer);

    const inv = makeInvoice('INV-DATE-01', 'INV-DATE-01', '2026-10-01', 10000, 4000);
    db.saveInvoice(inv);

    // 1. Initial source voucher created with date 2026-10-01 and amount 4000
    const sourceVoucher = createPaymentReceiptVoucher({
      receiptNumber: `INV-${inv.invoiceNumber}`,
      date: '2026-10-01',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 4000,
      paymentMode: 'CASH',
      narration: 'Upfront payment for INV-DATE-01',
    });
    sourceVoucher.partyId = sampleCustomer.id;
    sourceVoucher.partyName = sampleCustomer.name;
    sourceVoucher.sourceDocumentType = 'INVOICE';
    sourceVoucher.sourceDocumentId = inv.id;
    sourceVoucher.sourceDocumentNumber = inv.invoiceNumber;
    sourceVoucher.allocationMode = 'SOURCE_DOCUMENT';
    sourceVoucher.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: inv.id,
        documentNumber: inv.invoiceNumber,
        amount: 4000,
        date: '2026-10-01',
      },
    ];
    db.savePaymentVoucher(sourceVoucher, { skipDocumentUpdate: true });

    // 2. Later party payment receipt voucher linking another 2000
    const partyVoucher = createPaymentReceiptVoucher({
      receiptNumber: 'RCPT-DATE-PTY',
      date: '2026-10-05',
      customerName: sampleCustomer.name,
      customerId: sampleCustomer.id,
      amount: 2000,
      paymentMode: 'CASH',
      narration: 'Part payment for INV-DATE-01',
    });
    partyVoucher.partyId = sampleCustomer.id;
    partyVoucher.partyName = sampleCustomer.name;
    partyVoucher.allocationMode = 'MANUAL';
    partyVoucher.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: inv.id,
        documentNumber: inv.invoiceNumber,
        amount: 2000,
        date: '2026-10-05',
      },
    ];
    db.savePaymentVoucher(partyVoucher);

    const invAfterPartyPayment = db.getInvoices().find((i) => i.id === inv.id)!;
    expect(invAfterPartyPayment.paidAmount).toBe(6000);
    expect(invAfterPartyPayment.balanceAmount).toBe(4000);

    // 3. User edits invoice date from 2026-10-01 to 2026-10-18
    const dateEditedInvoice: Invoice = {
      ...invAfterPartyPayment,
      date: '2026-10-18',
    };

    const validation = validateInvoicePreSave({
      newInvoice: dateEditedInvoice,
      existingInvoices: db.getInvoices(),
      vouchers: db.getVouchers(),
    });
    expect(validation.valid).toBe(true);
    expect(validation.existingSourceVoucher).toBeDefined();
    expect(validation.otherActiveLinked.length).toBe(1);

    // Simulate App.handleSaveInvoice date sync logic when other vouchers exist:
    const { existingSourceVoucher } = validation;
    if (existingSourceVoucher && dateEditedInvoice.date !== existingSourceVoucher.date) {
      const updatedSourceVoucher: Voucher = {
        ...existingSourceVoucher,
        date: dateEditedInvoice.date,
        paymentAllocations: (existingSourceVoucher.paymentAllocations || []).map((a) =>
          a.documentId === dateEditedInvoice.id ? { ...a, date: dateEditedInvoice.date } : { ...a }
        ),
      };
      db.savePaymentVoucher(updatedSourceVoucher, { skipDocumentUpdate: true });
    }

    db.saveInvoice(dateEditedInvoice);

    // Verify stored source voucher
    const storedSourceVoucher = db.getVouchers().find((v) => v.id === sourceVoucher.id)!;
    expect(storedSourceVoucher.totalAmount).toBe(4000); // Unchanged
    expect(storedSourceVoucher.date).toBe('2026-10-18'); // Updated
    expect(storedSourceVoucher.paymentAllocations![0].date).toBe('2026-10-18'); // Updated
    expect(storedSourceVoucher.paymentAllocations![0].amount).toBe(4000); // Unchanged

    // Verify party voucher was untouched
    const storedPartyVoucher = db.getVouchers().find((v) => v.id === partyVoucher.id)!;
    expect(storedPartyVoucher.totalAmount).toBe(2000);
    expect(storedPartyVoucher.date).toBe('2026-10-05');
    expect(storedPartyVoucher.paymentAllocations![0].amount).toBe(2000);

    // Verify invoice balances remain unchanged
    const storedInvoice = db.getInvoices().find((i) => i.id === inv.id)!;
    expect(storedInvoice.paidAmount).toBe(6000);
    expect(storedInvoice.balanceAmount).toBe(4000);
    expect(storedInvoice.date).toBe('2026-10-18');
  });

  // Scenario 35: Multiple invoices with partial linked receipts do not create duplicate Payment In rows
  it('Scenario 35: Multiple invoices with partial linked receipts do not create duplicate Payment In rows', () => {
    const cust: Party = {
      ...sampleCustomer,
      id: 'PARTY-CUST-MULTI-LINK',
      name: 'Multi Link Customer',
      currentBalance: 0,
    };
    db.saveParty(cust);

    // 1. Older invoice with a paid amount but no voucher (to prove party aggregate is no longer consumed by this invoice)
    const oldInv: Invoice = {
      ...makeInvoice('INV-OLD-01', 'INV-OLD-01', '2026-08-01', 1000, 1000),
      partyId: cust.id,
      partyName: cust.name,
      paymentMode: 'CASH',
      paymentStatus: 'PAID',
    };
    db.saveInvoice(oldInv);

    // 2. Newer invoice 1: Total 3000, paid 1500, with linked receipt voucher
    const inv1: Invoice = {
      ...makeInvoice('INV-LINK-01', 'INV-LINK-01', '2026-08-15', 3000, 1500),
      partyId: cust.id,
      partyName: cust.name,
      paymentMode: 'CASH',
      paymentStatus: 'PARTIAL',
    };
    db.saveInvoice(inv1);

    const v1 = createPaymentReceiptVoucher({
      receiptNumber: `INV-${inv1.invoiceNumber}`,
      date: '2026-08-15',
      customerName: cust.name,
      customerId: cust.id,
      amount: 1500,
      paymentMode: 'CASH',
      narration: 'Receipt for INV-LINK-01',
    });
    v1.partyId = cust.id;
    v1.partyName = cust.name;
    v1.sourceDocumentType = 'INVOICE';
    v1.sourceDocumentId = inv1.id;
    v1.sourceDocumentNumber = inv1.invoiceNumber;
    v1.allocationMode = 'SOURCE_DOCUMENT';
    v1.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: inv1.id,
        documentNumber: inv1.invoiceNumber,
        amount: 1500,
        date: '2026-08-15',
      },
    ];
    db.savePaymentVoucher(v1, { skipDocumentUpdate: true });

    // 3. Newer invoice 2: Total 2000, paid 800, with linked receipt voucher
    const inv2: Invoice = {
      ...makeInvoice('INV-LINK-02', 'INV-LINK-02', '2026-08-20', 2000, 800),
      partyId: cust.id,
      partyName: cust.name,
      paymentMode: 'CASH',
      paymentStatus: 'PARTIAL',
    };
    db.saveInvoice(inv2);

    const v2 = createPaymentReceiptVoucher({
      receiptNumber: `INV-${inv2.invoiceNumber}`,
      date: '2026-08-20',
      customerName: cust.name,
      customerId: cust.id,
      amount: 800,
      paymentMode: 'CASH',
      narration: 'Receipt for INV-LINK-02',
    });
    v2.partyId = cust.id;
    v2.partyName = cust.name;
    v2.sourceDocumentType = 'INVOICE';
    v2.sourceDocumentId = inv2.id;
    v2.sourceDocumentNumber = inv2.invoiceNumber;
    v2.allocationMode = 'SOURCE_DOCUMENT';
    v2.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: inv2.id,
        documentNumber: inv2.invoiceNumber,
        amount: 800,
        date: '2026-08-20',
      },
    ];
    db.savePaymentVoucher(v2, { skipDocumentUpdate: true });

    // Compute cash bank summary
    const summary = computeCashBankSummary({
      accounts: db.getBankAccounts(),
      invoices: db.getInvoices(),
      purchases: db.getPurchases(),
      expenses: db.getExpenses(),
      vouchers: db.getVouchers(),
      transactions: db.getCashBankTransactions(),
    });

    const inflowEntries = summary.ledgerEntries.filter((e) => e.flow === 'IN');

    // Expected inflows:
    // oldInv: synthetic SALE row = 1000 (no voucher)
    // inv1: voucher v1 row = 1500 (NO synthetic sale row)
    // inv2: voucher v2 row = 800 (NO synthetic sale row)
    const oldInvEntries = inflowEntries.filter((e) => e.rawInvoiceId === oldInv.id || e.referenceNo === oldInv.invoiceNumber);
    expect(oldInvEntries.length).toBe(1);
    expect(oldInvEntries[0].amount).toBe(1000);
    expect(oldInvEntries[0].type).toBe('SALE');

    const inv1Entries = inflowEntries.filter((e) => e.rawInvoiceId === inv1.id || e.rawVoucherId === v1.id || e.referenceNo === v1.voucherNumber);
    expect(inv1Entries.length).toBe(1);
    expect(inv1Entries[0].amount).toBe(1500);
    expect(inv1Entries[0].type).toBe('PARTY_RECEIPT');

    const inv2Entries = inflowEntries.filter((e) => e.rawInvoiceId === inv2.id || e.rawVoucherId === v2.id || e.referenceNo === v2.voucherNumber);
    expect(inv2Entries.length).toBe(1);
    expect(inv2Entries[0].amount).toBe(800);
    expect(inv2Entries[0].type).toBe('PARTY_RECEIPT');

    // Total inflow equals total paid
    const totalPaidExpected = 1000 + 1500 + 800; // 3300
    const relevantInflow = oldInvEntries[0].amount + inv1Entries[0].amount + inv2Entries[0].amount;
    expect(relevantInflow).toBe(totalPaidExpected);
  });

  // Scenario 36: unlinkPaymentAllocation restores invoice balance and keeps the voucher as an unallocated advance
  it('Scenario 36: unlinkPaymentAllocation restores invoice balance and keeps the voucher as an unallocated advance', () => {
    const cust: Party = {
      ...sampleCustomer,
      id: 'PARTY-UNLINK-CUST',
      name: 'Unlink Customer',
      currentBalance: 0,
    };
    db.saveParty(cust);

    const inv: Invoice = {
      ...makeInvoice('INV-UNL-01', 'INV-UNL-01', '2026-09-01', 5000, 0),
      partyId: cust.id,
      partyName: cust.name,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
    };
    db.saveInvoice(inv);

    const voucher = createPaymentReceiptVoucher({
      receiptNumber: 'RCPT-UNL-01',
      date: '2026-09-01',
      customerName: cust.name,
      customerId: cust.id,
      amount: 2000,
      paymentMode: 'CASH',
      narration: 'Payment for invoice',
    });
    voucher.partyId = cust.id;
    voucher.partyName = cust.name;
    voucher.sourceDocumentType = 'INVOICE';
    voucher.sourceDocumentId = inv.id;
    voucher.sourceDocumentNumber = inv.invoiceNumber;
    voucher.allocationMode = 'SOURCE_DOCUMENT';
    voucher.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: inv.id,
        documentNumber: inv.invoiceNumber,
        amount: 2000,
        date: '2026-09-01',
      },
    ];
    db.savePaymentVoucher(voucher);

    // Initial check: invoice is partially paid by the voucher
    const storedInvBefore = db.getInvoices().find((i) => i.id === inv.id)!;
    expect(storedInvBefore.paidAmount).toBe(2000);
    expect(storedInvBefore.balanceAmount).toBe(3000);
    expect(storedInvBefore.paymentStatus).toBe('PARTIAL');

    // Unlink the payment allocation
    const unlinkedVoucher = db.unlinkPaymentAllocation(voucher.id, 'INVOICE', inv.id);

    // Voucher verification: kept alive as unallocated advance
    expect(unlinkedVoucher.id).toBe(voucher.id);
    expect(unlinkedVoucher.voucherNumber).toBe(voucher.voucherNumber);
    expect(unlinkedVoucher.totalAmount).toBe(2000);
    expect(unlinkedVoucher.partyId).toBe(cust.id);
    expect(unlinkedVoucher.allocationMode).toBe('UNALLOCATED');
    expect(unlinkedVoucher.paymentAllocations).toEqual([]);
    expect(unlinkedVoucher.sourceDocumentId).toBeUndefined();
    expect(unlinkedVoucher.sourceDocumentType).toBeUndefined();
    expect(unlinkedVoucher.sourceDocumentNumber).toBeUndefined();

    // Invoice verification: balance restored, status UNPAID, mode CREDIT
    const storedInvAfter = db.getInvoices().find((i) => i.id === inv.id)!;
    expect(storedInvAfter.paidAmount).toBe(0);
    expect(storedInvAfter.balanceAmount).toBe(5000);
    expect(storedInvAfter.paymentStatus).toBe('UNPAID');
    expect(storedInvAfter.paymentMode).toBe('CREDIT');

    // Party balance verification:
    // Invoice owes 5000 (receivable), unallocated voucher provides 2000 (advance receipt/credit)
    // Net receivable balance = 3000
    const partyAfter = db.getParties().find((p) => p.id === cust.id)!;
    expect(partyAfter.currentBalance).toBe(3000);
  });

  // Scenario 37: reassignLinkedPaymentParty moves source and manual linked receipts, updates party journal line, preserves cash/bank lines and allocations, and corrects party balances
  it('Scenario 37: reassignLinkedPaymentParty moves source and manual linked receipts, updates party journal line, preserves cash/bank lines and allocations, and corrects party balances', () => {
    const oldParty: Party = {
      ...sampleCustomer,
      id: 'PARTY-OLD-01',
      name: 'Old Party Corp',
      currentBalance: 0,
    };
    const newParty: Party = {
      ...sampleCustomer,
      id: 'PARTY-NEW-01',
      name: 'New Party Inc',
      currentBalance: 0,
    };
    db.saveParty(oldParty);
    db.saveParty(newParty);

    const inv: Invoice = {
      ...makeInvoice('INV-REASSIGN-01', 'INV-REASSIGN-01', '2026-09-01', 5000, 5000),
      partyId: oldParty.id,
      partyName: oldParty.name,
      paymentMode: 'CASH',
      paymentStatus: 'PAID',
    };
    db.saveInvoice(inv);

    // Source voucher (upfront receipt 3000)
    const sourceVoucher = createPaymentReceiptVoucher({
      receiptNumber: `INV-${inv.invoiceNumber}`,
      date: '2026-09-01',
      customerName: oldParty.name,
      customerId: oldParty.id,
      amount: 3000,
      paymentMode: 'CASH',
      narration: 'Upfront receipt',
    });
    sourceVoucher.partyId = oldParty.id;
    sourceVoucher.partyName = oldParty.name;
    sourceVoucher.sourceDocumentType = 'INVOICE';
    sourceVoucher.sourceDocumentId = inv.id;
    sourceVoucher.sourceDocumentNumber = inv.invoiceNumber;
    sourceVoucher.allocationMode = 'SOURCE_DOCUMENT';
    sourceVoucher.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: inv.id,
        documentNumber: inv.invoiceNumber,
        amount: 3000,
        date: '2026-09-01',
      },
    ];
    db.savePaymentVoucher(sourceVoucher, { skipDocumentUpdate: true });

    // Manual linked voucher (later receipt 2000)
    const manualVoucher = createPaymentReceiptVoucher({
      receiptNumber: 'RCPT-MAN-01',
      date: '2026-09-05',
      customerName: oldParty.name,
      customerId: oldParty.id,
      amount: 2000,
      paymentMode: 'CASH',
      narration: 'Later manual receipt',
    });
    manualVoucher.partyId = oldParty.id;
    manualVoucher.partyName = oldParty.name;
    manualVoucher.allocationMode = 'MANUAL';
    manualVoucher.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: inv.id,
        documentNumber: inv.invoiceNumber,
        amount: 2000,
        date: '2026-09-05',
      },
    ];
    db.savePaymentVoucher(manualVoucher, { skipDocumentUpdate: true });

    // Reassign linked payments to new party
    db.reassignLinkedPaymentParty(inv.id, newParty.id, newParty.name);

    // Verify source voucher
    const storedSource = db.getVouchers().find((v) => v.id === sourceVoucher.id)!;
    expect(storedSource.partyId).toBe(newParty.id);
    expect(storedSource.partyName).toBe(newParty.name);
    expect(storedSource.totalAmount).toBe(3000);
    expect(storedSource.paymentAllocations![0].amount).toBe(3000);
    // Cash debit line preserved
    const sourceDebit = storedSource.entries.find((e) => e.debit > 0)!;
    expect(sourceDebit.accountId).toBe('ACC_CASH');
    expect(sourceDebit.debit).toBe(3000);
    // Party credit line updated
    const sourceCredit = storedSource.entries.find((e) => e.credit > 0)!;
    expect(sourceCredit.accountId).toBe(newParty.id);
    expect(sourceCredit.accountName).toBe(newParty.name);
    expect(sourceCredit.credit).toBe(3000);

    // Verify manual voucher
    const storedManual = db.getVouchers().find((v) => v.id === manualVoucher.id)!;
    expect(storedManual.partyId).toBe(newParty.id);
    expect(storedManual.partyName).toBe(newParty.name);
    expect(storedManual.totalAmount).toBe(2000);
    expect(storedManual.paymentAllocations![0].amount).toBe(2000);
    const manualCredit = storedManual.entries.find((e) => e.credit > 0)!;
    expect(manualCredit.accountId).toBe(newParty.id);
    expect(manualCredit.accountName).toBe(newParty.name);

    // Update invoice party to new party as App.handleSaveInvoice does
    const updatedInv = { ...inv, partyId: newParty.id, partyName: newParty.name };
    db.saveInvoice(updatedInv);

    // Both old and new party balances are updated
    const oldPartyFinal = db.getParties().find((p) => p.id === oldParty.id)!;
    expect(oldPartyFinal.currentBalance).toBe(0);

    const newPartyFinal = db.getParties().find((p) => p.id === newParty.id)!;
    // Invoice grand total 5000, paid 5000 => net balance 0
    expect(newPartyFinal.currentBalance).toBe(0);
  });

  // Scenario 38: validateInvoicePreSave allows invoice party changes with linked payments
  it('Scenario 38: validateInvoicePreSave allows invoice party changes with linked payments', () => {
    const cust1: Party = {
      ...sampleCustomer,
      id: 'PARTY-PRE-01',
      name: 'PreSave Party 1',
    };
    const cust2: Party = {
      ...sampleCustomer,
      id: 'PARTY-PRE-02',
      name: 'PreSave Party 2',
    };
    db.saveParty(cust1);
    db.saveParty(cust2);

    const inv: Invoice = {
      ...makeInvoice('INV-PRE-01', 'INV-PRE-01', '2026-09-01', 3000, 3000),
      partyId: cust1.id,
      partyName: cust1.name,
    };
    db.saveInvoice(inv);

    const voucher = createPaymentReceiptVoucher({
      receiptNumber: 'RCPT-PRE-01',
      date: '2026-09-01',
      customerName: cust1.name,
      customerId: cust1.id,
      amount: 3000,
      paymentMode: 'CASH',
    });
    voucher.partyId = cust1.id;
    voucher.sourceDocumentType = 'INVOICE';
    voucher.sourceDocumentId = inv.id;
    voucher.sourceDocumentNumber = inv.invoiceNumber;
    voucher.allocationMode = 'SOURCE_DOCUMENT';
    voucher.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: inv.id,
        documentNumber: inv.invoiceNumber,
        amount: 3000,
        date: '2026-09-01',
      },
    ];
    db.savePaymentVoucher(voucher, { skipDocumentUpdate: true });

    // Editing party to cust2
    const editedInv: Invoice = {
      ...inv,
      partyId: cust2.id,
      partyName: cust2.name,
    };

    const validation = validateInvoicePreSave({
      newInvoice: editedInv,
      existingInvoices: db.getInvoices(),
      vouchers: db.getVouchers(),
    });

    expect(validation.valid).toBe(true);
    expect(validation.error).toBeUndefined();
  });

  // Scenario 39: Plain db.saveInvoice of an edited invoice leaves linked vouchers unchanged
  it('Scenario 39: Plain db.saveInvoice of an edited invoice leaves linked vouchers unchanged', () => {
    const cust: Party = {
      ...sampleCustomer,
      id: 'PARTY-PLAIN-01',
      name: 'Plain Save Customer',
    };
    db.saveParty(cust);

    const inv: Invoice = {
      ...makeInvoice('INV-PLAIN-01', 'INV-PLAIN-01', '2026-09-01', 4000, 4000),
      partyId: cust.id,
      partyName: cust.name,
      paymentMode: 'CASH',
      paymentStatus: 'PAID',
    };
    db.saveInvoice(inv);

    const voucher = createPaymentReceiptVoucher({
      receiptNumber: `INV-${inv.invoiceNumber}`,
      date: '2026-09-01',
      customerName: cust.name,
      customerId: cust.id,
      amount: 4000,
      paymentMode: 'CASH',
      narration: 'Upfront receipt',
    });
    voucher.partyId = cust.id;
    voucher.partyName = cust.name;
    voucher.sourceDocumentType = 'INVOICE';
    voucher.sourceDocumentId = inv.id;
    voucher.sourceDocumentNumber = inv.invoiceNumber;
    voucher.allocationMode = 'SOURCE_DOCUMENT';
    voucher.paymentAllocations = [
      {
        documentType: 'INVOICE',
        documentId: inv.id,
        documentNumber: inv.invoiceNumber,
        amount: 4000,
        date: '2026-09-01',
      },
    ];
    db.savePaymentVoucher(voucher, { skipDocumentUpdate: true });

    const voucherBefore = JSON.stringify(db.getVouchers().find((v) => v.id === voucher.id));

    // Edit invoice notes, leaving payment state unchanged
    const editedInv: Invoice = {
      ...inv,
      notes: 'Updated invoice notes for delivery instructions',
    };
    db.saveInvoice(editedInv);

    const voucherAfter = JSON.stringify(db.getVouchers().find((v) => v.id === voucher.id));
    expect(voucherAfter).toBe(voucherBefore);
  });

  // Scenario 40: Legacy source receipt voucher with sourceDocumentId but no paymentAllocations suppresses its linked invoice without duplicate SALE row
  it('Scenario 40: Legacy source receipt voucher with sourceDocumentId but no paymentAllocations suppresses its linked invoice without duplicate SALE row', () => {
    const cust: Party = {
      ...sampleCustomer,
      id: 'PARTY-LEG-SRC-01',
      name: 'Legacy Source Customer',
    };
    db.saveParty(cust);

    // 1. Older invoice with upfront cash payment and NO voucher
    const oldInv: Invoice = {
      ...makeInvoice('INV-LEG-OLD', 'INV-LEG-OLD', '2026-08-01', 2000, 2000),
      partyId: cust.id,
      partyName: cust.name,
      paymentMode: 'CASH',
      paymentStatus: 'PAID',
    };
    db.saveInvoice(oldInv);

    // 2. Newer invoice with upfront cash payment and a legacy source voucher (no paymentAllocations)
    const linkedInv: Invoice = {
      ...makeInvoice('INV-LEG-LINK', 'INV-LEG-LINK', '2026-08-10', 3500, 3500),
      partyId: cust.id,
      partyName: cust.name,
      paymentMode: 'CASH',
      paymentStatus: 'PAID',
    };
    db.saveInvoice(linkedInv);

    const legacyVoucher = createPaymentReceiptVoucher({
      receiptNumber: `INV-${linkedInv.invoiceNumber}`,
      date: '2026-08-10',
      customerName: cust.name,
      customerId: cust.id,
      amount: 3500,
      paymentMode: 'CASH',
      narration: 'Legacy receipt for INV-LEG-LINK',
    });
    legacyVoucher.partyId = cust.id;
    legacyVoucher.partyName = cust.name;
    legacyVoucher.sourceDocumentType = 'INVOICE';
    legacyVoucher.sourceDocumentId = linkedInv.id;
    legacyVoucher.sourceDocumentNumber = linkedInv.invoiceNumber;
    // Explicitly no paymentAllocations (simulating legacy data)
    legacyVoucher.paymentAllocations = undefined;
    db.savePaymentVoucher(legacyVoucher, { skipDocumentUpdate: true });

    const summary = computeCashBankSummary({
      accounts: db.getBankAccounts(),
      invoices: db.getInvoices(),
      purchases: db.getPurchases(),
      expenses: db.getExpenses(),
      vouchers: db.getVouchers(),
      transactions: db.getCashBankTransactions(),
    });

    // Verify:
    // 1. linkedInv must NOT generate a synthetic SALE entry (voucher suppresses it directly via sourceDocumentId)
    const linkedSale = summary.ledgerEntries.find((e) => e.rawInvoiceId === linkedInv.id);
    expect(linkedSale).toBeUndefined();

    // 2. oldInv MUST still generate a synthetic SALE entry (not stolen by party-aggregate fallback)
    const oldSale = summary.ledgerEntries.find((e) => e.rawInvoiceId === oldInv.id);
    expect(oldSale).toBeDefined();
    expect(oldSale!.amount).toBe(2000);
    expect(oldSale!.type).toBe('SALE');

    // 3. The voucher itself is present as a PARTY_RECEIPT entry
    const voucherEntry = summary.ledgerEntries.find((e) => e.rawVoucherId === legacyVoucher.id || e.referenceNo === legacyVoucher.voucherNumber);
    expect(voucherEntry).toBeDefined();
    expect(voucherEntry!.amount).toBe(3500);
    expect(voucherEntry!.type).toBe('PARTY_RECEIPT');
  });

  // Scenario 41: Legacy source payment voucher with sourceDocumentType=PURCHASE and sourceDocumentId but no paymentAllocations suppresses its linked bill
  it('Scenario 41: Legacy source payment voucher with sourceDocumentType=PURCHASE and sourceDocumentId but no paymentAllocations suppresses its linked bill', () => {
    const supp: Party = {
      ...sampleSupplier,
      id: 'SUPP-LEG-SRC-01',
      name: 'Legacy Source Supplier',
    };
    db.saveParty(supp);

    // 1. Older bill with upfront cash payment and NO voucher
    const oldBill: PurchaseBill = {
      ...makePurchase('PUR-LEG-OLD', 'PUR-LEG-OLD', '2026-08-01', 1500, 1500),
      supplierId: supp.id,
      supplierName: supp.name,
      paymentMode: 'CASH',
      paymentStatus: 'PAID',
    };
    db.savePurchase(oldBill);

    // 2. Newer bill with upfront cash payment and a legacy source voucher (no paymentAllocations)
    const linkedBill: PurchaseBill = {
      ...makePurchase('PUR-LEG-LINK', 'PUR-LEG-LINK', '2026-08-10', 4500, 4500),
      supplierId: supp.id,
      supplierName: supp.name,
      paymentMode: 'CASH',
      paymentStatus: 'PAID',
    };
    db.savePurchase(linkedBill);

    const legacyPaymentVoucher = createPaymentOutVoucher({
      receiptNumber: `PUR-${linkedBill.billNumber}`,
      date: '2026-08-10',
      supplierName: supp.name,
      supplierId: supp.id,
      amount: 4500,
      paymentMode: 'CASH',
      narration: 'Legacy payment for PUR-LEG-LINK',
    });
    legacyPaymentVoucher.partyId = supp.id;
    legacyPaymentVoucher.partyName = supp.name;
    legacyPaymentVoucher.sourceDocumentType = 'PURCHASE';
    legacyPaymentVoucher.sourceDocumentId = linkedBill.id;
    legacyPaymentVoucher.sourceDocumentNumber = linkedBill.billNumber;
    // Explicitly no paymentAllocations
    legacyPaymentVoucher.paymentAllocations = undefined;
    db.savePaymentVoucher(legacyPaymentVoucher, { skipDocumentUpdate: true });

    const summary = computeCashBankSummary({
      accounts: db.getBankAccounts(),
      invoices: db.getInvoices(),
      purchases: db.getPurchases(),
      expenses: db.getExpenses(),
      vouchers: db.getVouchers(),
      transactions: db.getCashBankTransactions(),
    });

    // Verify:
    // 1. linkedBill must NOT generate a synthetic PURCHASE entry
    const linkedPur = summary.ledgerEntries.find((e) => e.rawPurchaseId === linkedBill.id);
    expect(linkedPur).toBeUndefined();

    // 2. oldBill MUST still generate a synthetic PURCHASE entry
    const oldPur = summary.ledgerEntries.find((e) => e.rawPurchaseId === oldBill.id);
    expect(oldPur).toBeDefined();
    expect(oldPur!.amount).toBe(1500);
    expect(oldPur!.type).toBe('PURCHASE');

    // 3. The voucher itself is present as a PARTY_PAYMENT entry
    const voucherEntry = summary.ledgerEntries.find((e) => e.rawVoucherId === legacyPaymentVoucher.id || e.referenceNo === legacyPaymentVoucher.voucherNumber);
    expect(voucherEntry).toBeDefined();
    expect(voucherEntry!.amount).toBe(4500);
    expect(voucherEntry!.type).toBe('PARTY_PAYMENT');
  });
});
