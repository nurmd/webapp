import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { CashBankManagementView } from '../components/CashBank/CashBankManagementView.tsx';
import { DashboardView } from '../components/Dashboard/DashboardView.tsx';
import { BankAccount, CashBankTransaction } from '../models/bankAccount.ts';
import { CompanyProfile } from '../models/company.ts';
import { Expense } from '../models/expense.ts';
import { db } from '../services/db.ts';

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
  },
}));

describe('Cash/Bank Reconciliation UI Integration Tests', () => {
  let container: HTMLDivElement;
  let root: Root;

  const mockCompany: CompanyProfile = {
    id: 'comp_1',
    businessName: 'Bharat Traders',
    tradeName: 'Bharat Trading Co',
    gstin: '27AABCU9603R1ZN',
    pan: 'AABCU9603R',
    stateCode: '27',
    address: '123 MG Road, Pune',
    pincode: '411001',
    city: 'Pune',
    phone: '9876543210',
    email: 'bharat@example.com',
    isGstEnabled: true,
  };

  const mockCashAccount: BankAccount = {
    id: 'ACC_CASH',
    accountName: 'Cash in Hand',
    accountType: 'CASH',
    openingBalance: 1000,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const mockBankAccount: BankAccount = {
    id: 'ACC_BANK_1',
    accountName: 'State Bank of India',
    accountType: 'BANK',
    openingBalance: 2000,
    isDefault: true,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  // Large expense exceeding balance to force negative balance
  const mockExpenses: Expense[] = [
    {
      id: 'EXP-1',
      title: 'Commercial Rent',
      amount: 15000,
      taxableAmount: 15000,
      gstRate: 0,
      taxAmount: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      itcEligible: false,
      paymentMode: 'CASH',
      date: '2026-10-25',
      category: 'Rent & Utilities',
      createdAt: '2026-10-25',
    },
  ];

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
    vi.restoreAllMocks();
  });

  it('1. Negative total shows cash-bank-negative-balance-note with the phrase "not a calculation error"', async () => {
    await act(async () => {
      root.render(
        <CashBankManagementView
          company={mockCompany}
          accounts={[mockCashAccount, mockBankAccount]}
          transactions={[]}
          invoices={[]}
          purchases={[]}
          expenses={mockExpenses}
          vouchers={[]}
          onSaveAccount={vi.fn()}
          onDeleteAccount={vi.fn()}
          onSaveTransaction={vi.fn()}
          onDeleteTransaction={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    const noteBanner = container.querySelector('[data-testid="cash-bank-negative-balance-note"]');
    expect(noteBanner).not.toBeNull();
    expect(noteBanner?.textContent).toContain('not a calculation error');
  });

  it('2. Clicking cash-bank-reconcile-button opens the panel; panel contains "Read-only", account names, equation, and negative explanation', async () => {
    await act(async () => {
      root.render(
        <CashBankManagementView
          company={mockCompany}
          accounts={[mockCashAccount, mockBankAccount]}
          transactions={[]}
          invoices={[]}
          purchases={[]}
          expenses={mockExpenses}
          vouchers={[]}
          onSaveAccount={vi.fn()}
          onDeleteAccount={vi.fn()}
          onSaveTransaction={vi.fn()}
          onDeleteTransaction={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    const reconcileBtn = container.querySelector('[data-testid="cash-bank-reconcile-button"]') as HTMLButtonElement;
    expect(reconcileBtn).not.toBeNull();

    await act(async () => {
      reconcileBtn.click();
    });

    // Panel is opened
    const dialog = container.querySelector('div[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('Read-only');
    expect(dialog?.textContent).toContain('Cash in Hand');
    expect(dialog?.textContent).toContain('State Bank of India');
    expect(dialog?.textContent).toContain('Equation: Opening + Inflows − Outflows = Closing');
    expect(dialog?.textContent).toContain('not a calculation error');
  });

  it('3. Export button invokes a download with a CSV filename; no write callbacks are invoked', async () => {
    let createdBlob: Blob | null = null;
    let clickedAnchor: HTMLAnchorElement | null = null;
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;

    URL.createObjectURL = vi.fn((blob: Blob) => {
      createdBlob = blob;
      return 'blob:mock-csv-export';
    });
    URL.revokeObjectURL = vi.fn();

    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      if (node instanceof HTMLAnchorElement) {
        clickedAnchor = node;
        vi.spyOn(node, 'click').mockImplementation(() => {});
      }
      return node;
    });
    vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

    const onSaveAccount = vi.fn();
    const onDeleteAccount = vi.fn();
    const onSaveTransaction = vi.fn();
    const onDeleteTransaction = vi.fn();

    await act(async () => {
      root.render(
        <CashBankManagementView
          company={mockCompany}
          accounts={[mockCashAccount, mockBankAccount]}
          transactions={[]}
          invoices={[]}
          purchases={[]}
          expenses={mockExpenses}
          vouchers={[]}
          onSaveAccount={onSaveAccount}
          onDeleteAccount={onDeleteAccount}
          onSaveTransaction={onSaveTransaction}
          onDeleteTransaction={onDeleteTransaction}
          onNavigateTab={vi.fn()}
        />
      );
    });

    const reconcileBtn = container.querySelector('[data-testid="cash-bank-reconcile-button"]') as HTMLButtonElement;
    await act(async () => {
      reconcileBtn.click();
    });

    const exportBtn = container.querySelector('[data-testid="cash-bank-reconciliation-export"]') as HTMLButtonElement;
    expect(exportBtn).not.toBeNull();

    await act(async () => {
      exportBtn.click();
    });

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(createdBlob).not.toBeNull();
    const anchorEl = clickedAnchor as HTMLAnchorElement | null;
    expect(anchorEl?.download).toMatch(/^cash_bank_reconciliation_\d{4}-\d{2}-\d{2}\.csv$/);

    // Verify strictly zero writes
    expect(onSaveAccount).not.toHaveBeenCalled();
    expect(onDeleteAccount).not.toHaveBeenCalled();
    expect(onSaveTransaction).not.toHaveBeenCalled();
    expect(onDeleteTransaction).not.toHaveBeenCalled();

    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('4. Render DashboardView with a negative total and assert dashboard-cash-bank-negative-note; positive total does not show it', async () => {
    // 4a. Negative scenario: bank account with negative opening balance
    const negAccount: BankAccount = {
      id: 'ACC_BANK_OD',
      accountName: 'Overdraft Account',
      accountType: 'BANK',
      openingBalance: -25000,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    vi.spyOn(db, 'getBankAccounts').mockReturnValue([negAccount]);
    vi.spyOn(db, 'getCashBankTransactions').mockReturnValue([]);

    await act(async () => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={[]}
          items={[]}
          parties={[]}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    const negativeNote = container.querySelector('[data-testid="dashboard-cash-bank-negative-note"]');
    expect(negativeNote).not.toBeNull();
    expect(negativeNote?.textContent).toBe('Negative ledger balance');

    // 4b. Positive scenario: positive balance should NOT render note
    act(() => {
      root.unmount();
    });
    root = createRoot(container);

    const posAccount: BankAccount = {
      id: 'ACC_BANK_SAVINGS',
      accountName: 'Savings Account',
      accountType: 'BANK',
      openingBalance: 50000,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    vi.spyOn(db, 'getBankAccounts').mockReturnValue([posAccount]);
    vi.spyOn(db, 'getCashBankTransactions').mockReturnValue([]);

    await act(async () => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={[]}
          items={[]}
          parties={[]}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    const noteWhenPositive = container.querySelector('[data-testid="dashboard-cash-bank-negative-note"]');
    expect(noteWhenPositive).toBeNull();
  });

  it('5. The panel does not render any control labelled "Fix", "Adjust", "Auto-resolve", "Repair", or "Write"', async () => {
    await act(async () => {
      root.render(
        <CashBankManagementView
          company={mockCompany}
          accounts={[mockCashAccount, mockBankAccount]}
          transactions={[]}
          invoices={[]}
          purchases={[]}
          expenses={mockExpenses}
          vouchers={[]}
          onSaveAccount={vi.fn()}
          onDeleteAccount={vi.fn()}
          onSaveTransaction={vi.fn()}
          onDeleteTransaction={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    const reconcileBtn = container.querySelector('[data-testid="cash-bank-reconcile-button"]') as HTMLButtonElement;
    await act(async () => {
      reconcileBtn.click();
    });

    const dialog = container.querySelector('div[role="dialog"]');
    expect(dialog).not.toBeNull();

    // Check all buttons and inputs in the dialog
    const interactiveElements = dialog!.querySelectorAll('button, a, input, select, textarea');
    const prohibitedWords = ['fix', 'adjust', 'auto-resolve', 'autoresolve', 'repair', 'write'];

    interactiveElements.forEach((el) => {
      const text = (el.textContent || '').trim().toLowerCase();
      const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
      const title = (el.getAttribute('title') || '').toLowerCase();

      for (const word of prohibitedWords) {
        expect(text).not.toContain(word);
        expect(ariaLabel).not.toContain(word);
        expect(title).not.toContain(word);
      }
    });
  });

  it('6. Shows an empty state when no accounts are configured without creating or fixing one', async () => {
    await act(async () => {
      root.render(
        <CashBankManagementView
          company={mockCompany}
          accounts={[]}
          transactions={[]}
          invoices={[]}
          purchases={[]}
          expenses={[]}
          vouchers={[]}
          onSaveAccount={vi.fn()}
          onDeleteAccount={vi.fn()}
          onSaveTransaction={vi.fn()}
          onDeleteTransaction={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    const reconcileBtn = container.querySelector('[data-testid="cash-bank-reconcile-button"]') as HTMLButtonElement;
    expect(reconcileBtn).not.toBeNull();

    await act(async () => {
      reconcileBtn.click();
    });

    const dialog = container.querySelector('div[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(
      dialog?.querySelector('[data-testid="reconciliation-empty-state"]')
    ).not.toBeNull();
    expect(dialog?.textContent).toContain('No cash or bank accounts are configured yet');
  });
});
