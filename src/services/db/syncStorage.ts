import { CompanyProfile } from '../../models/company.ts';
import { Party } from '../../models/party.ts';
import { InventoryItem, StockAdjustment } from '../../models/item.ts';
import { Invoice } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { Voucher } from '../../core/accounting/voucherTypes.ts';
import { Expense } from '../../models/expense.ts';
import { BankAccount, CashBankTransaction } from '../../models/bankAccount.ts';
import { LoanAccount, LoanTransaction } from '../../models/loan.ts';
import { pouch, type PouchDocChange } from '../pouchdb.ts';
import {
  STORAGE_KEYS,
  SyncedSettings,
  DEFAULT_COMPANY,
  DEFAULT_BANK_ACCOUNTS,
  DEMO_PARTY_IDS,
  DEMO_ITEM_IDS,
  DEMO_INVOICE_IDS,
  DEMO_PURCHASE_IDS,
  DEMO_EXPENSE_IDS,
  DEMO_BANK_IDS,
  DEMO_TXN_IDS,
} from './storageEngine.ts';
import {
  DEMO_COMPANY,
  DEMO_ITEMS,
  DEMO_PARTIES,
  DEMO_INVOICES,
  DEMO_PURCHASES,
  DEMO_EXPENSES,
  DEMO_BANK_ACCOUNTS,
  DEMO_CASH_BANK_TXNS,
  DEMO_LOANS,
  DEMO_LOAN_TRANSACTIONS,
  DEMO_VOUCHERS,
} from '../demoData.ts';
import { BackupRestoreStorage } from './backupRestoreStorage.ts';

/**
 * Synchronization and Demo Data lifecycle domain storage.
 * Handles cross-tab BroadcastChannel mutations, real-time PouchDB/CouchDB 2-way sync,
 * and legacy demo data purge routines.
 */
export class SyncStorage extends BackupRestoreStorage {
  constructor() {
    super();

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
            if (typeof syncable.allowNegativeStock === 'boolean') {
              try {
                localStorage.setItem('gst_allow_negative_stock', syncable.allowNegativeStock.toString());
                window.dispatchEvent(new CustomEvent('gst_negative_stock_change', { detail: { allow: syncable.allowNegativeStock } }));
              } catch {}
            }
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
        if (!event.key) {
          // Global localStorage.clear() occurred in another window
          this.invalidateCache();
        } else if (event.key.startsWith('gst_') || event.key === 'couchdb_remote_url') {
          this.invalidateCache(event.key);
        }
        this.notifyListeners();
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
      if (typeof (pouch as any)?.subscribeDataChange === 'function') {
        pouch.subscribeDataChange((change) => {
          this.applyIncomingChange(change);
        });
      }
    }, 100);
  }

  public applyLocalEntityMutation(entity: string, action: 'save' | 'delete', id: string, data?: any): void {
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
          const list = [...this.getInvoices()];
          const idx = list.findIndex((i) => i.id === id);
          if (idx >= 0) list[idx] = data; else list.unshift(data);
          this.set(STORAGE_KEYS.INVOICES, list);
          const pId =
            data?.partyId ||
            (data?.partyName
              ? this.getParties().find((p) => p.name.trim().toLowerCase() === data.partyName.trim().toLowerCase())?.id
              : undefined);
          if (pId) this.recalculatePartyBalance(pId);
          break;
        }
        case 'purchase': {
          const list = [...this.getPurchases()];
          const idx = list.findIndex((p) => p.id === id);
          if (idx >= 0) list[idx] = data; else list.unshift(data);
          this.set(STORAGE_KEYS.PURCHASES, list);
          const sId =
            data?.supplierId ||
            (data?.supplierName
              ? this.getParties().find((p) => p.name.trim().toLowerCase() === data.supplierName.trim().toLowerCase())?.id
              : undefined);
          if (sId) this.recalculatePartyBalance(sId);
          break;
        }
        case 'party': {
          const list = [...this.getParties()];
          const idx = list.findIndex((p) => p.id === id);
          if (idx >= 0) {
            const existing = list[idx];
            const isExplicitZero = data.openingBalance !== undefined && data.openingBalance === 0;
            list[idx] = {
              ...data,
              openingBalance: isExplicitZero
                ? undefined
                : data.openingBalance !== undefined
                ? data.openingBalance
                : existing.openingBalance,
              openingBalanceType: isExplicitZero
                ? undefined
                : data.openingBalanceType !== undefined
                ? data.openingBalanceType
                : existing.openingBalanceType,
              openingBalanceDate: isExplicitZero
                ? undefined
                : data.openingBalanceDate !== undefined
                ? data.openingBalanceDate
                : existing.openingBalanceDate,
            };
          } else {
            const partyData =
              data.openingBalance === 0
                ? { ...data, openingBalance: undefined, openingBalanceType: undefined, openingBalanceDate: undefined }
                : data;
            list.push(partyData);
          }
          this.set(STORAGE_KEYS.PARTIES, list);
          this.recalculatePartyBalance(id);
          break;
        }
        case 'item': {
          const list = [...this.getItems()];
          const idx = list.findIndex((i) => i.id === id);
          if (idx >= 0) list[idx] = data; else list.push(data);
          this.set(STORAGE_KEYS.ITEMS, list);
          break;
        }
        case 'expense': {
          const list = [...this.getExpenses()];
          const idx = list.findIndex((e) => e.id === id);
          if (idx >= 0) list[idx] = data; else list.unshift(data);
          this.set(STORAGE_KEYS.EXPENSES, list);
          break;
        }
        case 'voucher': {
          const list = [...this.getVouchers()];
          const idx = list.findIndex((v) => v.id === id);
          if (idx >= 0) list[idx] = data; else list.unshift(data);
          this.set(STORAGE_KEYS.VOUCHERS, list);
          if (data?.entries && Array.isArray(data.entries)) {
            const allParties = this.getParties();
            data.entries.forEach((e: any) => {
              const match = allParties.find(
                (p) => p.id === e.accountId || (e.accountName && p.name.trim().toLowerCase() === e.accountName.trim().toLowerCase())
              );
              if (match) this.recalculatePartyBalance(match.id);
            });
          }
          break;
        }
        case 'adjustment': {
          const list = [...this.getStockAdjustments()];
          const idx = list.findIndex((a) => a.id === id);
          if (idx >= 0) list[idx] = data; else list.unshift(data);
          this.set(STORAGE_KEYS.ADJUSTMENTS, list);
          break;
        }
        case 'bank_account': {
          const list = [...this.getBankAccounts()];
          const idx = list.findIndex((b) => b.id === id);
          if (idx >= 0) list[idx] = data; else list.push(data);
          this.set(STORAGE_KEYS.BANK_ACCOUNTS, list);
          break;
        }
        case 'cash_bank_txn': {
          const list = [...this.getCashBankTransactions()];
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
        case 'loan': {
          const list = this.getLoans().filter((l) => l.id !== docId);
          this.set(STORAGE_KEYS.LOANS, list);
          break;
        }
        case 'loan_txn': {
          const list = this.getLoanTransactions().filter((t) => t.id !== docId);
          this.set(STORAGE_KEYS.LOAN_TXNS, list);
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
    const data = (doc as any).data || cleanEntity;

    switch (docType) {
      case 'settings': {
        const { printingSettings, printerWidth, printerType, bluetoothPrinterAddress, ...syncable } = data as any;
        const current = this.getSettings();
        this.set(STORAGE_KEYS.SETTINGS, { ...current, ...syncable });
        if (typeof syncable.allowNegativeStock === 'boolean') {
          try {
            localStorage.setItem('gst_allow_negative_stock', syncable.allowNegativeStock.toString());
            window.dispatchEvent(new CustomEvent('gst_negative_stock_change', { detail: { allow: syncable.allowNegativeStock } }));
          } catch {}
        }
        if (syncable.company) {
          this.set(STORAGE_KEYS.COMPANY, syncable.company);
        }
        break;
      }
      case 'company': {
        if (data.businessName !== 'Apex Technologies Private Limited' && data.gstin !== '27AABCT3518Q1ZS') {
          this.set(STORAGE_KEYS.COMPANY, data as CompanyProfile);
        }
        break;
      }
      case 'invoice': {
        const inv = data as Invoice;
        const list = [...this.getInvoices()];
        const idx = list.findIndex((i) => i.id === docId);
        if (idx >= 0) list[idx] = inv; else list.unshift(inv);
        this.set(STORAGE_KEYS.INVOICES, list);
        if (inv.partyId) {
          this.recalculatePartyBalance(inv.partyId);
        }
        break;
      }
      case 'purchase': {
        const pur = data as PurchaseBill;
        const list = [...this.getPurchases()];
        const idx = list.findIndex((p) => p.id === docId);
        if (idx >= 0) list[idx] = pur; else list.unshift(pur);
        this.set(STORAGE_KEYS.PURCHASES, list);
        if (pur.supplierId) {
          this.recalculatePartyBalance(pur.supplierId);
        }
        break;
      }
      case 'party': {
        const list = [...this.getParties()];
        const idx = list.findIndex((p) => p.id === docId);
        const incoming = data as Party;
        if (idx >= 0) {
          const existing = list[idx];
          const isExplicitZero = incoming.openingBalance !== undefined && incoming.openingBalance === 0;
          list[idx] = {
            ...incoming,
            openingBalance: isExplicitZero
              ? undefined
              : incoming.openingBalance !== undefined
              ? incoming.openingBalance
              : existing.openingBalance,
            openingBalanceType: isExplicitZero
              ? undefined
              : incoming.openingBalanceType !== undefined
              ? incoming.openingBalanceType
              : existing.openingBalanceType,
            openingBalanceDate: isExplicitZero
              ? undefined
              : incoming.openingBalanceDate !== undefined
              ? incoming.openingBalanceDate
              : existing.openingBalanceDate,
          };
        } else {
          const partyDoc =
            incoming.openingBalance === 0
              ? { ...incoming, openingBalance: undefined, openingBalanceType: undefined, openingBalanceDate: undefined }
              : incoming;
          list.push(partyDoc);
        }
        this.set(STORAGE_KEYS.PARTIES, list);
        this.recalculatePartyBalance(docId);
        break;
      }
      case 'item': {
        const list = [...this.getItems()];
        const idx = list.findIndex((i) => i.id === docId);
        if (idx >= 0) list[idx] = data as InventoryItem; else list.push(data as InventoryItem);
        this.set(STORAGE_KEYS.ITEMS, list);
        break;
      }
      case 'expense': {
        const list = [...this.getExpenses()];
        const idx = list.findIndex((e) => e.id === docId);
        if (idx >= 0) list[idx] = data as Expense; else list.unshift(data as Expense);
        this.set(STORAGE_KEYS.EXPENSES, list);
        break;
      }
      case 'voucher': {
        const list = [...this.getVouchers()];
        const idx = list.findIndex((v) => v.id === docId);
        if (idx >= 0) list[idx] = data as Voucher; else list.unshift(data as Voucher);
        this.set(STORAGE_KEYS.VOUCHERS, list);
        this.syncAllPartyBalances();
        break;
      }
      case 'adjustment': {
        const list = [...this.getStockAdjustments()];
        const idx = list.findIndex((a) => a.id === docId);
        if (idx >= 0) list[idx] = data as StockAdjustment; else list.unshift(data as StockAdjustment);
        this.set(STORAGE_KEYS.ADJUSTMENTS, list);
        break;
      }
      case 'bank_account': {
        const list = [...this.getBankAccounts()];
        const idx = list.findIndex((b) => b.id === docId);
        if (idx >= 0) list[idx] = data as BankAccount; else list.push(data as BankAccount);
        this.set(STORAGE_KEYS.BANK_ACCOUNTS, list);
        break;
      }
      case 'cash_bank_txn': {
        const list = [...this.getCashBankTransactions()];
        const idx = list.findIndex((t) => t.id === docId);
        if (idx >= 0) list[idx] = data as CashBankTransaction; else list.unshift(data as CashBankTransaction);
        this.set(STORAGE_KEYS.CASH_BANK_TXNS, list);
        break;
      }
      case 'loan': {
        const list = [...this.getLoans()];
        const idx = list.findIndex((l) => l.id === docId);
        if (idx >= 0) list[idx] = data as any; else list.push(data as any);
        this.set(STORAGE_KEYS.LOANS, list);
        break;
      }
      case 'loan_txn': {
        const list = [...this.getLoanTransactions()];
        const idx = list.findIndex((t) => t.id === docId);
        if (idx >= 0) list[idx] = data as any; else list.unshift(data as any);
        this.set(STORAGE_KEYS.LOAN_TXNS, list);
        break;
      }
    }
    this.notifyListeners();
  }

  private purgeDemoData(): void {
    try {
      if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
      const PURGE_KEY = 'gst_demo_purged_v1017';
      if (localStorage.getItem(PURGE_KEY)) return;

      // 1. Company
      const comp = this.getCompany();
      const isFictitious =
        comp &&
        (comp.businessName === 'Apex Technologies Private Limited' ||
          comp.gstin === '27AABCT3518Q1ZS' ||
          comp.businessName?.toLowerCase().includes('shree ganesh') ||
          comp.tradeName?.toLowerCase().includes('shree ganesh') ||
          comp.businessName?.toLowerCase().includes('ganesh'));

      if (isFictitious) {
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
        remoteLoans,
        remoteLoanTxns,
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
        pouch.getAllDocs<LoanAccount>('loan'),
        pouch.getAllDocs<LoanTransaction>('loan_txn'),
      ]);

      if (remoteSettings.length > 0) {
        const { printingSettings, printerWidth, printerType, bluetoothPrinterAddress, ...syncable } = remoteSettings[0] as any;
        const current = this.getSettings();
        this.set(STORAGE_KEYS.SETTINGS, { ...current, ...syncable });
        if (typeof syncable.allowNegativeStock === 'boolean') {
          try {
            localStorage.setItem('gst_allow_negative_stock', syncable.allowNegativeStock.toString());
            window.dispatchEvent(new CustomEvent('gst_negative_stock_change', { detail: { allow: syncable.allowNegativeStock } }));
          } catch {}
        }
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
      if (remoteLoans.length > 0) {
        this.set(STORAGE_KEYS.LOANS, remoteLoans);
      }
      if (remoteLoanTxns.length > 0) {
        this.set(STORAGE_KEYS.LOAN_TXNS, remoteLoanTxns);
      }

      this.syncAllPartyBalances();
      this.notifyListeners();
    } catch (e) {
      console.warn('Error applying full PouchDB sync:', e);
    }
  }

  public async loadDemoData(): Promise<void> {
    try {
      this.saveCompany(DEMO_COMPANY);
      this.set(STORAGE_KEYS.ITEMS, DEMO_ITEMS);
      for (const item of DEMO_ITEMS) {
        await pouch.putDoc('item', item);
      }
      this.set(STORAGE_KEYS.PARTIES, DEMO_PARTIES);
      for (const party of DEMO_PARTIES) {
        await pouch.putDoc('party', party);
      }
      this.set(STORAGE_KEYS.INVOICES, DEMO_INVOICES);
      for (const inv of DEMO_INVOICES) {
        await pouch.putDoc('invoice', inv);
      }
      this.set(STORAGE_KEYS.PURCHASES, DEMO_PURCHASES);
      for (const pur of DEMO_PURCHASES) {
        await pouch.putDoc('purchase', pur);
      }
      this.set(STORAGE_KEYS.EXPENSES, DEMO_EXPENSES);
      for (const exp of DEMO_EXPENSES) {
        await pouch.putDoc('expense', exp);
      }
      this.set(STORAGE_KEYS.BANK_ACCOUNTS, DEMO_BANK_ACCOUNTS);
      for (const acc of DEMO_BANK_ACCOUNTS) {
        await pouch.putDoc('bank_account', acc);
      }
      this.set(STORAGE_KEYS.CASH_BANK_TXNS, DEMO_CASH_BANK_TXNS);
      for (const txn of DEMO_CASH_BANK_TXNS) {
        await pouch.putDoc('cash_bank_txn', txn);
      }
      this.set(STORAGE_KEYS.LOANS, DEMO_LOANS);
      for (const loan of DEMO_LOANS) {
        await pouch.putDoc('loan', loan);
      }
      this.set(STORAGE_KEYS.LOAN_TXNS, DEMO_LOAN_TRANSACTIONS);
      for (const txn of DEMO_LOAN_TRANSACTIONS) {
        await pouch.putDoc('loan_txn', txn);
      }
      this.set(STORAGE_KEYS.VOUCHERS, DEMO_VOUCHERS);
      for (const v of DEMO_VOUCHERS) {
        await pouch.putDoc('voucher', v);
      }
      this.syncAllPartyBalances();
      this.notifyListeners();
    } catch (e) {
      console.error('Failed to load demo data:', e);
      throw e;
    }
  }
}
