import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../services/db.ts';
import { rbac } from '../services/rbac.ts';
import { CompanyProfile } from '../models/company.ts';
import { Invoice, InvoiceItemEntry } from '../models/invoice.ts';
import { PurchaseBill, PurchaseItemEntry } from '../models/purchase.ts';
import { InventoryItem } from '../models/item.ts';
import { Party } from '../models/party.ts';
import {
  generateNextDocumentNumber,
  DOCUMENT_SERIES_LABELS,
  DEFAULT_SERIES_CONFIGS,
} from '../core/utils/invoiceNumber.ts';
import {
  canConvertToInvoice,
  convertDocumentToTaxInvoice,
  canConvertPurchaseOrder,
  convertPurchaseOrderToBill,
} from '../core/utils/documentConversion.ts';

// Setup isolated Mock Storage
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

vi.mock('../services/pouchdb.ts', () => ({
  pouch: {
    putDoc: vi.fn().mockResolvedValue({}),
    deleteDoc: vi.fn().mockResolvedValue({}),
    getAllDocs: vi.fn().mockResolvedValue([]),
    syncNow: vi.fn().mockResolvedValue({}),
    subscribe: vi.fn(() => () => {}),
    isConfigured: vi.fn().mockReturnValue(false),
    migrateFromLocalStorage: vi.fn().mockResolvedValue({}),
  },
}));

describe('Commercial Orders & Returns Architecture Tests', () => {
  const sampleCompany: CompanyProfile = {
    id: 'comp_test',
    businessName: 'Apex Industrial Solutions Pvt Ltd',
    tradeName: 'Apex Industrial',
    gstin: '27AABCA1234F1Z5',
    pan: 'AABCA1234F',
    email: 'accounts@apexind.com',
    phone: '9876543210',
    address: '401 Commerce Square, MIDC Industrial Area',
    city: 'Mumbai',
    stateCode: '27',
    pincode: '400093',
    isGstEnabled: true,
    documentSeries: DEFAULT_SERIES_CONFIGS,
  };

  const sampleCustomer: Party = {
    id: 'cust_01',
    name: 'Metro Contracting LLC',
    type: 'CUSTOMER',
    phone: '9123456780',
    gstin: '27BBCDE5678K1Z3',
    stateCode: '27',
    billingAddress: 'Andheri East, Mumbai',
    currentBalance: 0,
    creditLimit: 250000,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const sampleSupplier: Party = {
    id: 'supp_01',
    name: 'National Steel Fabricators',
    type: 'SUPPLIER',
    phone: '9876501234',
    gstin: '27CCDEF9012M1Z8',
    stateCode: '27',
    billingAddress: 'Navi Mumbai Industrial Zone',
    currentBalance: 0,
    creditLimit: 500000,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const sampleItem: InventoryItem = {
    id: 'item_01',
    name: 'Heavy Duty Structural Beam',
    sku: 'HDSB-100',
    hsnSacCode: '7216',
    category: 'Structural',
    unit: 'PCS',
    purchasePrice: 2000,
    salePrice: 3000,
    gstRate: 18,
    currentStock: 50,
    minStockAlert: 10,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const createTestInvoice = (overrides: Partial<Invoice>): Invoice => ({
    id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    invoiceNumber: 'INV-2026-0001',
    invoiceType: 'B2B',
    date: '2026-10-17',
    partyId: sampleCustomer.id,
    partyName: sampleCustomer.name,
    partyPhone: sampleCustomer.phone,
    partyGstin: sampleCustomer.gstin,
    partyAddress: sampleCustomer.billingAddress,
    partyStateCode: sampleCustomer.stateCode,
    placeOfSupplyStateCode: sampleCustomer.stateCode,
    isIntraState: true,
    items: [],
    totalGrossAmount: 0,
    totalDiscount: 0,
    totalTaxableAmount: 0,
    totalCgst: 0,
    totalSgst: 0,
    totalIgst: 0,
    totalCess: 0,
    totalTax: 0,
    roundOff: 0,
    grandTotal: 0,
    amountInWords: '',
    paymentMode: 'CREDIT',
    paymentStatus: 'UNPAID',
    paidAmount: 0,
    balanceAmount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  const createTestPurchase = (overrides: Partial<PurchaseBill>): PurchaseBill => ({
    id: `pur_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    billNumber: 'PUR-2026-0001',
    purchaseType: 'BILL',
    date: '2026-10-17',
    supplierId: sampleSupplier.id,
    supplierName: sampleSupplier.name,
    supplierGstin: sampleSupplier.gstin,
    supplierAddress: sampleSupplier.billingAddress,
    supplierStateCode: sampleSupplier.stateCode,
    placeOfSupplyStateCode: sampleSupplier.stateCode,
    isIntraState: true,
    itcEligibility: 'ALL_OTHER_ITC',
    isRcm: false,
    items: [],
    totalGrossAmount: 0,
    totalDiscount: 0,
    totalTaxableAmount: 0,
    totalCgst: 0,
    totalSgst: 0,
    totalIgst: 0,
    totalCess: 0,
    totalTax: 0,
    roundOff: 0,
    grandTotal: 0,
    paymentMode: 'CREDIT',
    paymentStatus: 'UNPAID',
    paidAmount: 0,
    balanceAmount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  beforeEach(() => {
    testStorage.clear();
    (db as any).set('gst_invoices', []);
    (db as any).set('gst_purchases', []);
    (db as any).set('gst_vouchers', []);
    (db as any).set('gst_parties', [{ ...sampleCustomer, currentBalance: 0 }, { ...sampleSupplier, currentBalance: 0 }]);
    (db as any).set('gst_items', [{ ...sampleItem, currentStock: 50 }]);
    db.saveCompany(sampleCompany);
  });

  describe('1. Document Series Numbering', () => {
    it('correctly registers labels and prefixes for Sales Order and Purchase Order', () => {
      expect(DOCUMENT_SERIES_LABELS.SALES_ORDER.title).toBe('Sales Order');
      expect(DOCUMENT_SERIES_LABELS.PURCHASE_ORDER.title).toBe('Purchase Order');
      expect(DOCUMENT_SERIES_LABELS.CREDIT_NOTE.title).toBe('Credit Note');
      expect(DOCUMENT_SERIES_LABELS.DEBIT_NOTE.title).toBe('Debit Note');
      expect(DOCUMENT_SERIES_LABELS.ESTIMATE.title).toBe('Quotation / Estimate');
    });

    it('generates sequential series number for Sales Order (SO-)', () => {
      const num1 = generateNextDocumentNumber('SALES_ORDER', sampleCompany, []);
      expect(num1).toMatch(/^SO-\d{4}-0001$/);

      const existingSO = {
        invoiceNumber: num1,
      };

      const num2 = generateNextDocumentNumber('SALES_ORDER', sampleCompany, [existingSO]);
      expect(num2).toMatch(/^SO-\d{4}-0002$/);
    });

    it('generates sequential series number for Purchase Order (PO-)', () => {
      const num1 = generateNextDocumentNumber('PURCHASE_ORDER', sampleCompany, []);
      expect(num1).toMatch(/^PO-\d{4}-0001$/);
    });
  });

  describe('2. Sales Order Lifecycle & Conversion', () => {
    it('verifies canConvertToInvoice rules for Sales Orders and Estimates', () => {
      const salesOrder = createTestInvoice({
        id: 'so_test_1',
        invoiceNumber: 'SO-2026-0001',
        invoiceType: 'SALES_ORDER',
        totalTaxableAmount: 3000,
        totalCgst: 270,
        totalSgst: 270,
        totalTax: 540,
        grandTotal: 3540,
        balanceAmount: 3540,
        orderStatus: 'PENDING',
      });

      expect(canConvertToInvoice(salesOrder)).toBe(true);

      const convertedSO: Invoice = {
        ...salesOrder,
        isConverted: true,
        orderStatus: 'FULFILLED',
      };
      expect(canConvertToInvoice(convertedSO)).toBe(false);

      const cancelledSO: Invoice = {
        ...salesOrder,
        orderStatus: 'CANCELLED',
      };
      expect(canConvertToInvoice(cancelledSO)).toBe(false);
    });

    it('converts Sales Order to Tax Invoice, marking order FULFILLED and linking references', async () => {
      const orderItems: InvoiceItemEntry[] = [
        {
          itemId: sampleItem.id,
          name: sampleItem.name,
          hsnSacCode: sampleItem.hsnSacCode,
          quantity: 5,
          unit: sampleItem.unit,
          unitPrice: sampleItem.salePrice,
          taxableAmount: 15000,
          gstRate: sampleItem.gstRate,
          cgstAmount: 1350,
          sgstAmount: 1350,
          igstAmount: 0,
          cessAmount: 0,
          totalAmount: 17700,
        },
      ];

      const salesOrder = createTestInvoice({
        id: 'so_exec_01',
        invoiceNumber: 'SO-2026-0005',
        invoiceType: 'SALES_ORDER',
        items: orderItems,
        totalGrossAmount: 15000,
        totalTaxableAmount: 15000,
        totalCgst: 1350,
        totalSgst: 1350,
        totalTax: 2700,
        grandTotal: 17700,
        balanceAmount: 17700,
        orderStatus: 'PENDING',
      });
      db.saveInvoice(salesOrder);

      // Verify that saving a Sales Order does NOT deduct physical inventory stock
      expect(db.getItems().find((i) => i.id === sampleItem.id)?.currentStock).toBe(50);
      // Verify that saving a Sales Order does NOT post to customer receivable
      expect(db.getParties().find((p) => p.id === sampleCustomer.id)?.currentBalance).toBe(0);

      // Perform conversion
      const newInvoice = await convertDocumentToTaxInvoice(salesOrder, sampleCompany);
      expect(newInvoice).not.toBeNull();
      expect(newInvoice.invoiceType).toBe('B2B');
      expect(newInvoice.convertedFromDocType).toBe('SALES_ORDER');
      expect(newInvoice.convertedFromDocId).toBe(salesOrder.id);
      expect(newInvoice.convertedFromDocNumber).toBe(salesOrder.invoiceNumber);
      expect(newInvoice.grandTotal).toBe(17700);
      expect(newInvoice.paymentStatus).toBe('UNPAID');

      // Verify original order was updated to FULFILLED and isConverted = true in db
      const refreshedSO = db.getInvoices().find((i) => i.id === salesOrder.id);
      expect(refreshedSO?.isConverted).toBe(true);
      expect(refreshedSO?.orderStatus).toBe('FULFILLED');
      expect(refreshedSO?.convertedToInvoiceId).toBe(newInvoice.id);
      expect(refreshedSO?.convertedToInvoiceNumber).toBe(newInvoice.invoiceNumber);

      // Save the generated tax invoice and check customer balance & inventory stock
      db.saveInvoice(newInvoice);
      const updatedParty = db.getParties().find((p) => p.id === sampleCustomer.id);
      expect(updatedParty?.currentBalance).toBe(17700);

      const updatedItem = db.getItems().find((i) => i.id === sampleItem.id);
      expect(updatedItem?.currentStock).toBe(45); // Deducted 5 items
    });
  });

  describe('3. Purchase Order Lifecycle & Inward Fulfillment', () => {
    it('verifies canConvertPurchaseOrder validation', () => {
      const po = createTestPurchase({
        id: 'po_01',
        billNumber: 'PO-2026-0001',
        purchaseType: 'PO',
        totalTaxableAmount: 10000,
        totalCgst: 900,
        totalSgst: 900,
        totalTax: 1800,
        grandTotal: 11800,
        balanceAmount: 11800,
        orderStatus: 'PENDING',
      });

      expect(canConvertPurchaseOrder(po)).toBe(true);

      const fulfilledPO: PurchaseBill = {
        ...po,
        isConverted: true,
        orderStatus: 'FULFILLED',
      };
      expect(canConvertPurchaseOrder(fulfilledPO)).toBe(false);

      const regularBill: PurchaseBill = {
        ...po,
        purchaseType: 'BILL',
      };
      expect(canConvertPurchaseOrder(regularBill)).toBe(false);
    });

    it('converts Purchase Order to Inward Purchase Bill, updating stock & payables', async () => {
      const purchaseItems: PurchaseItemEntry[] = [
        {
          itemId: sampleItem.id,
          name: sampleItem.name,
          hsnSacCode: sampleItem.hsnSacCode,
          quantity: 20,
          unit: sampleItem.unit,
          unitPrice: 2000,
          taxableAmount: 40000,
          gstRate: 18,
          cgstAmount: 3600,
          sgstAmount: 3600,
          igstAmount: 0,
          cessAmount: 0,
          totalAmount: 47200,
        },
      ];

      const po = createTestPurchase({
        id: 'po_exec_01',
        billNumber: 'PO-2026-0010',
        purchaseType: 'PO',
        items: purchaseItems,
        totalGrossAmount: 40000,
        totalTaxableAmount: 40000,
        totalCgst: 3600,
        totalSgst: 3600,
        totalTax: 7200,
        grandTotal: 47200,
        balanceAmount: 47200,
        orderStatus: 'PENDING',
      });
      db.savePurchase(po);

      // Verify PO does NOT affect initial stock (stock remains 50)
      const initialItem = db.getItems().find((i) => i.id === sampleItem.id);
      expect(initialItem?.currentStock).toBe(50);
      // Verify PO does NOT affect supplier payable
      expect(db.getParties().find((p) => p.id === sampleSupplier.id)?.currentBalance).toBe(0);

      // Convert PO to Bill
      const inwardBill = await convertPurchaseOrderToBill(po, sampleCompany);
      expect(inwardBill).not.toBeNull();
      expect(inwardBill.purchaseType).toBe('BILL');
      expect(inwardBill.billNumber).toMatch(/^PUR-/);
      expect(inwardBill.convertedFromPoId).toBe(po.id);
      expect(inwardBill.convertedFromPoNumber).toBe(po.billNumber);
      expect(inwardBill.grandTotal).toBe(47200);

      // Original PO should be fulfilled
      const refreshedPO = db.getPurchases().find((p) => p.id === po.id);
      expect(refreshedPO?.isConverted).toBe(true);
      expect(refreshedPO?.orderStatus).toBe('FULFILLED');
      expect(refreshedPO?.convertedToBillId).toBe(inwardBill.id);

      // Inventory should receive the inward stock (+20)
      const stockItemAfterInward = db.getItems().find((i) => i.id === sampleItem.id);
      expect(stockItemAfterInward?.currentStock).toBe(70); // 50 + 20

      // Supplier payable balance should increase by 47200 (stored as negative for payable)
      const supplierAfterInward = db.getParties().find((p) => p.id === sampleSupplier.id);
      expect(supplierAfterInward?.currentBalance).toBe(-47200);
    });
  });

  describe('4. Sales Returns (Credit Note) & Purchase Returns (Debit Note)', () => {
    it('handles Sales Return (Credit Note): increases item stock and decreases receivable', () => {
      // First, set customer balance with an invoice
      const invoice = createTestInvoice({
        id: 'inv_return_target',
        invoiceNumber: 'INV-2026-0099',
        invoiceType: 'B2B',
        items: [
          {
            itemId: sampleItem.id,
            name: sampleItem.name,
            hsnSacCode: sampleItem.hsnSacCode,
            quantity: 10,
            unit: sampleItem.unit,
            unitPrice: 3000,
            taxableAmount: 30000,
            gstRate: 18,
            cgstAmount: 2700,
            sgstAmount: 2700,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 35400,
          },
        ],
        totalGrossAmount: 30000,
        totalTaxableAmount: 30000,
        totalCgst: 2700,
        totalSgst: 2700,
        totalTax: 5400,
        grandTotal: 35400,
        balanceAmount: 35400,
      });
      db.saveInvoice(invoice);

      expect(db.getItems().find((i) => i.id === sampleItem.id)?.currentStock).toBe(40); // 50 - 10
      expect(db.getParties().find((p) => p.id === sampleCustomer.id)?.currentBalance).toBe(35400);

      // Now create a Sales Return (Credit Note) for 2 items
      const creditNote = createTestInvoice({
        id: 'cn_2026_01',
        invoiceNumber: 'CN-2026-0001',
        invoiceType: 'CREDIT_NOTE',
        returnReason: 'Damaged packaging during transit',
        items: [
          {
            itemId: sampleItem.id,
            name: sampleItem.name,
            hsnSacCode: sampleItem.hsnSacCode,
            quantity: 2,
            unit: sampleItem.unit,
            unitPrice: 3000,
            taxableAmount: 6000,
            gstRate: 18,
            cgstAmount: 540,
            sgstAmount: 540,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 7080,
          },
        ],
        totalGrossAmount: 6000,
        totalTaxableAmount: 6000,
        totalCgst: 540,
        totalSgst: 540,
        totalTax: 1080,
        grandTotal: 7080,
        balanceAmount: 7080,
      });
      db.saveInvoice(creditNote);

      // Credit Note restores returned items into inventory (40 + 2 = 42)
      expect(db.getItems().find((i) => i.id === sampleItem.id)?.currentStock).toBe(42);
      // Customer balance reduced by credit note (35400 - 7080 = 28320)
      expect(db.getParties().find((p) => p.id === sampleCustomer.id)?.currentBalance).toBe(28320);
    });

    it('handles Purchase Return (Debit Note): reduces item stock and reduces payable', () => {
      // Create initial purchase bill
      const bill = createTestPurchase({
        id: 'pur_target_bill',
        billNumber: 'PUR-2026-0050',
        purchaseType: 'BILL',
        items: [
          {
            itemId: sampleItem.id,
            name: sampleItem.name,
            hsnSacCode: sampleItem.hsnSacCode,
            quantity: 10,
            unit: sampleItem.unit,
            unitPrice: 2000,
            taxableAmount: 20000,
            gstRate: 18,
            cgstAmount: 1800,
            sgstAmount: 1800,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 23600,
          },
        ],
        totalGrossAmount: 20000,
        totalTaxableAmount: 20000,
        totalCgst: 1800,
        totalSgst: 1800,
        totalTax: 3600,
        grandTotal: 23600,
        balanceAmount: 23600,
      });
      db.savePurchase(bill);

      expect(db.getItems().find((i) => i.id === sampleItem.id)?.currentStock).toBe(60); // 50 + 10
      expect(db.getParties().find((p) => p.id === sampleSupplier.id)?.currentBalance).toBe(-23600);

      // Now create a Purchase Return (Debit Note) for 3 items
      const debitNote = createTestPurchase({
        id: 'dn_2026_01',
        billNumber: 'DN-2026-0001',
        purchaseType: 'RETURN',
        returnReason: 'Quality mismatch with purchase specifications',
        items: [
          {
            itemId: sampleItem.id,
            name: sampleItem.name,
            hsnSacCode: sampleItem.hsnSacCode,
            quantity: 3,
            unit: sampleItem.unit,
            unitPrice: 2000,
            taxableAmount: 6000,
            gstRate: 18,
            cgstAmount: 540,
            sgstAmount: 540,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 7080,
          },
        ],
        totalGrossAmount: 6000,
        totalTaxableAmount: 6000,
        totalCgst: 540,
        totalSgst: 540,
        totalTax: 1080,
        grandTotal: 7080,
        balanceAmount: 7080,
      });
      db.savePurchase(debitNote);

      // Return deducts stock from inventory (60 - 3 = 57)
      expect(db.getItems().find((i) => i.id === sampleItem.id)?.currentStock).toBe(57);
      // Supplier payable reduced (-23600 + 7080 = -16520)
      expect(db.getParties().find((p) => p.id === sampleSupplier.id)?.currentBalance).toBe(-16520);
    });
  });

  describe('5. Role-Based Access Control for Commercial Documents', () => {
    it('verifies Cashier can access customer orders & returns but not procurement', () => {
      expect(rbac.canAccessTab('quotations', 'CASHIER')).toBe(true);
      expect(rbac.canAccessTab('sales_orders', 'CASHIER')).toBe(true);
      expect(rbac.canAccessTab('sales_returns', 'CASHIER')).toBe(true);
      expect(rbac.canAccessTab('purchase_orders', 'CASHIER')).toBe(false);
      expect(rbac.canAccessTab('purchase_returns', 'CASHIER')).toBe(false);
    });

    it('verifies Accountant and Owner have comprehensive access to all order and return documents', () => {
      const tabs = [
        'quotations',
        'sales_orders',
        'sales_returns',
        'purchase_orders',
        'purchase_returns',
      ];
      for (const tab of tabs) {
        expect(rbac.canAccessTab(tab, 'ACCOUNTANT')).toBe(true);
        expect(rbac.canAccessTab(tab, 'OWNER')).toBe(true);
      }
    });
  });
});
