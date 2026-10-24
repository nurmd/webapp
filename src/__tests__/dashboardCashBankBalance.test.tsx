import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { DashboardView } from '../components/Dashboard/DashboardView.tsx';
import { CompanyProfile } from '../models/company.ts';
import { BankAccount, CashBankTransaction } from '../models/bankAccount.ts';
import { Invoice } from '../models/invoice.ts';
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

describe('DashboardView Cash & Bank Balance', () => {
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

  it('computes live Cash & Bank balance with paid invoices/transactions and renders formatINR(total) with zero state', () => {
    const mockAccounts: BankAccount[] = [
      {
        id: 'ACC_CASH',
        accountName: 'Cash in Hand',
        accountType: 'CASH',
        openingBalance: 10000,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'ACC_BANK_SBI',
        accountName: 'State Bank of India',
        accountType: 'BANK',
        openingBalance: 20000,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    // Paid cash invoice of ₹5,000
    const mockInvoices: Invoice[] = [
      {
        id: 'inv_1',
        invoiceNumber: 'INV-2026-001',
        invoiceType: 'B2CS',
        date: '2026-10-10',
        partyName: 'Walk-in Customer',
        partyAddress: 'Pune Market',
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        totalGrossAmount: 5000,
        totalDiscount: 0,
        totalTaxableAmount: 5000,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 5000,
        amountInWords: 'Five Thousand Rupees Only',
        paymentMode: 'CASH',
        paymentStatus: 'PAID',
        paidAmount: 5000,
        balanceAmount: 0,
        createdAt: '2026-10-10T10:00:00Z',
        updatedAt: '2026-10-10T10:00:00Z',
      },
    ];

    // Direct cash bank deposit/add transaction of ₹2,500 into Bank
    const mockTransactions: CashBankTransaction[] = [
      {
        id: 'cbt_1',
        txnNumber: 'TXN-001',
        date: '2026-10-10',
        type: 'ADD_MONEY',
        toAccountId: 'ACC_BANK_SBI',
        amount: 2500,
        description: 'Direct Deposit',
        createdAt: '2026-10-10T10:00:00Z',
      },
    ];

    vi.spyOn(db, 'getBankAccounts').mockReturnValue(mockAccounts);
    vi.spyOn(db, 'getCashBankTransactions').mockReturnValue(mockTransactions);

    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={mockInvoices}
          items={[]}
          parties={[]}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    const balanceElem = container.querySelector('[data-testid="dashboard-cash-bank-balance"]');
    expect(balanceElem).not.null;
    // Opening (10,000 + 20,000 = 30,000) + Paid Invoice (+5,000) + Direct Inflow (+2,500) = 37,500 => "₹ 37,500.00"
    expect(balanceElem?.textContent).toBe('₹ 37,500.00');

    // Re-render with updated transactions array to verify live reactivity without staling
    const updatedTransactions: CashBankTransaction[] = [
      ...mockTransactions,
      {
        id: 'cbt_2',
        txnNumber: 'TXN-002',
        date: '2026-10-10',
        type: 'ADD_MONEY',
        toAccountId: 'ACC_CASH',
        amount: 4000,
        description: 'Additional Cash Inflow',
        createdAt: '2026-10-10T11:00:00Z',
      },
    ];

    vi.spyOn(db, 'getCashBankTransactions').mockReturnValue(updatedTransactions);

    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={mockInvoices}
          items={[]}
          parties={[]}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    // 37,500 + 4,000 = 41,500 => "₹ 41,500.00"
    expect(balanceElem?.textContent).toBe('₹ 41,500.00');

    // Test zero state with empty accounts & data
    act(() => {
      root.unmount();
    });
    root = createRoot(container);
    vi.spyOn(db, 'getBankAccounts').mockReturnValue([]);
    vi.spyOn(db, 'getCashBankTransactions').mockReturnValue([]);

    act(() => {
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

    const zeroBalanceElem = container.querySelector('[data-testid="dashboard-cash-bank-balance"]');
    expect(zeroBalanceElem).not.null;
    // Zero state => "₹ 0.00"
    expect(zeroBalanceElem?.textContent).toBe('₹ 0.00');
  });
});
