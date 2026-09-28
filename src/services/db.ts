import { CompanyProfile } from '../models/company.ts';
import { Party } from '../models/party.ts';
import { InventoryItem } from '../models/item.ts';
import { Invoice } from '../models/invoice.ts';
import { Voucher } from '../core/accounting/voucherTypes.ts';

import { PurchaseBill } from '../models/purchase.ts';
import { StockAdjustment } from '../models/item.ts';

const STORAGE_KEYS = {
  COMPANY: 'gst_company_profile',
  PARTIES: 'gst_parties',
  ITEMS: 'gst_items',
  INVOICES: 'gst_invoices',
  PURCHASES: 'gst_purchases',
  ADJUSTMENTS: 'gst_stock_adjustments',
  VOUCHERS: 'gst_vouchers',
};

// Initial Seed Data for immediate testing & demonstration
const DEFAULT_COMPANY: CompanyProfile = {
  id: 'COMP-001',
  businessName: 'Bharat Infotech Solutions',
  tradeName: 'Bharat Infotech',
  gstin: '27AABCU9603R1ZN', // Maharashtra Valid GSTIN
  pan: 'AABCU9603R',
  stateCode: '27',
  address: 'Shop No. 12, Tech Park, Shivaji Nagar, Pune',
  pincode: '411005',
  phone: '+91 9876543210',
  email: 'accounts@bharatinfotech.in',
  website: 'https://bharatinfotech.in',
  bankName: 'State Bank of India',
  accountNumber: '32109876543',
  ifscCode: 'SBIN0001234',
  branchName: 'Shivaji Nagar Pune',
  upiId: 'bharatinfotech@sbi',
  termsAndConditions: '1. Goods once sold will not be taken back.\n2. Interest @ 18% p.a. will be charged after due date.\n3. Subject to Pune jurisdiction.',
  invoicePrefix: 'INV-2627-',
};

const DEFAULT_PARTIES: Party[] = [
  {
    id: 'PTY-101',
    name: 'Sharma Electronics & Hardware',
    type: 'CUSTOMER',
    phone: '9822012345',
    email: 'sharma.store@example.com',
    gstin: '27AAACS1429B1ZV',
    pan: 'AAACS1429B',
    stateCode: '27',
    billingAddress: 'Main Market, Station Road, Thane, Maharashtra',
    currentBalance: 14500,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'PTY-102',
    name: 'Gujarat Apex Traders (Interstate)',
    type: 'CUSTOMER',
    phone: '9898011223',
    email: 'apextraders.ahd@example.com',
    gstin: '24AAACA1111A1ZY',
    pan: 'AAACA1111A',
    stateCode: '24', // Gujarat
    billingAddress: 'GIDC Industrial Estate, Vatva, Ahmedabad, Gujarat',
    currentBalance: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'PTY-103',
    name: 'Direct Retail Customer (Cash)',
    type: 'CUSTOMER',
    phone: '9999999999',
    stateCode: '27',
    billingAddress: 'Local Counter, Pune',
    currentBalance: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const DEFAULT_ITEMS: InventoryItem[] = [
  {
    id: 'ITM-001',
    name: 'Thermal Receipt Printer 80mm USB+BT',
    sku: 'PRN-80-BT',
    barcode: '8901234567890',
    hsnSacCode: '844332',
    category: 'Hardware',
    unit: 'PCS',
    salePrice: 3800,
    purchasePrice: 2800,
    gstRate: 18,
    currentStock: 25,
    minStockAlert: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'ITM-002',
    name: 'Wireless 2D Barcode Scanner',
    sku: 'SCN-2D-WIFI',
    barcode: '8901234567891',
    hsnSacCode: '847130',
    category: 'Hardware',
    unit: 'PCS',
    salePrice: 1950,
    purchasePrice: 1350,
    gstRate: 18,
    currentStock: 40,
    minStockAlert: 8,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'ITM-003',
    name: 'Billing Thermal Paper Roll (79mm x 50m)',
    sku: 'PPR-TH-80',
    barcode: '8901234567892',
    hsnSacCode: '4802',
    category: 'Consumables',
    unit: 'BOX',
    salePrice: 850,
    purchasePrice: 620,
    gstRate: 12,
    currentStock: 120,
    minStockAlert: 20,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'ITM-004',
    name: 'Annual Software Maintenance Service',
    sku: 'SRV-AMC-YR',
    hsnSacCode: '998313',
    category: 'Services',
    unit: 'NOS',
    salePrice: 5000,
    purchasePrice: 0,
    gstRate: 18,
    currentStock: 999,
    minStockAlert: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

class StorageService {
  private get<T>(key: string, defaultValue: T): T {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  private set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('Local storage write error:', e);
    }
  }

  // Company
  getCompany(): CompanyProfile {
    return this.get<CompanyProfile>(STORAGE_KEYS.COMPANY, DEFAULT_COMPANY);
  }

  saveCompany(company: CompanyProfile): void {
    this.set(STORAGE_KEYS.COMPANY, company);
  }

  // Parties
  getParties(): Party[] {
    return this.get<Party[]>(STORAGE_KEYS.PARTIES, DEFAULT_PARTIES);
  }

  saveParty(party: Party): void {
    const list = this.getParties();
    const idx = list.findIndex((p) => p.id === party.id);
    if (idx >= 0) {
      list[idx] = party;
    } else {
      list.push(party);
    }
    this.set(STORAGE_KEYS.PARTIES, list);
  }

  deleteParty(id: string): void {
    const list = this.getParties().filter((p) => p.id !== id);
    this.set(STORAGE_KEYS.PARTIES, list);
  }

  // Items
  getItems(): InventoryItem[] {
    return this.get<InventoryItem[]>(STORAGE_KEYS.ITEMS, DEFAULT_ITEMS);
  }

  saveItem(item: InventoryItem): void {
    const list = this.getItems();
    const idx = list.findIndex((i) => i.id === item.id);
    if (idx >= 0) {
      list[idx] = item;
    } else {
      list.push(item);
    }
    this.set(STORAGE_KEYS.ITEMS, list);
  }

  deleteItem(id: string): void {
    const list = this.getItems().filter((i) => i.id !== id);
    this.set(STORAGE_KEYS.ITEMS, list);
  }

  // Invoices
  getInvoices(): Invoice[] {
    return this.get<Invoice[]>(STORAGE_KEYS.INVOICES, []);
  }

  saveInvoice(invoice: Invoice): void {
    const list = this.getInvoices();
    const idx = list.findIndex((inv) => inv.id === invoice.id);
    if (idx >= 0) {
      list[idx] = invoice;
    } else {
      list.unshift(invoice);
    }
    this.set(STORAGE_KEYS.INVOICES, list);

    // Update stock levels
    const items = this.getItems();
    for (const line of invoice.items) {
      const match = items.find((itm) => itm.id === line.itemId);
      if (match && match.currentStock > 0) {
        match.currentStock = Math.max(0, match.currentStock - line.quantity);
        this.saveItem(match);
      }
    }
  }

  deleteInvoice(id: string): void {
    const list = this.getInvoices().filter((inv) => inv.id !== id);
    this.set(STORAGE_KEYS.INVOICES, list);
  }

  // Purchases
  getPurchases(): PurchaseBill[] {
    return this.get<PurchaseBill[]>(STORAGE_KEYS.PURCHASES, [
      {
        id: 'PUR-001',
        billNumber: 'BILL-SUP-8821',
        date: new Date().toISOString().split('T')[0],
        supplierId: 'PTY-101',
        supplierName: 'National Hardware & Electronics Ltd',
        supplierGstin: '27AAACS1429B1ZV',
        supplierAddress: 'MIDC Phase II, Pune',
        supplierStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        itcEligibility: 'ELIGIBLE_INPUTS',
        isRcm: false,
        items: [
          {
            name: 'Thermal Receipt Printer 80mm USB+BT',
            hsnSacCode: '844332',
            unit: 'PCS',
            quantity: 10,
            unitPrice: 2800,
            taxableAmount: 28000,
            gstRate: 18,
            cgstAmount: 2520,
            sgstAmount: 2520,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 33040,
          },
        ],
        totalGrossAmount: 28000,
        totalDiscount: 0,
        totalTaxableAmount: 28000,
        totalCgst: 2520,
        totalSgst: 2520,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 5040,
        roundOff: 0,
        grandTotal: 33040,
        paymentMode: 'NET_BANKING',
        paymentStatus: 'PAID',
        paidAmount: 33040,
        balanceAmount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
  }

  savePurchase(bill: PurchaseBill): void {
    const list = this.getPurchases();
    const idx = list.findIndex((b) => b.id === bill.id);
    if (idx >= 0) {
      list[idx] = bill;
    } else {
      list.unshift(bill);
    }
    this.set(STORAGE_KEYS.PURCHASES, list);

    // Increase stock levels for purchased items
    const items = this.getItems();
    for (const line of bill.items) {
      if (line.itemId) {
        const match = items.find((itm) => itm.id === line.itemId);
        if (match) {
          match.currentStock += line.quantity;
          this.saveItem(match);
        }
      }
    }
  }

  deletePurchase(id: string): void {
    const list = this.getPurchases().filter((b) => b.id !== id);
    this.set(STORAGE_KEYS.PURCHASES, list);
  }

  // Stock Adjustments
  getStockAdjustments(): StockAdjustment[] {
    return this.get<StockAdjustment[]>(STORAGE_KEYS.ADJUSTMENTS, []);
  }

  saveStockAdjustment(adj: StockAdjustment): void {
    const list = this.getStockAdjustments();
    list.unshift(adj);
    this.set(STORAGE_KEYS.ADJUSTMENTS, list);

    // Update item stock
    const items = this.getItems();
    const match = items.find((i) => i.id === adj.itemId);
    if (match) {
      if (adj.type === 'STOCK_IN') {
        match.currentStock += adj.quantity;
      } else {
        match.currentStock = Math.max(0, match.currentStock - adj.quantity);
      }
      this.saveItem(match);
    }
  }

  // Vouchers
  getVouchers(): Voucher[] {
    return this.get<Voucher[]>(STORAGE_KEYS.VOUCHERS, []);
  }

  saveVoucher(voucher: Voucher): void {
    const list = this.getVouchers();
    list.unshift(voucher);
    this.set(STORAGE_KEYS.VOUCHERS, list);
  }
}

export const db = new StorageService();

