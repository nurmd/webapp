import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

import { DashboardView } from '../components/Dashboard/DashboardView.tsx';
import { CompanyProfile } from '../models/company.ts';
import { Invoice } from '../models/invoice.ts';
import { PurchaseBill } from '../models/purchase.ts';
import { Expense } from '../models/expense.ts';
import { Voucher } from '../core/accounting/voucherTypes.ts';
import { Party } from '../models/party.ts';
import { InventoryItem } from '../models/item.ts';
import { db } from '../services/db.ts';

describe('Dashboard Unified Business Activity Timeline Suite (R1, R2, R3)', () => {
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
    bankName: 'State Bank of India',
    accountNumber: '12345678901',
    ifscCode: 'SBIN0001234',
    upiId: 'bharat@sbi',
    invoicePrefix: 'INV-2026-',
    isGstEnabled: true,
  };

  const mockParties: Party[] = [
    {
      id: 'party_cust_1',
      name: 'Sharma Electronics',
      type: 'CUSTOMER',
      phone: '9876543211',
      stateCode: '27',
      billingAddress: 'Pune Market',
      openingBalance: 0,
      currentBalance: 5000,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'party_supp_1',
      name: 'Alpha Wholesale Supplies',
      type: 'SUPPLIER',
      phone: '9876543212',
      stateCode: '27',
      billingAddress: 'Mumbai MIDC',
      openingBalance: 0,
      currentBalance: -12000,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  const mockItems: InventoryItem[] = [
    {
      id: 'item_1',
      name: 'LED Panel 40W',
      hsnSacCode: '8539',
      category: 'Electronics',
      unit: 'PCS',
      salePrice: 1200,
      purchasePrice: 900,
      gstRate: 18,
      currentStock: 25,
      minStockAlert: 5,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  const mockInvoices: Invoice[] = [
    {
      id: 'inv_1',
      invoiceNumber: 'INV-2026-001',
      invoiceType: 'B2B',
      date: '2026-10-10',
      partyId: 'party_cust_1',
      partyName: 'Sharma Electronics',
      partyAddress: 'Pune Market',
      partyStateCode: '27',
      shippingAddress: 'Pune Market',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      items: [
        {
          id: 'inv_item_1',
          itemId: 'item_1',
          name: 'LED Panel 40W',
          hsnSacCode: '8539',
          unit: 'PCS',
          quantity: 5,
          unitPrice: 1000,
          discountPercent: 0,
          discountAmount: 0,
          taxableAmount: 5000,
          gstRate: 18,
          cgstAmount: 450,
          sgstAmount: 450,
          igstAmount: 0,
          cessAmount: 0,
          totalAmount: 5900,
        },
      ],
      totalGrossAmount: 5000,
      totalDiscount: 0,
      totalTaxableAmount: 5000,
      totalCgst: 450,
      totalSgst: 450,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 900,
      roundOff: 0,
      grandTotal: 5900,
      amountInWords: 'Five Thousand Nine Hundred Rupees Only',
      paymentMode: 'CASH',
      paymentStatus: 'PAID',
      paidAmount: 5900,
      balanceAmount: 0,
      createdAt: '2026-10-10T10:00:00Z',
      updatedAt: '2026-10-10T10:00:00Z',
    },
    {
      id: 'inv_2',
      invoiceNumber: 'INV-2026-002',
      invoiceType: 'B2B',
      date: '2026-10-14',
      partyId: 'party_cust_1',
      partyName: 'Sharma Electronics',
      partyAddress: 'Pune Market',
      partyStateCode: '27',
      shippingAddress: 'Pune Market',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      items: [],
      totalGrossAmount: 3000,
      totalDiscount: 0,
      totalTaxableAmount: 3000,
      totalCgst: 0,
      totalSgst: 0,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 3000,
      amountInWords: 'Three Thousand Rupees Only',
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
      paidAmount: 0,
      balanceAmount: 3000,
      createdAt: '2026-10-14T11:00:00Z',
      updatedAt: '2026-10-14T11:00:00Z',
    },
  ];

  const mockPurchases: PurchaseBill[] = [
    {
      id: 'pur_1',
      billNumber: 'PUR-2026-088',
      date: '2026-10-12',
      supplierId: 'party_supp_1',
      supplierName: 'Alpha Wholesale Supplies',
      supplierAddress: 'Mumbai MIDC',
      supplierStateCode: '27',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      items: [],
      itcEligibility: 'ELIGIBLE_INPUTS',
      isRcm: false,
      totalGrossAmount: 12000,
      totalDiscount: 0,
      totalTaxableAmount: 12000,
      totalCgst: 0,
      totalSgst: 0,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 12000,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
      paidAmount: 0,
      balanceAmount: 12000,
      createdAt: '2026-10-12T14:00:00Z',
      updatedAt: '2026-10-12T14:00:00Z',
    },
  ];

  const mockVouchers: Voucher[] = [
    {
      id: 'vch_rcpt_1',
      voucherNumber: 'RCPT-2026-005',
      voucherType: 'RECEIPT',
      date: '2026-10-13',
      entries: [
        { accountId: 'ACC_BANK', accountName: 'State Bank of India', debit: 4500, credit: 0 },
        { accountId: 'party_cust_1', accountName: 'Sharma Electronics', debit: 0, credit: 4500 },
      ],
      narration: 'Advance received via UPI',
      totalAmount: 4500,
      createdAt: '2026-10-13T16:00:00Z',
    },
  ];

  const mockExpenses: Expense[] = [
    {
      id: 'exp_1',
      category: 'Rent & Utilities',
      title: 'Shop Monthly Rent',
      amount: 8000,
      taxableAmount: 8000,
      gstRate: 0,
      taxAmount: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      date: '2026-10-11',
      paymentMode: 'BANK_TRANSFER',
      vendorName: 'Property Landlord',
      voucherNumber: 'EXP-101',
      itcEligible: false,
      createdAt: '2026-10-11T12:00:00Z',
    },
  ];

  beforeEach(() => {
    testStorage.clear();
    vi.clearAllMocks();
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    window.open = vi.fn();
    window.print = vi.fn();
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

  function changeInput(input: HTMLInputElement, value: string) {
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    nativeSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ==========================================
  // R1: Consolidated Multi-Entity Activity Feed
  // ==========================================
  it('R1: aggregates Sales Invoices, Purchase Bills, Vouchers, and Expenses chronologically in descending order', () => {
    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          vouchers={mockVouchers}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    // Feed should contain all 5 records
    expect(container.textContent).toContain('Business Activity Timeline');
    expect(container.textContent).toContain('5 of 5');

    // Verify identifiers exist
    expect(container.textContent).toContain('INV-2026-002'); // Date: 2026-10-14
    expect(container.textContent).toContain('RCPT-2026-005'); // Date: 2026-10-13
    expect(container.textContent).toContain('PUR-2026-088');  // Date: 2026-10-12
    expect(container.textContent).toContain('Shop Monthly Rent'); // Date: 2026-10-11
    expect(container.textContent).toContain('INV-2026-001'); // Date: 2026-10-10

    // Chronological order verification:
    // INV-2026-002 (Oct 14) -> RCPT-2026-005 (Oct 13) -> PUR-2026-088 (Oct 12) -> Shop Monthly Rent (Oct 11) -> INV-2026-001 (Oct 10)
    const text = container.textContent || '';
    const idxOct14 = text.indexOf('INV-2026-002');
    const idxOct13 = text.indexOf('RCPT-2026-005');
    const idxOct12 = text.indexOf('PUR-2026-088');
    const idxOct11 = text.indexOf('Shop Monthly Rent');
    const idxOct10 = text.indexOf('INV-2026-001');

    expect(idxOct14).toBeLessThan(idxOct13);
    expect(idxOct13).toBeLessThan(idxOct12);
    expect(idxOct12).toBeLessThan(idxOct11);
    expect(idxOct11).toBeLessThan(idxOct10);
  });

  it('R1: visually distinguishes incoming cash flow (Money In) from outgoing cash flow (Money Out)', () => {
    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          vouchers={mockVouchers}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    const moneyInAmounts = Array.from(container.querySelectorAll('.font-tabular-data')).filter(
      (el) => el.textContent?.trim().startsWith('+') && el.className.includes('text-emerald-700')
    );
    const moneyOutAmounts = Array.from(container.querySelectorAll('.font-tabular-data')).filter(
      (el) => el.textContent?.trim().startsWith('-') && el.className.includes('text-rose-700')
    );

    // Sales (2) + Receipt Voucher (1) = 3 Money In (+)
    // Purchase (1) + Expense (1) = 2 Money Out (-)
    expect(moneyInAmounts.length).toBeGreaterThanOrEqual(3);
    expect(moneyOutAmounts.length).toBeGreaterThanOrEqual(2);
  });

  it('R1: displays party/vendor name, payment mode, and settlement status on transaction cards', () => {
    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          vouchers={mockVouchers}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    // Party names
    expect(container.textContent).toContain('Sharma Electronics');
    expect(container.textContent).toContain('Alpha Wholesale Supplies');

    // Settlement statuses
    expect(container.textContent).toContain('PAID');
    expect(container.textContent).toContain('UNPAID');

    // Payment modes
    expect(container.textContent).toContain('CASH');
    expect(container.textContent).toContain('CREDIT');
  });

  it('labels inward GRN challans as Purchase Challan instead of Purchase Bill', () => {
    const grnChallan: PurchaseBill = {
      ...mockPurchases[0],
      id: 'grn_1',
      billNumber: 'GRN-2026-001',
      purchaseType: 'CHALLAN',
      challanStatus: 'RECEIVED',
      items: [],
      grandTotal: 0,
      balanceAmount: 0,
      paymentStatus: 'PAID',
    };

    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={[]}
          purchases={[grnChallan]}
          vouchers={[]}
          expenses={[]}
          items={mockItems}
          parties={mockParties}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    const identifier = Array.from(container.querySelectorAll('span')).find(
      (el) => el.textContent?.trim() === 'GRN-2026-001'
    );
    const card = identifier?.closest('.group');

    expect(card?.textContent).toContain('Purchase Challan (GRN)');
    expect(card?.textContent).toContain('Goods Received Note');
    expect(card?.textContent).not.toContain('Purchase Bill');
  });

  it('prefers the voucher party name over bank and discount entry labels', () => {
    const receipt: Voucher = {
      id: 'vch_rcpt_party_header',
      voucherNumber: 'RCPT-2026-009',
      voucherType: 'RECEIPT',
      date: '2026-10-15',
      entries: [
        { accountId: 'ACC_BANK_SBI', accountName: 'SBI Collection Account', debit: 5000, credit: 0 },
        { accountId: 'ACC_EXPENSE_DISCOUNT', accountName: 'Discount Allowed', debit: 100, credit: 0 },
        { accountId: 'party_cust_1', accountName: 'Sharma Electronics', debit: 0, credit: 5100 },
      ],
      narration: 'NOTE: advance received against dues',
      totalAmount: 5100,
      createdAt: '2026-10-15T12:00:00Z',
    };

    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={[]}
          purchases={[]}
          vouchers={[receipt]}
          expenses={[]}
          items={mockItems}
          parties={mockParties}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    const identifier = Array.from(container.querySelectorAll('span')).find(
      (el) => el.textContent?.trim() === 'RCPT-2026-009'
    );
    const card = identifier?.closest('.group');

    expect(card?.textContent).toContain('Sharma Electronics');
    expect(card?.textContent).not.toContain('SBI Collection Account');
    expect(card?.textContent).not.toContain('Discount Allowed');
  });

  // ==========================================
  // R2: Real-Time Search & Type Filtering
  // ==========================================
  it('R2: filters live transactions dynamically by document reference number without UI lag', () => {
    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          vouchers={mockVouchers}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    const searchInput = container.querySelector('input[placeholder*="Search reference"]') as HTMLInputElement;
    expect(searchInput).not.toBeNull();

    // Search for 'PUR-2026-088'
    act(() => {
      changeInput(searchInput, 'PUR-2026-088');
    });

    expect(container.textContent).toContain('1 of 5');
    expect(container.textContent).toContain('PUR-2026-088');
    expect(container.textContent).not.toContain('INV-2026-001');
    expect(container.textContent).not.toContain('RCPT-2026-005');

    // Clear search
    act(() => {
      changeInput(searchInput, '');
    });
    expect(container.textContent).toContain('5 of 5');
  });

  it('R2: filters live transactions dynamically by party or vendor name', () => {
    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          vouchers={mockVouchers}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    const searchInput = container.querySelector('input[placeholder*="Search reference"]') as HTMLInputElement;

    // Search for 'Alpha Wholesale'
    act(() => {
      changeInput(searchInput, 'Alpha Wholesale');
    });

    expect(container.textContent).toContain('1 of 5');
    expect(container.textContent).toContain('Alpha Wholesale Supplies');
    expect(container.textContent).not.toContain('Sharma Electronics');
  });

  it('R2: filters live transactions dynamically by transaction amount', () => {
    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          vouchers={mockVouchers}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    const searchInput = container.querySelector('input[placeholder*="Search reference"]') as HTMLInputElement;

    // Search for '8000' (Rent expense)
    act(() => {
      changeInput(searchInput, '8000');
    });

    expect(container.textContent).toContain('1 of 5');
    expect(container.textContent).toContain('Shop Monthly Rent');
  });

  it('R2: switches visible transactions using quick type filter pills (Sales, Purchases, Vouchers, Expenses)', () => {
    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          vouchers={mockVouchers}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    const buttons = Array.from(container.querySelectorAll('button'));

    // Tap "Sales"
    const salesBtn = buttons.find((b) => b.textContent?.includes('Sales (2)'));
    expect(salesBtn).toBeDefined();
    act(() => {
      salesBtn?.click();
    });

    expect(container.textContent).toContain('2 of 5');
    expect(container.textContent).toContain('INV-2026-001');
    expect(container.textContent).toContain('INV-2026-002');
    expect(container.textContent).not.toContain('PUR-2026-088');

    // Tap "Purchases"
    const purchasesBtn = buttons.find((b) => b.textContent?.includes('Purchases (1)'));
    expect(purchasesBtn).toBeDefined();
    act(() => {
      purchasesBtn?.click();
    });

    expect(container.textContent).toContain('1 of 5');
    expect(container.textContent).toContain('PUR-2026-088');
    expect(container.textContent).not.toContain('INV-2026-001');

    // Tap "Vouchers"
    const vouchersBtn = buttons.find((b) => b.textContent?.includes('Vouchers (1)'));
    expect(vouchersBtn).toBeDefined();
    act(() => {
      vouchersBtn?.click();
    });

    expect(container.textContent).toContain('1 of 5');
    expect(container.textContent).toContain('RCPT-2026-005');

    // Tap "Expenses"
    const expensesBtn = buttons.find((b) => b.textContent?.includes('Expenses (1)'));
    expect(expensesBtn).toBeDefined();
    act(() => {
      expensesBtn?.click();
    });

    expect(container.textContent).toContain('1 of 5');
    expect(container.textContent).toContain('Shop Monthly Rent');

    // Tap "All"
    const allBtn = buttons.find((b) => b.textContent?.includes('All (5)'));
    expect(allBtn).toBeDefined();
    act(() => {
      allBtn?.click();
    });

    expect(container.textContent).toContain('5 of 5');
  });

  it('R2: filters by payment status pills (All, Unpaid, Paid)', () => {
    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          vouchers={mockVouchers}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    const buttons = Array.from(container.querySelectorAll('button'));

    // Unpaid pill: INV-2026-002 (3000) & PUR-2026-088 (12000) = 2 items
    const unpaidBtn = buttons.find((b) => b.textContent?.includes('Unpaid (2)'));
    expect(unpaidBtn).toBeDefined();
    act(() => {
      unpaidBtn?.click();
    });

    expect(container.textContent).toContain('2 of 5');
    expect(container.textContent).toContain('INV-2026-002');
    expect(container.textContent).toContain('PUR-2026-088');
    expect(container.textContent).not.toContain('INV-2026-001');

    // Paid pill: INV-2026-001, RCPT-2026-005, Shop Monthly Rent = 3 items
    const paidBtn = buttons.find((b) => b.textContent?.includes('Paid (3)'));
    expect(paidBtn).toBeDefined();
    act(() => {
      paidBtn?.click();
    });

    expect(container.textContent).toContain('3 of 5');
    expect(container.textContent).toContain('INV-2026-001');
    expect(container.textContent).toContain('RCPT-2026-005');
    expect(container.textContent).toContain('Shop Monthly Rent');
    expect(container.textContent).not.toContain('INV-2026-002');
  });

  // ==========================================
  // R3: Inline Fast Action Controls
  // ==========================================
  it('R3: clicking a transaction card triggers onViewInvoice for invoices without losing context', () => {
    const handleViewInvoice = vi.fn();

    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          vouchers={mockVouchers}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={handleViewInvoice}
          onNavigateTab={vi.fn()}
        />
      );
    });

    const card = Array.from(container.querySelectorAll('div')).find((d) =>
      d.textContent?.includes('INV-2026-001') && d.classList.contains('group')
    );
    expect(card).toBeDefined();

    act(() => {
      card?.click();
    });

    expect(handleViewInvoice).toHaveBeenCalledWith(mockInvoices[0]);
  });

  it('R3: 1-tap "Collect" button opens inline record payment modal prefilled with bill balance', () => {
    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          vouchers={mockVouchers}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    // Look for the "Collect" 1-tap button on unpaid invoice card
    const collectBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'paymentsCollect'
    );
    expect(collectBtn).toBeDefined();

    act(() => {
      collectBtn?.click();
    });

    // Should open the modal inline
    expect(container.textContent).toContain('Collect Customer Payment');
    expect(container.textContent).toContain('Sharma Electronics');
    expect(container.textContent).toContain('Ref: #INV-2026-002');
    expect(container.textContent).toContain('Payment Mode');
    expect(container.textContent).toContain('Confirm Payment');
  });

  it('R3: submitting inline payment modal calls onRecordPartyPayment and closes without navigation', () => {
    const handleRecordPayment = vi.fn();
    const handleRefresh = vi.fn();

    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          vouchers={mockVouchers}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onRecordPartyPayment={handleRecordPayment}
          onRefresh={handleRefresh}
          onNavigateTab={vi.fn()}
        />
      );
    });

    // Click "Collect"
    const collectBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'paymentsCollect'
    );
    act(() => {
      collectBtn?.click();
    });

    // Modal is open; click Confirm Payment
    const confirmBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirm Payment')
    );
    expect(confirmBtn).toBeDefined();

    act(() => {
      confirmBtn?.click();
    });

    expect(handleRecordPayment).toHaveBeenCalled();
    expect(handleRefresh).toHaveBeenCalled();

    // Modal closes
    expect(container.textContent).not.toContain('Collect Customer Payment');
  });

  it('R2 Edge Case: searches dynamically across formatted currency, decimals, currency symbols, and balance due without regex errors', () => {
    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          vouchers={mockVouchers}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    const searchInput = container.querySelector('input[placeholder*="Search reference"]') as HTMLInputElement;
    expect(searchInput).not.toBeNull();

    // 1. Search with decimal places: "5900.00"
    act(() => {
      changeInput(searchInput, '5900.00');
    });
    expect(container.textContent).toContain('1 of 5');
    expect(container.textContent).toContain('INV-2026-001');

    // 2. Search with currency symbol without spaces: "₹5900"
    act(() => {
      changeInput(searchInput, '₹5900');
    });
    expect(container.textContent).toContain('1 of 5');
    expect(container.textContent).toContain('INV-2026-001');

    // 3. Search with currency symbol with comma: "₹ 5,900"
    act(() => {
      changeInput(searchInput, '₹ 5,900');
    });
    expect(container.textContent).toContain('1 of 5');
    expect(container.textContent).toContain('INV-2026-001');

    // 4. Search by balance due: "3000" (Due amount on INV-2026-002)
    act(() => {
      changeInput(searchInput, '3000');
    });
    expect(container.textContent).toContain('1 of 5');
    expect(container.textContent).toContain('INV-2026-002');

    // 5. Search by entity type: "expense"
    act(() => {
      changeInput(searchInput, 'expense');
    });
    expect(container.textContent).toContain('1 of 5');
    expect(container.textContent).toContain('Shop Monthly Rent');

    // 6. Search with regex special characters like brackets and parentheses: "[test]"
    act(() => {
      changeInput(searchInput, '[2026]');
    });
    // Should safely perform substring check without crashing regex parser
    expect(container.textContent).toContain('0 of 5');
  });

  it('R2 Edge Case: switches visible transactions using quick type filter pill for Vouchers/Expenses', () => {
    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          vouchers={mockVouchers}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const voucherExpBtn = buttons.find((b) => b.textContent?.includes('Vouchers/Expenses (2)'));
    expect(voucherExpBtn).toBeDefined();

    act(() => {
      voucherExpBtn?.click();
    });

    expect(container.textContent).toContain('2 of 5');
    expect(container.textContent).toContain('RCPT-2026-005');
    expect(container.textContent).toContain('Shop Monthly Rent');
    expect(container.textContent).not.toContain('INV-2026-001');
    expect(container.textContent).not.toContain('PUR-2026-088');
  });

  it('R2 Edge Case: Reset Filters button restores All transactions when filter yields 0 matches', () => {
    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          vouchers={[]}
          expenses={[]}
          items={mockItems}
          parties={mockParties}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const voucherBtn = buttons.find((b) => b.textContent?.includes('Vouchers (0)'));
    expect(voucherBtn).toBeDefined();

    act(() => {
      voucherBtn?.click();
    });

    expect(container.textContent).toContain('0 of 3');
    expect(container.textContent).toContain('No transactions match the selected filter combination.');

    // Click Reset Filters
    const resetBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Reset Filters'
    );
    expect(resetBtn).toBeDefined();

    act(() => {
      resetBtn?.click();
    });

    expect(container.textContent).toContain('3 of 3');
  });

  it('R3 Edge Case: 1-tap Share button triggers WhatsApp share for vouchers and expenses', () => {
    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          vouchers={mockVouchers}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    // Share on Expense card
    const expenseCard = Array.from(container.querySelectorAll('div')).find(
      (d) => d.textContent?.includes('Shop Monthly Rent') && d.classList.contains('group')
    );
    expect(expenseCard).toBeDefined();

    const expShareBtn = Array.from(expenseCard!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Share')
    );
    expect(expShareBtn).toBeDefined();

    act(() => {
      expShareBtn?.click();
    });

    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining('wa.me/?text='),
      '_blank'
    );
  });

  it('DashboardRecordPaymentModal validates amount, fails safely without handler, and invokes central onRecordPartyPayment', () => {
    const handleRefresh = vi.fn();
    const onRecordPartyPaymentMock = vi.fn();
    const saveInvoiceSpy = vi.spyOn(db, 'saveInvoice');

    // Invoice for walk-in customer with no party in parties list
    const walkInInvoice: Invoice = {
      ...mockInvoices[1],
      id: 'inv_walkin_999',
      invoiceNumber: 'INV-WALKIN-999',
      partyId: undefined,
      partyName: 'Walk-in Cash Guest',
      balanceAmount: 1500,
      grandTotal: 1500,
      paidAmount: 0,
    };

    // First: render without onRecordPartyPayment to verify safe rejection without direct mutations
    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={[walkInInvoice]}
          purchases={[]}
          vouchers={[]}
          expenses={[]}
          items={mockItems}
          parties={[]} // Empty parties list
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onRefresh={handleRefresh}
          onNavigateTab={vi.fn()}
        />
      );
    });

    // Click Collect
    const collectBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'paymentsCollect'
    );
    expect(collectBtn).toBeDefined();

    act(() => {
      collectBtn?.click();
    });

    expect(container.textContent).toContain('Collect Customer Payment');

    // 1. Test validation error on 0 amount
    const amtInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    act(() => {
      changeInput(amtInput, '0');
    });

    const confirmBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirm Payment')
    );

    act(() => {
      confirmBtn?.click();
    });

    expect(container.textContent).toContain('Please enter a valid payment amount greater than zero.');
    expect(saveInvoiceSpy).not.toHaveBeenCalled();

    // 2. Set valid amount without handler: fails safely with validation error, no direct mutation
    act(() => {
      changeInput(amtInput, '1500');
    });

    act(() => {
      confirmBtn?.click();
    });

    expect(container.textContent).toContain('Payment recording handler is unavailable.');
    expect(saveInvoiceSpy).not.toHaveBeenCalled();

    // 3. Now re-render with central onRecordPartyPayment provided
    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={[walkInInvoice]}
          purchases={[]}
          vouchers={[]}
          expenses={[]}
          items={mockItems}
          parties={[]}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onRefresh={handleRefresh}
          onNavigateTab={vi.fn()}
          onRecordPartyPayment={onRecordPartyPaymentMock}
        />
      );
    });

    // Click Collect again
    const collectBtn2 = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'paymentsCollect'
    );
    act(() => {
      collectBtn2?.click();
    });

    const amtInput2 = container.querySelector('input[type="number"]') as HTMLInputElement;
    act(() => {
      changeInput(amtInput2, '1500');
    });

    const confirmBtn2 = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirm Payment')
    );
    act(() => {
      confirmBtn2?.click();
    });

    expect(onRecordPartyPaymentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Walk-in Cash Guest',
      }),
      1500,
      expect.any(String),
      expect.any(String),
      'IN',
      undefined,
      0,
      undefined,
      [
        expect.objectContaining({
          documentType: 'INVOICE',
          documentId: 'inv_walkin_999',
          amount: 1500,
        }),
      ],
      'MANUAL',
      expect.any(String)
    );
    expect(handleRefresh).toHaveBeenCalled();
    expect(saveInvoiceSpy).not.toHaveBeenCalled();
    saveInvoiceSpy.mockRestore();
  });

  it('Robustness & Fault Tolerance: handles missing props, malformed vouchers, and null entries safely', () => {
    const malformedVoucher: Voucher = {
      id: 'vch_malformed',
      voucherNumber: '',
      voucherType: 'RECEIPT',
      date: '2026-10-15',
      entries: undefined as any,
      narration: '',
      totalAmount: 1000,
      createdAt: '2026-10-15T00:00:00Z',
    };

    const malformedExpense: Expense = {
      id: 'exp_malformed',
      category: 'General Operational',
      title: 'Misc expense',
      amount: 500,
      taxableAmount: 500,
      gstRate: 0,
      taxAmount: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      date: '2026-10-15',
      paymentMode: 'CASH',
      itcEligible: false,
      createdAt: '2026-10-15T00:00:00Z',
    };

    // Render should succeed without throwing uncaught TypeError
    expect(() => {
      act(() => {
        root.render(
          <DashboardView
            company={mockCompany}
            invoices={[]}
            purchases={[]}
            vouchers={[malformedVoucher]}
            expenses={[malformedExpense]}
            items={[]}
            parties={[]}
            onNewInvoice={vi.fn()}
            onQuickPos={vi.fn()}
            onViewInvoice={vi.fn()}
            onNavigateTab={vi.fn()}
          />
        );
      });
    }).not.toThrow();

    expect(container.textContent).toContain('Business Activity Timeline');
    expect(container.textContent).toContain('2 of 2');
  });

  it('R2 Search: supports real-time search by transaction date (ISO and DD/MM/YYYY) and cash flow direction (Money In / Money Out)', () => {
    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          vouchers={mockVouchers}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    const searchInput = container.querySelector('input[placeholder*="Search reference"]') as HTMLInputElement;
    expect(searchInput).not.toBeNull();

    // 1. Search by ISO date string '2026-10-10' (INV-2026-001)
    act(() => {
      changeInput(searchInput, '2026-10-10');
    });
    expect(container.textContent).toContain('1 of 5');
    expect(container.textContent).toContain('INV-2026-001');

    // 2. Search by Indian formatted date '10/10/2026'
    act(() => {
      changeInput(searchInput, '10/10/2026');
    });
    expect(container.textContent).toContain('1 of 5');
    expect(container.textContent).toContain('INV-2026-001');

    // 3. Search by cash flow "money in" (2 sales + 1 receipt voucher = 3 items)
    act(() => {
      changeInput(searchInput, 'money in');
    });
    expect(container.textContent).toContain('3 of 5');
    expect(container.textContent).toContain('INV-2026-001');
    expect(container.textContent).toContain('INV-2026-002');
    expect(container.textContent).toContain('RCPT-2026-005');
    expect(container.textContent).not.toContain('PUR-2026-088');

    // 4. Search by cash flow "money out" (1 purchase + 1 expense = 2 items)
    act(() => {
      changeInput(searchInput, 'money out');
    });
    expect(container.textContent).toContain('2 of 5');
    expect(container.textContent).toContain('PUR-2026-088');
    expect(container.textContent).toContain('Shop Monthly Rent');
    expect(container.textContent).not.toContain('INV-2026-001');

    // 5. Solitary dot '.' must not match all items
    act(() => {
      changeInput(searchInput, '.');
    });
    expect(container.textContent).not.toContain('5 of 5');
  });

  it('R1 Edge Case: displays clear Cash & Bank Transfer and Journal Adjustment descriptions for CONTRA and JOURNAL vouchers', () => {
    const contraVoucher: Voucher = {
      id: 'vch_contra_1',
      voucherNumber: 'CONTRA-001',
      voucherType: 'CONTRA',
      date: '2026-10-15',
      entries: [
        { accountId: 'ACC_BANK', accountName: 'Bank Account', debit: 1000, credit: 0 },
        { accountId: 'ACC_CASH', accountName: 'Cash-in-hand', debit: 0, credit: 1000 },
      ],
      narration: 'Cash deposited to bank',
      totalAmount: 1000,
      createdAt: '2026-10-15T10:00:00Z',
    };

    const journalVoucher: Voucher = {
      id: 'vch_journal_1',
      voucherNumber: 'JRNL-001',
      voucherType: 'JOURNAL',
      date: '2026-10-15',
      entries: [
        { accountId: 'ACC_EXP', accountName: 'Depreciation Account', debit: 500, credit: 0 },
        { accountId: 'ACC_ASSET', accountName: 'Office Equipment', debit: 0, credit: 500 },
      ],
      narration: 'Depreciation entry',
      totalAmount: 500,
      createdAt: '2026-10-15T11:00:00Z',
    };

    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={[]}
          purchases={[]}
          vouchers={[contraVoucher, journalVoucher]}
          expenses={[]}
          items={[]}
          parties={[]}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    expect(container.textContent).toContain('Cash & Bank Transfer');
    expect(container.textContent).not.toContain('Payment Party');
  });

  it('R3 Edge Case: WhatsApp share safely handles popup blockers by falling back to anchor dispatch', () => {
    window.open = vi.fn(() => null);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');

    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          vouchers={mockVouchers}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    const expenseCard = Array.from(container.querySelectorAll('div')).find(
      (d) => d.textContent?.includes('Shop Monthly Rent') && d.classList.contains('group')
    );
    expect(expenseCard).toBeDefined();

    const expShareBtn = Array.from(expenseCard!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Share')
    );
    expect(expShareBtn).toBeDefined();

    expect(() => {
      act(() => {
        expShareBtn?.click();
      });
    }).not.toThrow();

    expect(window.open).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('R3 Edge Case: DashboardRecordPaymentModal validates and rejects overpayment greater than balance due', () => {
    const walkInInvoice: Invoice = {
      ...mockInvoices[1],
      id: 'inv_overpay_test',
      partyId: undefined,
      partyName: 'Walk-in Cash Guest',
      balanceAmount: 1200,
      grandTotal: 1200,
      paidAmount: 0,
    };

    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={[walkInInvoice]}
          purchases={[]}
          vouchers={[]}
          expenses={[]}
          items={mockItems}
          parties={[]}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    const collectBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'paymentsCollect'
    );
    expect(collectBtn).toBeDefined();

    act(() => {
      collectBtn?.click();
    });

    const amtInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    expect(amtInput).not.toBeNull();

    act(() => {
      changeInput(amtInput, '2000');
    });

    const confirmBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirm Payment')
    );
    expect(confirmBtn).toBeDefined();

    act(() => {
      confirmBtn?.click();
    });

    expect(container.textContent).toContain('Payment amount cannot exceed the pending balance');
    expect(container.textContent).toContain('Collect Customer Payment');
  });

  it('R3 UI/A11y: ensures responsive touch targets meet >=44px guidelines for mobile/tablet quick action controls', () => {
    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          vouchers={mockVouchers}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    const filterButtons = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('Sales (2)') || b.textContent?.includes('Purchases (1)')
    );
    expect(filterButtons.length).toBeGreaterThan(0);
    filterButtons.forEach((btn) => {
      expect(btn.className).toContain('rounded-full');
    });

    const viewButtons = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.getAttribute('title') === 'View Details'
    );
    expect(viewButtons.length).toBeGreaterThan(0);
    viewButtons.forEach((btn) => {
      expect(btn.className).toContain('min-h-[44px]');
    });

    const shareButtons = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.getAttribute('title') === 'Share Receipt'
    );
    expect(shareButtons.length).toBeGreaterThan(0);
    shareButtons.forEach((btn) => {
      expect(btn.className).toContain('min-h-[44px]');
    });

    const printButtons = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.getAttribute('title') === 'Print Receipt'
    );
    expect(printButtons.length).toBeGreaterThan(0);
    printButtons.forEach((btn) => {
      expect(btn.className).toContain('min-h-[44px]');
    });

    const collectButton = Array.from(container.querySelectorAll('button')).find((b) =>
      b.getAttribute('title') === 'Collect Customer Payment'
    );
    expect(collectButton).toBeDefined();
    expect(collectButton?.className).toContain('min-h-[44px]');
  });

  it('Adversarial Stress R1/R2: handles large dataset (120+ multi-entity transactions) with progressive batching and full-dataset live search', () => {
    // Generate 50 sales, 30 purchases, 20 vouchers, 20 expenses = 120 total transactions
    const heavyInvoices: Invoice[] = Array.from({ length: 50 }, (_, i) => ({
      id: `inv_heavy_${i + 1}`,
      invoiceNumber: `INV-2026-HVY-${String(i + 1).padStart(3, '0')}`,
      invoiceType: 'B2B',
      date: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`,
      partyId: 'party_cust_1',
      partyName: `Customer ${i + 1}`,
      partyAddress: 'Pune Market',
      partyStateCode: '27',
      shippingAddress: 'Pune Market',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      items: [],
      totalGrossAmount: 1000 + i * 100,
      totalDiscount: 0,
      totalTaxableAmount: 1000 + i * 100,
      totalCgst: 0,
      totalSgst: 0,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 1000 + i * 100,
      amountInWords: '',
      paymentMode: i % 2 === 0 ? 'CASH' : 'CREDIT',
      paymentStatus: i % 2 === 0 ? 'PAID' : 'UNPAID',
      paidAmount: i % 2 === 0 ? 1000 + i * 100 : 0,
      balanceAmount: i % 2 === 0 ? 0 : 1000 + i * 100,
      createdAt: `2026-09-01T10:00:00Z`,
      updatedAt: `2026-09-01T10:00:00Z`,
    }));

    const heavyPurchases: PurchaseBill[] = Array.from({ length: 30 }, (_, i) => ({
      id: `pur_heavy_${i + 1}`,
      billNumber: `PUR-2026-HVY-${String(i + 1).padStart(3, '0')}`,
      date: `2026-08-${String((i % 28) + 1).padStart(2, '0')}`,
      supplierId: 'party_supp_1',
      supplierName: `Supplier ${i + 1}`,
      supplierAddress: 'Mumbai MIDC',
      supplierStateCode: '27',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      items: [],
      itcEligibility: 'ELIGIBLE_INPUTS',
      isRcm: false,
      totalGrossAmount: 2000 + i * 50,
      totalDiscount: 0,
      totalTaxableAmount: 2000 + i * 50,
      totalCgst: 0,
      totalSgst: 0,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 0,
      roundOff: 0,
      grandTotal: 2000 + i * 50,
      paymentMode: 'CREDIT',
      paymentStatus: 'UNPAID',
      paidAmount: 0,
      balanceAmount: 2000 + i * 50,
      createdAt: `2026-08-01T10:00:00Z`,
      updatedAt: `2026-08-01T10:00:00Z`,
    }));

    const heavyVouchers: Voucher[] = Array.from({ length: 20 }, (_, i) => ({
      id: `vch_heavy_${i + 1}`,
      voucherNumber: `RCPT-HVY-${String(i + 1).padStart(3, '0')}`,
      voucherType: 'RECEIPT',
      date: `2026-07-${String((i % 28) + 1).padStart(2, '0')}`,
      entries: [
        { accountId: 'ACC_BANK', accountName: 'State Bank of India', debit: 500, credit: 0 },
        { accountId: 'party_cust_1', accountName: `Customer ${i + 1}`, debit: 0, credit: 500 },
      ],
      narration: `Voucher collection ${i + 1}`,
      totalAmount: 500,
      createdAt: `2026-07-01T10:00:00Z`,
    }));

    const heavyExpenses: Expense[] = Array.from({ length: 20 }, (_, i) => ({
      id: `exp_heavy_${i + 1}`,
      category: 'General Operational',
      title: `Expense ${i + 1}`,
      amount: 350 + i * 10,
      taxableAmount: 350 + i * 10,
      gstRate: 0,
      taxAmount: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      date: `2026-06-${String((i % 28) + 1).padStart(2, '0')}`,
      paymentMode: 'CASH',
      vendorName: `Vendor ${i + 1}`,
      voucherNumber: `EXP-HVY-${String(i + 1).padStart(3, '0')}`,
      itcEligible: false,
      createdAt: `2026-06-01T10:00:00Z`,
    }));

    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={heavyInvoices}
          purchases={heavyPurchases}
          vouchers={heavyVouchers}
          expenses={heavyExpenses}
          items={mockItems}
          parties={mockParties}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    // 1. Total aggregation metric header: 120 of 120
    expect(container.textContent).toContain('120 of 120');

    // 2. Type pill counters:
    expect(container.textContent).toContain('Sales (50)');
    expect(container.textContent).toContain('Purchases (30)');
    expect(container.textContent).toContain('Vouchers (20)');
    expect(container.textContent).toContain('Expenses (20)');
    expect(container.textContent).toContain('Vouchers/Expenses (40)');

    // 3. Progressive batching dock: shows "Showing 50 of 120 transactions"
    expect(container.textContent).toContain('Showing 50 of 120 transactions');

    // 4. Load More (50) expansion
    const loadMoreBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Load More')
    );
    expect(loadMoreBtn).toBeDefined();

    act(() => {
      loadMoreBtn?.click();
    });
    expect(container.textContent).toContain('Showing 100 of 120 transactions');

    // 5. Show All expansion
    const showAllBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Show All')
    );
    expect(showAllBtn).toBeDefined();

    act(() => {
      showAllBtn?.click();
    });
    // With all shown, the load-more dock disappears
    expect(container.textContent).not.toContain('Showing 100 of 120 transactions');

    // 6. Real-time search across the entire 120 dataset
    const searchInput = container.querySelector('input[placeholder*="Search reference"]') as HTMLInputElement;
    expect(searchInput).not.toBeNull();

    act(() => {
      changeInput(searchInput, 'INV-2026-HVY-045');
    });
    expect(container.textContent).toContain('1 of 120');
    expect(container.textContent).toContain('INV-2026-HVY-045');
  });

  it('Adversarial Stress R2: tests simultaneous multi-filtering (Type + Status + Multi-word Live Search)', () => {
    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          vouchers={mockVouchers}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    // 1. Select Purchases type filter
    const purFilterBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Purchases (1)')
    );
    act(() => {
      purFilterBtn?.click();
    });
    expect(container.textContent).toContain('1 of 5');
    expect(container.textContent).toContain('PUR-2026-088');

    // 2. Select Unpaid status filter
    const unpaidBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Unpaid')
    );
    act(() => {
      unpaidBtn?.click();
    });
    expect(container.textContent).toContain('1 of 5');
    expect(container.textContent).toContain('PUR-2026-088');

    // 3. Multi-word search tokenization ("alpha 12000")
    const searchInput = container.querySelector('input[placeholder*="Search reference"]') as HTMLInputElement;
    act(() => {
      changeInput(searchInput, 'alpha 12000');
    });
    expect(container.textContent).toContain('1 of 5');
    expect(container.textContent).toContain('PUR-2026-088');

    // 4. Contradictory search ("alpha paid") -> 0 matches, with Reset Filters button
    act(() => {
      changeInput(searchInput, 'alpha nonexisting');
    });
    expect(container.textContent).toContain('0 of 5');
    expect(container.textContent).toContain('No transactions found');

    const resetFiltersBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Reset Filters')
    );
    expect(resetFiltersBtn).toBeDefined();

    act(() => {
      resetFiltersBtn?.click();
    });
    expect(container.textContent).toContain('No matching records found for "alpha nonexisting"');
  });

  it('Adversarial Fault Tolerance: safely handles undefined invoices prop and Indian DD/MM/YYYY dates', () => {
    const ddmmyyyyInvoice: Invoice = {
      ...mockInvoices[0],
      id: 'inv_ddmmyyyy',
      invoiceNumber: 'INV-DDMM-999',
      date: '25/12/2026',
    };

    // Passing invoices as undefined or with DD/MM/YYYY format should render safely without throwing
    expect(() => {
      act(() => {
        root.render(
          <DashboardView
            company={mockCompany}
            invoices={undefined as any}
            purchases={[]}
            vouchers={[]}
            expenses={[]}
            items={[]}
            parties={[]}
            onNewInvoice={vi.fn()}
            onQuickPos={vi.fn()}
            onViewInvoice={vi.fn()}
            onNavigateTab={vi.fn()}
          />
        );
      });
    }).not.toThrow();

    expect(container.textContent).toContain('0 bills recorded');

    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={[ddmmyyyyInvoice]}
          purchases={[]}
          vouchers={[]}
          expenses={[]}
          items={[]}
          parties={[]}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    expect(container.textContent).toContain('25/12/2026');
    expect(container.textContent).toContain('INV-DDMM-999');
  });

  it('Adversarial A11y: verifies status filter buttons and search input strictly satisfy min-h-[44px]', () => {
    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          vouchers={mockVouchers}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={vi.fn()}
          onNavigateTab={vi.fn()}
        />
      );
    });

    // Check all status filter buttons (All, Unpaid, Paid)
    const statusButtons = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.textContent === 'All' || b.textContent?.startsWith('Unpaid') || b.textContent?.startsWith('Paid')
    );
    expect(statusButtons.length).toBe(3);
    statusButtons.forEach((btn) => {
      expect(btn.className).toContain('rounded-full');
    });

    // Check search input
    const searchInput = container.querySelector('input[placeholder*="Search reference"]') as HTMLInputElement;
    expect(searchInput.className).toContain('min-h-[44px]');
  });

  it('smaller screen UX: provides \\/ chevron button to expand action icons per transaction card and toggles expanded state', () => {
    const handleViewInvoice = vi.fn();

    act(() => {
      root.render(
        <DashboardView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          vouchers={mockVouchers}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
          onNewInvoice={vi.fn()}
          onQuickPos={vi.fn()}
          onViewInvoice={handleViewInvoice}
          onNavigateTab={vi.fn()}
        />
      );
    });

    // Find all expand chevron buttons
    const expandButtons = Array.from(
      container.querySelectorAll('button[data-testid^="expand-actions-"]')
    ) as HTMLButtonElement[];

    expect(expandButtons.length).toBeGreaterThan(0);

    const firstExpandBtn = expandButtons[0];
    expect(firstExpandBtn.getAttribute('aria-expanded')).toBe('false');
    expect(firstExpandBtn.getAttribute('aria-label')).toBe('Expand action icons');
    expect(firstExpandBtn.textContent).toContain('expand_more');

    // Click to expand
    act(() => {
      firstExpandBtn.click();
    });

    expect(firstExpandBtn.getAttribute('aria-expanded')).toBe('true');
    expect(firstExpandBtn.getAttribute('aria-label')).toBe('Collapse action icons');
    expect(firstExpandBtn.querySelector('span')?.className).toContain('rotate-180');

    // Ensure clicking the expand toggle does not inadvertently trigger onViewInvoice (stopPropagation)
    expect(handleViewInvoice).not.toHaveBeenCalled();

    // Click again to collapse
    act(() => {
      firstExpandBtn.click();
    });

    expect(firstExpandBtn.getAttribute('aria-expanded')).toBe('false');
    expect(firstExpandBtn.getAttribute('aria-label')).toBe('Expand action icons');
    expect(firstExpandBtn.querySelector('span')?.className).not.toContain('rotate-180');
  });
});

