import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

// In-memory test storage
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

const inMemoryDocs = new Map<string, any>();

vi.mock('../services/pouchdb.ts', () => ({
  pouch: {
    putDoc: vi.fn(async (type: string, doc: any) => {
      inMemoryDocs.set(`${type}:${doc.id}`, { ...doc, docType: type });
      return { ok: true };
    }),
    deleteDoc: vi.fn(async (type: string, id: string) => {
      inMemoryDocs.delete(`${type}:${id}`);
      return { ok: true };
    }),
    getAllDocs: vi.fn(async (type: string) => {
      const prefix = `${type}:`;
      return Array.from(inMemoryDocs.entries())
        .filter(([k]) => k.startsWith(prefix))
        .map(([, v]) => ({ ...v }));
    }),
    getSyncState: vi.fn(() => ({ isSyncing: false, isOnline: true })),
    subscribeSync: vi.fn(() => () => {}),
    syncNow: vi.fn(async () => ({ ok: true })),
    startSync: vi.fn(),
    stopSync: vi.fn(),
    migrateFromLocalStorage: vi.fn(async () => {}),
  },
}));

import { db } from '../services/db.ts';
import { STORAGE_KEYS } from '../services/db/storageEngine.ts';
import { Party } from '../models/party.ts';
import { InventoryItem } from '../models/item.ts';
import { Invoice } from '../models/invoice.ts';
import { PurchaseBill } from '../models/purchase.ts';
import { Voucher } from '../core/accounting/voucherTypes.ts';
import { CompanyProfile } from '../models/company.ts';
import { auditAllPartyBalances, reconcilePartyBalances } from '../core/audit/financialBalanceAuditor.ts';
import { auditAllItemStock, reconcileItemStock } from '../core/audit/inventoryStockAuditor.ts';
import { usePartyPassbook } from '../components/Parties/usePartyPassbook.ts';

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

describe('Financial Balance and Inventory Stock Auditors', () => {
  beforeEach(() => {
    testStorage.clear();
    db.clearMemoryCache();
    inMemoryDocs.clear();
    vi.clearAllMocks();
  });

  describe('Party Passbook Overpayment & Voucher Retention Bug Fix', () => {
    it('preserves receipt vouchers referencing invoice numbers and does not suppress them as duplicate invoices', () => {
      const party: Party = {
        id: 'PARTY-001',
        name: 'Amit Patel',
        phone: '9876543210',
        type: 'CUSTOMER',
        stateCode: '27',
        billingAddress: 'Station Road',
        currentBalance: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };

      const invoice: Invoice = {
        id: 'INV-001',
        invoiceNumber: 'INV-2026-001',
        invoiceType: 'B2CS',
        partyId: party.id,
        partyName: party.name,
        partyAddress: 'Station Road',
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        date: '2026-01-10',
        dueDate: '2026-01-20',
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
        paymentMode: 'CASH',
        paymentStatus: 'PAID',
        paidAmount: 1180,
        balanceAmount: 0,
        createdAt: '2026-01-10T10:00:00.000Z',
        updatedAt: '2026-01-10T10:00:00.000Z',
      };

      // Payment voucher created for the invoice with referenceNo matching invoiceNumber
      const paymentVoucher: Voucher = {
        id: 'VOUCHER-001',
        voucherNumber: 'RCT-001',
        voucherType: 'RECEIPT',
        date: '2026-01-10',
        totalAmount: 1500, // Overpayment: cash tendered 1500 > balance 1180
        referenceNo: 'INV-2026-001', // References invoice number
        narration: 'Cash received for INV-2026-001',
        entries: [
          { accountId: 'ACC_CASH', accountName: 'Cash', debit: 1500, credit: 0 },
          { accountId: party.id, accountName: party.name, debit: 0, credit: 1500 },
        ],
        createdAt: '2026-01-10T10:05:00.000Z',
      };

      const harness = renderPassbookHook({
        party,
        company: dummyCompany,
        invoices: [invoice],
        purchases: [],
        vouchers: [paymentVoucher],
      });

      const passbook = harness.result().passbook;

      // Both the invoice debit (1180) and receipt credit (1500) must appear!
      const invRow = passbook.find((t: any) => t.docNumber === 'INV-2026-001');
      const voucherRow = passbook.find((t: any) => t.docNumber === 'RCT-001');

      expect(invRow).toBeDefined();
      expect(invRow?.debit).toBe(1180);

      expect(voucherRow).toBeDefined();
      expect(voucherRow?.credit).toBe(1500);
      expect(voucherRow?.type).toBe('PAYMENT_IN');

      harness.unmount();
    });
  });

  describe('Financial Balance Auditor', () => {
    it('detects party balance discrepancies when recorded balance disagrees with transaction ground truth', () => {
      const party: Party = {
        id: 'PARTY-002',
        name: 'Rajesh Traders',
        phone: '9988776655',
        type: 'CUSTOMER',
        stateCode: '27',
        billingAddress: 'Market Yard',
        currentBalance: 500,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      db.saveParty(party);

      const invoice: Invoice = {
        id: 'INV-002',
        invoiceNumber: 'INV-2026-002',
        invoiceType: 'B2CS',
        partyId: party.id,
        partyName: party.name,
        partyAddress: 'Market Yard',
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        date: '2026-01-15',
        dueDate: '2026-01-25',
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
        createdAt: '2026-01-15T10:00:00.000Z',
        updatedAt: '2026-01-15T10:00:00.000Z',
      };
      db.saveInvoice(invoice);

      // Now simulate discrepancy by manually tampering party.currentBalance to 500
      const currentParties = db.getParties();
      const pIdx = currentParties.findIndex((p) => p.id === party.id);
      currentParties[pIdx].currentBalance = 500;
      testStorage.setItem('gst_parties', JSON.stringify(currentParties));

      // Audit should calculate computed balance = 2000, recorded = 500, variance = -1500
      const report = auditAllPartyBalances();
      expect(report.totalPartiesAudited).toBe(1);
      expect(report.discrepantPartiesCount).toBe(1);

      const discrepancy = report.discrepancies[0];
      expect(discrepancy.partyId).toBe(party.id);
      expect(discrepancy.recordedBalance).toBe(500);
      expect(discrepancy.computedBalance).toBe(2000);
      expect(discrepancy.discrepancy).toBe(-1500);
    });

    it('auto-reconciles party balances and fixes document balance arithmetic errors', async () => {
      const party: Party = {
        id: 'PARTY-003',
        name: 'Kavita Stores',
        phone: '9123456780',
        type: 'CUSTOMER',
        stateCode: '27',
        billingAddress: 'City Centre',
        currentBalance: 100, // Wrong balance
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      db.saveParty(party);

      // Invoice with arithmetic inconsistency: grandTotal 1000, paid 200, but balance recorded as 500 (should be 800)
      const corruptedInvoice: Invoice = {
        id: 'INV-003',
        invoiceNumber: 'INV-2026-003',
        invoiceType: 'B2CS',
        partyId: party.id,
        partyName: party.name,
        partyAddress: 'City Centre',
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        date: '2026-01-16',
        dueDate: '2026-01-26',
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
        amountInWords: 'One Thousand Only',
        paymentMode: 'CREDIT',
        paymentStatus: 'PARTIAL',
        paidAmount: 200,
        balanceAmount: 500, // Corrupted!
        createdAt: '2026-01-16T10:00:00.000Z',
        updatedAt: '2026-01-16T10:00:00.000Z',
      };
      db.saveInvoice(corruptedInvoice);
      // Simulate historical corruption in storage after save
      const corruptedList = db.getInvoices().map((inv) =>
        inv.id === corruptedInvoice.id ? { ...inv, balanceAmount: 500 } : inv
      );
      (db as any).set(STORAGE_KEYS.INVOICES, corruptedList);

      const reportBefore = auditAllPartyBalances();
      expect(reportBefore.inconsistentDocuments.length).toBe(1);

      const result = await reconcilePartyBalances(reportBefore);
      expect(result.reconciledCount).toBe(1);
      expect(result.repairedDocumentsCount).toBe(1);

      // Check repaired invoice balance
      const repairedInv = db.getInvoices().find((i) => i.id === corruptedInvoice.id);
      expect(repairedInv?.balanceAmount).toBe(800);

      // After auto-reconcile, audit report should have 0 discrepancies
      const reportAfter = auditAllPartyBalances();
      expect(reportAfter.discrepantPartiesCount).toBe(0);
      const updatedParty = db.getParties().find((p) => p.id === party.id);
      expect(updatedParty?.currentBalance).toBe(800);
    });
  });

  describe('Inventory Stock Auditor', () => {
    it('detects stock discrepancies between current catalog stock and actual transaction movements', () => {
      const item: InventoryItem = {
        id: 'ITEM-001',
        name: 'Basmati Rice 5kg',
        hsnSacCode: '1006',
        category: 'Groceries',
        unit: 'BAG',
        salePrice: 500,
        purchasePrice: 400,
        gstRate: 5,
        currentStock: 15,
        minStockAlert: 10,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      db.saveItem(item);

      // Purchase bill of 20 bags
      const purchase: PurchaseBill = {
        id: 'PUR-001',
        billNumber: 'BILL-001',
        supplierId: 'SUPP-001',
        supplierName: 'Agro Supplier',
        supplierAddress: 'APMC Market',
        supplierStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        itcEligibility: 'ALL_OTHER_ITC',
        isRcm: false,
        date: '2026-01-05',
        dueDate: '2026-01-15',
        items: [
          {
            itemId: item.id,
            name: item.name,
            hsnSacCode: '1006',
            unit: 'BAG',
            quantity: 20,
            unitPrice: 400,
            taxableAmount: 8000,
            gstRate: 5,
            cgstAmount: 200,
            sgstAmount: 200,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 8400,
          },
        ],
        totalGrossAmount: 8000,
        totalDiscount: 0,
        totalTaxableAmount: 8000,
        totalCgst: 200,
        totalSgst: 200,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 400,
        roundOff: 0,
        grandTotal: 8400,
        paymentMode: 'CASH',
        paymentStatus: 'PAID',
        paidAmount: 8400,
        balanceAmount: 0,
        createdAt: '2026-01-05T10:00:00.000Z',
        updatedAt: '2026-01-05T10:00:00.000Z',
      };
      db.savePurchase(purchase);

      // Sale invoice of 5 bags
      const invoice: Invoice = {
        id: 'INV-004',
        invoiceNumber: 'INV-2026-004',
        invoiceType: 'B2CS',
        partyId: 'PARTY-001',
        partyName: 'Amit Patel',
        partyAddress: 'Station Road',
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        date: '2026-01-08',
        dueDate: '2026-01-18',
        items: [
          {
            itemId: item.id,
            name: item.name,
            hsnSacCode: '1006',
            unit: 'BAG',
            quantity: 5,
            unitPrice: 500,
            taxableAmount: 2500,
            gstRate: 5,
            cgstAmount: 62.5,
            sgstAmount: 62.5,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 2625,
          },
        ],
        totalGrossAmount: 2500,
        totalDiscount: 0,
        totalTaxableAmount: 2500,
        totalCgst: 62.5,
        totalSgst: 62.5,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 125,
        roundOff: 0,
        grandTotal: 2625,
        amountInWords: 'Two Thousand Six Hundred Twenty Five Only',
        paymentMode: 'CASH',
        paymentStatus: 'PAID',
        paidAmount: 2625,
        balanceAmount: 0,
        createdAt: '2026-01-08T10:00:00.000Z',
        updatedAt: '2026-01-08T10:00:00.000Z',
      };
      db.saveInvoice(invoice);

      // Current stock was computed as 15 + 20 - 5 = 30 by savePurchase/saveInvoice.
      // Now tamper the recorded stock to 65 to simulate discrepancy.
      const currentItems = db.getItems();
      const iIdx = currentItems.findIndex((i) => i.id === item.id);
      currentItems[iIdx].currentStock = 65;
      testStorage.setItem('gst_items', JSON.stringify(currentItems));

      // Expected computed stock: 20 - 5 = 15. Recorded stock = 65. Variance = 50.
      const stockReport = auditAllItemStock();
      expect(stockReport.totalItemsAudited).toBe(1);
      expect(stockReport.discrepantItemsCount).toBe(1);

      const discrepancy = stockReport.discrepancies[0];
      expect(discrepancy.itemId).toBe(item.id);
      expect(discrepancy.recordedStock).toBe(65);
      expect(discrepancy.totalPurchased).toBe(20);
      expect(discrepancy.totalSold).toBe(5);
      expect(discrepancy.computedStock).toBe(15);
      expect(discrepancy.variance).toBe(50);
    });

    it('auto-reconciles item stock by generating a stock adjustment entry', async () => {
      // Clear items and adjustments for test isolation
      testStorage.setItem('gst_items', JSON.stringify([]));
      testStorage.setItem('gst_purchases', JSON.stringify([]));
      testStorage.setItem('gst_invoices', JSON.stringify([]));
      testStorage.setItem('gst_stock_adjustments', JSON.stringify([]));

      const item: InventoryItem = {
        id: 'ITEM-002',
        name: 'Wheat Flour 10kg',
        hsnSacCode: '1101',
        category: 'Groceries',
        unit: 'BAG',
        salePrice: 400,
        purchasePrice: 320,
        gstRate: 0,
        currentStock: 0,
        minStockAlert: 5,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };
      db.saveItem(item);

      // Purchase 10 bags
      const purchase: PurchaseBill = {
        id: 'PUR-002',
        billNumber: 'BILL-002',
        supplierId: 'SUPP-001',
        supplierName: 'Agro Supplier',
        supplierAddress: 'APMC Market',
        supplierStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        itcEligibility: 'ALL_OTHER_ITC',
        isRcm: false,
        date: '2026-01-05',
        dueDate: '2026-01-15',
        items: [
          {
            itemId: item.id,
            name: item.name,
            hsnSacCode: '1101',
            unit: 'BAG',
            quantity: 10,
            unitPrice: 320,
            taxableAmount: 3200,
            gstRate: 0,
            cgstAmount: 0,
            sgstAmount: 0,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 3200,
          },
        ],
        totalGrossAmount: 3200,
        totalDiscount: 0,
        totalTaxableAmount: 3200,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 3200,
        paymentMode: 'CASH',
        paymentStatus: 'PAID',
        paidAmount: 3200,
        balanceAmount: 0,
        createdAt: '2026-01-05T10:00:00.000Z',
        updatedAt: '2026-01-05T10:00:00.000Z',
      };
      db.savePurchase(purchase);

      // Now tamper item stock to 30 to simulate a variance
      const itemsList = db.getItems();
      const idx = itemsList.findIndex((i) => i.id === item.id);
      itemsList[idx].currentStock = 30;
      testStorage.setItem('gst_items', JSON.stringify(itemsList));

      const reportBefore = auditAllItemStock();
      expect(reportBefore.discrepantItemsCount).toBe(1);

      const reconcileResult = await reconcileItemStock(reportBefore);
      expect(reconcileResult.reconciledCount).toBe(1);

      // Verify stock was updated to computed 10
      const updatedItem = db.getItems().find((i) => i.id === item.id);
      expect(updatedItem?.currentStock).toBe(10);

      // Post-reconciliation audit should report zero discrepancies
      const reportAfter = auditAllItemStock();
      expect(reportAfter.discrepantItemsCount).toBe(0);
    });

    it('TC-AUD-STOCK-04: Reconciles oversold negative stock without resetting to 0 when allowNegativeStock is true', async () => {
      // Clear items and transactions for test isolation
      testStorage.setItem('gst_items', JSON.stringify([]));
      testStorage.setItem('gst_purchases', JSON.stringify([]));
      testStorage.setItem('gst_invoices', JSON.stringify([]));
      testStorage.setItem('gst_stock_adjustments', JSON.stringify([]));

      // Enable negative stock
      db.setAllowNegativeStock(true);

      const item: InventoryItem = {
        id: 'ITM-OVERSOLD-01',
        name: 'Oversold Stock Item',
        hsnSacCode: '844332',
        category: 'Hardware',
        unit: 'PCS',
        salePrice: 100,
        purchasePrice: 60,
        gstRate: 18,
        currentStock: 0,
        minStockAlert: 5,
        createdAt: '2026-01-01T10:00:00.000Z',
        updatedAt: '2026-01-01T10:00:00.000Z',
      };
      db.saveItem(item);

      // Sell 15 items when initial stock is 0
      const invoice: Invoice = {
        id: 'INV-NEG-001',
        invoiceNumber: 'INV-NEG-001',
        invoiceType: 'B2CS',
        partyId: 'CUST-001',
        partyName: 'Customer Oversold',
        partyAddress: 'Market',
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        date: '2026-01-02',
        dueDate: '2026-01-15',
        items: [
          {
            itemId: item.id,
            name: item.name,
            hsnSacCode: '844332',
            quantity: 15,
            unit: 'PCS',
            unitPrice: 100,
            taxableAmount: 1500,
            gstRate: 18,
            cgstAmount: 135,
            sgstAmount: 135,
            igstAmount: 0,
            cessAmount: 0,
            total: 1770,
            totalAmount: 1770,
          },
        ],
        totalGrossAmount: 1500,
        totalDiscount: 0,
        totalTaxableAmount: 1500,
        totalCgst: 135,
        totalSgst: 135,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 270,
        roundOff: 0,
        grandTotal: 1770,
        amountInWords: 'One Thousand Seven Hundred Seventy Only',
        paymentMode: 'CASH',
        paymentStatus: 'PAID',
        paidAmount: 1770,
        balanceAmount: 0,
        createdAt: '2026-01-02T10:00:00.000Z',
        updatedAt: '2026-01-02T10:00:00.000Z',
      };
      db.saveInvoice(invoice);

      // Tamper item stock to 0 to simulate discrepancy
      const itemsList = db.getItems();
      const idx = itemsList.findIndex((i) => i.id === item.id);
      itemsList[idx].currentStock = 0;
      testStorage.setItem('gst_items', JSON.stringify(itemsList));

      const reportBefore = auditAllItemStock();
      expect(reportBefore.discrepantItemsCount).toBe(1);

      const reconcileResult = await reconcileItemStock(reportBefore);
      expect(reconcileResult.reconciledCount).toBe(1);

      // Stock should reconcile to -15, not clamped to 0
      const updatedItem = db.getItems().find((i) => i.id === item.id);
      expect(updatedItem?.currentStock).toBe(-15);

      const reportAfter = auditAllItemStock();
      expect(reportAfter.discrepantItemsCount).toBe(0);
    });
  });

  describe('Reverse Charge Mechanism (RCM) Accounting Hooks', () => {
    it('automatically generates paired journal voucher on RCM purchase and deletes it on bill deletion', () => {
      const rcmBill: PurchaseBill = {
        id: 'PUR-RCM-TEST-1',
        billNumber: 'PB-RCM-001',
        date: '2026-10-15',
        supplierId: 'SUP-GTA',
        supplierName: 'National Freight Logistics',
        supplierAddress: 'Navi Mumbai',
        supplierStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [
          {
            name: 'Goods Transport Agency (GTA) Freight',
            hsnSacCode: '996511',
            unit: 'NOS',
            quantity: 1,
            unitPrice: 50000,
            taxableAmount: 50000,
            gstRate: 5,
            cgstAmount: 1250,
            sgstAmount: 1250,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 52500,
          },
        ],
        itcEligibility: 'ELIGIBLE_SERVICES',
        isRcm: true,
        totalGrossAmount: 50000,
        totalDiscount: 0,
        totalTaxableAmount: 50000,
        totalCgst: 1250,
        totalSgst: 1250,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 2500,
        roundOff: 0,
        grandTotal: 52500,
        paidAmount: 50000,
        balanceAmount: 2500,
        paymentMode: 'BANK',
        paymentStatus: 'PARTIAL',
        createdAt: '2026-10-15T10:00:00.000Z',
        updatedAt: '2026-10-15T10:00:00.000Z',
      };

      // 1. Save RCM Purchase
      db.savePurchase(rcmBill);

      // Verify paired RCM voucher was generated
      const vouchers = db.getVouchers();
      const rcmVoucher = vouchers.find((v) => v.id === `VCH-RCM-${rcmBill.id}`);
      expect(rcmVoucher).toBeDefined();
      expect(rcmVoucher?.voucherType).toBe('JOURNAL');
      expect(rcmVoucher?.totalAmount).toBe(2500);

      const drCgst = rcmVoucher?.entries.find((e) => e.accountId === 'ACC_INPUT_CGST_RCM');
      const crCgst = rcmVoucher?.entries.find((e) => e.accountId === 'ACC_OUTPUT_CGST_RCM');
      expect(drCgst?.debit).toBe(1250);
      expect(crCgst?.credit).toBe(1250);

      // 2. Updating bill to non-RCM reverses the paired RCM voucher (no hard-deletes)
      db.savePurchase({ ...rcmBill, isRcm: false });
      const vouchersAfterNonRcm = db.getVouchers();
      const rcmV = vouchersAfterNonRcm.find((v) => v.id === `VCH-RCM-${rcmBill.id}`);
      expect(rcmV).toBeDefined();
      expect(rcmV?.isReversed).toBe(true);
      expect(vouchersAfterNonRcm.find((v) => v.reversalOfVoucherId === `VCH-RCM-${rcmBill.id}`)).toBeDefined();

      // 3. Re-saving as RCM regenerates active RCM voucher without overwriting reversed predecessor
      db.savePurchase(rcmBill);
      const activeRcm = db.getVouchers().find(
        (v) => (v.id === `VCH-RCM-${rcmBill.id}` || v.id.startsWith(`VCH-RCM-${rcmBill.id}-`)) && !v.isReversed
      );
      expect(activeRcm).toBeDefined();

      // Original reversed voucher is preserved intact
      const origReversed = db.getVouchers().find((v) => v.id === `VCH-RCM-${rcmBill.id}`);
      expect(origReversed?.isReversed).toBe(true);

      // 4. Deleting the purchase bill reverses the new active RCM voucher
      db.deletePurchase(rcmBill.id);
      const deletedRcm = db.getVouchers().find((v) => v.id === activeRcm?.id);
      expect(deletedRcm?.isReversed).toBe(true);
      expect(db.getVouchers().find((v) => v.reversalOfVoucherId === activeRcm?.id)).toBeDefined();
    });
  });
});
