/**
 * src/core/store/useDataStore.ts
 *
 * High-performance, granular React 18 external store integration via useSyncExternalStore.
 * Directly subscribed to db.subscribe() and the in-memory heap cache of StorageService.
 *
 * Architectural Guarantees:
 * 1. Domain Hook Granularity: Components subscribe ONLY to the domain entities they read.
 *    A party update will NEVER re-render an invoice grid, item list, or header bar.
 * 2. Referential Snapshot Stability: getSnapshot returns stable references from db.ts memoryCache,
 *    allowing React's Object.is(prevSnapshot, nextSnapshot) to bail out of rendering.
 * 3. Stable Subscription Identity: subscribeToDataStore is allocated once at module scope,
 *    eliminating re-subscription churn and listener thrashing.
 * 4. Concurrent-Mode & SSR Safety: Includes getServerSnapshot fallback returning current heap values.
 */

import { useSyncExternalStore, useMemo } from 'react';
import { db, SyncedSettings } from '../../services/db.ts';
import { CompanyProfile } from '../../models/company.ts';
import { Party, PartyGroup, PartyCategory } from '../../models/party.ts';
import { InventoryItem, StockAdjustment } from '../../models/item.ts';
import { Invoice } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { Expense } from '../../models/expense.ts';
import { Voucher } from '../accounting/voucherTypes.ts';
import { BankAccount, CashBankTransaction } from '../../models/bankAccount.ts';

// ---------------------------------------------------------------------------
// 1. Stable Subscription Function (Module-Level Singleton)
// ---------------------------------------------------------------------------

/**
 * Shared stable subscription function connected to db.subscribe().
 * Permanently allocated at module level to guarantee referential identity
 * across all component renders and eliminate re-subscription cycles.
 */
export const subscribeToDataStore = (listener: () => void): (() => void) => {
  return db.subscribe(listener);
};

// ---------------------------------------------------------------------------
// 2. Stable Snapshot Getters
// ---------------------------------------------------------------------------

/**
 * Defensive snapshot stabilizer.
 * Guarantees referential identity for empty array fallbacks across useSyncExternalStore calls,
 * permanently guarding against React Error #185 (Maximum update depth exceeded).
 */
function createStableSnapshotGetter<T>(getter: () => T): () => T {
  let cached: T = getter();
  return () => {
    const next = getter();
    if (Object.is(cached, next)) {
      return cached;
    }
    if (Array.isArray(cached) && Array.isArray(next)) {
      if (cached.length === 0 && next.length === 0) {
        return cached;
      }
    }
    cached = next;
    return next;
  };
}

export const getCompanySnapshot = createStableSnapshotGetter((): CompanyProfile => db.getCompany());
export const getPartiesSnapshot = createStableSnapshotGetter((): Party[] => db.getParties());
export const getPartyGroupsSnapshot = createStableSnapshotGetter((): PartyGroup[] => db.getPartyGroups());
export const getPartyCategoriesSnapshot = createStableSnapshotGetter((): PartyCategory[] => db.getPartyCategories());
export const getItemsSnapshot = createStableSnapshotGetter((): InventoryItem[] => db.getItems());
export const getInvoicesSnapshot = createStableSnapshotGetter((): Invoice[] => db.getInvoices());
export const getPurchasesSnapshot = createStableSnapshotGetter((): PurchaseBill[] => db.getPurchases());
export const getExpensesSnapshot = createStableSnapshotGetter((): Expense[] => db.getExpenses());
export const getVouchersSnapshot = createStableSnapshotGetter((): Voucher[] => db.getVouchers());
export const getBankAccountsSnapshot = createStableSnapshotGetter((): BankAccount[] => db.getBankAccounts());
export const getCashBankTxnsSnapshot = createStableSnapshotGetter((): CashBankTransaction[] => db.getCashBankTransactions());
export const getSettingsSnapshot = createStableSnapshotGetter((): SyncedSettings => db.getSettings());
export const getStockAdjustmentsSnapshot = createStableSnapshotGetter((): StockAdjustment[] => db.getStockAdjustments());

// ---------------------------------------------------------------------------
// 3. Domain-Specific Reactive Hooks
// ---------------------------------------------------------------------------

/**
 * Subscribes to Company Profile changes.
 * Re-renders ONLY when the company profile is updated.
 */
export function useCompany(): CompanyProfile {
  return useSyncExternalStore(subscribeToDataStore, getCompanySnapshot, getCompanySnapshot);
}

/**
 * Subscribes to Parties (Customers & Suppliers).
 * Re-renders ONLY when parties or party balances change.
 */
export function useParties(): Party[] {
  return useSyncExternalStore(subscribeToDataStore, getPartiesSnapshot, getPartiesSnapshot);
}

/**
 * Subscribes to Party Groups.
 * Re-renders ONLY when party groups change.
 */
export function usePartyGroups(): PartyGroup[] {
  return useSyncExternalStore(subscribeToDataStore, getPartyGroupsSnapshot, getPartyGroupsSnapshot);
}

/**
 * Subscribes to Party Categories.
 * Re-renders ONLY when party categories change.
 */
export function usePartyCategories(): PartyCategory[] {
  return useSyncExternalStore(subscribeToDataStore, getPartyCategoriesSnapshot, getPartyCategoriesSnapshot);
}

/**
 * Subscribes to Inventory Items.
 * Re-renders ONLY when items or stock levels change.
 */
export function useItems(): InventoryItem[] {
  return useSyncExternalStore(subscribeToDataStore, getItemsSnapshot, getItemsSnapshot);
}

/**
 * Subscribes to Sales Invoices.
 * Re-renders ONLY when sales invoices are created, modified, or cancelled.
 */
export function useInvoices(): Invoice[] {
  return useSyncExternalStore(subscribeToDataStore, getInvoicesSnapshot, getInvoicesSnapshot);
}

/**
 * Subscribes to Purchase Bills.
 * Re-renders ONLY when purchase bills are added, edited, or deleted.
 */
export function usePurchases(): PurchaseBill[] {
  return useSyncExternalStore(subscribeToDataStore, getPurchasesSnapshot, getPurchasesSnapshot);
}

/**
 * Subscribes to Business Expenses.
 * Re-renders ONLY when expenses are created, modified, or removed.
 */
export function useExpenses(): Expense[] {
  return useSyncExternalStore(subscribeToDataStore, getExpensesSnapshot, getExpensesSnapshot);
}

/**
 * Subscribes to Accounting Vouchers.
 * Re-renders ONLY when vouchers (payments, receipts, journal entries) change.
 */
export function useVouchers(): Voucher[] {
  return useSyncExternalStore(subscribeToDataStore, getVouchersSnapshot, getVouchersSnapshot);
}

/**
 * Subscribes to Bank & Cash Accounts.
 * Re-renders ONLY when bank/cash accounts are created, edited, or removed.
 */
export function useBankAccounts(): BankAccount[] {
  return useSyncExternalStore(subscribeToDataStore, getBankAccountsSnapshot, getBankAccountsSnapshot);
}

/**
 * Subscribes to Cash & Bank Transactions.
 * Re-renders ONLY when cash/bank transfers or ledger movements occur.
 */
export function useCashBankTxns(): CashBankTransaction[] {
  return useSyncExternalStore(subscribeToDataStore, getCashBankTxnsSnapshot, getCashBankTxnsSnapshot);
}

/**
 * Subscribes to Synced App Settings.
 * Re-renders ONLY when general app configuration changes.
 */
export function useSettings(): SyncedSettings {
  return useSyncExternalStore(subscribeToDataStore, getSettingsSnapshot, getSettingsSnapshot);
}

/**
 * Subscribes to Inventory Stock Adjustments.
 * Re-renders ONLY when manual stock corrections occur.
 */
export function useStockAdjustments(): StockAdjustment[] {
  return useSyncExternalStore(subscribeToDataStore, getStockAdjustmentsSnapshot, getStockAdjustmentsSnapshot);
}

// ---------------------------------------------------------------------------
// 4. Aggregated Store & Custom Selector Hooks
// ---------------------------------------------------------------------------

export interface DataStoreState {
  company: CompanyProfile;
  parties: Party[];
  items: InventoryItem[];
  invoices: Invoice[];
  purchases: PurchaseBill[];
  expenses: Expense[];
  vouchers: Voucher[];
  bankAccounts: BankAccount[];
  cashBankTxns: CashBankTransaction[];
}

/**
 * Consolidated hook providing access to all 9 core domain models.
 * Note: Prefer granular domain hooks (e.g. useInvoices()) in leaf components
 * to maximize render isolation.
 */
export function useDataStore(): DataStoreState {
  const company = useCompany();
  const parties = useParties();
  const items = useItems();
  const invoices = useInvoices();
  const purchases = usePurchases();
  const expenses = useExpenses();
  const vouchers = useVouchers();
  const bankAccounts = useBankAccounts();
  const cashBankTxns = useCashBankTxns();

  return useMemo(
    () => ({
      company,
      parties,
      items,
      invoices,
      purchases,
      expenses,
      vouchers,
      bankAccounts,
      cashBankTxns,
    }),
    [
      company,
      parties,
      items,
      invoices,
      purchases,
      expenses,
      vouchers,
      bankAccounts,
      cashBankTxns,
    ]
  );
}
