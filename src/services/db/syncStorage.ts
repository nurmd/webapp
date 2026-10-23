import { CompanyProfile } from '../../models/company.ts';
import { Party, PartyGroup, PartyCategory } from '../../models/party.ts';
import { InventoryItem, StockAdjustment } from '../../models/item.ts';
import { Invoice } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { Voucher } from '../../core/accounting/voucherTypes.ts';
import { Expense } from '../../models/expense.ts';
import { BankAccount, CashBankTransaction } from '../../models/bankAccount.ts';
import { LoanAccount, LoanTransaction } from '../../models/loan.ts';
import {
  pouch,
  type PouchDocChange,
  type SyncConflict,
} from '../pouchdb.ts';
import {
  DEFAULT_LOCAL_DB_NAME,
  DEMO_LOCAL_DB_NAME,
  POUCH_PERSIST_KEYS,
} from './localDbConstants.ts';
import {
  STORAGE_KEYS,
  SyncedSettings,
  DEFAULT_COMPANY,
  DEFAULT_BANK_ACCOUNTS,
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

    // Check if the active local database has switched across tabs or reloads.
    // Clears local cache only when switching databases, preserving legacy migration on initial default DB load:
    // (lastHydratedDb !== null && lastHydratedDb !== activeDb) || (lastHydratedDb === null && activeDb !== DEFAULT_LOCAL_DB_NAME)
    const activeDb =
      typeof (pouch as any)?.getActiveDbName === 'function'
        ? pouch.getActiveDbName()
        : DEFAULT_LOCAL_DB_NAME;
    const lastHydratedDb =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem(POUCH_PERSIST_KEYS.LAST_HYDRATED_DB)
        : null;
    const shouldClear =
      (lastHydratedDb !== null && lastHydratedDb !== activeDb) ||
      (lastHydratedDb === null && activeDb !== DEFAULT_LOCAL_DB_NAME);
    if (shouldClear) {
      this.clearSyncedDataKeys();
      this.invalidateCache();
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(POUCH_PERSIST_KEYS.LAST_HYDRATED_DB, activeDb);
    }

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
    setTimeout(async () => {
      // 1. If in Demo Mode and demo load is pending, populate the isolated demo DB
      if (typeof (pouch as any)?.isDemoMode === 'function' && pouch.isDemoMode()) {
        const isPending =
          typeof localStorage !== 'undefined' &&
          localStorage.getItem(POUCH_PERSIST_KEYS.PENDING_DEMO_LOAD) === 'true';
        if (isPending) {
          try {
            localStorage.removeItem(POUCH_PERSIST_KEYS.PENDING_DEMO_LOAD);
            await this.loadDemoData();
          } catch (e) {
            console.error('Failed to populate demo data in demo mode:', e);
          }
        }
      } else if (activeDb === DEFAULT_LOCAL_DB_NAME) {
        // Only the default offline DB migrates legacy localStorage
        await pouch.migrateFromLocalStorage({
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
        });
      }

      // 2. Hydrate local memory/localStorage from active PouchDB
      await this.syncAllFromPouch();

      // 3. Realtime continuous change listener
      if (typeof (pouch as any)?.subscribeDataChange === 'function') {
        pouch.subscribeDataChange((change) => {
          this.applyIncomingChange(change);
        });
      }
    }, 50);
  }

  public clearSyncedDataKeys(): void {
    if (typeof localStorage === 'undefined') return;

    // Preserve device-local printing and privacy settings if embedded in settings
    let localPrinting: any = null;
    try {
      const rawSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (rawSettings) {
        const parsed = JSON.parse(rawSettings);
        if (parsed.printingSettings || parsed.printerWidth || parsed.printerType || parsed.bluetoothPrinterAddress) {
          localPrinting = {
            printingSettings: parsed.printingSettings,
            printerWidth: parsed.printerWidth,
            printerType: parsed.printerType,
            bluetoothPrinterAddress: parsed.bluetoothPrinterAddress,
          };
        }
      }
    } catch {}

    const SYNCED_KEYS = [
      STORAGE_KEYS.COMPANY,
      STORAGE_KEYS.PARTIES,
      STORAGE_KEYS.ITEMS,
      STORAGE_KEYS.CATEGORIES,
      STORAGE_KEYS.INVOICES,
      STORAGE_KEYS.PURCHASES,
      STORAGE_KEYS.EXPENSES,
      STORAGE_KEYS.ADJUSTMENTS,
      STORAGE_KEYS.VOUCHERS,
      STORAGE_KEYS.BANK_ACCOUNTS,
      STORAGE_KEYS.CASH_BANK_TXNS,
      STORAGE_KEYS.LOANS,
      STORAGE_KEYS.LOAN_TXNS,
      STORAGE_KEYS.PARTY_GROUPS,
      STORAGE_KEYS.PARTY_CATEGORIES,
      STORAGE_KEYS.TOMBSTONES,
      STORAGE_KEYS.CONFLICTS,
      STORAGE_KEYS.SETTINGS,
      'gst_allow_negative_stock',
    ];
    for (const key of SYNCED_KEYS) {
      try {
        localStorage.removeItem(key);
      } catch {}
    }

    if (localPrinting) {
      try {
        localStorage.setItem(STORAGE_KEYS.LOCAL_PRINTING_SETTINGS, JSON.stringify(localPrinting));
      } catch {}
    }
  }

  public applyLocalEntityMutation(entity: string, action: 'save' | 'delete', id: string, data?: any): void {
    if (action === 'delete') {
      this.recordTombstone(entity, id);
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
        case 'party_group': {
          this.set(STORAGE_KEYS.PARTY_GROUPS, this.getPartyGroups().filter((g) => g.id !== id));
          void this.prunePartyReferencesForDeletedEntity('group', id, false).catch((err) => {
            console.warn('Failed to prune party group references:', err);
          });
          break;
        }
        case 'party_category': {
          this.set(STORAGE_KEYS.PARTY_CATEGORIES, this.getPartyCategories().filter((c) => c.id !== id));
          void this.prunePartyReferencesForDeletedEntity('category', id, false).catch((err) => {
            console.warn('Failed to prune party category references:', err);
          });
          break;
        }
      }
      this.syncAllPartyBalances();
    } else if (data) {
      this.removeTombstone(entity, id);
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
              groupId: 'groupId' in data ? (data.groupId || undefined) : existing.groupId,
              categoryId: 'categoryId' in data ? (data.categoryId || undefined) : existing.categoryId,
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
        case 'party_group': {
          const list = [...this.getPartyGroups()];
          const idx = list.findIndex((g) => g.id === id);
          if (idx >= 0) list[idx] = data; else list.push(data);
          this.set(STORAGE_KEYS.PARTY_GROUPS, list);
          break;
        }
        case 'party_category': {
          const list = [...this.getPartyCategories()];
          const idx = list.findIndex((c) => c.id === id);
          if (idx >= 0) list[idx] = data; else list.push(data);
          this.set(STORAGE_KEYS.PARTY_CATEGORIES, list);
          break;
        }
      }
      this.syncAllPartyBalances();
    }
    this.notifyListeners();
  }

  private async prunePartyReferencesForDeletedEntity(
    type: 'group' | 'category',
    deletedId: string,
    persistToPouch: boolean = false
  ): Promise<void> {
    const parties = this.getParties();
    let hasChanges = false;
    const writePromises: Promise<any>[] = [];

    const updatedParties = parties.map((p) => {
      let changed = false;
      let newGroupId = p.groupId;
      let newCategoryId = p.categoryId;

      if (type === 'group' && p.groupId === deletedId) {
        newGroupId = undefined;
        changed = true;
      }
      if (type === 'category' && p.categoryId === deletedId) {
        newCategoryId = undefined;
        changed = true;
      }

      if (changed) {
        hasChanges = true;
        const updated: Party = {
          ...p,
          groupId: newGroupId,
          categoryId: newCategoryId,
          updatedAt: new Date().toISOString(),
        };
        if (persistToPouch && typeof (pouch as any)?.putDoc === 'function') {
          writePromises.push((pouch as any).putDoc('party', updated));
        }
        return updated;
      }
      return p;
    });

    if (hasChanges) {
      this.set(STORAGE_KEYS.PARTIES, updatedParties);
      if (writePromises.length > 0) {
        await Promise.all(writePromises);
      }
    }
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
      this.recordTombstone(docType, docId);
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
        case 'party_group': {
          const list = this.getPartyGroups().filter((g) => g.id !== docId);
          this.set(STORAGE_KEYS.PARTY_GROUPS, list);
          void this.prunePartyReferencesForDeletedEntity('group', docId, true).catch((err) => {
            console.warn('Failed to prune incoming party group references:', err);
          });
          break;
        }
        case 'party_category': {
          const list = this.getPartyCategories().filter((c) => c.id !== docId);
          this.set(STORAGE_KEYS.PARTY_CATEGORIES, list);
          void this.prunePartyReferencesForDeletedEntity('category', docId, true).catch((err) => {
            console.warn('Failed to prune incoming party category references:', err);
          });
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
    this.removeTombstone(docType, docId);

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
            groupId: 'groupId' in incoming ? (incoming.groupId || undefined) : existing.groupId,
            categoryId: 'categoryId' in incoming ? (incoming.categoryId || undefined) : existing.categoryId,
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
      case 'party_group': {
        const list = [...this.getPartyGroups()];
        const idx = list.findIndex((g) => g.id === docId);
        if (idx >= 0) list[idx] = data as PartyGroup; else list.push(data as PartyGroup);
        this.set(STORAGE_KEYS.PARTY_GROUPS, list);
        break;
      }
      case 'party_category': {
        const list = [...this.getPartyCategories()];
        const idx = list.findIndex((c) => c.id === docId);
        if (idx >= 0) list[idx] = data as PartyCategory; else list.push(data as PartyCategory);
        this.set(STORAGE_KEYS.PARTY_CATEGORIES, list);
        break;
      }
    }
    this.notifyListeners();
  }

  private areEntitiesDivergent(a: any, b: any): boolean {
    if (!a || !b) return true;
    const cleanA = { ...a };
    const cleanB = { ...b };
    delete cleanA._id;
    delete cleanA._rev;
    delete cleanA._conflicts;
    delete cleanA.syncedAt;
    delete cleanA.docType;
    delete cleanB._id;
    delete cleanB._rev;
    delete cleanB._conflicts;
    delete cleanB.syncedAt;
    delete cleanB.docType;

    return JSON.stringify(cleanA) !== JSON.stringify(cleanB);
  }

  private reconcileCollection<T extends { id: string; updatedAt?: string; createdAt?: string }>(
    entityType: string,
    storageKey: string,
    localItems: T[],
    remoteItems: any[]
  ): T[] {
    const tombstones = this.getTombstones();
    const localMap = new Map<string, T>();
    (localItems || []).forEach((item) => {
      if (item && item.id) localMap.set(item.id, item);
    });

    const isFinancial = [
      'invoice',
      'purchase',
      'voucher',
      'expense',
      'bank_account',
      'cash_bank_txn',
      'loan',
      'loan_txn',
    ].includes(entityType);

    const unsyncedToPush: T[] = [];
    const mergedMap = new Map<string, T>();

    // 1. Process local items
    for (const [id, localItem] of localMap.entries()) {
      const tombstoneKey = `${entityType}:${id}`;
      const tombstone = tombstones[tombstoneKey];

      if (tombstone) {
        const remoteItem = (remoteItems || []).find((r) => r && r.id === id);
        const remoteTime = remoteItem?.updatedAt || remoteItem?.createdAt || '';
        if (remoteItem && remoteTime && remoteTime > tombstone.deletedAt) {
          this.removeTombstone(entityType, id);
          mergedMap.set(id, remoteItem);
        } else {
          pouch.deleteDoc(entityType, id)?.catch?.(() => {});
        }
      } else {
        const remoteItem = (remoteItems || []).find((r) => r && r.id === id);
        if (!remoteItem) {
          // Local unsynced record: remote does not have it yet!
          // NEVER DELETE LOCAL UNSYNCED RECORDS
          mergedMap.set(id, localItem);
          unsyncedToPush.push(localItem);
        } else {
          const isDivergent = this.areEntitiesDivergent(localItem, remoteItem);

          if (isFinancial && isDivergent) {
            // For financial documents, if both sides changed, enqueue a visible conflict!
            // Never silently merge or replace the local dirty record!
            const conflictId = `${entityType}:${id}#financial-divergence`;
            const conflict: SyncConflict = {
              id: conflictId,
              docId: `${entityType}:${id}`,
              docType: entityType,
              entityId: id,
              winningRev: remoteItem._rev || 'remote-branch',
              conflictingRev: 'local-dirty',
              winningDoc: remoteItem,
              conflictingDoc: localItem,
              detectedAt: new Date().toISOString(),
            };
            if (typeof (pouch as any)?.addExplicitConflict === 'function') {
              (pouch as any).addExplicitConflict(conflict);
            }
            // Preserve the local record in place until operator resolves
            mergedMap.set(id, localItem);
          } else if (isDivergent) {
            const localTime = localItem.updatedAt || localItem.createdAt || '';
            const remoteTime = remoteItem.updatedAt || remoteItem.createdAt || '';

            if (localTime && remoteTime && localTime > remoteTime) {
              mergedMap.set(id, localItem);
              unsyncedToPush.push(localItem);
            } else {
              mergedMap.set(id, remoteItem);
            }
          } else {
            mergedMap.set(id, remoteItem);
          }
        }
      }
    }

    // 2. Process remote items not yet in mergedMap
    for (const remoteItem of remoteItems || []) {
      if (!remoteItem || !remoteItem.id) continue;

      const id = remoteItem.id;
      if (mergedMap.has(id)) continue;

      const tombstoneKey = `${entityType}:${id}`;
      const tombstone = tombstones[tombstoneKey];

      if (tombstone) {
        const remoteTime = remoteItem.updatedAt || remoteItem.createdAt || '';
        if (remoteTime && remoteTime > tombstone.deletedAt) {
          this.removeTombstone(entityType, id);
          mergedMap.set(id, remoteItem);
        } else {
          pouch.deleteDoc(entityType, id)?.catch?.(() => {});
        }
      } else {
        mergedMap.set(id, remoteItem);
      }
    }

    const mergedList = Array.from(mergedMap.values());
    this.set(storageKey, mergedList);

    if (unsyncedToPush.length > 0 && typeof (pouch as any)?.putDoc === 'function') {
      Promise.all(unsyncedToPush.map((item) => pouch.putDoc(entityType, item))).catch((err) => {
        console.warn(`Error pushing unsynced ${entityType} records to PouchDB:`, err);
      });
    }

    return mergedList;
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
        remotePartyGroups,
        remotePartyCategories,
        remoteTombstones,
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
        pouch.getAllDocs<PartyGroup>('party_group'),
        pouch.getAllDocs<PartyCategory>('party_category'),
        typeof (pouch as any)?.getAllTombstones === 'function'
          ? (pouch as any).getAllTombstones()
          : Promise.resolve([]),
      ]);

      // Replicate remote tombstones into local storage so remote deletions are respected
      if (Array.isArray(remoteTombstones)) {
        for (const t of remoteTombstones) {
          if (t && t.targetType && t.targetId && t.deletedAt) {
            this.recordTombstone(t.targetType, t.targetId, t.deletedAt);
            if (t.targetType === 'party_group') {
              await this.prunePartyReferencesForDeletedEntity('group', t.targetId, true);
            } else if (t.targetType === 'party_category') {
              await this.prunePartyReferencesForDeletedEntity('category', t.targetId, true);
            }
          }
        }
      }

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

      // Reconcile collections without wholesale overwriting local unsynced records
      this.reconcileCollection(
        'invoice',
        STORAGE_KEYS.INVOICES,
        this.getInvoices(),
        remoteInvoices
      );
      this.reconcileCollection(
        'purchase',
        STORAGE_KEYS.PURCHASES,
        this.getPurchases(),
        remotePurchases
      );
      this.reconcileCollection(
        'party',
        STORAGE_KEYS.PARTIES,
        this.getParties(),
        remoteParties
      );
      this.reconcileCollection(
        'item',
        STORAGE_KEYS.ITEMS,
        this.getItems(),
        remoteItems
      );
      this.reconcileCollection(
        'expense',
        STORAGE_KEYS.EXPENSES,
        this.getExpenses(),
        remoteExpenses
      );
      this.reconcileCollection(
        'adjustment',
        STORAGE_KEYS.ADJUSTMENTS,
        this.getStockAdjustments(),
        remoteAdjustments
      );
      this.reconcileCollection(
        'voucher',
        STORAGE_KEYS.VOUCHERS,
        this.getVouchers(),
        remoteVouchers
      );
      this.reconcileCollection(
        'bank_account',
        STORAGE_KEYS.BANK_ACCOUNTS,
        this.getBankAccounts(),
        remoteBankAccounts
      );
      this.reconcileCollection(
        'cash_bank_txn',
        STORAGE_KEYS.CASH_BANK_TXNS,
        this.getCashBankTransactions(),
        remoteCashBankTxns
      );
      this.reconcileCollection(
        'loan',
        STORAGE_KEYS.LOANS,
        this.getLoans(),
        remoteLoans
      );
      this.reconcileCollection(
        'loan_txn',
        STORAGE_KEYS.LOAN_TXNS,
        this.getLoanTransactions(),
        remoteLoanTxns
      );
      this.reconcileCollection(
        'party_group',
        STORAGE_KEYS.PARTY_GROUPS,
        this.getPartyGroups(),
        remotePartyGroups
      );
      this.reconcileCollection(
        'party_category',
        STORAGE_KEYS.PARTY_CATEGORIES,
        this.getPartyCategories(),
        remotePartyCategories
      );

      if (typeof (pouch as any)?.refreshConflicts === 'function') {
        await (pouch as any).refreshConflicts();
      }

      this.syncAllPartyBalances();
      this.notifyListeners();
    } catch (e) {
      console.warn('Error applying full PouchDB sync:', e);
    }
  }

  public async getConflicts(): Promise<SyncConflict[]> {
    if (typeof (pouch as any)?.getConflicts === 'function') {
      return (pouch as any).getConflicts();
    }
    return [];
  }

  public async resolveConflict(
    conflictId: string,
    choice: 'keep_winning' | 'keep_conflicting' | 'merge',
    options?: { docId?: string; winningRev?: string; conflictingRev?: string; mergedDoc?: any }
  ): Promise<void> {
    if (typeof (pouch as any)?.resolveConflict === 'function') {
      const docId = options?.docId || conflictId.split('#')[0];
      const conflictingRev = options?.conflictingRev || conflictId.split('#')[1];

      const conflicts = await this.getConflicts();
      const targetConflict = conflicts.find((c) => c.id === conflictId || c.docId === docId);

      await (pouch as any).resolveConflict(docId, choice, {
        ...options,
        conflictingRev,
      });

      if (targetConflict) {
        const colonIdx = docId.indexOf(':');
        const entityType = colonIdx !== -1 ? docId.substring(0, colonIdx) : targetConflict.docType;
        const entityId = targetConflict.entityId;

        if (choice === 'keep_winning') {
          this.applyLocalEntityMutation(entityType, 'save', entityId, targetConflict.winningDoc);
        } else if (choice === 'keep_conflicting') {
          this.applyLocalEntityMutation(entityType, 'save', entityId, targetConflict.conflictingDoc);
        }
      }

      await this.syncAllFromPouch();
    }
  }

  public async loadDemoData(): Promise<void> {
    if (!pouch.isDemoMode()) {
      throw new Error('Demo data can only be loaded in the isolated demo database. Use the demo-mode switch first.');
    }

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
