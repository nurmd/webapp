import { CompanyProfile } from '../models/company.ts';
import { Party } from '../models/party.ts';
import { InventoryItem } from '../models/item.ts';
import { Invoice } from '../models/invoice.ts';
import { Voucher } from '../core/accounting/voucherTypes.ts';
import { PurchaseBill } from '../models/purchase.ts';
import { StockAdjustment } from '../models/item.ts';
import { Expense } from '../models/expense.ts';
import { BankAccount, CashBankTransaction } from '../models/bankAccount.ts';
import { pouch, type PouchDocChange } from './pouchdb.ts';

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
  BANK_ACCOUNTS: 'gst_bank_accounts',
  CASH_BANK_TXNS: 'gst_cash_bank_transactions',
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

// Clean Initial Seed Data for Production Use
const DEFAULT_COMPANY: CompanyProfile = {
  id: 'COMP-001',
  businessName: 'My Store',
  tradeName: 'My Store',
  gstin: '',
  pan: '',
  stateCode: '27',
  address: '',
  pincode: '',
  phone: '',
  email: '',
  website: '',
  bankName: '',
  accountNumber: '',
  ifscCode: '',
  branchName: '',
  upiId: '',
  termsAndConditions: '1. Goods once sold will not be taken back.\n2. Subject to local jurisdiction.',
  invoicePrefix: 'INV-',
  isGstEnabled: true,
};

const DEFAULT_PARTIES: Party[] = [];

const DEFAULT_ITEMS: InventoryItem[] = [];

export const DEFAULT_INVOICES: Invoice[] = [];

export const DEFAULT_BANK_ACCOUNTS: BankAccount[] = [
  {
    id: 'ACC_CASH',
    accountName: 'Cash in Hand',
    accountType: 'CASH',
    openingBalance: 0,
    openingBalanceDate: new Date().toISOString().split('T')[0],
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const DEFAULT_CASH_BANK_TXNS: CashBankTransaction[] = [];

const DEMO_PARTY_IDS = new Set(['PTY-101', 'PTY-102', 'PTY-103']);
const DEMO_ITEM_IDS = new Set(['ITM-001', 'ITM-002', 'ITM-003', 'ITM-004']);
const DEMO_INVOICE_IDS = new Set(['INV-SAMPLE-001']);
const DEMO_PURCHASE_IDS = new Set(['PUR-001']);
const DEMO_EXPENSE_IDS = new Set(['EXP-001', 'EXP-002', 'EXP-003', 'EXP-004']);
const DEMO_BANK_IDS = new Set(['ACC_BANK_SBI']);
const DEMO_TXN_IDS = new Set(['TXN-INIT-001']);

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
  private listeners: Set<() => void> = new Set();
  private batchNotifyTimeout: any = null;
  private broadcastChannel: BroadcastChannel | null = null;

  constructor() {
    // Purge any legacy sample/demo data to guarantee clean production state
    this.purgeDemoData();

    // Cross-tab / cross-window multi-device real-time sync channel
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.broadcastChannel = new BroadcastChannel('vyapar_multi_device_sync');
        this.broadcastChannel.onmessage = (event) => {
          if (event.data?.type === 'ALL_SETTINGS_SYNC' && event.data.settings) {
            // Apply all settings, strictly excluding and preserving local device printing settings
            const { printingSettings, printerWidth, printerType, bluetoothPrinterAddress, ...syncable } = event.data.settings;
            const current = this.getSettings();
            this.set(STORAGE_KEYS.SETTINGS, { ...current, ...syncable });
            if (syncable.company) {
              this.set(STORAGE_KEYS.COMPANY, syncable.company);
            }
            this.notifyListeners();
          } else if (event.data?.type === 'COMPANY_PROFILE_SYNC' && event.data.company) {
            this.set(STORAGE_KEYS.COMPANY, event.data.company);
            this.notifyListeners();
          } else if (event.data?.type === 'ENTITY_MUTATION') {
            const { entity, action, id, data } = event.data;
            this.applyLocalEntityMutation(entity, action, id, data);
          }
        };
      } catch (e) {
        console.warn('BroadcastChannel not initialized:', e);
      }
    }

    // Cross-tab storage event fallback
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key && (event.key.startsWith('gst_') || event.key === 'couchdb_remote_url')) {
          this.notifyListeners();
        }
      });
    }

    // Perform initial PouchDB migration and setup live synchronization hooks
    setTimeout(() => {
      pouch
        .migrateFromLocalStorage({
          company: this.getCompany(),
          parties: this.getParties(),
          items: this.getItems(),
          invoices: this.getInvoices(),
          purchases: this.getPurchases(),
          expenses: this.getExpenses(),
          adjustments: this.getStockAdjustments(),
          vouchers: this.getVouchers(),
          bankAccounts: this.getBankAccounts(),
          cashBankTxns: this.getCashBankTransactions(),
        })
        .then(() => {
          // Hydrate from PouchDB in case remote CouchDB already had data
          this.syncAllFromPouch();
        });

      // Realtime continuous change listener
      pouch.subscribeDataChange((change) => {
        this.applyIncomingChange(change);
      });
    }, 100);
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public notifyListeners(): void {
    if (this.batchNotifyTimeout) return;
    this.batchNotifyTimeout = setTimeout(() => {
      this.batchNotifyTimeout = null;
      this.listeners.forEach((listener) => {
        try {
          listener();
        } catch (e) {
          console.error('DB listener error:', e);
        }
      });
    }, 16);
  }

  private broadcastChange(entity: string, action: 'save' | 'delete', id: string, data?: any): void {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        if (!this.broadcastChannel) {
          this.broadcastChannel = new BroadcastChannel('vyapar_multi_device_sync');
        }
        this.broadcastChannel.postMessage({
          type: 'ENTITY_MUTATION',
          entity,
          action,
          id,
          data,
          timestamp: Date.now(),
        });
      } catch (e) {}
    }
  }

  private applyLocalEntityMutation(entity: string, action: 'save' | 'delete', id: string, data?: any): void {
    if (action === 'delete') {
      switch (entity) {
        case 'invoice': this.set(STORAGE_KEYS.INVOICES, this.getInvoices().filter((i) => i.id !== id)); break;
        case 'purchase': this.set(STORAGE_KEYS.PURCHASES, this.getPurchases().filter((p) => p.id !== id)); break;
        case 'party': this.set(STORAGE_KEYS.PARTIES, this.getParties().filter((p) => p.id !== id)); break;
        case 'item': this.set(STORAGE_KEYS.ITEMS, this.getItems().filter((i) => i.id !== id)); break;
        case 'expense': this.set(STORAGE_KEYS.EXPENSES, this.getExpenses().filter((e) => e.id !== id)); break;
        case 'voucher': this.set(STORAGE_KEYS.VOUCHERS, this.getVouchers().filter((v) => v.id !== id)); break;
        case 'adjustment': this.set(STORAGE_KEYS.ADJUSTMENTS, this.getStockAdjustments().filter((a) => a.id !== id)); break;
        case 'bank_account': this.set(STORAGE_KEYS.BANK_ACCOUNTS, this.getBankAccounts().filter((b) => b.id !== id)); break;
        case 'cash_bank_txn': this.set(STORAGE_KEYS.CASH_BANK_TXNS, this.getCashBankTransactions().filter((t) => t.id !== id)); break;
      }
      this.syncAllPartyBalances();
    } else if (data) {
      switch (entity) {
        case 'invoice': {
          const list = this.getInvoices();
          const idx = list.findIndex((i) => i.id === id);
          if (idx >= 0) list[idx] = data; else list.unshift(data);
          this.set(STORAGE_KEYS.INVOICES, list);
          break;
        }
        case 'purchase': {
          const list = this.getPurchases();
          const idx = list.findIndex((p) => p.id === id);
          if (idx >= 0) list[idx] = data; else list.unshift(data);
          this.set(STORAGE_KEYS.PURCHASES, list);
          break;
        }
        case 'party': {
          const list = this.getParties();
          const idx = list.findIndex((p) => p.id === id);
          if (idx >= 0) list[idx] = data; else list.push(data);
          this.set(STORAGE_KEYS.PARTIES, list);
          break;
        }
        case 'item': {
          const list = this.getItems();
          const idx = list.findIndex((i) => i.id === id);
          if (idx >= 0) list[idx] = data; else list.push(data);
          this.set(STORAGE_KEYS.ITEMS, list);
          break;
        }
        case 'expense': {
          const list = this.getExpenses();
          const idx = list.findIndex((e) => e.id === id);
          if (idx >= 0) list[idx] = data; else list.unshift(data);
          this.set(STORAGE_KEYS.EXPENSES, list);
          break;
        }
        case 'voucher': {
          const list = this.getVouchers();
          const idx = list.findIndex((v) => v.id === id);
          if (idx >= 0) list[idx] = data; else list.unshift(data);
          this.set(STORAGE_KEYS.VOUCHERS, list);
          break;
        }
        case 'adjustment': {
          const list = this.getStockAdjustments();
          const idx = list.findIndex((a) => a.id === id);
          if (idx >= 0) list[idx] = data; else list.unshift(data);
          this.set(STORAGE_KEYS.ADJUSTMENTS, list);
          break;
        }
        case 'bank_account': {
          const list = this.getBankAccounts();
          const idx = list.findIndex((b) => b.id === id);
          if (idx >= 0) list[idx] = data; else list.push(data);
          this.set(STORAGE_KEYS.BANK_ACCOUNTS, list);
          break;
        }
        case 'cash_bank_txn': {
          const list = this.getCashBankTransactions();
          const idx = list.findIndex((t) => t.id === id);
          if (idx >= 0) list[idx] = data; else list.unshift(data);
          this.set(STORAGE_KEYS.CASH_BANK_TXNS, list);
          break;
        }
      }
      this.syncAllPartyBalances();
    }
    this.notifyListeners();
  }

  public applyIncomingChange(change?: PouchDocChange): void {
    if (!change || !change.id) {
      this.syncAllFromPouch();
      return;
    }

    const colonIdx = change.id.indexOf(':');
    if (colonIdx === -1) {
      this.syncAllFromPouch();
      return;
    }

    const docType = change.id.substring(0, colonIdx);
    const docId = change.id.substring(colonIdx + 1);

    if (change.deleted) {
      switch (docType) {
        case 'invoice': {
          const list = this.getInvoices().filter((i) => i.id !== docId);
          this.set(STORAGE_KEYS.INVOICES, list);
          this.syncAllPartyBalances();
          break;
        }
        case 'purchase': {
          const list = this.getPurchases().filter((p) => p.id !== docId);
          this.set(STORAGE_KEYS.PURCHASES, list);
          this.syncAllPartyBalances();
          break;
        }
        case 'party': {
          const list = this.getParties().filter((p) => p.id !== docId);
          this.set(STORAGE_KEYS.PARTIES, list);
          break;
        }
        case 'item': {
          const list = this.getItems().filter((i) => i.id !== docId);
          this.set(STORAGE_KEYS.ITEMS, list);
          break;
        }
        case 'expense': {
          const list = this.getExpenses().filter((e) => e.id !== docId);
          this.set(STORAGE_KEYS.EXPENSES, list);
          break;
        }
        case 'voucher': {
          const list = this.getVouchers().filter((v) => v.id !== docId);
          this.set(STORAGE_KEYS.VOUCHERS, list);
          this.syncAllPartyBalances();
          break;
        }
        case 'adjustment': {
          const list = this.getStockAdjustments().filter((a) => a.id !== docId);
          this.set(STORAGE_KEYS.ADJUSTMENTS, list);
          break;
        }
        case 'bank_account': {
          const list = this.getBankAccounts().filter((b) => b.id !== docId);
          this.set(STORAGE_KEYS.BANK_ACCOUNTS, list);
          break;
        }
        case 'cash_bank_txn': {
          const list = this.getCashBankTransactions().filter((t) => t.id !== docId);
          this.set(STORAGE_KEYS.CASH_BANK_TXNS, list);
          break;
        }
      }
      this.notifyListeners();
      return;
    }

    const doc = change.doc;
    if (!doc) {
      this.syncAllFromPouch();
      return;
    }

    const { _id, _rev, docType: _dt, syncedAt: _sa, ...cleanEntity } = doc;

    switch (docType) {
      case 'invoice': {
        const inv = cleanEntity as Invoice;
        const list = this.getInvoices();
        const idx = list.findIndex((i) => i.id === docId);
        if (idx >= 0) {
          list[idx] = inv;
        } else {
          list.unshift(inv);
        }
        this.set(STORAGE_KEYS.INVOICES, list);
        if (inv.partyId) {
          this.recalculatePartyBalance(inv.partyId);
        }
        break;
      }
      case 'purchase': {
        const pur = cleanEntity as PurchaseBill;
        const list = this.getPurchases();
        const idx = list.findIndex((p) => p.id === docId);
        if (idx >= 0) {
          list[idx] = pur;
        } else {
          list.unshift(pur);
        }
        this.set(STORAGE_KEYS.PURCHASES, list);
        if (pur.supplierId) {
          this.recalculatePartyBalance(pur.supplierId);
        }
        break;
      }
      case 'party': {
        const list = this.getParties();
        const idx = list.findIndex((p) => p.id === docId);
        if (idx >= 0) {
          list[idx] = cleanEntity as Party;
        } else {
          list.push(cleanEntity as Party);
        }
        this.set(STORAGE_KEYS.PARTIES, list);
        break;
      }
      case 'item': {
        const list = this.getItems();
        const idx = list.findIndex((i) => i.id === docId);
        if (idx >= 0) {
          list[idx] = cleanEntity as InventoryItem;
        } else {
          list.push(cleanEntity as InventoryItem);
        }
        this.set(STORAGE_KEYS.ITEMS, list);
        break;
      }
      case 'expense': {
        const list = this.getExpenses();
        const idx = list.findIndex((e) => e.id === docId);
        if (idx >= 0) {
          list[idx] = cleanEntity as Expense;
        } else {
          list.unshift(cleanEntity as Expense);
        }
        this.set(STORAGE_KEYS.EXPENSES, list);
        break;
      }
      case 'voucher': {
        const list = this.getVouchers();
        const idx = list.findIndex((v) => v.id === docId);
        if (idx >= 0) {
          list[idx] = cleanEntity as Voucher;
        } else {
          list.unshift(cleanEntity as Voucher);
        }
        this.set(STORAGE_KEYS.VOUCHERS, list);
        this.syncAllPartyBalances();
        break;
      }
      case 'adjustment': {
        const list = this.getStockAdjustments();
        const idx = list.findIndex((a) => a.id === docId);
        if (idx >= 0) {
          list[idx] = cleanEntity as StockAdjustment;
        } else {
          list.unshift(cleanEntity as StockAdjustment);
        }
        this.set(STORAGE_KEYS.ADJUSTMENTS, list);
        break;
      }
      case 'bank_account': {
        const list = this.getBankAccounts();
        const idx = list.findIndex((b) => b.id === docId);
        if (idx >= 0) {
          list[idx] = cleanEntity as BankAccount;
        } else {
          list.push(cleanEntity as BankAccount);
        }
        this.set(STORAGE_KEYS.BANK_ACCOUNTS, list);
        break;
      }
      case 'cash_bank_txn': {
        const list = this.getCashBankTransactions();
        const idx = list.findIndex((t) => t.id === docId);
        if (idx >= 0) {
          list[idx] = cleanEntity as CashBankTransaction;
        } else {
          list.unshift(cleanEntity as CashBankTransaction);
        }
        this.set(STORAGE_KEYS.CASH_BANK_TXNS, list);
        break;
      }
      case 'company': {
        this.set(STORAGE_KEYS.COMPANY, cleanEntity as CompanyProfile);
        break;
      }
      case 'settings': {
        const { printingSettings, printerWidth, printerType, bluetoothPrinterAddress, ...syncable } = cleanEntity as any;
        const current = this.getSettings();
        this.set(STORAGE_KEYS.SETTINGS, { ...current, ...syncable });
        if (syncable.company) {
          this.set(STORAGE_KEYS.COMPANY, syncable.company);
        }
        break;
      }
    }

    this.notifyListeners();
  }

  private purgeDemoData(): void {
    try {
      if (typeof window === 'undefined') return;
      const PURGE_KEY = 'gst_demo_purged_v1017';
      if (localStorage.getItem(PURGE_KEY)) return;

      // 1. Company
      const comp = this.getCompany();
      if (comp && (comp.businessName === 'Apex Technologies Private Limited' || comp.gstin === '27AABCT3518Q1ZS')) {
        this.set(STORAGE_KEYS.COMPANY, DEFAULT_COMPANY);
        pouch.putDoc('company', { ...DEFAULT_COMPANY, id: 'company_profile' });
      }

      // 2. Parties
      const parties = this.getParties().filter((p) => !DEMO_PARTY_IDS.has(p.id));
      this.set(STORAGE_KEYS.PARTIES, parties);
      DEMO_PARTY_IDS.forEach((id) => pouch.deleteDoc('party', id));

      // 3. Items
      const items = this.getItems().filter((i) => !DEMO_ITEM_IDS.has(i.id));
      this.set(STORAGE_KEYS.ITEMS, items);
      DEMO_ITEM_IDS.forEach((id) => pouch.deleteDoc('item', id));

      // 4. Invoices
      const invoices = this.getInvoices().filter((i) => !DEMO_INVOICE_IDS.has(i.id) && !i.id.startsWith('INV-SAMPLE-'));
      this.set(STORAGE_KEYS.INVOICES, invoices);
      DEMO_INVOICE_IDS.forEach((id) => pouch.deleteDoc('invoice', id));

      // 5. Purchases
      const purchases = this.getPurchases().filter((p) => !DEMO_PURCHASE_IDS.has(p.id));
      this.set(STORAGE_KEYS.PURCHASES, purchases);
      DEMO_PURCHASE_IDS.forEach((id) => pouch.deleteDoc('purchase', id));

      // 6. Expenses
      const expenses = this.getExpenses().filter((e) => !DEMO_EXPENSE_IDS.has(e.id));
      this.set(STORAGE_KEYS.EXPENSES, expenses);
      DEMO_EXPENSE_IDS.forEach((id) => pouch.deleteDoc('expense', id));

      // 7. Bank Accounts
      let bankAccounts = this.getBankAccounts().filter((b) => !DEMO_BANK_IDS.has(b.id));
      bankAccounts = bankAccounts.map((b) => {
        if (b.id === 'ACC_CASH' && b.openingBalance === 15000) {
          return { ...b, openingBalance: 0 };
        }
        return b;
      });
      if (bankAccounts.length === 0) {
        bankAccounts = DEFAULT_BANK_ACCOUNTS;
      }
      this.set(STORAGE_KEYS.BANK_ACCOUNTS, bankAccounts);
      DEMO_BANK_IDS.forEach((id) => pouch.deleteDoc('bank_account', id));

      // 8. Cash Bank Txns
      const txns = this.getCashBankTransactions().filter((t) => !DEMO_TXN_IDS.has(t.id));
      this.set(STORAGE_KEYS.CASH_BANK_TXNS, txns);
      DEMO_TXN_IDS.forEach((id) => pouch.deleteDoc('cash_bank_txn', id));

      localStorage.setItem(PURGE_KEY, 'true');
    } catch (e) {
      console.warn('Error purging demo data:', e);
    }
  }

  public async syncAllFromPouch(): Promise<void> {
    try {
      const [
        remoteSettings,
        remoteCompany,
        remoteInvoices,
        remotePurchases,
        remoteParties,
        remoteItems,
        remoteExpenses,
        remoteAdjustments,
        remoteVouchers,
        remoteBankAccounts,
        remoteCashBankTxns,
      ] = await Promise.all([
        pouch.getAllDocs<SyncedSettings>('settings'),
        pouch.getAllDocs<CompanyProfile>('company'),
        pouch.getAllDocs<Invoice>('invoice'),
        pouch.getAllDocs<PurchaseBill>('purchase'),
        pouch.getAllDocs<Party>('party'),
        pouch.getAllDocs<InventoryItem>('item'),
        pouch.getAllDocs<Expense>('expense'),
        pouch.getAllDocs<StockAdjustment>('adjustment'),
        pouch.getAllDocs<Voucher>('voucher'),
        pouch.getAllDocs<BankAccount>('bank_account'),
        pouch.getAllDocs<CashBankTransaction>('cash_bank_txn'),
      ]);

      if (remoteSettings.length > 0) {
        const { printingSettings, printerWidth, printerType, bluetoothPrinterAddress, ...syncable } = remoteSettings[0] as any;
        const current = this.getSettings();
        this.set(STORAGE_KEYS.SETTINGS, { ...current, ...syncable });
        if (syncable.company) {
          this.set(STORAGE_KEYS.COMPANY, syncable.company);
        }
      }

      if (remoteCompany.length > 0) {
        const comp = remoteCompany[0];
        if (comp.businessName !== 'Apex Technologies Private Limited' && comp.gstin !== '27AABCT3518Q1ZS') {
          this.set(STORAGE_KEYS.COMPANY, comp);
        }
      }
      if (remoteInvoices.length > 0) {
        const filtered = remoteInvoices.filter((i) => !DEMO_INVOICE_IDS.has(i.id) && !i.id.startsWith('INV-SAMPLE-'));
        this.set(STORAGE_KEYS.INVOICES, filtered);
      }
      if (remotePurchases.length > 0) {
        const filtered = remotePurchases.filter((p) => !DEMO_PURCHASE_IDS.has(p.id));
        this.set(STORAGE_KEYS.PURCHASES, filtered);
      }
      if (remoteParties.length > 0) {
        const filtered = remoteParties.filter((p) => !DEMO_PARTY_IDS.has(p.id));
        this.set(STORAGE_KEYS.PARTIES, filtered);
      }
      if (remoteItems.length > 0) {
        const filtered = remoteItems.filter((i) => !DEMO_ITEM_IDS.has(i.id));
        this.set(STORAGE_KEYS.ITEMS, filtered);
      }
      if (remoteExpenses.length > 0) {
        const filtered = remoteExpenses.filter((e) => !DEMO_EXPENSE_IDS.has(e.id));
        this.set(STORAGE_KEYS.EXPENSES, filtered);
      }
      if (remoteAdjustments.length > 0) this.set(STORAGE_KEYS.ADJUSTMENTS, remoteAdjustments);
      if (remoteVouchers.length > 0) this.set(STORAGE_KEYS.VOUCHERS, remoteVouchers);
      if (remoteBankAccounts.length > 0) {
        const filtered = remoteBankAccounts.filter((b) => !DEMO_BANK_IDS.has(b.id)).map((b) => {
          if (b.id === 'ACC_CASH' && b.openingBalance === 15000) {
            return { ...b, openingBalance: 0 };
          }
          return b;
        });
        this.set(STORAGE_KEYS.BANK_ACCOUNTS, filtered.length > 0 ? filtered : DEFAULT_BANK_ACCOUNTS);
      }
      if (remoteCashBankTxns.length > 0) {
        const filtered = remoteCashBankTxns.filter((t) => !DEMO_TXN_IDS.has(t.id));
        this.set(STORAGE_KEYS.CASH_BANK_TXNS, filtered);
      }

      this.syncAllPartyBalances();
      this.notifyListeners();
    } catch (e) {
      console.warn('Error applying full PouchDB sync:', e);
    }
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
    this.broadcastChange('company', 'save', company.id || 'COMP-001', company);
    this.notifyListeners();
  }

  async syncBusinessProfileAcrossDevices(company: CompanyProfile): Promise<{ success: boolean; lastSyncedAt: string }> {
    this.saveCompany(company);
    await pouch.syncNow();
    return {
      success: true,
      lastSyncedAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
  }

  // Synced Settings (All settings except device-local printing & privacy settings)
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

  // Device-local Buy Price Privacy Setting (Never synced to remote devices)
  getBuyPriceVisibility(): boolean {
    if (typeof window === 'undefined') return true;
    try {
      return localStorage.getItem('gst_hide_buy_prices') !== 'true';
    } catch {
      return true;
    }
  }

  setBuyPriceVisibility(visible: boolean): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('gst_hide_buy_prices', (!visible).toString());
      window.dispatchEvent(new Event('gst_buy_price_visibility_change'));
    } catch {}
  }

  saveSettings(settings: Partial<SyncedSettings>): void {
    const current = this.getSettings();
    // Explicitly exclude and strip any printing settings & device-local privacy settings so they remain device-local
    const { printingSettings, printerWidth, printerType, bluetoothPrinterAddress, showBuyPricesGlobally, ...syncable } = settings as any;
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
    this.broadcastChange('settings', 'save', 'app_settings', merged);
    this.notifyListeners();
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
    this.broadcastChange('party', 'save', party.id, party);
    this.notifyListeners();
  }

  deleteParty(id: string): void {
    const list = this.getParties().filter((p) => p.id !== id);
    this.set(STORAGE_KEYS.PARTIES, list);
    pouch.deleteDoc('party', id);
    this.broadcastChange('party', 'delete', id);
    this.notifyListeners();
  }

  // Recalculate and persist a party's balance based on explicit opening balance and unpaid bills/invoices
  recalculatePartyBalance(partyId: string): number {
    const parties = this.getParties();
    const partyIndex = parties.findIndex((p) => p.id === partyId);
    if (partyIndex < 0) return 0;

    const party = parties[partyIndex];
    const isCustomer = party.type === 'CUSTOMER';
    const partyNameNorm = (party.name || '').trim().toLowerCase();

    // 1. Explicit Opening Balance
    let balance = 0;
    if (typeof party.openingBalance === 'number' && party.openingBalance > 0) {
      const amt = party.openingBalance;
      const opType = party.openingBalanceType || (isCustomer ? 'TO_RECEIVE' : 'TO_PAY');
      if (opType === 'TO_RECEIVE') {
        balance += amt;
      } else {
        balance -= amt;
      }
    }

    if (isCustomer) {
      // Invoices: customer owes remaining unpaid balance (positive = receivable)
      const invoices = this.getInvoices();
      const partyInvoices = invoices.filter(
        (inv) => inv.partyId === party.id || (inv.partyName && inv.partyName.trim().toLowerCase() === partyNameNorm)
      );
      partyInvoices.forEach((inv) => {
        const unpaid = typeof inv.balanceAmount === 'number' ? inv.balanceAmount : Math.max(0, inv.grandTotal - (inv.paidAmount || 0));
        balance += unpaid;
      });

      // Check for unallocated/advance receipt vouchers
      const vouchers = this.getVouchers();
      const partyReceipts = vouchers.filter(
        (v) =>
          v.voucherType === 'RECEIPT' &&
          v.entries.some((e) => e.accountId === party.id || e.accountName.toLowerCase() === partyNameNorm)
      );
      const totalReceipts = partyReceipts.reduce((sum, v) => sum + v.totalAmount, 0);
      const totalInvoicePaid = partyInvoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);
      if (totalReceipts > totalInvoicePaid) {
        // Customer paid more than total settled on invoices (advance from customer)
        balance -= (totalReceipts - totalInvoicePaid);
      }
    } else {
      // Purchases: we owe vendor remaining unpaid balance (negative = payable)
      const purchases = this.getPurchases();
      const partyPurchases = purchases.filter(
        (pur) => pur.supplierId === party.id || (pur.supplierName && pur.supplierName.trim().toLowerCase() === partyNameNorm)
      );
      partyPurchases.forEach((pur) => {
        const unpaid = typeof pur.balanceAmount === 'number' ? pur.balanceAmount : Math.max(0, pur.grandTotal - (pur.paidAmount || 0));
        balance -= unpaid;
      });

      // Check for unallocated/advance payment out vouchers
      const vouchers = this.getVouchers();
      const partyPayments = vouchers.filter(
        (v) =>
          v.voucherType === 'PAYMENT' &&
          v.entries.some((e) => e.accountId === party.id || e.accountName.toLowerCase() === partyNameNorm)
      );
      const totalPayments = partyPayments.reduce((sum, v) => sum + v.totalAmount, 0);
      const totalPurchasePaid = partyPurchases.reduce((sum, pur) => sum + (pur.paidAmount || 0), 0);
      if (totalPayments > totalPurchasePaid) {
        // We paid vendor more than total billed on purchases (advance to vendor)
        balance += (totalPayments - totalPurchasePaid);
      }
    }

    const netBalance = Math.round(balance * 100) / 100;
    if (party.currentBalance !== netBalance) {
      party.currentBalance = netBalance;
      party.updatedAt = new Date().toISOString();
      parties[partyIndex] = party;
      this.set(STORAGE_KEYS.PARTIES, parties);
      pouch.putDoc('party', party);
      this.broadcastChange('party', 'save', party.id, party);
    }

    return netBalance;
  }

  // Synchronize balances for all parties
  syncAllPartyBalances(): void {
    const parties = this.getParties();
    for (const party of parties) {
      this.recalculatePartyBalance(party.id);
    }
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
    this.broadcastChange('item', 'save', item.id, item);
    this.notifyListeners();
  }

  deleteItem(id: string): void {
    const list = this.getItems().filter((i) => i.id !== id);
    this.set(STORAGE_KEYS.ITEMS, list);
    pouch.deleteDoc('item', id);
    this.broadcastChange('item', 'delete', id);
    this.notifyListeners();
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
    const prevInvoice = idx >= 0 ? list[idx] : null;

    if (idx >= 0) {
      list[idx] = invoice;
    } else {
      list.unshift(invoice);
    }
    this.set(STORAGE_KEYS.INVOICES, list);
    pouch.putDoc('invoice', invoice);
    this.broadcastChange('invoice', 'save', invoice.id, invoice);

    // Update stock levels
    const items = this.getItems();

    // If editing existing invoice, revert previous quantities first
    if (prevInvoice) {
      for (const oldLine of prevInvoice.items) {
        const match = oldLine.itemId
          ? items.find((itm) => itm.id === oldLine.itemId)
          : items.find((itm) => itm.name.trim().toLowerCase() === oldLine.name.trim().toLowerCase());
        if (match) {
          match.currentStock += oldLine.quantity;
        }
      }
    }

    for (const line of invoice.items) {
      const match = line.itemId
        ? items.find((itm) => itm.id === line.itemId)
        : items.find((itm) => itm.name.trim().toLowerCase() === line.name.trim().toLowerCase());
      if (match) {
        match.currentStock = Math.max(0, match.currentStock - line.quantity);
        match.updatedAt = new Date().toISOString();
        this.saveItem(match);
      }
    }

    if (invoice.partyId) {
      this.recalculatePartyBalance(invoice.partyId);
    }
    this.notifyListeners();
  }

  deleteInvoice(id: string): void {
    const inv = this.getInvoices().find((i) => i.id === id);
    const list = this.getInvoices().filter((i) => i.id !== id);
    this.set(STORAGE_KEYS.INVOICES, list);
    pouch.deleteDoc('invoice', id);
    this.broadcastChange('invoice', 'delete', id);

    // Restore stock upon invoice deletion
    if (inv) {
      const items = this.getItems();
      for (const line of inv.items) {
        const match = line.itemId
          ? items.find((itm) => itm.id === line.itemId)
          : items.find((itm) => itm.name.trim().toLowerCase() === line.name.trim().toLowerCase());
        if (match) {
          match.currentStock += line.quantity;
          match.updatedAt = new Date().toISOString();
          this.saveItem(match);
        }
      }
    }

    if (inv?.partyId) {
      this.recalculatePartyBalance(inv.partyId);
    }
    this.notifyListeners();
  }

  // Purchases
  getPurchases(): PurchaseBill[] {
    return this.get<PurchaseBill[]>(STORAGE_KEYS.PURCHASES, []);
  }

  savePurchase(bill: PurchaseBill): void {
    const list = this.getPurchases();
    const idx = list.findIndex((b) => b.id === bill.id);
    const prevBill = idx >= 0 ? list[idx] : null;

    if (idx >= 0) {
      list[idx] = bill;
    } else {
      list.unshift(bill);
    }
    this.set(STORAGE_KEYS.PURCHASES, list);
    pouch.putDoc('purchase', bill);
    this.broadcastChange('purchase', 'save', bill.id, bill);

    // Increase stock levels and update latest purchase price for purchased items
    const items = this.getItems();

    // If editing existing bill, revert previous quantities first
    if (prevBill) {
      for (const oldLine of prevBill.items) {
        const match = oldLine.itemId
          ? items.find((itm) => itm.id === oldLine.itemId)
          : items.find((itm) => itm.name.trim().toLowerCase() === oldLine.name.trim().toLowerCase());
        if (match) {
          match.currentStock = Math.max(0, match.currentStock - oldLine.quantity);
        }
      }
    }

    for (const line of bill.items) {
      const match = line.itemId
        ? items.find((itm) => itm.id === line.itemId)
        : items.find((itm) => itm.name.trim().toLowerCase() === line.name.trim().toLowerCase());

      if (match) {
        match.currentStock += line.quantity;
        // Update purchase price from bill so the latest purchase price is reflected in items & stock
        if (typeof line.unitPrice === 'number' && line.unitPrice > 0) {
          match.purchasePrice = line.unitPrice;
        }
        match.updatedAt = new Date().toISOString();
        this.saveItem(match);
      } else if (line.name && line.name.trim()) {
        // If purchased item is not yet in catalog, automatically register it with the bill's purchase price
        const newId = line.itemId || `ITM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        line.itemId = newId;
        const newItem: InventoryItem = {
          id: newId,
          name: line.name.trim(),
          hsnSacCode: line.hsnSacCode || '844332',
          category: 'General',
          unit: line.unit || 'PCS',
          salePrice: Number((line.unitPrice * 1.2).toFixed(2)),
          purchasePrice: line.unitPrice || 0,
          gstRate: line.gstRate || 0,
          currentStock: line.quantity,
          minStockAlert: 5,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        items.push(newItem);
        this.saveItem(newItem);
      }
    }

    if (bill.supplierId) {
      this.recalculatePartyBalance(bill.supplierId);
    }
    this.notifyListeners();
  }

  deletePurchase(id: string): void {
    const bill = this.getPurchases().find((b) => b.id === id);
    const list = this.getPurchases().filter((b) => b.id !== id);
    this.set(STORAGE_KEYS.PURCHASES, list);
    pouch.deleteDoc('purchase', id);
    this.broadcastChange('purchase', 'delete', id);

    // Revert stock upon bill deletion
    if (bill) {
      const items = this.getItems();
      for (const line of bill.items) {
        const match = line.itemId
          ? items.find((itm) => itm.id === line.itemId)
          : items.find((itm) => itm.name.trim().toLowerCase() === line.name.trim().toLowerCase());
        if (match) {
          match.currentStock = Math.max(0, match.currentStock - line.quantity);
          match.updatedAt = new Date().toISOString();
          this.saveItem(match);
        }
      }
    }

    if (bill?.supplierId) {
      this.recalculatePartyBalance(bill.supplierId);
    }
    this.notifyListeners();
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
    this.broadcastChange('adjustment', 'save', adj.id, adj);

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
    this.notifyListeners();
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
    this.broadcastChange('voucher', 'save', voucher.id, voucher);
    this.notifyListeners();
  }

  deleteVoucher(id: string): void {
    const list = this.getVouchers().filter((v) => v.id !== id);
    this.set(STORAGE_KEYS.VOUCHERS, list);
    pouch.deleteDoc('voucher', id);
    this.broadcastChange('voucher', 'delete', id);
    this.notifyListeners();
  }

  // Expenses
  getExpenses(): Expense[] {
    return this.get<Expense[]>(STORAGE_KEYS.EXPENSES, []);
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
    this.broadcastChange('expense', 'save', expense.id, expense);
    this.notifyListeners();
  }

  deleteExpense(id: string): void {
    const list = this.getExpenses().filter((e) => e.id !== id);
    this.set(STORAGE_KEYS.EXPENSES, list);
    pouch.deleteDoc('expense', id);
    this.broadcastChange('expense', 'delete', id);
    this.notifyListeners();
  }

  // Bank Accounts
  getBankAccounts(): BankAccount[] {
    const list = this.get<BankAccount[]>(STORAGE_KEYS.BANK_ACCOUNTS, DEFAULT_BANK_ACCOUNTS);
    return list && list.length > 0 ? list : DEFAULT_BANK_ACCOUNTS;
  }

  saveBankAccount(account: BankAccount): void {
    const list = this.getBankAccounts();
    const idx = list.findIndex((b) => b.id === account.id);
    if (idx >= 0) {
      list[idx] = account;
    } else {
      list.push(account);
    }
    this.set(STORAGE_KEYS.BANK_ACCOUNTS, list);
    pouch.putDoc('bank_account', account);
    this.broadcastChange('bank_account', 'save', account.id, account);
    this.notifyListeners();
  }

  deleteBankAccount(id: string): void {
    if (id === 'ACC_CASH') return; // Cannot delete cash register
    const list = this.getBankAccounts().filter((b) => b.id !== id);
    this.set(STORAGE_KEYS.BANK_ACCOUNTS, list);
    pouch.deleteDoc('bank_account', id);
    this.broadcastChange('bank_account', 'delete', id);
    this.notifyListeners();
  }

  // Cash & Bank Transactions (Contra & Direct Transfers)
  getCashBankTransactions(): CashBankTransaction[] {
    return this.get<CashBankTransaction[]>(STORAGE_KEYS.CASH_BANK_TXNS, DEFAULT_CASH_BANK_TXNS);
  }

  saveCashBankTransaction(txn: CashBankTransaction): void {
    const list = this.getCashBankTransactions();
    const idx = list.findIndex((t) => t.id === txn.id);
    if (idx >= 0) {
      list[idx] = txn;
    } else {
      list.unshift(txn);
    }
    this.set(STORAGE_KEYS.CASH_BANK_TXNS, list);
    pouch.putDoc('cash_bank_txn', txn);
    this.broadcastChange('cash_bank_txn', 'save', txn.id, txn);
    this.notifyListeners();
  }

  deleteCashBankTransaction(id: string): void {
    const list = this.getCashBankTransactions().filter((t) => t.id !== id);
    this.set(STORAGE_KEYS.CASH_BANK_TXNS, list);
    pouch.deleteDoc('cash_bank_txn', id);
    this.broadcastChange('cash_bank_txn', 'delete', id);
    this.notifyListeners();
  }
}

export const db = new StorageService();
