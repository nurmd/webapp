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
    const allowNegativeStock = this.getAllowNegativeStock();
    const hideBuyPrices = !this.getBuyPriceVisibility();

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
      auditLogs,
      allowNegativeStock,
      hideBuyPrices,
    };

    const checksum = computeBackupChecksum(data);
    const totalSalesAmount = invoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);
    const totalPurchasesAmount = purchases.reduce((sum, p) => sum + (p.grandTotal || 0), 0);

    return {
      format: 'GST_BILLING_BACKUP',
      version: 1,
      appName: 'GST Billing & Accounting',
      appVersion: '1.2.10',
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

  downloadDatabaseBackup(customBundle?: DatabaseBackupBundle): { success: boolean; filename: string } {
    const bundle = customBundle || this.createDatabaseBackup();
    const filename = generateBackupFilename(bundle.metadata?.businessName || bundle.data.company.businessName);
    const jsonStr = JSON.stringify(bundle, null, 2);

    if (typeof window !== 'undefined' && (window as any).AndroidBridge?.saveBackupToStorage) {
      try {
        (window as any).AndroidBridge.saveBackupToStorage(filename, jsonStr);
      } catch (err) {
        console.warn('AndroidBridge saveBackupToStorage error:', err);
      }
    } else if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    return { success: true, filename };
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

    if (mode === 'REPLACE') {
      this.clearMemoryCache();
    }

    // Helper for merging or replacing arrays by ID
    const mergeCollection = <T extends { id: string }>(current: T[], incoming: T[] = []): T[] => {
      if (mode === 'REPLACE') return incoming;
      const map = new Map<string, T>();
      current.forEach((item) => map.set(item.id, item));
      incoming.forEach((item) => map.set(item.id, item));
      return Array.from(map.values());
    };

    // 1. Company Profile & Settings
    if (mode === 'REPLACE' || !this.getCompany().gstin) {
      if (data.company) {
        this.saveCompany(data.company);
      }
    }
    if (data.settings) {
      this.saveSettings(data.settings);
    }
    if (data.allowNegativeStock !== undefined) {
      this.setAllowNegativeStock(data.allowNegativeStock);
    }
    if (data.hideBuyPrices !== undefined) {
      this.setBuyPriceVisibility(!data.hideBuyPrices);
    }

    // 2. Collections
    const finalInvoices = mergeCollection(this.getInvoices(), data.invoices);
    const finalPurchases = mergeCollection(this.getPurchases(), data.purchases);
    const finalItems = mergeCollection(this.getItems(), data.items);
    const finalParties = mergeCollection(this.getParties(), data.parties);
    const finalVouchers = mergeCollection(this.getVouchers(), data.vouchers);
    const finalExpenses = mergeCollection(this.getExpenses(), data.expenses);
    const finalAdjustments = mergeCollection(this.getStockAdjustments(), data.adjustments);
    const finalBankAccounts = mergeCollection(this.getBankAccounts(), data.bankAccounts);
    const finalCashBankTxns = mergeCollection(this.getCashBankTransactions(), data.cashBankTransactions);

    // Save state
    this.set(STORAGE_KEYS.INVOICES, finalInvoices);
    this.set(STORAGE_KEYS.PURCHASES, finalPurchases);
    this.set(STORAGE_KEYS.ITEMS, finalItems);
    this.set(STORAGE_KEYS.PARTIES, finalParties);
    this.set(STORAGE_KEYS.VOUCHERS, finalVouchers);
    this.set(STORAGE_KEYS.EXPENSES, finalExpenses);
    this.set(STORAGE_KEYS.ADJUSTMENTS, finalAdjustments);
    this.set(STORAGE_KEYS.BANK_ACCOUNTS, finalBankAccounts);
    this.set(STORAGE_KEYS.CASH_BANK_TXNS, finalCashBankTxns);
    if (Array.isArray(data.categories)) {
      const finalCategories = mergeCollection(this.getCategories(), data.categories);
      this.set(STORAGE_KEYS.CATEGORIES, finalCategories);
    }

    // 3. PouchDB Sync
    try {
      finalInvoices.forEach((inv) => pouch.putDoc('invoice', inv));
      finalPurchases.forEach((p) => pouch.putDoc('purchase', p));
      finalItems.forEach((it) => pouch.putDoc('item', it));
      finalParties.forEach((pty) => pouch.putDoc('party', pty));
      finalVouchers.forEach((v) => pouch.putDoc('voucher', v));
      finalExpenses.forEach((exp) => pouch.putDoc('expense', exp));
      finalAdjustments.forEach((adj) => pouch.putDoc('adjustment', adj));
      finalBankAccounts.forEach((acc) => pouch.putDoc('bank_account', acc));
      finalCashBankTxns.forEach((txn) => pouch.putDoc('cash_bank_txn', txn));
    } catch (err) {
      console.warn('PouchDB sync during backup restore encountered non-fatal error:', err);
    }

    // 4. Audit Trail Log
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

    // 5. Notify React components & Global listeners
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
      },
    };
  }
}
