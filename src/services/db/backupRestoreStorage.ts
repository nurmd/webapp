import {
  DatabaseBackupBundle,
  DatabaseBackupData,
  DatabaseBackupCounts,
  computeBackupChecksum,
  generateBackupFilename,
  validateBackupBundle,
} from '../../core/backup/backupEngine.ts';
import { pouch } from '../pouchdb.ts';
import { auditTrail } from '../auditTrail.ts';
import { STORAGE_KEYS } from './storageEngine.ts';
import { InvoicePurchaseStorage } from './invoicePurchaseStorage.ts';
import packageJson from '../../../package.json';

const APP_VERSION = packageJson.version;

/**
 * Database Backup and Disaster Recovery domain storage.
 * Handles cryptographic checksum verification, full database bundling,
 * JSON export/download, and REPLACE/MERGE restore modes with memory cache invalidation.
 */
export class BackupRestoreStorage extends InvoicePurchaseStorage {
  createDatabaseBackup(): DatabaseBackupBundle {
    const company = this.getCompany();
    const settings = this.getSettings();
    const invoices = this.getInvoices();
    const purchases = this.getPurchases();
    const items = this.getItems();
    const parties = this.getParties();
    const vouchers = this.getVouchers();
    const expenses = this.getExpenses();
    const adjustments = this.getStockAdjustments();
    const bankAccounts = this.getBankAccounts();
    const cashBankTransactions = this.getCashBankTransactions();
    const auditLogs = typeof auditTrail?.getRecordsSync === 'function'
      ? auditTrail.getRecordsSync()
      : (typeof localStorage !== 'undefined'
          ? JSON.parse(localStorage.getItem('gst_audit_logs') || '[]')
          : []);
    const categories = this.getCategories();
    const partyGroups = this.getPartyGroups();
    const partyCategories = this.getPartyCategories();
    const allowNegativeStock = this.getAllowNegativeStock();
    const hideBuyPrices = !this.getBuyPriceVisibility();
    const syncRemoteUrl = typeof (pouch as any)?.getStoredRemoteUrl === 'function'
      ? ((pouch as any).getStoredRemoteUrl() as string)
      : '';

    const counts: DatabaseBackupCounts = {
      invoices: invoices.length,
      purchases: purchases.length,
      items: items.length,
      parties: parties.length,
      vouchers: vouchers.length,
      expenses: expenses.length,
      stockAdjustments: adjustments.length,
      bankAccounts: bankAccounts.length,
      cashBankTransactions: cashBankTransactions.length,
      auditLogs: auditLogs.length,
      categories: categories.length,
      partyGroups: partyGroups.length,
      partyCategories: partyCategories.length,
    };

    const data: DatabaseBackupData = {
      company,
      settings,
      invoices,
      purchases,
      items,
      parties,
      vouchers,
      expenses,
      adjustments,
      bankAccounts,
      cashBankTransactions,
      categories,
      partyGroups,
      partyCategories,
      auditLogs,
      allowNegativeStock,
      hideBuyPrices,
      syncRemoteUrl: syncRemoteUrl || undefined,
    };

    const checksum = computeBackupChecksum(data);
    const totalSalesAmount = invoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);
    const totalPurchasesAmount = purchases.reduce((sum, p) => sum + (p.grandTotal || 0), 0);

    return {
      format: 'GST_BILLING_BACKUP',
      version: 1,
      appName: 'GST Billing & Accounting',
      appVersion: APP_VERSION,
      createdAt: new Date().toISOString(),
      checksum,
      counts,
      metadata: {
        businessName: company.businessName,
        tradeName: company.tradeName,
        gstin: company.gstin,
        phone: company.phone,
        email: company.email,
        totalSalesAmount,
        totalPurchasesAmount,
      },
      data,
    };
  }

  async createDatabaseBackupAsync(): Promise<DatabaseBackupBundle> {
    if (typeof (auditTrail as any)?.ensureLoaded === 'function') {
      try {
        await (auditTrail as any).ensureLoaded();
      } catch (err) {
        console.warn('createDatabaseBackupAsync: auditTrail.ensureLoaded failed', err);
      }
    }
    return this.createDatabaseBackup();
  }

  serializeDatabaseBackup(customBundle?: DatabaseBackupBundle): {
    bundle: DatabaseBackupBundle;
    filename: string;
    jsonStr: string;
  } {
    const bundle = customBundle || this.createDatabaseBackup();
    const filename = generateBackupFilename(bundle.metadata?.businessName || bundle.data?.company?.businessName);
    const jsonStr = JSON.stringify(bundle, null, 2);
    return { bundle, filename, jsonStr };
  }

  downloadDatabaseBackup(customBundle?: DatabaseBackupBundle): { success: boolean; filename: string; reason?: string } {
    const { filename, jsonStr } = this.serializeDatabaseBackup(customBundle);

    if (typeof window !== 'undefined' && (window as any).AndroidBridge) {
      return { success: false, filename, reason: 'ANDROID_FILE_PICKER_REQUIRED' };
    }

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return { success: true, filename };
    }

    return { success: false, filename, reason: 'DOM_UNAVAILABLE' };
  }

  async restoreDatabaseBackup(
    bundle: DatabaseBackupBundle,
    mode: 'REPLACE' | 'MERGE' = 'REPLACE'
  ): Promise<{ success: boolean; mode: 'REPLACE' | 'MERGE'; restoredCounts: Record<string, number> }> {
    const validation = validateBackupBundle(bundle);
    if (!validation.isValid || !validation.bundle) {
      throw new Error(validation.error || 'Invalid backup bundle');
    }

    const { data } = validation.bundle;

    // Snapshot pre-restore state for atomic rollback on any failure
    const snapshot = {
      company: this.getCompany(),
      settings: this.getSettings(),
      allowNegativeStock: this.getAllowNegativeStock(),
      buyPriceVisibility: this.getBuyPriceVisibility(),
      invoices: this.getInvoices(),
      purchases: this.getPurchases(),
      items: this.getItems(),
      parties: this.getParties(),
      vouchers: this.getVouchers(),
      expenses: this.getExpenses(),
      adjustments: this.getStockAdjustments(),
      bankAccounts: this.getBankAccounts(),
      cashBankTxns: this.getCashBankTransactions(),
      categories: this.getCategories(),
      partyGroups: this.getPartyGroups(),
      partyCategories: this.getPartyCategories(),
    };

    // Helper for merging or replacing arrays by ID.
    // In REPLACE mode: if incoming is omitted or undefined (e.g. partial backup),
    // preserve current snapshot rather than wiping the collection with an empty array.
    const mergeCollection = <T extends { id: string }>(current: T[], incoming?: T[]): T[] => {
      if (incoming === undefined || !Array.isArray(incoming)) {
        return current;
      }
      if (mode === 'REPLACE') return incoming;
      const map = new Map<string, T>();
      current.forEach((item) => map.set(item.id, item));
      incoming.forEach((item) => map.set(item.id, item));
      return Array.from(map.values());
    };

    // Strict PouchDB write and delete helpers with fallbacks for testing environments
    const putStrict = async (type: string, doc: any): Promise<void> => {
      if (typeof (pouch as any).putDocStrict === 'function') {
        await (pouch as any).putDocStrict(type, doc);
      } else {
        await pouch.putDoc(type, doc);
      }
    };

    const deleteStrict = async (type: string, id: string): Promise<void> => {
      if (typeof (pouch as any).deleteDocStrict === 'function') {
        await (pouch as any).deleteDocStrict(type, id);
      } else {
        await pouch.deleteDoc(type, id);
      }
    };

    // 1. Company Profile & Settings
    const finalCompany = (mode === 'REPLACE' || !snapshot.company.gstin) && data.company
      ? data.company
      : snapshot.company;

    let finalSettings = snapshot.settings;
    if (data.settings) {
      const { printingSettings, printerWidth, printerType, bluetoothPrinterAddress, showBuyPricesGlobally, ...syncable } = data.settings as any;
      finalSettings = {
        ...snapshot.settings,
        ...syncable,
        company: finalCompany,
        updatedAt: new Date().toISOString(),
      };
    }

    // 2. Collections
    const finalInvoices = mergeCollection(snapshot.invoices, data.invoices);
    const finalPurchases = mergeCollection(snapshot.purchases, data.purchases);
    const finalItems = mergeCollection(snapshot.items, data.items);
    const finalParties = mergeCollection(snapshot.parties, data.parties);
    const finalVouchers = mergeCollection(snapshot.vouchers, data.vouchers);
    const finalExpenses = mergeCollection(snapshot.expenses, data.expenses);
    const finalAdjustments = mergeCollection(snapshot.adjustments, data.adjustments);
    const finalBankAccounts = mergeCollection(snapshot.bankAccounts, data.bankAccounts);
    const finalCashBankTxns = mergeCollection(snapshot.cashBankTxns, data.cashBankTransactions);
    const finalCategories = Array.isArray(data.categories)
      ? mergeCollection(snapshot.categories, data.categories)
      : snapshot.categories;
    const finalPartyGroups = Array.isArray(data.partyGroups)
      ? (mode === 'REPLACE' ? data.partyGroups : mergeCollection(snapshot.partyGroups, data.partyGroups))
      : snapshot.partyGroups;
    const finalPartyCategories = Array.isArray(data.partyCategories)
      ? (mode === 'REPLACE' ? data.partyCategories : mergeCollection(snapshot.partyCategories, data.partyCategories))
      : snapshot.partyCategories;

    const collections: { type: string; items: any[]; storageKey: string }[] = [
      { type: 'invoice', items: finalInvoices, storageKey: STORAGE_KEYS.INVOICES },
      { type: 'purchase', items: finalPurchases, storageKey: STORAGE_KEYS.PURCHASES },
      { type: 'item', items: finalItems, storageKey: STORAGE_KEYS.ITEMS },
      { type: 'party', items: finalParties, storageKey: STORAGE_KEYS.PARTIES },
      { type: 'voucher', items: finalVouchers, storageKey: STORAGE_KEYS.VOUCHERS },
      { type: 'expense', items: finalExpenses, storageKey: STORAGE_KEYS.EXPENSES },
      { type: 'adjustment', items: finalAdjustments, storageKey: STORAGE_KEYS.ADJUSTMENTS },
      { type: 'bank_account', items: finalBankAccounts, storageKey: STORAGE_KEYS.BANK_ACCOUNTS },
      { type: 'cash_bank_txn', items: finalCashBankTxns, storageKey: STORAGE_KEYS.CASH_BANK_TXNS },
      { type: 'party_group', items: finalPartyGroups, storageKey: STORAGE_KEYS.PARTY_GROUPS },
      { type: 'party_category', items: finalPartyCategories, storageKey: STORAGE_KEYS.PARTY_CATEGORIES },
    ];

    try {
      // 3. PouchDB operations
      for (const col of collections) {
        if (mode === 'REPLACE') {
          // Read existing docs in PouchDB and strict-delete any not present in incoming array
          const existingDocs = await pouch.getAllDocs<{ id: string }>(col.type);
          const targetIds = new Set(col.items.map((it) => it.id));
          const staleDocs = (existingDocs || []).filter((d) => d && d.id && !targetIds.has(d.id));
          await Promise.all(staleDocs.map((doc) => deleteStrict(col.type, doc.id)));
        }

        // Strict-put all target items
        await Promise.all(col.items.map((item) => putStrict(col.type, item)));
      }

      // Persist Company & Settings to PouchDB directly without unawaited side-effects
      if (finalCompany) {
        await putStrict('company', { ...finalCompany, id: finalCompany.id || 'COMP-001' });
      }
      if (finalSettings) {
        await putStrict('settings', { ...finalSettings, id: finalSettings.id || 'app_settings' });
      }

      // 4. Commit to local storage state
      this.set(STORAGE_KEYS.COMPANY, finalCompany);
      this.set(STORAGE_KEYS.SETTINGS, finalSettings);
      this.set(STORAGE_KEYS.INVOICES, finalInvoices);
      this.set(STORAGE_KEYS.PURCHASES, finalPurchases);
      this.set(STORAGE_KEYS.ITEMS, finalItems);
      this.set(STORAGE_KEYS.PARTIES, finalParties);
      this.set(STORAGE_KEYS.VOUCHERS, finalVouchers);
      this.set(STORAGE_KEYS.EXPENSES, finalExpenses);
      this.set(STORAGE_KEYS.ADJUSTMENTS, finalAdjustments);
      this.set(STORAGE_KEYS.BANK_ACCOUNTS, finalBankAccounts);
      this.set(STORAGE_KEYS.CASH_BANK_TXNS, finalCashBankTxns);
      if (Array.isArray(finalCategories)) {
        this.set(STORAGE_KEYS.CATEGORIES, finalCategories);
      }
      if (Array.isArray(finalPartyGroups)) {
        this.set(STORAGE_KEYS.PARTY_GROUPS, finalPartyGroups);
      }
      if (Array.isArray(finalPartyCategories)) {
        this.set(STORAGE_KEYS.PARTY_CATEGORIES, finalPartyCategories);
      }
      if (data.allowNegativeStock !== undefined) {
        try {
          localStorage.setItem('gst_allow_negative_stock', data.allowNegativeStock.toString());
        } catch {}
      }
      if (data.hideBuyPrices !== undefined) {
        try {
          localStorage.setItem('gst_hide_buy_prices', data.hideBuyPrices.toString());
        } catch {}
      }

      if (mode === 'REPLACE') {
        this.clearMemoryCache();
      }
    } catch (err) {
      // Rollback on any write failure: restore localStorage state
      this.set(STORAGE_KEYS.COMPANY, snapshot.company);
      this.set(STORAGE_KEYS.SETTINGS, snapshot.settings);
      this.set(STORAGE_KEYS.INVOICES, snapshot.invoices);
      this.set(STORAGE_KEYS.PURCHASES, snapshot.purchases);
      this.set(STORAGE_KEYS.ITEMS, snapshot.items);
      this.set(STORAGE_KEYS.PARTIES, snapshot.parties);
      this.set(STORAGE_KEYS.VOUCHERS, snapshot.vouchers);
      this.set(STORAGE_KEYS.EXPENSES, snapshot.expenses);
      this.set(STORAGE_KEYS.ADJUSTMENTS, snapshot.adjustments);
      this.set(STORAGE_KEYS.BANK_ACCOUNTS, snapshot.bankAccounts);
      this.set(STORAGE_KEYS.CASH_BANK_TXNS, snapshot.cashBankTxns);
      this.set(STORAGE_KEYS.CATEGORIES, snapshot.categories);
      this.set(STORAGE_KEYS.PARTY_GROUPS, snapshot.partyGroups);
      this.set(STORAGE_KEYS.PARTY_CATEGORIES, snapshot.partyCategories);
      if (snapshot.allowNegativeStock !== undefined) {
        try {
          localStorage.setItem('gst_allow_negative_stock', snapshot.allowNegativeStock.toString());
        } catch {}
      }
      if (snapshot.buyPriceVisibility !== undefined) {
        try {
          localStorage.setItem('gst_hide_buy_prices', (!snapshot.buyPriceVisibility).toString());
        } catch {}
      }

      // Reconcile PouchDB back to exact snapshot state
      const snapshotCollections: { type: string; items: any[] }[] = [
        { type: 'invoice', items: snapshot.invoices },
        { type: 'purchase', items: snapshot.purchases },
        { type: 'item', items: snapshot.items },
        { type: 'party', items: snapshot.parties },
        { type: 'voucher', items: snapshot.vouchers },
        { type: 'expense', items: snapshot.expenses },
        { type: 'adjustment', items: snapshot.adjustments },
        { type: 'bank_account', items: snapshot.bankAccounts },
        { type: 'cash_bank_txn', items: snapshot.cashBankTxns },
        { type: 'party_group', items: snapshot.partyGroups },
        { type: 'party_category', items: snapshot.partyCategories },
      ];

      try {
        for (const col of snapshotCollections) {
          const liveDocs = await pouch.getAllDocs<{ id: string }>(col.type);
          const snapshotIds = new Set(col.items.map((it) => it.id));
          const foreignDocs = (liveDocs || []).filter((d) => d && d.id && !snapshotIds.has(d.id));
          await Promise.all(foreignDocs.map((d) => deleteStrict(col.type, d.id)));
          await Promise.all(col.items.map((item) => putStrict(col.type, item)));
        }

        if (snapshot.company) {
          await putStrict('company', { ...snapshot.company, id: snapshot.company.id || 'COMP-001' });
        }
        if (snapshot.settings) {
          await putStrict('settings', { ...snapshot.settings, id: snapshot.settings.id || 'app_settings' });
        }
      } catch (rollbackErr) {
        console.warn('PouchDB rollback encountered error while reconciling to snapshot:', rollbackErr);
      }

      this.clearMemoryCache();
      this.notifyListeners();
      throw err;
    }

    // 5. Restore the device's cloud sync link when the backup carries one.
    // Preserve any existing link in MERGE mode; REPLACE intentionally adopts
    // the backup's device configuration.
    try {
      const currentSyncUrl = typeof (pouch as any).getStoredRemoteUrl === 'function'
        ? ((pouch as any).getStoredRemoteUrl() as string)
        : '';
      if (data.syncRemoteUrl && (mode === 'REPLACE' || !currentSyncUrl)) {
        pouch.startSync(data.syncRemoteUrl);
      }
    } catch (syncErr) {
      console.warn('Cloud sync link restore from backup failed:', syncErr);
    }

    // 6. Append restore event to device's immutable audit trail (without overwriting device trail)
    try {
      const auditUser = this.getAuditUser();
      auditTrail
        .logEvent({
          userId: auditUser.userId,
          userName: auditUser.userName,
          userRole: auditUser.userRole,
          actionType: 'SETTINGS_UPDATE',
          documentId: 'backup_restore',
          documentType: 'SETTINGS',
          summary: `Database restored from backup (${mode} mode, created ${validation.bundle.createdAt})`,
          newSnapshot: {
            mode,
            sourceAppVersion: validation.bundle.appVersion,
            sourceCreatedAt: validation.bundle.createdAt,
            counts: validation.bundle.counts,
          },
        })
        .catch((auditErr) => {
          console.warn('Audit trail logging failed during restore:', auditErr);
        });
    } catch (auditErr) {
      console.warn('Audit trail logging failed during restore:', auditErr);
    }

    // 7. Notify React components & Global listeners
    this.notifyListeners();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('app_db_restored', {
          detail: { mode, counts: validation.bundle.counts },
        })
      );
    }

    return {
      success: true,
      mode,
      restoredCounts: {
        invoices: finalInvoices.length,
        purchases: finalPurchases.length,
        items: finalItems.length,
        parties: finalParties.length,
        vouchers: finalVouchers.length,
        expenses: finalExpenses.length,
        adjustments: finalAdjustments.length,
        bankAccounts: finalBankAccounts.length,
        cashBankTransactions: finalCashBankTxns.length,
        partyGroups: finalPartyGroups.length,
        partyCategories: finalPartyCategories.length,
      },
    };
  }
}
