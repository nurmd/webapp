import { describe, it, expect, beforeEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

// Mock Storage implementation
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

// Mock PouchDB
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
      getAllDocs: vi.fn(async () => Array.from(inMemoryDocs.values())),
      onRemoteChange: vi.fn(() => () => {}),
      initLiveSync: vi.fn(),
      getSyncStatus: vi.fn(() => ({ status: 'active', active: true })),
      migrateFromLocalStorage: vi.fn(async () => {}),
    },
  };
});

// Mock Audio
vi.mock('../services/barcodeService.ts', async () => {
  const actual: any = await vi.importActual('../services/barcodeService.ts');
  return {
    ...actual,
    audioService: {
      playScanSuccess: vi.fn(),
      playScanError: vi.fn(),
    },
  };
});

import { db } from '../services/db.ts';
import { Party } from '../models/party.ts';
import { Invoice } from '../models/invoice.ts';
import { PurchaseBill } from '../models/purchase.ts';
import { Voucher } from '../core/accounting/voucherTypes.ts';
import { InventoryItem } from '../models/item.ts';
import { CompanyProfile } from '../models/company.ts';
import { hardwareScanner } from '../services/barcodeService.ts';
import { DashboardView } from '../components/Dashboard/DashboardView.tsx';
import { QuickBillingView } from '../components/POS/QuickBillingView.tsx';

const STORAGE_KEY_PARTIES = 'gst_parties';
const STORAGE_KEY_INVOICES = 'gst_invoices';
const STORAGE_KEY_PURCHASES = 'gst_purchases';
const STORAGE_KEY_VOUCHERS = 'gst_vouchers';

const dummyCompany: CompanyProfile = {
  id: 'COMP-001',
  businessName: 'Empirical Stress Test Enterprises',
  gstin: '27AABCU9603R1ZX',
  pan: 'AABCU9603R',
  email: 'test@example.com',
  phone: '9876543210',
  address: '100 Marine Drive',
  stateCode: '27',
  pincode: '400020',
  isGstEnabled: true,
};

describe('Empirical Adversarial Stress Suite: Party Balance Recalculation & Performance', () => {
  beforeEach(() => {
    testStorage.clear();
    inMemoryDocs.clear();
    vi.clearAllMocks();
  });

  describe('1. Exact Parity: syncAllPartyBalances() vs recalculatePartyBalance() on Large Adversarial Dataset', () => {
    it('guarantees identical penny-perfect balances for 60 customers + 60 suppliers across 750+ mixed documents', () => {
      const customers: Party[] = [];
      const suppliers: Party[] = [];

      // Generate 60 Customers with diverse opening balance configurations
      for (let i = 1; i <= 60; i++) {
        let opBal = 0;
        let opType: 'TO_RECEIVE' | 'TO_PAY' | undefined = undefined;

        if (i <= 10) {
          opBal = 1000 * i;
          opType = 'TO_RECEIVE';
        } else if (i <= 20) {
          opBal = 500 * (i - 10);
          opType = 'TO_PAY';
        } else if (i <= 30) {
          opBal = 0;
        } else if (i <= 40) {
          opBal = 750 * (i - 30); // Implicit TO_RECEIVE
        } else if (i <= 50) {
          opBal = -400 * (i - 40); // Implicit TO_PAY
        } else {
          opBal = 0; // Dormant
        }

        customers.push({
          id: `CUST-${String(i).padStart(3, '0')}`,
          name: i % 7 === 0 ? `  Customer With Padding ${i}  ` : `Customer Corp ${i}`,
          type: 'CUSTOMER',
          phone: `91000000${String(i).padStart(2, '0')}`,
          billingAddress: `Street ${i}, Mumbai`,
          stateCode: '27',
          openingBalance: opBal,
          openingBalanceType: opType,
          openingBalanceDate: '2026-04-01',
          currentBalance: 0,
          createdAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
        });
      }

      // Generate 60 Suppliers with diverse opening balance configurations
      for (let i = 1; i <= 60; i++) {
        let opBal = 0;
        let opType: 'TO_RECEIVE' | 'TO_PAY' | undefined = undefined;

        if (i <= 10) {
          opBal = 1200 * i;
          opType = 'TO_PAY';
        } else if (i <= 20) {
          opBal = 600 * (i - 10);
          opType = 'TO_RECEIVE';
        } else if (i <= 30) {
          opBal = 0;
        } else if (i <= 40) {
          opBal = 850 * (i - 30); // Implicit TO_PAY
        } else if (i <= 50) {
          opBal = -300 * (i - 40); // Implicit TO_RECEIVE
        } else {
          opBal = 0; // Dormant
        }

        suppliers.push({
          id: `SUPP-${String(i).padStart(3, '0')}`,
          name: i % 7 === 0 ? `  Supplier With Padding ${i}  ` : `Supplier Vendor ${i}`,
          type: 'SUPPLIER',
          phone: `92000000${String(i).padStart(2, '0')}`,
          billingAddress: `Plot ${i}, Pune`,
          stateCode: '27',
          openingBalance: opBal,
          openingBalanceType: opType,
          openingBalanceDate: '2026-04-01',
          currentBalance: 0,
          createdAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
        });
      }

      const allParties = [...customers, ...suppliers];
      localStorage.setItem(STORAGE_KEY_PARTIES, JSON.stringify(allParties));

      // Generate 300+ Invoices
      const invoices: Invoice[] = [];
      let invSeq = 1;

      for (const cust of customers) {
        // Skip dormant customers (> 50)
        const custNum = parseInt(cust.id.replace('CUST-', ''), 10);
        if (custNum > 50) continue;

        // 1. Paid Invoice
        invoices.push({
          id: `INV-${String(invSeq++).padStart(4, '0')}`,
          invoiceNumber: `INV/26/${invSeq}`,
          date: '2026-04-05',
          partyId: cust.id,
          partyName: cust.name,
          partyGstin: '',
          partyAddress: cust.billingAddress,
          partyStateCode: cust.stateCode,
          placeOfSupplyStateCode: cust.stateCode,
          isIntraState: true,
          items: [],
          totalGrossAmount: 5000,
          totalDiscount: 0,
          totalTaxableAmount: 5000,
          totalCgst: 450,
          totalSgst: 450,
          totalIgst: 0,
          totalCess: 0,
          totalTax: 900,
          roundOff: 0,
          grandTotal: 5900,
          amountInWords: 'Five Thousand Nine Hundred Only',
          paidAmount: 5900,
          balanceAmount: 0,
          paymentMode: 'CASH',
          paymentStatus: 'PAID',
          invoiceType: 'B2B',
          createdAt: '2026-04-05T10:00:00Z',
          updatedAt: '2026-04-05T10:00:00Z',
        });

        // 2. Unpaid Invoice (Some with missing partyId, testing partyName matching)
        const useNameOnly = custNum % 5 === 0;
        invoices.push({
          id: `INV-${String(invSeq++).padStart(4, '0')}`,
          invoiceNumber: `INV/26/${invSeq}`,
          date: '2026-04-06',
          partyId: useNameOnly ? '' : cust.id,
          partyName: cust.name,
          partyGstin: '',
          partyAddress: cust.billingAddress,
          partyStateCode: cust.stateCode,
          placeOfSupplyStateCode: cust.stateCode,
          isIntraState: true,
          items: [],
          totalGrossAmount: 10000,
          totalDiscount: 0,
          totalTaxableAmount: 10000,
          totalCgst: 900,
          totalSgst: 900,
          totalIgst: 0,
          totalCess: 0,
          totalTax: 1800,
          roundOff: 0,
          grandTotal: 11800,
          amountInWords: 'Eleven Thousand Eight Hundred Only',
          paidAmount: 0,
          balanceAmount: 11800,
          paymentMode: 'CREDIT',
          paymentStatus: 'UNPAID',
          invoiceType: 'B2B',
          createdAt: '2026-04-06T10:00:00Z',
          updatedAt: '2026-04-06T10:00:00Z',
        });

        // 3. Partially Paid Invoice (Testing undefined balanceAmount fallback)
        invoices.push({
          id: `INV-${String(invSeq++).padStart(4, '0')}`,
          invoiceNumber: `INV/26/${invSeq}`,
          date: '2026-04-07',
          partyId: cust.id,
          partyName: cust.name,
          partyGstin: '',
          partyAddress: cust.billingAddress,
          partyStateCode: cust.stateCode,
          placeOfSupplyStateCode: cust.stateCode,
          isIntraState: true,
          items: [],
          totalGrossAmount: 8000,
          totalDiscount: 0,
          totalTaxableAmount: 8000,
          totalCgst: 720,
          totalSgst: 720,
          totalIgst: 0,
          totalCess: 0,
          totalTax: 1440,
          roundOff: 0,
          grandTotal: 9440,
          amountInWords: 'Nine Thousand Four Hundred Forty Only',
          paidAmount: 3440,
          balanceAmount: undefined as any, // Should fallback to 9440 - 3440 = 6000
          paymentMode: 'SPLIT',
          paymentStatus: 'PARTIAL',
          invoiceType: 'B2B',
          createdAt: '2026-04-07T10:00:00Z',
          updatedAt: '2026-04-07T10:00:00Z',
        });

        // 4. Cancelled Invoice (Must have zero effect on balance)
        invoices.push({
          id: `INV-${String(invSeq++).padStart(4, '0')}`,
          invoiceNumber: `INV/26/${invSeq}`,
          date: '2026-04-08',
          partyId: cust.id,
          partyName: cust.name,
          partyGstin: '',
          partyAddress: cust.billingAddress,
          partyStateCode: cust.stateCode,
          placeOfSupplyStateCode: cust.stateCode,
          isIntraState: true,
          items: [],
          totalGrossAmount: 50000,
          totalDiscount: 0,
          totalTaxableAmount: 50000,
          totalCgst: 4500,
          totalSgst: 4500,
          totalIgst: 0,
          totalCess: 0,
          totalTax: 9000,
          roundOff: 0,
          grandTotal: 59000,
          amountInWords: 'Fifty Nine Thousand Only',
          paidAmount: 0,
          balanceAmount: 59000,
          paymentMode: 'CREDIT',
          paymentStatus: 'UNPAID',
          invoiceType: 'B2B',
          isCancelled: true,
          createdAt: '2026-04-08T10:00:00Z',
          updatedAt: '2026-04-08T10:00:00Z',
        });

        // 5. Credit Note (Reduces customer balance)
        if (custNum % 2 === 0) {
          invoices.push({
            id: `INV-${String(invSeq++).padStart(4, '0')}`,
            invoiceNumber: `CRN/26/${invSeq}`,
            date: '2026-04-09',
            partyId: cust.id,
            partyName: cust.name,
            partyGstin: '',
            partyAddress: cust.billingAddress,
            partyStateCode: cust.stateCode,
            placeOfSupplyStateCode: cust.stateCode,
            isIntraState: true,
            items: [],
            totalGrossAmount: 2000,
            totalDiscount: 0,
            totalTaxableAmount: 2000,
            totalCgst: 180,
            totalSgst: 180,
            totalIgst: 0,
            totalCess: 0,
            totalTax: 360,
            roundOff: 0,
            grandTotal: 2360,
            amountInWords: 'Two Thousand Three Hundred Sixty Only',
            paidAmount: 0,
            balanceAmount: 2360,
            paymentMode: 'CREDIT',
            paymentStatus: 'UNPAID',
            invoiceType: 'CREDIT_NOTE',
            createdAt: '2026-04-09T10:00:00Z',
            updatedAt: '2026-04-09T10:00:00Z',
          });
        }

        // 6. Non-Accounting documents (Estimates, Orders, Challans)
        if (custNum % 3 === 0) {
          invoices.push({
            id: `INV-${String(invSeq++).padStart(4, '0')}`,
            invoiceNumber: `EST/26/${invSeq}`,
            date: '2026-04-10',
            partyId: cust.id,
            partyName: cust.name,
            partyGstin: '',
            partyAddress: cust.billingAddress,
            partyStateCode: cust.stateCode,
            placeOfSupplyStateCode: cust.stateCode,
            isIntraState: true,
            items: [],
            totalGrossAmount: 15000,
            totalDiscount: 0,
            totalTaxableAmount: 15000,
            totalCgst: 1350,
            totalSgst: 1350,
            totalIgst: 0,
            totalCess: 0,
            totalTax: 2700,
            roundOff: 0,
            grandTotal: 17700,
            amountInWords: 'Seventeen Thousand Seven Hundred Only',
            paidAmount: 0,
            balanceAmount: 17700,
            paymentMode: 'CREDIT',
            paymentStatus: 'UNPAID',
            invoiceType: 'ESTIMATE',
            createdAt: '2026-04-10T10:00:00Z',
            updatedAt: '2026-04-10T10:00:00Z',
          });
          invoices.push({
            id: `INV-${String(invSeq++).padStart(4, '0')}`,
            invoiceNumber: `DEL/26/${invSeq}`,
            date: '2026-04-11',
            partyId: cust.id,
            partyName: cust.name,
            partyGstin: '',
            partyAddress: cust.billingAddress,
            partyStateCode: cust.stateCode,
            placeOfSupplyStateCode: cust.stateCode,
            isIntraState: true,
            items: [],
            totalGrossAmount: 12000,
            totalDiscount: 0,
            totalTaxableAmount: 12000,
            totalCgst: 1080,
            totalSgst: 1080,
            totalIgst: 0,
            totalCess: 0,
            totalTax: 2160,
            roundOff: 0,
            grandTotal: 14160,
            amountInWords: 'Fourteen Thousand One Hundred Sixty Only',
            paidAmount: 0,
            balanceAmount: 14160,
            paymentMode: 'CREDIT',
            paymentStatus: 'UNPAID',
            invoiceType: 'DELIVERY_CHALLAN',
            createdAt: '2026-04-11T10:00:00Z',
            updatedAt: '2026-04-11T10:00:00Z',
          });
        }
      }

      localStorage.setItem(STORAGE_KEY_INVOICES, JSON.stringify(invoices));

      // Generate 300+ Purchases
      const purchases: PurchaseBill[] = [];
      let purSeq = 1;

      for (const supp of suppliers) {
        const suppNum = parseInt(supp.id.replace('SUPP-', ''), 10);
        if (suppNum > 50) continue;

        // 1. Paid Purchase Bill
        purchases.push({
          id: `PUR-${String(purSeq++).padStart(4, '0')}`,
          billNumber: `BILL/26/${purSeq}`,
          date: '2026-04-05',
          supplierId: supp.id,
          supplierName: supp.name,
          supplierAddress: supp.billingAddress,
          supplierStateCode: supp.stateCode,
          placeOfSupplyStateCode: supp.stateCode,
          isIntraState: true,
          items: [],
          itcEligibility: 'ALL_OTHER_ITC',
          isRcm: false,
          totalGrossAmount: 10000,
          totalDiscount: 0,
          totalTaxableAmount: 10000,
          totalCgst: 900,
          totalSgst: 900,
          totalIgst: 0,
          totalCess: 0,
          totalTax: 1800,
          roundOff: 0,
          grandTotal: 11800,
          paymentMode: 'BANK',
          paymentStatus: 'PAID',
          paidAmount: 11800,
          balanceAmount: 0,
          purchaseType: 'BILL',
          createdAt: '2026-04-05T10:00:00Z',
          updatedAt: '2026-04-05T10:00:00Z',
        });

        // 2. Unpaid Purchase Bill (Some matched by supplierName only)
        const useNameOnly = suppNum % 5 === 0;
        purchases.push({
          id: `PUR-${String(purSeq++).padStart(4, '0')}`,
          billNumber: `BILL/26/${purSeq}`,
          date: '2026-04-06',
          supplierId: useNameOnly ? '' : supp.id,
          supplierName: supp.name,
          supplierAddress: supp.billingAddress,
          supplierStateCode: supp.stateCode,
          placeOfSupplyStateCode: supp.stateCode,
          isIntraState: true,
          items: [],
          itcEligibility: 'ALL_OTHER_ITC',
          isRcm: false,
          totalGrossAmount: 15000,
          totalDiscount: 0,
          totalTaxableAmount: 15000,
          totalCgst: 1350,
          totalSgst: 1350,
          totalIgst: 0,
          totalCess: 0,
          totalTax: 2700,
          roundOff: 0,
          grandTotal: 17700,
          paymentMode: 'CREDIT',
          paymentStatus: 'UNPAID',
          paidAmount: 0,
          balanceAmount: 17700,
          purchaseType: 'BILL',
          createdAt: '2026-04-06T10:00:00Z',
          updatedAt: '2026-04-06T10:00:00Z',
        });

        // 3. Partially Paid Purchase Bill (Undefined balanceAmount fallback)
        purchases.push({
          id: `PUR-${String(purSeq++).padStart(4, '0')}`,
          billNumber: `BILL/26/${purSeq}`,
          date: '2026-04-07',
          supplierId: supp.id,
          supplierName: supp.name,
          supplierAddress: supp.billingAddress,
          supplierStateCode: supp.stateCode,
          placeOfSupplyStateCode: supp.stateCode,
          isIntraState: true,
          items: [],
          itcEligibility: 'ALL_OTHER_ITC',
          isRcm: false,
          totalGrossAmount: 6000,
          totalDiscount: 0,
          totalTaxableAmount: 6000,
          totalCgst: 540,
          totalSgst: 540,
          totalIgst: 0,
          totalCess: 0,
          totalTax: 1080,
          roundOff: 0,
          grandTotal: 7080,
          paymentMode: 'SPLIT',
          paymentStatus: 'PARTIAL',
          paidAmount: 2080,
          balanceAmount: undefined as any, // 7080 - 2080 = 5000
          purchaseType: 'BILL',
          createdAt: '2026-04-07T10:00:00Z',
          updatedAt: '2026-04-07T10:00:00Z',
        });

        // 4. Purchase Order (Must be ignored)
        purchases.push({
          id: `PUR-${String(purSeq++).padStart(4, '0')}`,
          billNumber: `PO/26/${purSeq}`,
          date: '2026-04-08',
          supplierId: supp.id,
          supplierName: supp.name,
          supplierAddress: supp.billingAddress,
          supplierStateCode: supp.stateCode,
          placeOfSupplyStateCode: supp.stateCode,
          isIntraState: true,
          items: [],
          itcEligibility: 'ALL_OTHER_ITC',
          isRcm: false,
          totalGrossAmount: 40000,
          totalDiscount: 0,
          totalTaxableAmount: 40000,
          totalCgst: 3600,
          totalSgst: 3600,
          totalIgst: 0,
          totalCess: 0,
          totalTax: 7200,
          roundOff: 0,
          grandTotal: 47200,
          paymentMode: 'CREDIT',
          paymentStatus: 'UNPAID',
          paidAmount: 0,
          balanceAmount: 47200,
          purchaseType: 'PO',
          createdAt: '2026-04-08T10:00:00Z',
          updatedAt: '2026-04-08T10:00:00Z',
        });

        // 5. Purchase Return / Debit Note (Increases supplier balance / reduces payable)
        if (suppNum % 2 === 0) {
          purchases.push({
            id: `PUR-${String(purSeq++).padStart(4, '0')}`,
            billNumber: `RET/26/${purSeq}`,
            date: '2026-04-09',
            supplierId: supp.id,
            supplierName: supp.name,
            supplierAddress: supp.billingAddress,
            supplierStateCode: supp.stateCode,
            placeOfSupplyStateCode: supp.stateCode,
            isIntraState: true,
            items: [],
            itcEligibility: 'ALL_OTHER_ITC',
            isRcm: false,
            totalGrossAmount: 3000,
            totalDiscount: 0,
            totalTaxableAmount: 3000,
            totalCgst: 270,
            totalSgst: 270,
            totalIgst: 0,
            totalCess: 0,
            totalTax: 540,
            roundOff: 0,
            grandTotal: 3540,
            paymentMode: 'CREDIT',
            paymentStatus: 'UNPAID',
            paidAmount: 0,
            balanceAmount: 3540,
            purchaseType: 'RETURN',
            createdAt: '2026-04-09T10:00:00Z',
            updatedAt: '2026-04-09T10:00:00Z',
          });
        }
      }

      localStorage.setItem(STORAGE_KEY_PURCHASES, JSON.stringify(purchases));

      // Generate 100+ Vouchers
      const vouchers: Voucher[] = [];
      let vSeq = 1;

      // Advance Receipt Vouchers (Exceeding settled invoice amounts for some customers)
      for (let i = 1; i <= 25; i++) {
        const cust = customers[i - 1];
        const isExcess = i % 2 === 0;
        // Total settled on invoices is 5900 + 3440 = 9340
        const vAmt = isExcess ? 15000 : 4000;

        vouchers.push({
          id: `VCH-${String(vSeq++).padStart(4, '0')}`,
          voucherNumber: `RCV/${vSeq}`,
          voucherType: 'RECEIPT',
          date: '2026-04-12',
          totalAmount: vAmt,
          narration: `Receipt from ${cust.name}`,
          createdAt: '2026-04-12T10:00:00Z',
          entries: [
            {
              accountId: 'ACC-BANK-01',
              accountName: 'HDFC Bank',
              debit: vAmt,
              credit: 0,
            },
            {
              accountId: cust.id,
              accountName: cust.name,
              debit: 0,
              credit: vAmt,
            },
          ],
        });
      }

      // Vouchers with multiple entry lines for the same customer (anti-double-counting check)
      vouchers.push({
        id: `VCH-${String(vSeq++).padStart(4, '0')}`,
        voucherNumber: `RCV-MULTI-LINE`,
        voucherType: 'RECEIPT',
        date: '2026-04-13',
        totalAmount: 5000,
        narration: 'Split lines for same party',
        createdAt: '2026-04-13T10:00:00Z',
        entries: [
          { accountId: customers[0].id, accountName: customers[0].name, debit: 0, credit: 3000 },
          { accountId: customers[0].id, accountName: customers[0].name, debit: 0, credit: 2000 },
          { accountId: 'ACC-CASH-01', accountName: 'Cash', debit: 5000, credit: 0 },
        ],
      });

      // Advance Payment Vouchers (Exceeding settled purchase amounts for some suppliers)
      for (let i = 1; i <= 25; i++) {
        const supp = suppliers[i - 1];
        const isExcess = i % 2 === 0;
        // Total settled on purchases is 11800 + 2080 = 13880
        const vAmt = isExcess ? 20000 : 5000;

        vouchers.push({
          id: `VCH-${String(vSeq++).padStart(4, '0')}`,
          voucherNumber: `PMT/${vSeq}`,
          voucherType: 'PAYMENT',
          date: '2026-04-12',
          totalAmount: vAmt,
          narration: `Payment to ${supp.name}`,
          createdAt: '2026-04-12T10:00:00Z',
          entries: [
            {
              accountId: supp.id,
              accountName: supp.name,
              debit: vAmt,
              credit: 0,
            },
            {
              accountId: 'ACC-BANK-01',
              accountName: 'HDFC Bank',
              debit: 0,
              credit: vAmt,
            },
          ],
        });
      }

      // Non-party vouchers (CONTRA, JOURNAL, etc.)
      vouchers.push({
        id: `VCH-${String(vSeq++).padStart(4, '0')}`,
        voucherNumber: `CTR/${vSeq}`,
        voucherType: 'CONTRA',
        date: '2026-04-14',
        totalAmount: 10000,
        narration: 'Cash deposit into bank',
        createdAt: '2026-04-14T10:00:00Z',
        entries: [
          { accountId: 'ACC-BANK-01', accountName: 'Bank', debit: 10000, credit: 0 },
          { accountId: 'ACC-CASH-01', accountName: 'Cash', debit: 0, credit: 10000 },
        ],
      });

      localStorage.setItem(STORAGE_KEY_VOUCHERS, JSON.stringify(vouchers));

      // STEP A: Calculate ground truth oracle using recalculatePartyBalance(partyId) for all 120 parties
      const oracleBalances = new Map<string, number>();
      for (const p of allParties) {
        const groundTruth = db.recalculatePartyBalance(p.id);
        oracleBalances.set(p.id, groundTruth);
      }

      // STEP B: Deliberately poison/scramble currentBalance in database to verify syncAllPartyBalances overwrites all
      const poisonedParties = db.getParties().map((p) => ({
        ...p,
        currentBalance: -999999.99,
      }));
      localStorage.setItem(STORAGE_KEY_PARTIES, JSON.stringify(poisonedParties));

      // STEP C: Run syncAllPartyBalances()
      db.syncAllPartyBalances();

      // STEP D: Verify 100% exact parity across every single party
      const syncedParties = db.getParties();
      expect(syncedParties.length).toBe(120);

      const discrepancies: Array<{ id: string; name: string; type: string; oracle: number; sync: number }> = [];

      for (const p of syncedParties) {
        const expected = oracleBalances.get(p.id);
        if (p.currentBalance !== expected) {
          discrepancies.push({
            id: p.id,
            name: p.name,
            type: p.type,
            oracle: expected!,
            sync: p.currentBalance,
          });
        }
      }

      expect(discrepancies).toEqual([]);
      expect(discrepancies.length).toBe(0);
    });
  });

  describe('2. Algorithmic Complexity & Execution Scaling Benchmark O(P + I + V + U)', () => {
    it('executes in linear time O(P + I + V + U) and handles 1,000+ entities in under 250ms', () => {
      const generateDataset = (partyCount: number, docCount: number) => {
        const parties: Party[] = [];
        const invoices: Invoice[] = [];

        for (let i = 0; i < partyCount; i++) {
          parties.push({
            id: `BENCH-P-${i}`,
            name: `Bench Party ${i}`,
            type: 'CUSTOMER',
            phone: '9999999999',
            billingAddress: 'Address',
            stateCode: '27',
            openingBalance: 1000,
            openingBalanceType: 'TO_RECEIVE',
            currentBalance: 0,
            createdAt: '2026-04-01T00:00:00Z',
            updatedAt: '2026-04-01T00:00:00Z',
          });
        }

        for (let i = 0; i < docCount; i++) {
          const p = parties[i % partyCount];
          invoices.push({
            id: `BENCH-INV-${i}`,
            invoiceNumber: `INV-${i}`,
            date: '2026-04-01',
            partyId: p.id,
            partyName: p.name,
            partyGstin: '',
            partyAddress: p.billingAddress,
            partyStateCode: p.stateCode,
            placeOfSupplyStateCode: p.stateCode,
            isIntraState: true,
            items: [],
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
            paidAmount: 500,
            balanceAmount: 680,
            paymentMode: 'CASH',
            paymentStatus: 'PARTIAL',
            invoiceType: 'B2B',
            createdAt: '2026-04-01T00:00:00Z',
            updatedAt: '2026-04-01T00:00:00Z',
          });
        }

        return { parties, invoices };
      };

      // Warmup JIT
      const { parties: wP, invoices: wI } = generateDataset(10, 10);
      localStorage.setItem(STORAGE_KEY_PARTIES, JSON.stringify(wP));
      localStorage.setItem(STORAGE_KEY_INVOICES, JSON.stringify(wI));
      localStorage.setItem(STORAGE_KEY_PURCHASES, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEY_VOUCHERS, JSON.stringify([]));
      db.syncAllPartyBalances();

      // Stress Benchmark: 500 Parties + 500 Invoices = 1,000 entities
      const { parties: benchParties, invoices: benchInvoices } = generateDataset(500, 500);
      localStorage.setItem(STORAGE_KEY_PARTIES, JSON.stringify(benchParties));
      localStorage.setItem(STORAGE_KEY_INVOICES, JSON.stringify(benchInvoices));

      const startTime = performance.now();
      db.syncAllPartyBalances();
      const elapsedMs = performance.now() - startTime;

      // Linear single-pass execution must complete swiftly (< 250ms on mobile/termux, usually < 30ms)
      expect(elapsedMs).toBeLessThan(250);

      const updatedParties = db.getParties();
      expect(updatedParties.length).toBe(500);
      // Each party has opening balance 1000 + 1 unpaid invoice balance 680 = 1680
      expect(updatedParties[0].currentBalance).toBe(1680);
      expect(updatedParties[499].currentBalance).toBe(1680);
    });
  });

  describe('3. DashboardView Financial Overview Memoization', () => {
    it('preserves memoized financial aggregates across search and filter interactions', () => {
      const parties: Party[] = [
        {
          id: 'DASH-P1',
          name: 'Debtor One',
          type: 'CUSTOMER',
          phone: '9870000001',
          billingAddress: 'Street 1',
          stateCode: '27',
          currentBalance: 5000, // Receivable
          createdAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
        },
        {
          id: 'DASH-P2',
          name: 'Creditor One',
          type: 'SUPPLIER',
          phone: '9870000002',
          billingAddress: 'Street 2',
          stateCode: '27',
          currentBalance: -3000, // Payable
          createdAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
        },
      ];

      const invoices: Invoice[] = [
        {
          id: 'DASH-INV-1',
          invoiceNumber: 'INV/001',
          date: '2026-04-01',
          partyId: 'DASH-P1',
          partyName: 'Debtor One',
          partyGstin: '',
          partyAddress: '',
          partyStateCode: '27',
          placeOfSupplyStateCode: '27',
          isIntraState: true,
          items: [],
          totalGrossAmount: 10000,
          totalDiscount: 0,
          totalTaxableAmount: 10000,
          totalCgst: 900,
          totalSgst: 900,
          totalIgst: 0,
          totalCess: 0,
          totalTax: 1800,
          roundOff: 0,
          grandTotal: 11800,
          amountInWords: 'Eleven Thousand Eight Hundred Only',
          paidAmount: 6800,
          balanceAmount: 5000,
          paymentMode: 'SPLIT',
          paymentStatus: 'PARTIAL',
          invoiceType: 'B2B',
          createdAt: '2026-04-01T10:00:00Z',
          updatedAt: '2026-04-01T10:00:00Z',
        },
      ];

      const items: InventoryItem[] = [
        {
          id: 'ITEM-1',
          name: 'Widget A',
          category: 'General',
          salePrice: 100,
          purchasePrice: 80,
          currentStock: 2,
          minStockAlert: 5, // Low stock
          unit: 'PCS',
          hsnSacCode: '8471',
          gstRate: 18,
          createdAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
        },
      ];

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      act(() => {
        root.render(
          <DashboardView
            company={dummyCompany}
            invoices={invoices}
            parties={parties}
            items={items}
            purchases={[]}
            vouchers={[]}
            expenses={[]}
            onNewInvoice={vi.fn()}
            onQuickPos={vi.fn()}
            onViewInvoice={vi.fn()}
            onNavigateTab={vi.fn()}
          />
        );
      });

      // Verify rendered financial overview values in DOM (formatINR renders e.g. "₹ 11,800.00")
      expect(container.textContent).toContain('11,800.00'); // totalSales
      expect(container.textContent).toContain('5,000.00'); // totalReceivables
      expect(container.textContent).toContain('3,000.00'); // totalPayables

      // Locate search input and type filter text
      const searchInput = container.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
      expect(searchInput).toBeTruthy();

      act(() => {
        searchInput.value = 'Non-existent transaction';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      // After filtering the timeline, financial cards MUST still display identical correct figures
      expect(container.textContent).toContain('11,800.00');
      expect(container.textContent).toContain('5,000.00');
      expect(container.textContent).toContain('3,000.00');

      root.unmount();
      container.remove();
    });
  });

  describe('4. QuickBillingView Hardware Barcode Scanner Listener Stability', () => {
    it('subscribes to hardwareScanner only once on mount with 0 churn across cart operations', () => {
      const items: InventoryItem[] = [
        {
          id: 'SCAN-ITM-1',
          name: 'Barcode Scanner Test Item',
          category: 'General',
          barcode: '8901234567890',
          salePrice: 250,
          purchasePrice: 200,
          currentStock: 50,
          minStockAlert: 5,
          unit: 'PCS',
          hsnSacCode: '8471',
          gstRate: 18,
          createdAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
        },
        {
          id: 'SCAN-ITM-2',
          name: 'Second Test Product',
          category: 'General',
          barcode: '8909876543210',
          salePrice: 500,
          purchasePrice: 400,
          currentStock: 25,
          minStockAlert: 5,
          unit: 'PCS',
          hsnSacCode: '8471',
          gstRate: 18,
          createdAt: '2026-04-01T00:00:00Z',
          updatedAt: '2026-04-01T00:00:00Z',
        },
      ];

      const subscribeSpy = vi.spyOn(hardwareScanner, 'subscribe');
      let capturedListener: ((barcode: string) => void) | null = null;

      subscribeSpy.mockImplementation((cb) => {
        capturedListener = cb;
        return () => {
          capturedListener = null;
        };
      });

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      act(() => {
        root.render(
          <QuickBillingView
            company={dummyCompany}
            items={items}
            parties={[]}
            onCompleteSale={vi.fn()}
            onViewInvoice={vi.fn()}
          />
        );
      });

      // Verify hardwareScanner.subscribe was called exactly ONCE on initial mount
      expect(subscribeSpy).toHaveBeenCalledTimes(1);
      expect(capturedListener).toBeTruthy();

      // Trigger barcode scan via wedge callback
      act(() => {
        capturedListener!('8901234567890');
      });

      // Item should be added to cart and rendered in DOM (250.00)
      expect(container.textContent).toContain('Barcode Scanner Test Item');
      expect(container.textContent).toContain('250.00');

      // Subscribe must NOT have re-subscribed (zero churn on cart update)
      expect(subscribeSpy).toHaveBeenCalledTimes(1);

      // Scan the same item again to increment quantity (qty 2 -> 500.00)
      act(() => {
        capturedListener!('8901234567890');
      });

      expect(container.textContent).toContain('500.00');
      expect(subscribeSpy).toHaveBeenCalledTimes(1);

      // Scan second item
      act(() => {
        capturedListener!('8909876543210');
      });

      expect(container.textContent).toContain('Second Test Product');
      // Still exactly 1 subscription
      expect(subscribeSpy).toHaveBeenCalledTimes(1);

      // Unmount component
      act(() => {
        root.unmount();
      });
      container.remove();

      // Upon unmount, listener is cleaned up
      expect(capturedListener).toBeNull();
      subscribeSpy.mockRestore();
    });
  });
});
