import { CompanyProfile } from '../models/company.ts';
import { Party } from '../models/party.ts';
import { InventoryItem } from '../models/item.ts';
import { Invoice } from '../models/invoice.ts';
import { Voucher } from '../core/accounting/voucherTypes.ts';
import { PurchaseBill } from '../models/purchase.ts';
import { StockAdjustment } from '../models/item.ts';
import { Expense } from '../models/expense.ts';
import { pouch } from './pouchdb.ts';

const STORAGE_KEYS = {
  COMPANY: 'gst_company_profile',
  PARTIES: 'gst_parties',
  ITEMS: 'gst_items',
  INVOICES: 'gst_invoices',
  PURCHASES: 'gst_purchases',
  EXPENSES: 'gst_expenses',
  ADJUSTMENTS: 'gst_stock_adjustments',
  VOUCHERS: 'gst_vouchers',
  SETTINGS: 'gst_app_settings',
  LOCAL_PRINTING_SETTINGS: 'local_device_printing_settings', // Kept strictly device-local
};

export interface SyncedSettings {
  id: string; // 'app_settings'
  company: CompanyProfile;
  isGstEnabled?: boolean;
  appLanguage?: string;
  isAppLockEnabled?: boolean;
  defaultGstRate?: number;
  enableEwayBill?: boolean;
  ewayBillThreshold?: number;
  autoWhatsAppAlerts?: boolean;
  updatedAt: string;
}

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
  isGstEnabled: true,
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

export const DEFAULT_INVOICES: Invoice[] = [
  {
    id: 'INV-SAMPLE-001',
    invoiceNumber: 'INV-2024-001',
    invoiceType: 'B2B',
    date: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
    partyId: 'PTY-101',
    partyName: 'National Hardware & Electronics Ltd',
    partyGstin: '27AAACS1429B1ZV',
    partyAddress: 'Plot 42, MIDC Phase II, Hinjewadi, Pune, Maharashtra - 411057',
    partyStateCode: '27',
    placeOfSupplyStateCode: '27',
    isIntraState: true,
    items: [
      {
        itemId: 'ITM-001',
        name: 'Thermal Receipt Printer 80mm USB+BT',
        hsnSacCode: '844332',
        unit: 'PCS',
        quantity: 2,
        unitPrice: 3800,
        discountPercent: 5,
        taxableAmount: 7220,
        gstRate: 18,
        cgstAmount: 649.8,
        sgstAmount: 649.8,
        igstAmount: 0,
        cessAmount: 0,
        totalAmount: 8519.6,
      },
      {
        itemId: 'ITM-002',
        name: 'Wireless 2D Barcode Scanner',
        hsnSacCode: '847130',
        unit: 'PCS',
        quantity: 1,
        unitPrice: 1950,
        discountPercent: 0,
        taxableAmount: 1950,
        gstRate: 18,
        cgstAmount: 175.5,
        sgstAmount: 175.5,
        igstAmount: 0,
        cessAmount: 0,
        totalAmount: 2301,
      },
      {
        itemId: 'ITM-003',
        name: 'Billing Thermal Paper Roll (79mm x 50m)',
        hsnSacCode: '4802',
        unit: 'BOX',
        quantity: 4,
        unitPrice: 850,
        discountPercent: 0,
        taxableAmount: 3400,
        gstRate: 12,
        cgstAmount: 204,
        sgstAmount: 204,
        igstAmount: 0,
        cessAmount: 0,
        totalAmount: 3808,
      },
    ],
    totalGrossAmount: 12950,
    totalDiscount: 380,
    totalTaxableAmount: 12570,
    totalCgst: 1029.3,
    totalSgst: 1029.3,
    totalIgst: 0,
    totalCess: 0,
    totalTax: 2058.6,
    roundOff: 0.4,
    grandTotal: 14629,
    amountInWords: 'Rupees Fourteen Thousand Six Hundred Twenty Nine Only',
    paymentMode: 'UPI',
    paymentStatus: 'PAID',
    paidAmount: 14629,
    balanceAmount: 0,
    notes: 'Goods once sold cannot be returned without original receipt.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

/**
 * Offline-first Data Access and Multi-Device Synchronization Engine.
 * 
 * Architecture:
 * - Tier 1: Synchronous LocalStorage cache for immediate 60fps UI responsiveness.
 * - Tier 2: Asynchronous PouchDB (IndexedDB) for persistent offline transactions and document versioning.
 * - Tier 3: Bidirectional continuous CouchDB sync for remote multi-counter / multi-branch synchronization.
 * - Tier 4: Cross-tab / PWA BroadcastChannel (`vyapar_multi_device_sync`) for instant intra-device state sync.
 * - Hardware Isolation: Printing hardware configurations (thermal paper width 58/80mm, Bluetooth/USB addresses)
 *   are strictly retained locally and excluded from remote sync to prevent counter conflicts.
 */
class StorageService {
  constructor() {
    // Cross-tab / cross-window multi-device real-time sync channel
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const bc = new BroadcastChannel('vyapar_multi_device_sync');
        bc.onmessage = (event) => {
          if (event.data?.type === 'ALL_SETTINGS_SYNC' && event.data.settings) {
            // Apply all settings, strictly excluding and preserving local device printing settings
            const { printingSettings, printerWidth, printerType, bluetoothPrinterAddress, ...syncable } = event.data.settings;
            const current = this.getSettings();
            this.set(STORAGE_KEYS.SETTINGS, { ...current, ...syncable });
            if (syncable.company) {
              this.set(STORAGE_KEYS.COMPANY, syncable.company);
            }
          } else if (event.data?.type === 'COMPANY_PROFILE_SYNC' && event.data.company) {
            this.set(STORAGE_KEYS.COMPANY, event.data.company);
            pouch.putDoc('company', event.data.company);
          }
        };
      } catch (e) {
        console.warn('BroadcastChannel not initialized:', e);
      }
    }

    // Perform initial PouchDB migration and setup live synchronization hooks
    setTimeout(() => {
      pouch.migrateFromLocalStorage({
        company: this.getCompany(),
        parties: this.getParties(),
        items: this.getItems(),
        invoices: this.getInvoices(),
        purchases: this.getPurchases(),
        expenses: this.getExpenses(),
        adjustments: this.getStockAdjustments(),
        vouchers: this.getVouchers(),
      });

      pouch.subscribeDataChange(async () => {
        // Synchronize remote changes from other counter devices into local storage cache
        try {
          // Synchronize all settings (taxes, invoices, banking, alerts, security) excluding printing
          const remoteSettings = await pouch.getAllDocs<SyncedSettings>('settings');
          if (remoteSettings.length > 0) {
            const { printingSettings, printerWidth, printerType, bluetoothPrinterAddress, ...syncable } = remoteSettings[0] as any;
            const current = this.getSettings();
            this.set(STORAGE_KEYS.SETTINGS, { ...current, ...syncable });
            if (syncable.company) {
              this.set(STORAGE_KEYS.COMPANY, syncable.company);
            }
          }

          const remoteCompany = await pouch.getAllDocs<CompanyProfile>('company');
          if (remoteCompany.length > 0) this.set(STORAGE_KEYS.COMPANY, remoteCompany[0]);

          const remoteInvoices = await pouch.getAllDocs<Invoice>('invoice');
          if (remoteInvoices.length > 0) this.set(STORAGE_KEYS.INVOICES, remoteInvoices);

          const remoteParties = await pouch.getAllDocs<Party>('party');
          if (remoteParties.length > 0) this.set(STORAGE_KEYS.PARTIES, remoteParties);

          const remoteItems = await pouch.getAllDocs<InventoryItem>('item');
          if (remoteItems.length > 0) this.set(STORAGE_KEYS.ITEMS, remoteItems);
        } catch (e) {
          console.warn('Error applying remote PouchDB changes:', e);
        }
      });
    }, 100);
  }

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
    pouch.putDoc('company', company);
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const bc = new BroadcastChannel('vyapar_multi_device_sync');
        bc.postMessage({ type: 'COMPANY_PROFILE_SYNC', company, timestamp: Date.now() });
        bc.close();
      } catch (e) {}
    }
  }

  async syncBusinessProfileAcrossDevices(company: CompanyProfile): Promise<{ success: boolean; lastSyncedAt: string }> {
    this.saveCompany(company);
    await pouch.syncNow();
    return {
      success: true,
      lastSyncedAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
  }

  // Synced Settings (All settings except device-local printing settings)
  getSettings(): SyncedSettings {
    const defaultSettings: SyncedSettings = {
      id: 'app_settings',
      company: this.getCompany(),
      appLanguage: 'English (India)',
      isAppLockEnabled: true,
      defaultGstRate: 18,
      enableEwayBill: true,
      ewayBillThreshold: 50000,
      autoWhatsAppAlerts: true,
      updatedAt: new Date().toISOString(),
    };
    return this.get<SyncedSettings>(STORAGE_KEYS.SETTINGS, defaultSettings);
  }

  saveSettings(settings: Partial<SyncedSettings>): void {
    const current = this.getSettings();
    // Explicitly exclude and strip any printing settings so they remain device-local
    const { printingSettings, printerWidth, printerType, bluetoothPrinterAddress, ...syncable } = settings as any;
    const merged: SyncedSettings = {
      ...current,
      ...syncable,
      updatedAt: new Date().toISOString(),
    };
    this.set(STORAGE_KEYS.SETTINGS, merged);
    if (merged.company) {
      this.set(STORAGE_KEYS.COMPANY, merged.company);
      pouch.putDoc('company', merged.company);
    }
    pouch.putDoc('settings', merged);

    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const bc = new BroadcastChannel('vyapar_multi_device_sync');
        bc.postMessage({ type: 'ALL_SETTINGS_SYNC', settings: merged, timestamp: Date.now() });
        bc.close();
      } catch (e) {}
    }
  }

  async syncAllSettingsAcrossDevices(settingsPayload?: Partial<SyncedSettings>): Promise<{ success: boolean; lastSyncedAt: string }> {
    if (settingsPayload) {
      this.saveSettings(settingsPayload);
    } else {
      this.saveSettings(this.getSettings());
    }
    await pouch.syncNow();
    return {
      success: true,
      lastSyncedAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
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
    pouch.putDoc('party', party);
  }

  deleteParty(id: string): void {
    const list = this.getParties().filter((p) => p.id !== id);
    this.set(STORAGE_KEYS.PARTIES, list);
    pouch.deleteDoc('party', id);
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
    pouch.putDoc('item', item);
  }

  deleteItem(id: string): void {
    const list = this.getItems().filter((i) => i.id !== id);
    this.set(STORAGE_KEYS.ITEMS, list);
    pouch.deleteDoc('item', id);
  }

  // Invoices
  getInvoices(): Invoice[] {
    const list = this.get<Invoice[]>(STORAGE_KEYS.INVOICES, DEFAULT_INVOICES);
    return list && list.length > 0 ? list : DEFAULT_INVOICES;
  }

  saveInvoice(invoice: Invoice): void {
    const list = this.getInvoices();
    // Enforce unique invoice number under GST compliance
    const norm = (invoice.invoiceNumber || '').trim().toUpperCase();
    const conflict = list.find(
      (inv) => inv.id !== invoice.id && (inv.invoiceNumber || '').trim().toUpperCase() === norm
    );
    if (conflict) {
      throw new Error(`Invoice number "${invoice.invoiceNumber}" is already in use by invoice for ${conflict.partyName}. Invoices must have unique numbers.`);
    }

    const idx = list.findIndex((inv) => inv.id === invoice.id);
    if (idx >= 0) {
      list[idx] = invoice;
    } else {
      list.unshift(invoice);
    }
    this.set(STORAGE_KEYS.INVOICES, list);
    pouch.putDoc('invoice', invoice);

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
    pouch.deleteDoc('invoice', id);
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
    pouch.putDoc('purchase', bill);

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
    pouch.deleteDoc('purchase', id);
  }

  // Stock Adjustments
  getStockAdjustments(): StockAdjustment[] {
    return this.get<StockAdjustment[]>(STORAGE_KEYS.ADJUSTMENTS, []);
  }

  saveStockAdjustment(adj: StockAdjustment): void {
    const list = this.getStockAdjustments();
    list.unshift(adj);
    this.set(STORAGE_KEYS.ADJUSTMENTS, list);
    pouch.putDoc('adjustment', adj);

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
    const idx = list.findIndex((v) => v.id === voucher.id);
    if (idx >= 0) {
      list[idx] = voucher;
    } else {
      list.unshift(voucher);
    }
    this.set(STORAGE_KEYS.VOUCHERS, list);
    pouch.putDoc('voucher', voucher);
  }

  deleteVoucher(id: string): void {
    const list = this.getVouchers().filter((v) => v.id !== id);
    this.set(STORAGE_KEYS.VOUCHERS, list);
    pouch.deleteDoc('voucher', id);
  }

  // Expenses
  getExpenses(): Expense[] {
    return this.get<Expense[]>(STORAGE_KEYS.EXPENSES, [
      {
        id: 'EXP-001',
        category: 'Rent & Utilities',
        title: 'Office & Warehouse Rent (Oct 2024)',
        amount: 25000,
        taxableAmount: 21186.44,
        gstRate: 18,
        taxAmount: 3813.56,
        cgstAmount: 1906.78,
        sgstAmount: 1906.78,
        igstAmount: 0,
        date: '2024-10-01',
        paymentMode: 'BANK_TRANSFER',
        vendorName: 'Pinnacle Commercial Spaces',
        vendorGstin: '27AABCP1234D1ZZ',
        voucherNumber: 'VR-24-089',
        itcEligible: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'EXP-002',
        category: 'Electricity & Water',
        title: 'MSEDCL Commercial Power Bill',
        amount: 4200,
        taxableAmount: 4200,
        gstRate: 0,
        taxAmount: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        date: '2024-10-05',
        paymentMode: 'UPI',
        vendorName: 'MSEDCL Maharashtra',
        voucherNumber: 'EB-88219',
        itcEligible: false,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'EXP-003',
        category: 'Tea, Coffee & Refreshments',
        title: 'Staff Pantry & Client Hospitality',
        amount: 1850,
        taxableAmount: 1761.9,
        gstRate: 5,
        taxAmount: 88.1,
        cgstAmount: 44.05,
        sgstAmount: 44.05,
        igstAmount: 0,
        date: '2024-10-08',
        paymentMode: 'CASH',
        vendorName: 'Sai Daily Needs',
        itcEligible: false,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'EXP-004',
        category: 'Packaging & Courier',
        title: 'Bluedart Priority Parcel Express',
        amount: 3450,
        taxableAmount: 2923.73,
        gstRate: 18,
        taxAmount: 526.27,
        cgstAmount: 263.14,
        sgstAmount: 263.14,
        igstAmount: 0,
        date: '2024-10-12',
        paymentMode: 'UPI',
        vendorName: 'Blue Dart Express Ltd',
        vendorGstin: '27AAACB0012A1ZX',
        voucherNumber: 'BD-PUN-9921',
        itcEligible: true,
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  saveExpense(expense: Expense): void {
    const list = this.getExpenses();
    const idx = list.findIndex((e) => e.id === expense.id);
    if (idx >= 0) {
      list[idx] = expense;
    } else {
      list.unshift(expense);
    }
    this.set(STORAGE_KEYS.EXPENSES, list);
    pouch.putDoc('expense', expense);
  }

  deleteExpense(id: string): void {
    const list = this.getExpenses().filter((e) => e.id !== id);
    this.set(STORAGE_KEYS.EXPENSES, list);
    pouch.deleteDoc('expense', id);
  }
}

export const db = new StorageService();
