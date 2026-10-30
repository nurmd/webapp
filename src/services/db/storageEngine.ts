import { CompanyProfile } from '../../models/company.ts';
import { Party, PartyGroup, PartyCategory } from '../../models/party.ts';
import { InventoryItem, StockAdjustment, ItemCategory, DEFAULT_ITEM_CATEGORIES } from '../../models/item.ts';
import { Invoice } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { Voucher } from '../../core/accounting/voucherTypes.ts';
import { Expense } from '../../models/expense.ts';
import { BankAccount, CashBankTransaction } from '../../models/bankAccount.ts';
import { LoanAccount, LoanTransaction } from '../../models/loan.ts';
import { rbac, UserRole } from '../rbac.ts';
import { pouch } from '../pouchdb.ts';

export const STORAGE_KEYS = {
  COMPANY: 'gst_company_profile',
  PARTIES: 'gst_parties',
  ITEMS: 'gst_items',
  CATEGORIES: 'gst_item_categories',
  INVOICES: 'gst_invoices',
  PURCHASES: 'gst_purchases',
  EXPENSES: 'gst_expenses',
  ADJUSTMENTS: 'gst_stock_adjustments',
  VOUCHERS: 'gst_vouchers',
  SETTINGS: 'gst_app_settings',
  BANK_ACCOUNTS: 'gst_bank_accounts',
  CASH_BANK_TXNS: 'gst_cash_bank_transactions',
  LOANS: 'gst_loans',
  LOAN_TXNS: 'gst_loan_transactions',
  PARTY_GROUPS: 'gst_party_groups',
  PARTY_CATEGORIES: 'gst_party_categories',
  LOCAL_PRINTING_SETTINGS: 'local_device_printing_settings', // Kept strictly device-local
  TOMBSTONES: 'gst_sync_tombstones',
  CONFLICTS: 'gst_sync_conflicts',
};

export interface Tombstone {
  type: string;
  id: string;
  deletedAt: string;
}

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
  allowNegativeStock?: boolean;
  defaultDueDays?: number;
  autoRoundOff?: boolean;
  dashboardQuickActions?: string[];
  updatedAt: string;
}

// Clean Initial Seed Data for Production Use
export const DEFAULT_COMPANY: CompanyProfile = {
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
  isCompositionScheme: false,
};

export const DEFAULT_PARTIES: Party[] = [];
export const DEFAULT_ITEMS: InventoryItem[] = [];
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

// Stable empty array constant to guarantee referential identity across useSyncExternalStore snapshots
export const EMPTY_BANK_ACCOUNTS: BankAccount[] = [];

export const DEFAULT_CASH_BANK_TXNS: CashBankTransaction[] = [];

/**
 * Foundation Storage Engine providing synchronous localStorage persistence,
 * in-memory O(1) heap cache, cross-tab BroadcastChannel, and reactive subscriptions.
 */
export class StorageEngine {
  protected listeners: Set<() => void> = new Set();
  protected batchNotifyTimeout: any = null;
  public broadcastChannel: BroadcastChannel | null = null;
  protected memoryCache: Map<string, any> = new Map<string, any>();
  protected rawCache: Map<string, string | null> = new Map<string, string | null>();
  protected quotaExceededKeys: Set<string> = new Set<string>();

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

  public notify(): void {
    if (this.batchNotifyTimeout) {
      clearTimeout(this.batchNotifyTimeout);
      this.batchNotifyTimeout = null;
    }
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (e) {
        console.error('DB listener error:', e);
      }
    });
  }

  public broadcastChange(entity: string, action: 'save' | 'delete', id: string, data?: any): void {
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

  public get<T>(key: string, defaultValue: T): T {
    try {
      if (typeof localStorage === 'undefined' || this.quotaExceededKeys.has(key)) {
        if (this.memoryCache.has(key)) {
          return this.memoryCache.get(key);
        }
        const initialValue = Array.isArray(defaultValue)
          ? ([...defaultValue] as unknown as T)
          : typeof defaultValue === 'object' && defaultValue !== null
          ? ({ ...defaultValue } as unknown as T)
          : defaultValue;
        this.memoryCache.set(key, initialValue);
        return initialValue;
      }

      const raw = localStorage.getItem(key);

      if (this.memoryCache.has(key) && this.rawCache.get(key) === raw) {
        return this.memoryCache.get(key);
      }

      if (raw === null) {
        const initialValue = Array.isArray(defaultValue)
          ? ([...defaultValue] as unknown as T)
          : typeof defaultValue === 'object' && defaultValue !== null
          ? ({ ...defaultValue } as unknown as T)
          : defaultValue;
        this.memoryCache.set(key, initialValue);
        this.rawCache.set(key, null);
        return initialValue;
      }

      const parsed = JSON.parse(raw);
      this.memoryCache.set(key, parsed);
      this.rawCache.set(key, raw);
      return parsed;
    } catch {
      const fallback = Array.isArray(defaultValue)
        ? ([...defaultValue] as unknown as T)
        : typeof defaultValue === 'object' && defaultValue !== null
        ? ({ ...defaultValue } as unknown as T)
        : defaultValue;
      return fallback;
    }
  }

  public set<T>(key: string, value: T): void {
    const raw = JSON.stringify(value);
    const cached = Array.isArray(value)
      ? ([...value] as unknown as T)
      : typeof value === 'object' && value !== null
      ? ({ ...value } as unknown as T)
      : value;
    this.memoryCache.set(key, cached);
    this.rawCache.set(key, raw);

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, raw);
        this.quotaExceededKeys.delete(key);
      }
    } catch (e: any) {
      const isQuotaExceeded =
        (typeof DOMException !== 'undefined' && e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014)) ||
        e?.name === 'QuotaExceededError' ||
        e?.code === 22 ||
        e?.number === -2147024882 ||
        (typeof e?.message === 'string' && e.message.toLowerCase().includes('quota'));

      if (isQuotaExceeded) {
        this.quotaExceededKeys.add(key);
        console.warn(`StorageService.set: QuotaExceededError encountered for key "${key}". Write skipped in localStorage without failing unhandled.`, e);
      } else {
        console.error('Local storage write error:', e);
      }
    }
  }

  public remove(key: string): void {
    this.memoryCache.delete(key);
    this.rawCache.delete(key);
    this.quotaExceededKeys.delete(key);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      }
    } catch {}
  }

  public invalidateCache(key?: string): void {
    if (key) {
      this.memoryCache.delete(key);
      this.rawCache.delete(key);
      this.quotaExceededKeys.delete(key);
    } else {
      this.memoryCache.clear();
      this.rawCache.clear();
      this.quotaExceededKeys.clear();
    }
  }

  public clearMemoryCache(): void {
    this.invalidateCache();
  }

  protected getAuditUser(): { userId: string; userName: string; userRole: UserRole } {
    try {
      const u = rbac.getActiveUser();
      return {
        userId: u.id || 'usr_sys',
        userName: u.name || 'System',
        userRole: (u.role || 'OWNER') as UserRole,
      };
    } catch {
      return {
        userId: 'usr_sys',
        userName: 'System',
        userRole: 'OWNER' as UserRole,
      };
    }
  }

  // Baseline Collection Getters
  getInvoices(): Invoice[] {
    return this.get<Invoice[]>(STORAGE_KEYS.INVOICES, DEFAULT_INVOICES);
  }

  getPurchases(): PurchaseBill[] {
    return this.get<PurchaseBill[]>(STORAGE_KEYS.PURCHASES, []);
  }

  getVouchers(): Voucher[] {
    return this.get<Voucher[]>(STORAGE_KEYS.VOUCHERS, []);
  }

  getItems(): InventoryItem[] {
    return this.get<InventoryItem[]>(STORAGE_KEYS.ITEMS, DEFAULT_ITEMS);
  }

  getParties(): Party[] {
    return this.get<Party[]>(STORAGE_KEYS.PARTIES, DEFAULT_PARTIES);
  }

  // Base accessors for party groups and categories; mirrors getParties()/getItems() in StorageEngine
  // while PartyStorage provides domain-specific mutations, validations, and sync hooks.
  getPartyGroups(): PartyGroup[] {
    return this.get<PartyGroup[]>(STORAGE_KEYS.PARTY_GROUPS, []);
  }

  getPartyCategories(): PartyCategory[] {
    return this.get<PartyCategory[]>(STORAGE_KEYS.PARTY_CATEGORIES, []);
  }

  getStockAdjustments(): StockAdjustment[] {
    return this.get<StockAdjustment[]>(STORAGE_KEYS.ADJUSTMENTS, []);
  }

  getExpenses(): Expense[] {
    return this.get<Expense[]>(STORAGE_KEYS.EXPENSES, []);
  }

  /**
   * The default Cash account is a seed for a brand-new offline database only.
   * Per-remote and demo databases are authoritative for their own accounts;
   * synthesizing ACC_CASH there can conflict with the remote ACC_CASH before
   * the initial pull finishes.
   */
  protected shouldSeedDefaultBankAccounts(): boolean {
    try {
      if (typeof (pouch as any)?.isRemoteDbActive === 'function' && (pouch as any).isRemoteDbActive()) {
        return false;
      }
      if (typeof (pouch as any)?.isDemoMode === 'function' && (pouch as any).isDemoMode()) {
        return false;
      }
    } catch {
      // Fall through to the offline default.
    }
    return true;
  }

  getBankAccounts(): BankAccount[] {
    const list = this.get<BankAccount[]>(STORAGE_KEYS.BANK_ACCOUNTS, EMPTY_BANK_ACCOUNTS);
    if (list && list.length > 0) return list;
    return this.shouldSeedDefaultBankAccounts() ? DEFAULT_BANK_ACCOUNTS : EMPTY_BANK_ACCOUNTS;
  }

  getCashBankTransactions(): CashBankTransaction[] {
    return this.get<CashBankTransaction[]>(STORAGE_KEYS.CASH_BANK_TXNS, DEFAULT_CASH_BANK_TXNS);
  }

  getLoans(): LoanAccount[] {
    return this.get<LoanAccount[]>(STORAGE_KEYS.LOANS, []);
  }

  getLoanTransactions(loanId?: string): LoanTransaction[] {
    const all = this.get<LoanTransaction[]>(STORAGE_KEYS.LOAN_TXNS, []);
    return loanId ? all.filter((t) => t.loanId === loanId) : all;
  }

  getCategories(): ItemCategory[] {
    return this.get<ItemCategory[]>(STORAGE_KEYS.CATEGORIES, DEFAULT_ITEM_CATEGORIES);
  }

  public getTombstones(): Record<string, Tombstone> {
    return this.get<Record<string, Tombstone>>(STORAGE_KEYS.TOMBSTONES, {});
  }

  public recordTombstone(type: string, id: string, deletedAt?: string): void {
    const tombstones = { ...this.getTombstones() };
    const key = `${type}:${id}`;
    const timestamp = deletedAt || new Date().toISOString();
    if (!tombstones[key] || timestamp > tombstones[key].deletedAt) {
      tombstones[key] = {
        type,
        id,
        deletedAt: timestamp,
      };
      this.set(STORAGE_KEYS.TOMBSTONES, tombstones);
    }
  }

  public removeTombstone(type: string, id: string): void {
    const tombstones = { ...this.getTombstones() };
    const key = `${type}:${id}`;
    if (tombstones[key]) {
      delete tombstones[key];
      this.set(STORAGE_KEYS.TOMBSTONES, tombstones);
    }
  }

  public isTombstoned(type: string, id: string): boolean {
    const tombstones = this.getTombstones();
    return Boolean(tombstones[`${type}:${id}`]);
  }

  /**
   * Safe background fire-and-forget write to PouchDB. Catches rejections to prevent
   * unhandled promise rejections in synchronous save paths while letting PouchDB surface
   * write errors to syncState.
   */
  protected backgroundPouchPut<T extends { id?: string }>(type: string, doc: T): void {
    void Promise.resolve(pouch.putDoc(type, doc as any)).catch((err) => {
      console.warn(`[StorageEngine] Background PouchDB putDoc failed for ${type}:${(doc as any)?.id}:`, err);
    });
  }

  /**
   * Safe background fire-and-forget delete from PouchDB.
   */
  protected backgroundPouchDelete(type: string, id: string): void {
    void Promise.resolve(pouch.deleteDoc(type, id)).catch((err) => {
      console.warn(`[StorageEngine] Background PouchDB deleteDoc failed for ${type}:${id}:`, err);
    });
  }
}
