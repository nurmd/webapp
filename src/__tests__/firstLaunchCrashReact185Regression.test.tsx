import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
Object.defineProperty(globalThis, 'localStorage', { value: testStorage, writable: true, configurable: true });

import { db } from '../services/db.ts';
import { pouch, PouchService } from '../services/pouchdb.ts';
import {
  useBankAccounts,
  useDataStore,
  getCompanySnapshot,
  getPartiesSnapshot,
  getPartyGroupsSnapshot,
  getPartyCategoriesSnapshot,
  getItemsSnapshot,
  getInvoicesSnapshot,
  getPurchasesSnapshot,
  getExpensesSnapshot,
  getVouchersSnapshot,
  getBankAccountsSnapshot,
  getCashBankTxnsSnapshot,
  getSettingsSnapshot,
  getStockAdjustmentsSnapshot,
} from '../core/store/useDataStore.ts';
import { STORAGE_KEYS, EMPTY_BANK_ACCOUNTS, DEFAULT_BANK_ACCOUNTS } from '../services/db/storageEngine.ts';
import { POUCH_PERSIST_KEYS } from '../services/db/localDbConstants.ts';
import { App } from '../App.tsx';

describe('Phase 1 Item 1: First-Launch React #185 Crash Regression Suite', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    testStorage.clear();
    (db as any).invalidateCache();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (root && container) {
      act(() => {
        root!.unmount();
      });
      container.remove();
    }
    container = null;
    root = null;
  });

  describe('1. Snapshot Stability & Referential Invariance', () => {
    it('guarantees referential identity for getBankAccounts when remote DB is active and store is empty', () => {
      vi.spyOn(pouch as any, 'isRemoteDbActive').mockReturnValue(true);
      localStorage.removeItem(STORAGE_KEYS.BANK_ACCOUNTS);
      (db as any).invalidateCache();

      const a = db.getBankAccounts();
      const b = db.getBankAccounts();
      expect(a).toBe(b);
      expect(a).toBe(EMPTY_BANK_ACCOUNTS);
    });

    it('guarantees referential identity across all 13 useDataStore snapshot getters', () => {
      vi.spyOn(pouch as any, 'isRemoteDbActive').mockReturnValue(true);
      (db as any).invalidateCache();

      expect(getCompanySnapshot()).toBe(getCompanySnapshot());
      expect(getPartiesSnapshot()).toBe(getPartiesSnapshot());
      expect(getPartyGroupsSnapshot()).toBe(getPartyGroupsSnapshot());
      expect(getPartyCategoriesSnapshot()).toBe(getPartyCategoriesSnapshot());
      expect(getItemsSnapshot()).toBe(getItemsSnapshot());
      expect(getInvoicesSnapshot()).toBe(getInvoicesSnapshot());
      expect(getPurchasesSnapshot()).toBe(getPurchasesSnapshot());
      expect(getExpensesSnapshot()).toBe(getExpensesSnapshot());
      expect(getVouchersSnapshot()).toBe(getVouchersSnapshot());
      expect(getBankAccountsSnapshot()).toBe(getBankAccountsSnapshot());
      expect(getCashBankTxnsSnapshot()).toBe(getCashBankTxnsSnapshot());
      expect(getSettingsSnapshot()).toBe(getSettingsSnapshot());
      expect(getStockAdjustmentsSnapshot()).toBe(getStockAdjustmentsSnapshot());
    });
  });

  describe('2. React 18 useSyncExternalStore Hook Render Loop Guard', () => {
    it('renders useBankAccounts in a reactive component without triggering infinite updates', async () => {
      vi.spyOn(pouch as any, 'isRemoteDbActive').mockReturnValue(true);
      localStorage.removeItem(STORAGE_KEYS.BANK_ACCOUNTS);
      (db as any).invalidateCache();

      let renderCount = 0;
      const TestConsumer: React.FC = () => {
        renderCount++;
        const accounts = useBankAccounts();
        if (renderCount > 25) {
          throw new Error('Maximum update depth exceeded (Infinite render loop detected!)');
        }
        return <div data-testid="count">Accounts: {accounts.length}</div>;
      };

      await act(async () => {
        root!.render(<TestConsumer />);
      });

      expect(renderCount).toBe(1);
      const el = container!.querySelector('[data-testid="count"]');
      expect(el?.textContent).toBe('Accounts: 0');
    });

    it('renders full useDataStore aggregated hook without triggering update loops', async () => {
      vi.spyOn(pouch as any, 'isRemoteDbActive').mockReturnValue(true);
      (db as any).invalidateCache();

      let renderCount = 0;
      const StoreConsumer: React.FC = () => {
        renderCount++;
        const store = useDataStore();
        if (renderCount > 25) {
          throw new Error('Maximum update depth exceeded (useDataStore infinite loop)');
        }
        return <div>Loaded: {store.invoices.length}</div>;
      };

      await act(async () => {
        root!.render(<StoreConsumer />);
      });

      expect(renderCount).toBe(1);
    });
  });

  describe('3. First-Run Hydration Lifecycle Reproduction', () => {
    it('simulates first-run: old/cleared last_hydrated_db, per-remote DB activation, and hydration without crash', async () => {
      // Step A: Simulate first launch after upgrade where last_hydrated_db is old or null
      testStorage.setItem(POUCH_PERSIST_KEYS.LAST_HYDRATED_DB, 'vyapar_fintech_store');
      testStorage.setItem(POUCH_PERSIST_KEYS.ACTIVE_LOCAL_DB, 'vyapar_remote_store_hash123');
      testStorage.setItem('couchdb_remote_url', 'https://remote.couchdb.org/store_db');

      // Step B: Remote DB is active
      vi.spyOn(pouch as any, 'isRemoteDbActive').mockReturnValue(true);
      vi.spyOn(pouch as any, 'getActiveDbName').mockReturnValue('vyapar_remote_store_hash123');

      // Step C: Trigger clearSyncedDataKeys & cache invalidation (as occurs on first launch switch)
      db.clearSyncedDataKeys();
      (db as any).invalidateCache();

      // Verify bank accounts are empty
      expect(db.getBankAccounts().length).toBe(0);
      expect(db.getBankAccounts()).toBe(EMPTY_BANK_ACCOUNTS);

      // Step D: Mount root App component and ensure no React #185 crash occurs
      let appMounted = false;
      await act(async () => {
        root!.render(<App />);
        appMounted = true;
      });

      expect(appMounted).toBe(true);
    });
  });

  describe('4. Diagnostic Error Recording Instrumentation', () => {
    it('records diagnostic state to localStorage if Maximum update depth exceeded is dispatched', () => {
      const mockEvent = new ErrorEvent('error', {
        message: 'Minified React error #185; visit https://reactjs.org/docs/error-decoder.html?invariant=185',
      });

      window.dispatchEvent(mockEvent);

      const savedDiag = testStorage.getItem('gst_diag_last_mount_crash');
      expect(savedDiag).not.toBeNull();
      const parsed = JSON.parse(savedDiag!);
      expect(parsed.error).toContain('185');
      expect(parsed.activeDb).toBeDefined();
    });
  });
});
