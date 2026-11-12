import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  readRupeeOr,
  attachPaiseFields,
  PAISE_SCHEMA_VERSION,
} from '../core/accounting/paisePersistence.ts';
import { buildThermalReceiptText } from '../core/utils/thermalReceiptText.ts';
import { generatePurchaseBillHtml } from '../core/utils/purchaseDocumentPrinter.ts';
import { generateEWayBillSlipHtml } from '../core/gst/eWayBillSlipPrinter.ts';
import { generateExpenseVoucherHtml } from '../core/utils/expenseVoucherPrinter.ts';
import { db } from '../services/db.ts';
import type { CompanyProfile } from '../models/company.ts';
import type { Invoice } from '../models/invoice.ts';
import type { PurchaseBill } from '../models/purchase.ts';
import type { Expense } from '../models/expense.ts';
import type { Party } from '../models/party.ts';

class TestStorage implements Storage {
  private store: Map<string, string> = new Map();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
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

describe('paisePrintAdapters', () => {
  const mockCompany: CompanyProfile = {
    id: 'COMP-1',
    businessName: 'Apex Industrial Supplies Pvt Ltd',
    tradeName: 'Apex Supplies',
    gstin: '27AABCU9603R1ZM',
    pan: 'AABCU9603R',
    phone: '9876543210',
    email: 'apex@supplies.com',
    address: 'Plot 44, MIDC Industrial Area, Pune',
    pincode: '411018',
    stateCode: '27',
    isGstEnabled: true,
    isCompositionScheme: false,
    termsAndConditions: 'Payment due within 30 days.',
  };

  const createMockInvoice = (): Invoice => ({
    id: 'INV-2026-001',
    invoiceNumber: 'INV-2026-001',
    invoiceType: 'B2B',
    date: '2026-10-28',
    partyId: 'PARTY-1',
    partyName: 'Tata Motors Limited',
    partyGstin: '27AAACT2727Q1ZW',
    partyAddress: 'Pune Industrial Complex, 9876543210',
    partyStateCode: '27',
    placeOfSupplyStateCode: '27',
    isIntraState: true,
    items: [
      {
        itemId: 'ITEM-1',
        name: 'Industrial Valve 2-inch',
        hsnSacCode: '84818030',
        quantity: 2,
        unit: 'PCS',
        unitPrice: 1500,
        discountPercent: 0,
        discountAmount: 0,
        taxableAmount: 3000,
        gstRate: 18,
        cgstAmount: 270,
        sgstAmount: 270,
        igstAmount: 0,
        cessAmount: 30,
        cessRate: 1,
        total: 3570,
        totalAmount: 3570,
      },
      {
        itemId: 'ITEM-2',
        name: 'Pressure Gauge 100 PSI',
        hsnSacCode: '90262000',
        quantity: 1,
        unit: 'PCS',
        unitPrice: 800,
        discountPercent: 0,
        discountAmount: 0,
        taxableAmount: 800,
        gstRate: 18,
        cgstAmount: 72,
        sgstAmount: 72,
        igstAmount: 0,
        cessAmount: 0,
        total: 944,
        totalAmount: 944,
      },
    ],
    totalGrossAmount: 3800,
    totalDiscount: 50,
    totalTaxableAmount: 3750,
    totalCgst: 342,
    totalSgst: 342,
    totalIgst: 0,
    totalCess: 30,
    totalTax: 714,
    shippingAmount: 100,
    roundOff: 0.5,
    grandTotal: 4564.5,
    amountInWords: 'Four Thousand Five Hundred Sixty Four Rupees and Fifty Paise Only',
    paidAmount: 2000,
    balanceAmount: 2564.5,
    paymentStatus: 'PARTIAL',
    paymentMode: 'SPLIT',
    paymentSplits: [
      { id: 'split-1', mode: 'UPI', amount: 1500 },
      { id: 'split-2', mode: 'CASH', amount: 500 },
    ],
    isCancelled: false,
    createdAt: '2026-10-28T10:00:00.000Z',
    updatedAt: '2026-10-28T10:00:00.000Z',
  });

  const createMockPurchaseBill = (): PurchaseBill => ({
    id: 'PUR-2026-001',
    billNumber: 'PB-2026-009',
    purchaseType: 'BILL',
    date: '2026-10-28',
    supplierId: 'SUPP-1',
    supplierName: 'Kirloskar Pneumatic Co',
    supplierGstin: '27AAACK1234Q1Z5',
    supplierAddress: 'Hadapsar Industrial Estate, Pune',
    supplierStateCode: '27',
    placeOfSupplyStateCode: '27',
    isIntraState: true,
    items: [
      {
        name: 'Air Compressor 5HP',
        hsnSacCode: '84148011',
        unit: 'NOS',
        quantity: 1,
        unitPrice: 45000,
        taxableAmount: 45000,
        gstRate: 18,
        cgstAmount: 4050,
        sgstAmount: 4050,
        igstAmount: 0,
        cessAmount: 0,
        totalAmount: 53100,
      },
      {
        name: 'Synthetic Lubricant 20L',
        hsnSacCode: '27101980',
        unit: 'LTR',
        quantity: 2,
        unitPrice: 3500,
        taxableAmount: 7000,
        gstRate: 18,
        cgstAmount: 630,
        sgstAmount: 630,
        igstAmount: 0,
        cessAmount: 0,
        totalAmount: 8260,
      },
    ],
    itcEligibility: 'ALL_OTHER_ITC',
    isRcm: false,
    totalGrossAmount: 52000,
    totalDiscount: 0,
    totalTaxableAmount: 52000,
    totalCgst: 4680,
    totalSgst: 4680,
    totalIgst: 0,
    totalCess: 0,
    totalTax: 9360,
    roundOff: 0.4,
    grandTotal: 61360.4,
    paymentMode: 'BANK',
    paymentStatus: 'PARTIAL',
    paidAmount: 30000,
    balanceAmount: 31360.4,
    paymentSplits: [],
    notes: 'Warranty: 12 months manufacturer warranty',
    isCancelled: false,
    createdAt: '2026-10-28T09:00:00Z',
    updatedAt: '2026-10-28T09:00:00Z',
  });

  const createMockExpense = (): Expense => ({
    id: 'EXP-1',
    voucherNumber: 'EXP-2026-001',
    date: '2026-10-28',
    title: 'Workshop Machine Lubricant',
    category: 'Repairs & Maintenance',
    amount: 2360,
    paymentMode: 'CASH',
    vendorName: 'Shell Lubricants Depot',
    notes: 'Quarterly maintenance lubrication',
    taxableAmount: 2000,
    taxAmount: 360,
    cgstAmount: 180,
    sgstAmount: 180,
    igstAmount: 0,
    gstRate: 18,
    itcEligible: true,
    createdAt: '2026-10-28T09:00:00Z',
  });

  const mockParty: Party = {
    id: 'PARTY-1',
    name: 'Tata Motors Limited',
    type: 'CUSTOMER',
    phone: '9876543210',
    billingAddress: 'Pune Industrial Complex, 9876543210',
    currentBalance: 5420.5,
    openingBalance: 1000,
    stateCode: '27',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(db, 'getParties').mockReturnValue([mockParty]);
  });

  describe('1. readRupeeOr unit table', () => {
    // 1. no schema -> raw rupee
    it('returns raw rupee unchanged when doc has no paiseSchema', () => {
      const doc = { amount: 123.45, grandTotal: 5000 };
      expect(readRupeeOr(doc, 'amount')).toBe(123.45);
      expect(readRupeeOr(doc, 'grandTotal')).toBe(5000);
    });

    // 2. current schema + matching twin -> same value (fromPaise(twin))
    it('returns fromPaise(twin) when doc is current and twin matches rupee field', () => {
      const doc = attachPaiseFields({ amount: 150.5, grandTotal: 3000 }, 'invoice');
      expect(doc.paiseSchema).toBe(PAISE_SCHEMA_VERSION);
      expect(readRupeeOr(doc, 'amount')).toBe(150.5);
      expect(readRupeeOr(doc, 'grandTotal')).toBe(3000);

      const zeroDoc = { amount: 0, amountPaise: 0, paiseSchema: PAISE_SCHEMA_VERSION };
      expect(readRupeeOr(zeroDoc, 'amount')).toBe(0);

      const negDoc = { amount: -50.25, amountPaise: -5025, paiseSchema: PAISE_SCHEMA_VERSION };
      expect(readRupeeOr(negDoc, 'amount')).toBe(-50.25);
    });

    // 3. tampered twin -> raw rupee unchanged (rupee wins)
    it('returns raw rupee unchanged when twin is tampered (rupee wins)', () => {
      const tamperedDoc = {
        amount: 123.45,
        amountPaise: 9999,
        grandTotal: 1000,
        grandTotalPaise: 1234567,
        paiseSchema: PAISE_SCHEMA_VERSION,
      };
      expect(readRupeeOr(tamperedDoc, 'amount')).toBe(123.45);
      expect(readRupeeOr(tamperedDoc, 'grandTotal')).toBe(1000);
    });

    // 4. missing/non-integer twin -> raw rupee unchanged
    it('returns raw rupee unchanged when twin is missing, non-integer, NaN, or non-number', () => {
      // Missing twin
      const missingTwin = { amount: 123.45, paiseSchema: PAISE_SCHEMA_VERSION };
      expect(readRupeeOr(missingTwin, 'amount')).toBe(123.45);

      // Non-integer twin
      const nonIntTwin = { amount: 123.45, amountPaise: 12345.5, paiseSchema: PAISE_SCHEMA_VERSION };
      expect(readRupeeOr(nonIntTwin, 'amount')).toBe(123.45);

      // NaN twin
      const nanTwin = { amount: 123.45, amountPaise: NaN, paiseSchema: PAISE_SCHEMA_VERSION };
      expect(readRupeeOr(nanTwin, 'amount')).toBe(123.45);

      // Infinity twin
      const infTwin = { amount: 123.45, amountPaise: Infinity, paiseSchema: PAISE_SCHEMA_VERSION };
      expect(readRupeeOr(infTwin, 'amount')).toBe(123.45);

      // Non-number twin
      const strTwin = { amount: 123.45, amountPaise: '12345' as unknown as number, paiseSchema: PAISE_SCHEMA_VERSION };
      expect(readRupeeOr(strTwin, 'amount')).toBe(123.45);
    });

    // 5. null/undefined/non-object -> fallback
    it('returns fallback for null, undefined, and non-object inputs', () => {
      expect(readRupeeOr(null, 'amount')).toBe(0);
      expect(readRupeeOr(null, 'amount', 42)).toBe(42);
      expect(readRupeeOr(undefined, 'amount')).toBe(0);
      expect(readRupeeOr(undefined, 'amount', 100)).toBe(100);
      expect(readRupeeOr('string' as unknown as object, 'amount')).toBe(0);
      expect(readRupeeOr('string' as unknown as object, 'amount', 55)).toBe(55);
      expect(readRupeeOr(12345 as unknown as object, 'amount', 88)).toBe(88);
      expect(readRupeeOr(true as unknown as object, 'amount', 77)).toBe(77);
    });

    // 6. non-finite rupee -> fallback
    it('returns fallback when rupee field is missing or non-finite', () => {
      expect(readRupeeOr({}, 'amount')).toBe(0);
      expect(readRupeeOr({}, 'amount', 99)).toBe(99);
      expect(readRupeeOr({ amount: NaN }, 'amount')).toBe(0);
      expect(readRupeeOr({ amount: NaN }, 'amount', 12)).toBe(12);
      expect(readRupeeOr({ amount: Infinity }, 'amount')).toBe(0);
      expect(readRupeeOr({ amount: Infinity }, 'amount', 34)).toBe(34);
      expect(readRupeeOr({ amount: -Infinity }, 'amount')).toBe(0);
      expect(readRupeeOr({ amount: -Infinity }, 'amount', 56)).toBe(56);
      expect(readRupeeOr({ amount: '100' as unknown as number }, 'amount')).toBe(0);
      expect(readRupeeOr({ amount: null as unknown as number }, 'amount', 78)).toBe(78);
    });

    // 7. a 3-decimal rupee value (e.g. 10.005) is returned unchanged (not rounded)
    it('returns a 3-decimal rupee value (e.g. 10.005) unchanged without rounding', () => {
      // Without schema
      expect(readRupeeOr({ amount: 10.005 }, 'amount')).toBe(10.005);

      // With schema but no twin
      expect(readRupeeOr({ amount: 10.005, paiseSchema: PAISE_SCHEMA_VERSION }, 'amount')).toBe(10.005);

      // With schema + attached twin: toPaise(10.005) = 1001, fromPaise(1001) = 10.01 !== 10.005 -> raw rupee returned unchanged
      const attached = attachPaiseFields({ amount: 10.005 }, 'invoice');
      expect(readRupeeOr(attached, 'amount')).toBe(10.005);
    });
  });

  describe('2. buildThermalReceiptText byte-identity', () => {
    it('produces identical string output with and without twins, and with tampered twin', () => {
      const rawInvoice = createMockInvoice();

      // Baseline output without twins
      const text32Raw = buildThermalReceiptText(rawInvoice, mockCompany, 32);
      const text48Raw = buildThermalReceiptText(rawInvoice, mockCompany, 48);

      // With attached paise twins
      const attachedInvoice = attachPaiseFields(rawInvoice, 'invoice');
      const text32Attached = buildThermalReceiptText(attachedInvoice, mockCompany, 32);
      const text48Attached = buildThermalReceiptText(attachedInvoice, mockCompany, 48);

      expect(text32Attached).toBe(text32Raw);
      expect(text48Attached).toBe(text48Raw);

      // With tampered twins (e.g. grandTotalPaise: 9999, item unitPricePaise / totalAmountPaise tampered)
      const tamperedInvoice: Invoice = {
        ...attachedInvoice,
        grandTotalPaise: 9999,
        paidAmountPaise: 1111,
        balanceAmountPaise: 2222,
        totalTaxableAmountPaise: 3333,
        totalDiscountPaise: 4444,
        totalCgstPaise: 5555,
        totalSgstPaise: 6666,
        totalCessPaise: 7777,
        shippingAmountPaise: 8888,
        roundOffPaise: 9999,
        items: attachedInvoice.items.map((it) => ({
          ...it,
          unitPricePaise: 111,
          totalAmountPaise: 222,
        })),
      } as unknown as Invoice;

      const text32Tampered = buildThermalReceiptText(tamperedInvoice, mockCompany, 32);
      const text48Tampered = buildThermalReceiptText(tamperedInvoice, mockCompany, 48);

      expect(text32Tampered).toBe(text32Raw);
      expect(text48Tampered).toBe(text48Raw);
    });
  });

  describe('3. generatePurchaseBillHtml byte-identity', () => {
    it('produces identical HTML with and without twins, and with tampered twin', () => {
      const rawBill = createMockPurchaseBill();

      // Baseline HTML without twins
      const rawHtml = generatePurchaseBillHtml(mockCompany, rawBill);

      // With attached paise twins
      const attachedBill = attachPaiseFields(rawBill, 'purchase');
      const attachedHtml = generatePurchaseBillHtml(mockCompany, attachedBill);

      expect(attachedHtml).toBe(rawHtml);

      // With tampered twins
      const tamperedBill: PurchaseBill = {
        ...attachedBill,
        grandTotalPaise: 9999,
        paidAmountPaise: 1111,
        balanceAmountPaise: 2222,
        totalTaxableAmountPaise: 3333,
        roundOffPaise: 4444,
        items: attachedBill.items.map((it) => ({
          ...it,
          unitPricePaise: 999,
          totalAmountPaise: 888,
        })),
      } as unknown as PurchaseBill;

      const tamperedHtml = generatePurchaseBillHtml(mockCompany, tamperedBill);

      expect(tamperedHtml).toBe(rawHtml);
    });
  });

  describe('4. generateEWayBillSlipHtml byte-identity', () => {
    it('produces identical HTML with and without twins, and with tampered twin', () => {
      const rawInvoice = createMockInvoice();
      const transportOptions = {
        vehicleNumber: 'MH12AB1234',
        transporterName: 'VRL Logistics Ltd',
        transDistance: 150,
      };

      // Baseline HTML without twins (with and without transportOptions)
      const rawHtmlWithOptions = generateEWayBillSlipHtml(mockCompany, rawInvoice, transportOptions);
      const rawHtmlDefault = generateEWayBillSlipHtml(mockCompany, rawInvoice);

      // With attached paise twins
      const attachedInvoice = attachPaiseFields(rawInvoice, 'invoice');
      const attachedHtmlWithOptions = generateEWayBillSlipHtml(mockCompany, attachedInvoice, transportOptions);
      const attachedHtmlDefault = generateEWayBillSlipHtml(mockCompany, attachedInvoice);

      expect(attachedHtmlWithOptions).toBe(rawHtmlWithOptions);
      expect(attachedHtmlDefault).toBe(rawHtmlDefault);

      // With tampered twins
      const tamperedInvoice: Invoice = {
        ...attachedInvoice,
        grandTotalPaise: 9999,
        totalTaxableAmountPaise: 1111,
        totalTaxPaise: 2222,
        items: attachedInvoice.items.map((it) => ({
          ...it,
          totalAmountPaise: 3333,
        })),
      } as unknown as Invoice;

      const tamperedHtmlWithOptions = generateEWayBillSlipHtml(mockCompany, tamperedInvoice, transportOptions);
      const tamperedHtmlDefault = generateEWayBillSlipHtml(mockCompany, tamperedInvoice);

      expect(tamperedHtmlWithOptions).toBe(rawHtmlWithOptions);
      expect(tamperedHtmlDefault).toBe(rawHtmlDefault);
    });
  });

  describe('5. generateExpenseVoucherHtml byte-identity', () => {
    it('produces identical HTML with and without twins, and with tampered twin', () => {
      const rawExpense = createMockExpense();

      // Baseline HTML without twins
      const rawHtml = generateExpenseVoucherHtml(mockCompany, rawExpense);

      // With attached paise twins
      const attachedExpense = attachPaiseFields(rawExpense, 'expense');
      const attachedHtml = generateExpenseVoucherHtml(mockCompany, attachedExpense);

      expect(attachedHtml).toBe(rawHtml);

      // With tampered twins
      const tamperedExpense: Expense = {
        ...attachedExpense,
        amountPaise: 9999,
        taxableAmountPaise: 1111,
        taxAmountPaise: 2222,
      } as unknown as Expense;

      const tamperedHtml = generateExpenseVoucherHtml(mockCompany, tamperedExpense);

      expect(tamperedHtml).toBe(rawHtml);
    });
  });

  describe('6. Immutability: No builder mutates the document it receives', () => {
    it('verifies buildThermalReceiptText does not mutate the invoice or company', () => {
      const invoice = createMockInvoice();
      const attachedInvoice = attachPaiseFields(createMockInvoice(), 'invoice');
      const company = { ...mockCompany };

      const beforeInvoice = JSON.stringify(invoice);
      const beforeAttached = JSON.stringify(attachedInvoice);
      const beforeCompany = JSON.stringify(company);

      buildThermalReceiptText(invoice, company, 32);
      buildThermalReceiptText(invoice, company, 48);
      buildThermalReceiptText(attachedInvoice, company, 32);
      buildThermalReceiptText(attachedInvoice, company, 48);

      expect(JSON.stringify(invoice)).toBe(beforeInvoice);
      expect(JSON.stringify(attachedInvoice)).toBe(beforeAttached);
      expect(JSON.stringify(company)).toBe(beforeCompany);
    });

    it('verifies generatePurchaseBillHtml does not mutate the bill or company', () => {
      const bill = createMockPurchaseBill();
      const attachedBill = attachPaiseFields(createMockPurchaseBill(), 'purchase');
      const company = { ...mockCompany };

      const beforeBill = JSON.stringify(bill);
      const beforeAttached = JSON.stringify(attachedBill);
      const beforeCompany = JSON.stringify(company);

      generatePurchaseBillHtml(company, bill);
      generatePurchaseBillHtml(company, attachedBill);

      expect(JSON.stringify(bill)).toBe(beforeBill);
      expect(JSON.stringify(attachedBill)).toBe(beforeAttached);
      expect(JSON.stringify(company)).toBe(beforeCompany);
    });

    it('verifies generateEWayBillSlipHtml does not mutate the invoice or company', () => {
      const invoice = createMockInvoice();
      const attachedInvoice = attachPaiseFields(createMockInvoice(), 'invoice');
      const company = { ...mockCompany };
      const transportOptions = { vehicleNumber: 'MH12AB1234' };
      const beforeOptions = JSON.stringify(transportOptions);

      const beforeInvoice = JSON.stringify(invoice);
      const beforeAttached = JSON.stringify(attachedInvoice);
      const beforeCompany = JSON.stringify(company);

      generateEWayBillSlipHtml(company, invoice, transportOptions);
      generateEWayBillSlipHtml(company, attachedInvoice, transportOptions);

      expect(JSON.stringify(invoice)).toBe(beforeInvoice);
      expect(JSON.stringify(attachedInvoice)).toBe(beforeAttached);
      expect(JSON.stringify(company)).toBe(beforeCompany);
      expect(JSON.stringify(transportOptions)).toBe(beforeOptions);
    });

    it('verifies generateExpenseVoucherHtml does not mutate the expense or company', () => {
      const expense = createMockExpense();
      const attachedExpense = attachPaiseFields(createMockExpense(), 'expense');
      const company = { ...mockCompany };

      const beforeExpense = JSON.stringify(expense);
      const beforeAttached = JSON.stringify(attachedExpense);
      const beforeCompany = JSON.stringify(company);

      generateExpenseVoucherHtml(company, expense);
      generateExpenseVoucherHtml(company, attachedExpense);

      expect(JSON.stringify(expense)).toBe(beforeExpense);
      expect(JSON.stringify(attachedExpense)).toBe(beforeAttached);
      expect(JSON.stringify(company)).toBe(beforeCompany);
    });
  });
});
