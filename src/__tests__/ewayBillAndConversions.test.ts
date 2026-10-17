import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../services/db.ts';
import { CompanyProfile } from '../models/company.ts';
import { Invoice, InvoiceItemEntry } from '../models/invoice.ts';
import { InventoryItem } from '../models/item.ts';
import {
  generateEWayBillJson,
  isValidVehicleNumber,
  EWAY_BILL_STATUTORY_THRESHOLD,
  formatEWayDate,
} from '../core/gst/eWayBillExport.ts';
import {
  generateEWayBillSlipHtml,
  printEWayBillSlip,
} from '../core/gst/eWayBillSlipPrinter.ts';
import {
  canConvertToInvoice,
  convertDocumentToTaxInvoice,
} from '../core/utils/documentConversion.ts';

// Setup Mock Storage
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

describe('Milestone 1: E-Way Bill System & 1-Tap Document Conversions', () => {
  const sampleCompany: CompanyProfile = {
    id: 'comp-1',
    businessName: 'Apex Industrial Supplies Pvt Ltd',
    tradeName: 'Apex Supplies',
    gstin: '27AABCA1234A1Z5',
    pan: 'AABCA1234A',
    phone: '9876543210',
    email: 'info@apexsupplies.com',
    address: 'Plot 42, MIDC Industrial Area, Andheri East, Mumbai, Maharashtra 400093',
    city: 'Mumbai',
    pincode: '400093',
    stateCode: '27',
  };

  const sampleItems: InvoiceItemEntry[] = [
    {
      itemId: 'item-101',
      name: 'Industrial Valve 50mm',
      hsnSacCode: '84818030',
      quantity: 10,
      unit: 'NOS',
      unitPrice: 5000,
      discountPercent: 0,
      discountAmount: 0,
      taxableAmount: 50000,
      gstRate: 18,
      cgstAmount: 4500,
      sgstAmount: 4500,
      igstAmount: 0,
      cessAmount: 0,
      totalAmount: 59000,
    },
  ];

  const sampleInvoice: Invoice = {
    id: 'inv-high-val-1',
    invoiceNumber: 'INV-2026-001',
    date: '2026-10-17T10:00:00Z',
    partyId: 'party-cust-1',
    partyName: 'Reliance Industries Limited',
    partyGstin: '27AAACR5055K1ZX',
    partyAddress: 'Maker Chambers IV, Nariman Point, Mumbai 400021',
    partyStateCode: '27',
    placeOfSupplyStateCode: '27',
    partyPincode: '400021',
    isIntraState: true,
    invoiceType: 'B2B',
    items: sampleItems,
    totalGrossAmount: 50000,
    totalTaxableAmount: 50000,
    totalCgst: 4500,
    totalSgst: 4500,
    totalIgst: 0,
    totalCess: 0,
    totalTax: 9000,
    totalDiscount: 0,
    grandTotal: 59000,
    amountInWords: 'Fifty Nine Thousand Rupees Only',
    roundOff: 0,
    paymentStatus: 'UNPAID',
    paidAmount: 0,
    balanceAmount: 59000,
    paymentMode: 'CREDIT',
    createdAt: '2026-10-17T10:00:00Z',
    updatedAt: '2026-10-17T10:00:00Z',
    // E-Way Bill fields
    transporterId: '27AAACT9999M1Z2',
    transporterName: 'VRL Logistics Ltd',
    transportMode: '1',
    transportDistance: 120,
    vehicleNumber: 'MH04AB1234',
    vehicleType: 'R',
    transDocNo: 'LR-987654',
    transDocDate: '2026-10-17',
  };

  beforeEach(() => {
    testStorage.clear();
    db.saveCompany(sampleCompany);
  });

  describe('1. E-Way Bill Rules, Validation & JSON Generation', () => {
    it('statutory threshold is correctly set to ₹50,000 under Rule 138', () => {
      expect(EWAY_BILL_STATUTORY_THRESHOLD).toBe(50000);
      expect(sampleInvoice.grandTotal).toBeGreaterThanOrEqual(EWAY_BILL_STATUTORY_THRESHOLD);
    });

    it('validates Indian vehicle registration numbers accurately', () => {
      // Valid plate formats
      expect(isValidVehicleNumber('MH12AB1234')).toBe(true);
      expect(isValidVehicleNumber('DL01A1234')).toBe(true);
      expect(isValidVehicleNumber('KA04ME5678')).toBe(true);
      expect(isValidVehicleNumber('mh 12 ab 1234')).toBe(true); // whitespace insensitive

      // Invalid formats
      expect(isValidVehicleNumber('')).toBe(false);
      expect(isValidVehicleNumber(undefined)).toBe(false);
      expect(isValidVehicleNumber('12345')).toBe(false);
      expect(isValidVehicleNumber('MH1234')).toBe(false);
      expect(isValidVehicleNumber('INVALID')).toBe(false);
    });

    it('formats ISO dates into Indian Government portal DD/MM/YYYY format', () => {
      expect(formatEWayDate('2026-10-17T10:00:00Z')).toBe('17/10/2026');
      expect(formatEWayDate('2026-05-04')).toBe('04/05/2026');
      expect(formatEWayDate('')).toBe('');
    });

    it('generates compliant NIC bulk upload payload with Part-A and Part-B data', () => {
      const payload = generateEWayBillJson(sampleCompany, sampleInvoice);

      expect(payload.version).toBe('1.0.1118');
      expect(payload.billLists.length).toBe(1);

      const bill = payload.billLists[0];
      // Part-A: Document & Supplier/Recipient Details
      expect(bill.userGstin).toBe(sampleCompany.gstin);
      expect(bill.fromGstin).toBe(sampleCompany.gstin);
      expect(bill.toGstin).toBe(sampleInvoice.partyGstin);
      expect(bill.docNo).toBe(sampleInvoice.invoiceNumber);
      expect(bill.docDate).toBe('17/10/2026');
      expect(bill.totalValue).toBe(50000);
      expect(bill.cgstValue).toBe(4500);
      expect(bill.sgstValue).toBe(4500);
      expect(bill.totInvValue).toBe(59000);

      // Part-B: Transporter & Vehicle Details
      expect(bill.transId).toBe('27AAACT9999M1Z2');
      expect(bill.transName).toBe('VRL Logistics Ltd');
      expect(bill.transMode).toBe('1');
      expect(bill.transDistance).toBe(120);
      expect(bill.vehNo).toBe('MH04AB1234');
      expect(bill.vehType).toBe('R');
      expect(bill.transDocNo).toBe('LR-987654');
      expect(bill.transDocDate).toBe('17/10/2026');
    });

    it('detects Bill-to Ship-to transactions (transType = 2) when shipping address is provided', () => {
      const shipToInvoice: Invoice = {
        ...sampleInvoice,
        shippingAddress: 'Plant 3, GIDC Industrial Estate, Ahmedabad, Gujarat 380001',
        shippingPincode: '380001',
      };

      const payload = generateEWayBillJson(sampleCompany, shipToInvoice);
      expect(payload.billLists[0].transType).toBe('2'); // Bill to - Ship to
      expect(payload.billLists[0].toPincode).toBe(380001);
      expect(payload.billLists[0].actToStateCode).toBe(24); // Gujarat code derived from pin 380xxx
    });
  });

  describe('2. Official E-Way Bill A4 Printable Slip Generator', () => {
    it('generates HTML containing Part-A and Part-B statutory tables', () => {
      const html = generateEWayBillSlipHtml(sampleCompany, sampleInvoice, {
        vehicleNumber: 'MH04AB1234',
        transporterName: 'VRL Logistics Ltd',
        transDistance: 120,
      });

      expect(html).toContain('E-Way Bill Transit Accompanying Slip');
      expect(html).toContain('Central Goods and Services Tax Rules, 2017');
      expect(html).toContain('PART-A');
      expect(html).toContain('PART-B');
      expect(html).toContain(sampleCompany.gstin);
      expect(html).toContain(sampleInvoice.partyGstin);
      expect(html).toContain('MH04AB1234');
      expect(html).toContain('VRL Logistics Ltd');
      expect(html).toContain('120 KM');
      expect(html).toContain('59,000');
    });

    it('triggers print without crashing when window.print or iframe is used', () => {
      const printSpy = vi.fn();
      const originalPrint = window.print;
      window.print = printSpy;

      expect(() => {
        printEWayBillSlip(sampleCompany, sampleInvoice);
      }).not.toThrow();

      window.print = originalPrint;
    });
  });

  describe('3. 1-Tap Document Conversions (Quotation/Challan -> Tax Invoice)', () => {
    const catalogItem: InventoryItem = {
      id: 'item-val-1',
      name: 'High Pressure Brass Valve',
      hsnSacCode: '84818030',
      salePrice: 1500,
      purchasePrice: 1000,
      gstRate: 18,
      currentStock: 50,
      minStockAlert: 10,
      unit: 'NOS',
      category: 'Valves',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };

    beforeEach(() => {
      db.saveItem(catalogItem);
    });

    it('identifies convertibility accurately via canConvertToInvoice', () => {
      const quotation: Invoice = {
        ...sampleInvoice,
        id: 'est-1',
        invoiceNumber: 'EST-001',
        invoiceType: 'ESTIMATE',
      };

      const challan: Invoice = {
        ...sampleInvoice,
        id: 'chl-1',
        invoiceNumber: 'DC-001',
        invoiceType: 'DELIVERY_CHALLAN',
      };

      const taxInvoice: Invoice = {
        ...sampleInvoice,
        id: 'inv-1',
        invoiceNumber: 'INV-001',
        invoiceType: 'B2B',
      };

      // Quotation and Challan can be converted
      expect(canConvertToInvoice(quotation)).toBe(true);
      expect(canConvertToInvoice(challan)).toBe(true);

      // Tax Invoice cannot be converted
      expect(canConvertToInvoice(taxInvoice)).toBe(false);

      // Already converted quotation cannot be converted again
      const alreadyConverted: Invoice = {
        ...quotation,
        isConverted: true,
        convertedToInvoiceId: 'inv-123',
      };
      expect(canConvertToInvoice(alreadyConverted)).toBe(false);
    });

    it('converts Quotation into official Tax Invoice and decrements stock', async () => {
      const quotation: Invoice = {
        ...sampleInvoice,
        id: 'est-to-convert-1',
        invoiceNumber: 'EST-100',
        date: '2026-10-17',
        partyId: 'party-b2b',
        partyName: 'Tata Motors Limited',
        partyGstin: '27AAACT2727Q1ZW',
        partyAddress: 'Pune Industrial Area',
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        invoiceType: 'ESTIMATE',
        items: [
          {
            itemId: 'item-val-1',
            name: 'High Pressure Brass Valve',
            hsnSacCode: '84818030',
            quantity: 15,
            unit: 'NOS',
            unitPrice: 1500,
            discountPercent: 0,
            discountAmount: 0,
            taxableAmount: 22500,
            gstRate: 18,
            cgstAmount: 2025,
            sgstAmount: 2025,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 26550,
          },
        ],
        totalGrossAmount: 22500,
        totalTaxableAmount: 22500,
        totalCgst: 2025,
        totalSgst: 2025,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 4050,
        totalDiscount: 0,
        grandTotal: 26550,
        amountInWords: 'Twenty Six Thousand Five Hundred Fifty Rupees Only',
        roundOff: 0,
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 26550,
        paymentMode: 'CREDIT',
      };

      db.saveInvoice(quotation);

      // Initial stock should be 50
      db.saveItem(catalogItem);
      const initialItem = db.getItems().find((i) => i.id === 'item-val-1');
      expect(initialItem?.currentStock).toBe(50);

      // Perform conversion
      const newInvoice = await convertDocumentToTaxInvoice(quotation, sampleCompany);

      // 1. Verify new invoice properties
      expect(newInvoice.id).not.toBe(quotation.id);
      expect(newInvoice.invoiceType).toBe('B2B'); // Target has GSTIN, so B2B
      expect(newInvoice.invoiceNumber).toMatch(/^INV-/);
      expect(newInvoice.convertedFromDocType).toBe('ESTIMATE');
      expect(newInvoice.convertedFromDocNumber).toBe('EST-100');
      expect(newInvoice.convertedFromDocId).toBe('est-to-convert-1');
      expect(newInvoice.grandTotal).toBe(26550);

      // 2. Verify stock was decremented from 50 to 35 (15 sold)
      const updatedItem = db.getItems().find((i) => i.id === 'item-val-1');
      expect(updatedItem?.currentStock).toBe(35);

      // 3. Verify source document was marked as converted
      const updatedSourceDoc = db.getInvoices().find((i) => i.id === 'est-to-convert-1');
      expect(updatedSourceDoc?.isConverted).toBe(true);
      expect(updatedSourceDoc?.convertedToInvoiceId).toBe(newInvoice.id);
      expect(updatedSourceDoc?.convertedToInvoiceNumber).toBe(newInvoice.invoiceNumber);

      // 4. Invariant: Attempting to convert again must fail
      await expect(convertDocumentToTaxInvoice(updatedSourceDoc!, sampleCompany)).rejects.toThrow(
        /cannot be converted/
      );
    });

    it('converts Delivery Challan to B2CS when recipient has no GSTIN', async () => {
      const challan: Invoice = {
        ...sampleInvoice,
        id: 'dc-to-convert-1',
        invoiceNumber: 'DC-555',
        date: '2026-10-17',
        partyId: 'party-consumer',
        partyName: 'Rajesh Sharma',
        partyGstin: undefined,
        partyAddress: 'Shop 5, Thane West',
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        invoiceType: 'DELIVERY_CHALLAN',
        items: [
          {
            itemId: 'item-val-1',
            name: 'High Pressure Brass Valve',
            hsnSacCode: '84818030',
            quantity: 5,
            unit: 'NOS',
            unitPrice: 1500,
            discountPercent: 0,
            discountAmount: 0,
            taxableAmount: 7500,
            gstRate: 18,
            cgstAmount: 675,
            sgstAmount: 675,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 8850,
          },
        ],
        totalGrossAmount: 7500,
        totalTaxableAmount: 7500,
        totalCgst: 675,
        totalSgst: 675,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 1350,
        totalDiscount: 0,
        grandTotal: 8850,
        amountInWords: 'Eight Thousand Eight Hundred Fifty Rupees Only',
        roundOff: 0,
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 8850,
        paymentMode: 'CREDIT',
      };

      db.saveInvoice(challan);

      const newInvoice = await convertDocumentToTaxInvoice(challan, sampleCompany);
      expect(newInvoice.invoiceType).toBe('B2CS'); // Recipient has no GSTIN, so B2CS
      expect(newInvoice.convertedFromDocType).toBe('DELIVERY_CHALLAN');
      expect(newInvoice.convertedFromDocNumber).toBe('DC-555');
    });
  });
});
