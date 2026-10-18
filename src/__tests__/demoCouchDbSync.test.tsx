import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

// Mock storage
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

// Mock pouchdb
vi.mock('../services/pouchdb.ts', () => ({
  DEFAULT_COUCHDB_REMOTE_URL: 'https://demo:passwordisdemo@sync.brahmaputrahw.store/gst_demo',
  pouch: {
    putDoc: vi.fn(async () => ({ ok: true })),
    deleteDoc: vi.fn(async () => ({ ok: true })),
    getAllDocs: vi.fn(async () => []),
    getSyncState: vi.fn(() => ({ status: 'offline', remoteUrl: '', pendingChanges: 0 })),
    subscribeSync: vi.fn(() => () => {}),
    syncNow: vi.fn(async () => {}),
    startSync: vi.fn(),
    stopSync: vi.fn(),
    migrateFromLocalStorage: vi.fn(async () => {}),
  },
}));

import { pouch, DEFAULT_COUCHDB_REMOTE_URL } from '../services/pouchdb.ts';
import { db } from '../services/db.ts';
import { CompanyProfile } from '../models/company.ts';
import { CompanySettingsView } from '../components/Settings/CompanySettingsView.tsx';
import {
  DEMO_COMPANY,
  DEMO_ITEMS,
  DEMO_PARTIES,
  DEMO_INVOICES,
  DEMO_PURCHASES,
  DEMO_EXPENSES,
  DEMO_LOANS,
  DEMO_LOAN_TXNS,
} from '../services/demoData.ts';

const sampleCompany: CompanyProfile = {
  id: 'comp-test-01',
  businessName: 'Original Store',
  tradeName: 'Original',
  gstin: '27AAAAA0000A1Z5',
  pan: 'AAAAA0000A',
  stateCode: '27',
  address: '123 Market St',
  pincode: '400001',
  phone: '9876543210',
  email: 'store@example.com',
};

describe('Demo CouchDB Sync & Data Population Test Suite', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    testStorage.clear();
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  it('verifies DEFAULT_COUCHDB_REMOTE_URL configuration', () => {
    expect(DEFAULT_COUCHDB_REMOTE_URL).toBe('https://demo:passwordisdemo@sync.brahmaputrahw.store/gst_demo');
  });

  it('renders "Use Demo CouchDB" button and initiates sync on click', async () => {
    act(() => {
      root.render(<CompanySettingsView company={sampleCompany} onSave={vi.fn()} />);
    });

    // Navigate to Data & Sync category
    const buttons = Array.from(container.querySelectorAll('button'));
    const dataSyncNavBtn = buttons.find((b) => b.textContent?.includes('Data & Sync'));
    expect(dataSyncNavBtn).toBeDefined();

    act(() => {
      dataSyncNavBtn?.click();
    });

    // Open sync configuration panel
    const tuneBtn = container.querySelector('button[aria-label="Configure Sync"]') as HTMLButtonElement;
    expect(tuneBtn).not.toBeNull();
    act(() => {
      tuneBtn.click();
    });

    // Find and click "Use Demo CouchDB" button
    const useDemoBtn = container.querySelector('[data-testid="use-demo-couchdb-btn"]') as HTMLButtonElement;
    expect(useDemoBtn).not.toBeNull();
    expect(useDemoBtn.textContent).toContain('Use Demo CouchDB');

    act(() => {
      useDemoBtn.click();
    });

    expect(pouch.startSync).toHaveBeenCalledWith('https://demo:passwordisdemo@sync.brahmaputrahw.store/gst_demo');
  });

  it('loads rich demo dataset via db.loadDemoData() and syncs to pouch', async () => {
    await db.loadDemoData();

    // Verify Company was updated
    const currentCompany = db.getCompany();
    expect(currentCompany.businessName).toBe(DEMO_COMPANY.businessName);
    expect(currentCompany.gstin).toBe(DEMO_COMPANY.gstin);

    // Verify Items loaded
    const items = db.getItems();
    expect(items.length).toBe(DEMO_ITEMS.length);
    expect(items[0].name).toBe(DEMO_ITEMS[0].name);

    // Verify Parties loaded
    const parties = db.getParties();
    expect(parties.length).toBe(DEMO_PARTIES.length);

    // Verify Invoices loaded
    const invoices = db.getInvoices();
    expect(invoices.length).toBe(DEMO_INVOICES.length);

    // Verify Purchases loaded
    const purchases = db.getPurchases();
    expect(purchases.length).toBe(DEMO_PURCHASES.length);

    // Verify Expenses loaded
    const expenses = db.getExpenses();
    expect(expenses.length).toBe(DEMO_EXPENSES.length);

    // Verify Loans loaded
    const loans = db.getLoans();
    expect(loans.length).toBe(DEMO_LOANS.length);
    expect(loans[0].accountNumber).toBe('39820019284');
    expect(loans[0].lenderName).toBe('State Bank of India MSME Loan');

    // Verify Loan Transactions loaded
    const loanTxns = db.getLoanTransactions();
    expect(loanTxns.length).toBe(DEMO_LOAN_TXNS.length);

    // Verify Pouch putDoc was invoked for demo records
    expect(pouch.putDoc).toHaveBeenCalled();
  });
});
