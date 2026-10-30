import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

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
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { value: testStorage, writable: true, configurable: true });
}

vi.mock('../services/pouchdb.ts', () => ({
  DEFAULT_COUCHDB_REMOTE_URL: '',
  DEFAULT_LOCAL_DB_NAME: 'vyapar_fintech_store',
  DEMO_LOCAL_DB_NAME: 'vyapar_demo',
  POUCH_PERSIST_KEYS: {
    ACTIVE_LOCAL_DB: 'gst_active_local_db',
    SYNC_REMOTE_URL: 'gst_sync_remote_url',
    DEMO_MODE: 'gst_demo_mode',
    PRE_DEMO_DB: 'gst_pre_demo_db',
    PRE_DEMO_REMOTE: 'gst_pre_demo_remote',
    LAST_HYDRATED_DB: 'gst_last_hydrated_db',
    PENDING_DEMO_LOAD: 'gst_pending_demo_load',
  },
  pouch: {
    putDoc: vi.fn(),
    deleteDoc: vi.fn(),
    getAllDocs: vi.fn(async () => []),
    getSyncState: vi.fn(() => ({ status: 'offline', remoteUrl: '', pendingChanges: 0 })),
    subscribeSync: vi.fn(() => () => {}),
    syncNow: vi.fn(async () => {}),
    startSync: vi.fn(),
    stopSync: vi.fn(),
    migrateFromLocalStorage: vi.fn(async () => {}),
    probeRemoteConnection: vi.fn(async () => ({
      ok: true,
      details: { dbName: 'test_db', docCount: 0, canRead: true, canWrite: true },
    })),
  },
  PouchService: {
    switchToRemoteDb: vi.fn(),
    switchToOfflineDb: vi.fn(),
    reconnectCloudDb: vi.fn(),
    enterDemoMode: vi.fn(),
    exitDemoMode: vi.fn(),
  },
}));

import { db } from '../services/db.ts';
import { CompanyProfile } from '../models/company.ts';
import { DashboardView } from '../components/Dashboard/DashboardView.tsx';
import { AppPreferencesTab } from '../components/Settings/tabs/AppPreferencesTab.tsx';
import { CompanySettingsView } from '../components/Settings/CompanySettingsView.tsx';
import {
  DEFAULT_DASHBOARD_QUICK_ACTIONS,
  MAX_DASHBOARD_QUICK_ACTIONS,
  normalizeDashboardQuickActions,
} from '../core/settings/dashboardQuickActions.ts';

const mockCompany: CompanyProfile = {
  id: 'comp_quick_actions',
  businessName: 'Quick Actions Mart',
  tradeName: 'Quick Actions Mart',
  gstin: '27AAAAA0000A1Z5',
  pan: 'AAAAA0000A',
  stateCode: '27',
  address: '1 Test Road',
  pincode: '400001',
  city: 'Mumbai',
  phone: '9876543210',
  email: 'quick@test.com',
  bankName: 'HDFC Bank',
  accountNumber: '1234567890',
  ifscCode: 'HDFC0001234',
  branchName: 'Fort',
  invoicePrefix: 'INV',
};

describe('Dashboard Quick Actions configuration', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    testStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('normalizes defaults, invalid IDs, duplicates, and the 6-item cap', () => {
    expect(normalizeDashboardQuickActions(undefined)).toEqual(DEFAULT_DASHBOARD_QUICK_ACTIONS);
    expect(normalizeDashboardQuickActions([])).toEqual(DEFAULT_DASHBOARD_QUICK_ACTIONS);
    expect(normalizeDashboardQuickActions(['SALE_BILL', 'SALE_BILL', 'NOPE', 'PURCHASE'])).toEqual([
      'SALE_BILL',
      'PURCHASE',
    ]);
    expect(
      normalizeDashboardQuickActions([
        'SALE_BILL',
        'QUICK_POS',
        'PURCHASE',
        'ADD_PARTY',
        'ITEMS',
        'EXPENSES',
        'REPORTS',
      ])
    ).toHaveLength(MAX_DASHBOARD_QUICK_ACTIONS);
  });

  it('persists the selection through the settings storage and falls back on empty', () => {
    db.setDashboardQuickActions(['SALE_BILL', 'REPORTS']);
    expect(db.getDashboardQuickActions()).toEqual(['SALE_BILL', 'REPORTS']);

    db.setDashboardQuickActions([]);
    expect(db.getDashboardQuickActions()).toEqual(DEFAULT_DASHBOARD_QUICK_ACTIONS);
  });

  it('renders the configured actions and dispatches the correct handlers', () => {
    db.setDashboardQuickActions(['NEW_INVOICE', 'ITEMS', 'REPORTS', 'PAYMENT_IN', 'PAYMENT_OUT', 'CASH_BANK']);

    const onNewInvoice = vi.fn();
    const onQuickPos = vi.fn();
    const onNavigateTab = vi.fn();

    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={[]}
          items={[]}
          parties={[]}
          purchases={[]}
          vouchers={[]}
          expenses={[]}
          onNewInvoice={onNewInvoice}
          onQuickPos={onQuickPos}
          onViewInvoice={vi.fn()}
          onNavigateTab={onNavigateTab}
        />
      );
    });

    expect(container.textContent).toContain('New Invoice');
    expect(container.textContent).toContain('Items');
    expect(container.textContent).toContain('Reports');
    expect(container.textContent).toContain('Payment In');
    expect(container.textContent).toContain('Payment Out');
    expect(container.textContent).toContain('Cash & Bank');
    expect(container.textContent).not.toContain('Sale Bill');

    const newInvoiceBtn = container.querySelector('[data-quick-action="NEW_INVOICE"]') as HTMLButtonElement | null;
    const reportsBtn = container.querySelector('[data-quick-action="REPORTS"]') as HTMLButtonElement | null;

    act(() => {
      newInvoiceBtn?.click();
      reportsBtn?.click();
    });

    expect(onNewInvoice).toHaveBeenCalledTimes(1);
    expect(onNavigateTab).toHaveBeenCalledWith('reports');
  });

  it('shows 6/6 and disables adding a 7th action in settings', () => {
    const onToggle = vi.fn();

    act(() => {
      root.render(
        <AppPreferencesTab
          appLanguage="English (India)"
          setAppLanguage={vi.fn()}
          isAppLockEnabled
          setIsAppLockEnabled={vi.fn()}
          CURRENT_APP_VERSION="1.2.50"
          updateStatusText={null}
          handleCheckForUpdates={vi.fn()}
          isUpdateChecking={false}
          dashboardQuickActions={['SALE_BILL', 'QUICK_POS', 'PURCHASE', 'ADD_PARTY', 'ITEMS', 'EXPENSES']}
          onToggleDashboardQuickAction={onToggle}
        />
      );
    });

    expect(container.textContent).toContain('Dashboard Quick Actions');
    expect(container.textContent).toContain('6/6');

    const reportsButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Reports')
    ) as HTMLButtonElement | undefined;

    expect(reportsButton).toBeDefined();
    expect(reportsButton?.disabled).toBe(true);

    const saleBillButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Sale Bill')
    ) as HTMLButtonElement | undefined;

    act(() => {
      saleBillButton?.click();
    });

    expect(onToggle).toHaveBeenCalledWith('SALE_BILL');
  });

  it('prevents deselecting the last remaining quick action', () => {
    act(() => {
      root.render(
        <AppPreferencesTab
          appLanguage="English (India)"
          setAppLanguage={vi.fn()}
          isAppLockEnabled
          setIsAppLockEnabled={vi.fn()}
          CURRENT_APP_VERSION="1.2.50"
          updateStatusText={null}
          handleCheckForUpdates={vi.fn()}
          isUpdateChecking={false}
          dashboardQuickActions={['SALE_BILL']}
          onToggleDashboardQuickAction={vi.fn()}
        />
      );
    });

    const saleBillButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Sale Bill')
    ) as HTMLButtonElement | undefined;

    expect(saleBillButton?.disabled).toBe(true);
  });

  it('persists a quick action toggle from the settings screen', () => {
    db.setDashboardQuickActions(DEFAULT_DASHBOARD_QUICK_ACTIONS);

    act(() => {
      root.render(
        <CompanySettingsView company={mockCompany} onSave={vi.fn()} initialTab="app_preferences" />
      );
    });

    expect(container.textContent).toContain('Dashboard Quick Actions');

    const reportsButton = container.querySelector(
      '[data-quick-action-setting="REPORTS"]'
    ) as HTMLButtonElement | null;

    expect(reportsButton).toBeDefined();
    expect(reportsButton?.disabled).toBe(false);

    act(() => {
      reportsButton?.click();
    });

    expect(db.getDashboardQuickActions()).toContain('REPORTS');
  });
});
