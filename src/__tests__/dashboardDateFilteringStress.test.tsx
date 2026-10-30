import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import {
  DatePreset,
  getDateFilterBounds,
  isDateInRange,
  getFinancialYear,
} from '../core/utils/dateFilters.ts';
import { DashboardView } from '../components/Dashboard/DashboardView.tsx';
import { CompanyProfile } from '../models/company.ts';
import { Invoice } from '../models/invoice.ts';
import { PurchaseBill } from '../models/purchase.ts';
import { Expense } from '../models/expense.ts';
import { Voucher } from '../core/accounting/voucherTypes.ts';
import { Party } from '../models/party.ts';
import { InventoryItem } from '../models/item.ts';

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

/**
 * Exact replica of toNormalizedDateStr from src/components/Dashboard/DashboardView.tsx (lines 124-146)
 * used for empirical testing across edge cases and tricky date formats.
 */
function toNormalizedDateStr(dateStr?: string, timestamp?: number): string {
  if (dateStr) {
    const trimmed = dateStr.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
    if (trimmed.includes('/')) {
      const parts = trimmed.split('/');
      if (parts.length === 3) {
        const d = parts[0].padStart(2, '0');
        const m = parts[1].padStart(2, '0');
        const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
        return `${y}-${m}-${d}`;
      }
    }
  }
  if (timestamp && timestamp > 0) {
    const d = new Date(timestamp);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return '';
}

/**
 * Mock data for React DashboardView rendering
 */
const mockCompany: CompanyProfile = {
  id: 'comp_1',
  businessName: 'Apex Enterprises',
  tradeName: 'Apex Enterprise',
  gstin: '27AAAAA0000A1Z5',
  pan: 'AAAAA0000A',
  stateCode: '27',
  address: '100 Industrial Area',
  pincode: '400001',
  city: 'Mumbai',
  phone: '9876543210',
  email: 'apex@test.com',
  bankName: 'HDFC Bank',
  accountNumber: '1234567890',
  ifscCode: 'HDFC0001234',
  branchName: 'Fort',
  invoicePrefix: 'INV',
};

const mockCustomer: Party = {
  id: 'cust_1',
  name: 'Standard Customer',
  type: 'CUSTOMER',
  phone: '9988776655',
  billingAddress: 'Customer Address',
  stateCode: '27',
  currentBalance: 0,
  openingBalance: 0,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

describe('Empirical Adversarial Stress Testing: Dashboard Date Filtering', () => {
  // =========================================================================
  // Dimension 1: toNormalizedDateStr across tricky formats and edge cases
  // =========================================================================
  describe('Dimension 1: Date Normalization (toNormalizedDateStr)', () => {
    it('1.1: Standard ISO YYYY-MM-DD date strings', () => {
      expect(toNormalizedDateStr('2026-10-16')).toBe('2026-10-16');
      expect(toNormalizedDateStr('2026-01-01')).toBe('2026-01-01');
      expect(toNormalizedDateStr('2025-12-31')).toBe('2025-12-31');
    });

    it('1.2: ISO timestamps with UTC Z suffix', () => {
      expect(toNormalizedDateStr('2026-10-16T00:00:00.000Z')).toBe('2026-10-16');
      expect(toNormalizedDateStr('2026-10-16T14:30:45.123Z')).toBe('2026-10-16');
      expect(toNormalizedDateStr('2026-10-16T23:59:59.999Z')).toBe('2026-10-16');
    });

    it('1.3: ISO timestamps with explicit timezone offsets', () => {
      expect(toNormalizedDateStr('2026-10-16T23:59:59.999+05:30')).toBe('2026-10-16');
      expect(toNormalizedDateStr('2026-10-16T00:00:00.000+05:30')).toBe('2026-10-16');
      expect(toNormalizedDateStr('2026-10-16T12:00:00-05:00')).toBe('2026-10-16');
    });

    it('1.4: Indian standard DD/MM/YYYY slash format', () => {
      expect(toNormalizedDateStr('16/10/2026')).toBe('2026-10-16');
      expect(toNormalizedDateStr('01/01/2026')).toBe('2026-01-01');
      expect(toNormalizedDateStr('31/12/2025')).toBe('2025-12-31');
      expect(toNormalizedDateStr('5/4/2026')).toBe('2026-04-05');
      expect(toNormalizedDateStr('05/04/2026')).toBe('2026-04-05');
    });

    it('1.5: 2-digit year DD/MM/YY slash format', () => {
      expect(toNormalizedDateStr('16/10/26')).toBe('2026-10-16');
      expect(toNormalizedDateStr('01/01/25')).toBe('2025-01-01');
      expect(toNormalizedDateStr('31/12/24')).toBe('2024-12-31');
    });

    it('1.6: Untrimmed strings with whitespace', () => {
      expect(toNormalizedDateStr('   2026-10-16   ')).toBe('2026-10-16');
      expect(toNormalizedDateStr('  16/10/2026  ')).toBe('2026-10-16');
    });

    it('1.7: Timestamp fallback when dateStr is absent or empty', () => {
      const fixedEpoch = new Date(2026, 9, 16, 10, 30, 0).getTime(); // Oct 16, 2026 local
      expect(toNormalizedDateStr(undefined, fixedEpoch)).toBe('2026-10-16');
      expect(toNormalizedDateStr('', fixedEpoch)).toBe('2026-10-16');
    });

    it('1.8: Edge cases: undefined, null, empty string, invalid dates', () => {
      expect(toNormalizedDateStr(undefined, undefined)).toBe('');
      expect(toNormalizedDateStr('', 0)).toBe('');
      expect(toNormalizedDateStr('', -100)).toBe('');
      expect(toNormalizedDateStr('   ', 0)).toBe('');
      expect(toNormalizedDateStr('not-a-valid-date', 0)).toBe('');
      expect(toNormalizedDateStr('invalid', undefined)).toBe('');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(toNormalizedDateStr(null as any, undefined)).toBe('');
    });

    it('1.9: Timestamp fallback when dateStr is unrecognized garbage text', () => {
      const fixedEpoch = new Date(2026, 9, 16, 12, 0, 0).getTime();
      expect(toNormalizedDateStr('corrupted_string', fixedEpoch)).toBe('2026-10-16');
    });
  });

  // =========================================================================
  // Dimension 2: isDateInRange with boundary dates and preset ranges
  // =========================================================================
  describe('Dimension 2: Boundary Date Range Testing (isDateInRange)', () => {
    it('2.1: Same-day transactions against TODAY range bounds', () => {
      const todayBounds = getDateFilterBounds('TODAY');
      expect(isDateInRange(todayBounds.start, todayBounds.start, todayBounds.end)).toBe(true);

      // Same day with ISO representation
      expect(isDateInRange(`${todayBounds.start}T14:30:00.000Z`, todayBounds.start, todayBounds.end)).toBe(true);

      // Yesterday and Tomorrow must fail TODAY bounds
      const [y, m, d] = todayBounds.start.split('-').map(Number);
      const yesterday = new Date(y, m - 1, d - 1);
      const tomorrow = new Date(y, m - 1, d + 1);
      const pad = (n: number) => String(n).padStart(2, '0');
      const yStr = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`;
      const tStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;

      expect(isDateInRange(yStr, todayBounds.start, todayBounds.end)).toBe(false);
      expect(isDateInRange(tStr, todayBounds.start, todayBounds.end)).toBe(false);
    });

    it('2.2: First day and last day boundaries of THIS_MONTH', () => {
      const monthBounds = getDateFilterBounds('THIS_MONTH');
      expect(monthBounds.start).toMatch(/^\d{4}-\d{2}-01$/);

      // Day 1 of month must be in range
      expect(isDateInRange(monthBounds.start, monthBounds.start, monthBounds.end)).toBe(true);
      // Last day of month must be in range
      expect(isDateInRange(monthBounds.end, monthBounds.start, monthBounds.end)).toBe(true);

      // Day before Day 1 must be out of range
      const [year, month] = monthBounds.start.split('-').map(Number);
      const dayBefore = new Date(year, month - 1, 0); // last day of prev month
      const pad = (n: number) => String(n).padStart(2, '0');
      const dayBeforeStr = `${dayBefore.getFullYear()}-${pad(dayBefore.getMonth() + 1)}-${pad(dayBefore.getDate())}`;
      expect(isDateInRange(dayBeforeStr, monthBounds.start, monthBounds.end)).toBe(false);

      // Day after last day must be out of range
      const dayAfter = new Date(year, month, 1); // 1st of next month
      const dayAfterStr = `${dayAfter.getFullYear()}-${pad(dayAfter.getMonth() + 1)}-${pad(dayAfter.getDate())}`;
      expect(isDateInRange(dayAfterStr, monthBounds.start, monthBounds.end)).toBe(false);
    });

    it('2.3: First day boundary of THIS_WEEK', () => {
      const weekBounds = getDateFilterBounds('THIS_WEEK');
      // Monday of this week must be in range
      expect(isDateInRange(weekBounds.start, weekBounds.start, weekBounds.end)).toBe(true);
      // Today (end of weekBounds) must be in range
      expect(isDateInRange(weekBounds.end, weekBounds.start, weekBounds.end)).toBe(true);

      // Day before Monday (Sunday of previous week) must be out of range
      const [wy, wm, wd] = weekBounds.start.split('-').map(Number);
      const prevSun = new Date(wy, wm - 1, wd - 1);
      const pad = (n: number) => String(n).padStart(2, '0');
      const prevSunStr = `${prevSun.getFullYear()}-${pad(prevSun.getMonth() + 1)}-${pad(prevSun.getDate())}`;
      expect(isDateInRange(prevSunStr, weekBounds.start, weekBounds.end)).toBe(false);
    });

    it('2.4: First day and last day boundaries of THIS_FY (Indian Financial Year)', () => {
      const fyBounds = getDateFilterBounds('THIS_FY');
      expect(fyBounds.start).toMatch(/^\d{4}-04-01$/);
      expect(fyBounds.end).toMatch(/^\d{4}-03-31$/);

      // April 1st of FY start year must be included
      expect(isDateInRange(fyBounds.start, fyBounds.start, fyBounds.end)).toBe(true);
      // March 31st of FY end year must be included
      expect(isDateInRange(fyBounds.end, fyBounds.start, fyBounds.end)).toBe(true);

      // March 31st of FY start year (belongs to previous FY) must be excluded
      const fyStartYear = parseInt(fyBounds.start.slice(0, 4), 10);
      const prevFyEnd = `${fyStartYear}-03-31`;
      expect(isDateInRange(prevFyEnd, fyBounds.start, fyBounds.end)).toBe(false);

      // April 1st of next FY must be excluded
      const fyEndYear = parseInt(fyBounds.end.slice(0, 4), 10);
      const nextFyStart = `${fyEndYear}-04-01`;
      expect(isDateInRange(nextFyStart, fyBounds.start, fyBounds.end)).toBe(false);
    });

    it('2.5: Future transactions and past transactions outside range', () => {
      const start = '2026-10-01';
      const end = '2026-10-31';

      expect(isDateInRange('2030-01-01', start, end)).toBe(false);
      expect(isDateInRange('2020-01-01', start, end)).toBe(false);
      expect(isDateInRange('2026-10-15', start, end)).toBe(true);

      // In ALL_TIME (unbounded), both past and future are included
      expect(isDateInRange('2030-01-01', '', '')).toBe(true);
      expect(isDateInRange('2020-01-01', '', '')).toBe(true);
    });

    it('2.6: Inverted custom range (start > end) returns false for all dates', () => {
      const invertedStart = '2026-10-31';
      const invertedEnd = '2026-10-01';
      expect(isDateInRange('2026-10-15', invertedStart, invertedEnd)).toBe(false);
      expect(isDateInRange('2026-10-01', invertedStart, invertedEnd)).toBe(false);
      expect(isDateInRange('2026-10-31', invertedStart, invertedEnd)).toBe(false);
    });

    it('2.7: Single-sided custom bounds (open start or open end)', () => {
      expect(isDateInRange('2026-10-15', '2026-10-01', '')).toBe(true);
      expect(isDateInRange('2026-09-30', '2026-10-01', '')).toBe(false);

      expect(isDateInRange('2026-10-15', '', '2026-10-20')).toBe(true);
      expect(isDateInRange('2026-10-25', '', '2026-10-20')).toBe(false);
    });
  });

  // =========================================================================
  // Dimension 3: Component Integration Testing with React DOM Rendering
  // =========================================================================
  describe('Dimension 3: React DashboardView Component Integration & Interactivity', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
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

    // Compute dynamic today and month boundaries matching test runtime
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const todayYMD = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const todayIndian = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
    const todayIsoWithTime = `${todayYMD}T10:30:00.000Z`;

    const pastYearYMD = '2023-01-15';

    const testInvoices: Invoice[] = [
      {
        id: 'inv-today-iso',
        invoiceNumber: 'INV-TODAY-01',
        date: todayIsoWithTime,
        partyId: 'cust_1',
        partyName: 'Customer Alpha',
        items: [] as any,
        subtotal: 1000,
        cgstTotal: 90,
        sgstTotal: 90,
        igstTotal: 0,
        grandTotal: 1180,
        paidAmount: 1180,
        balanceAmount: 0,
        paymentStatus: 'PAID',
        paymentMode: 'UPI',
        createdAt: todayIsoWithTime,
        status: 'PAID',
      } as unknown as Invoice,
      {
        id: 'inv-past-year',
        invoiceNumber: 'INV-PAST-99',
        date: pastYearYMD,
        partyId: 'cust_1',
        partyName: 'Customer Past',
        items: [] as any,
        subtotal: 500,
        cgstTotal: 45,
        sgstTotal: 45,
        igstTotal: 0,
        grandTotal: 590,
        paidAmount: 0,
        balanceAmount: 590,
        paymentStatus: 'UNPAID',
        paymentMode: 'CASH',
        createdAt: `${pastYearYMD}T00:00:00.000Z`,
        status: 'UNPAID',
      } as unknown as Invoice,
    ];

    const testPurchases: PurchaseBill[] = [
      {
        id: 'pur-today-indian',
        billNumber: 'BILL-IND-01',
        date: todayIndian, // DD/MM/YYYY format
        supplierId: 'supp_1',
        supplierName: 'Vendor Beta',
        items: [] as any,
        subtotal: 4000,
        cgstTotal: 360,
        sgstTotal: 360,
        igstTotal: 0,
        grandTotal: 4720,
        paidAmount: 4720,
        balanceAmount: 0,
        paymentStatus: 'PAID',
        paymentMode: 'BANK',
        createdAt: todayIsoWithTime,
        status: 'PAID',
      } as unknown as PurchaseBill,
    ];

    const testExpenses: Expense[] = [
      {
        id: 'exp-today-std',
        voucherNumber: 'EXP-TODAY-01',
        date: todayYMD,
        amount: 450,
        category: 'General Operational',
        title: 'Printer Paper',
        paymentMode: 'CASH',
        createdAt: todayIsoWithTime,
      } as unknown as Expense,
    ];

    const testVouchers: Voucher[] = [
      {
        id: 'vch-today-ts',
        voucherNumber: 'RCPT-TODAY-01',
        voucherType: 'RECEIPT',
        date: '', // Empty date string to verify timestamp fallback
        createdAt: todayIsoWithTime,
        totalAmount: 2500,
        narration: 'Cash collection',
        entries: [
          { accountId: 'ACC_CASH', accountName: 'Cash in Hand', debit: 2500, credit: 0 },
          { accountId: 'cust_1', accountName: 'Customer Alpha', debit: 0, credit: 2500 },
        ],
      },
    ];

    it('3.1: Mounts DashboardView with ALL_TIME preset and renders all multi-format transactions', () => {
      act(() => {
        root.render(
          <DashboardView
            company={mockCompany}
            invoices={testInvoices}
            purchases={testPurchases}
            expenses={testExpenses}
            vouchers={testVouchers}
            parties={[mockCustomer]}
            items={[]}
            onNewInvoice={vi.fn()}
            onQuickPos={vi.fn()}
            onViewInvoice={vi.fn()}
            onNavigateTab={vi.fn()}
          />
        );
      });

      // Total 5 activities rendered (2 invoices + 1 purchase + 1 expense + 1 voucher)
      expect(container.textContent).toContain('5 of 5');
      expect(container.textContent).toContain('INV-TODAY-01');
      expect(container.textContent).toContain('INV-PAST-99');
      expect(container.textContent).toContain('BILL-IND-01');
      expect(container.textContent).toContain('EXP-TODAY-01');
      expect(container.textContent).toContain('RCPT-TODAY-01');
    });

    it('3.2: Clicking TODAY preset pill filters multi-format records down to today only', () => {
      act(() => {
        root.render(
          <DashboardView
            company={mockCompany}
            invoices={testInvoices}
            purchases={testPurchases}
            expenses={testExpenses}
            vouchers={testVouchers}
            parties={[mockCustomer]}
            items={[]}
            onNewInvoice={vi.fn()}
            onQuickPos={vi.fn()}
            onViewInvoice={vi.fn()}
            onNavigateTab={vi.fn()}
          />
        );
      });

      // Find and click the "Today" preset pill
      const buttons = Array.from(container.querySelectorAll('button'));
      const todayBtn = buttons.find((b) => b.textContent?.trim() === 'Today');
      expect(todayBtn).toBeTruthy();

      act(() => {
        todayBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Should now show 4 of 5 (INV-PAST-99 from 2023 filtered out)
      expect(container.textContent).toContain('4 of 5');
      expect(container.textContent).toContain('INV-TODAY-01');    // ISO with time
      expect(container.textContent).toContain('BILL-IND-01');      // DD/MM/YYYY
      expect(container.textContent).toContain('EXP-TODAY-01');      // YYYY-MM-DD
      expect(container.textContent).toContain('RCPT-TODAY-01');     // Timestamp fallback
      expect(container.textContent).not.toContain('INV-PAST-99');  // Past year excluded
    });

    it('3.3: Type filter (SALES) combined with TODAY date filter returns exactly 1 sale today', () => {
      act(() => {
        root.render(
          <DashboardView
            company={mockCompany}
            invoices={testInvoices}
            purchases={testPurchases}
            expenses={testExpenses}
            vouchers={testVouchers}
            parties={[mockCustomer]}
            items={[]}
            onNewInvoice={vi.fn()}
            onQuickPos={vi.fn()}
            onViewInvoice={vi.fn()}
            onNavigateTab={vi.fn()}
          />
        );
      });

      // Click "Today" preset
      const buttons = Array.from(container.querySelectorAll('button'));
      const todayBtn = buttons.find((b) => b.textContent?.trim() === 'Today');
      act(() => {
        todayBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Click "Sales" type filter
      const updatedButtons = Array.from(container.querySelectorAll('button'));
      const salesBtn = updatedButtons.find((b) => b.textContent?.includes('Sales ('));
      expect(salesBtn).toBeTruthy();

      act(() => {
        salesBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Should show 1 of 5 (only INV-TODAY-01)
      expect(container.textContent).toContain('1 of 5');
      expect(container.textContent).toContain('INV-TODAY-01');
      expect(container.textContent).not.toContain('BILL-IND-01');
      expect(container.textContent).not.toContain('EXP-TODAY-01');
      expect(container.textContent).not.toContain('RCPT-TODAY-01');
      expect(container.textContent).not.toContain('INV-PAST-99');
    });

    it('3.4: Date Range dropdown (Custom) opens DateFilterModal on change', () => {
      act(() => {
        root.render(
          <DashboardView
            company={mockCompany}
            invoices={testInvoices}
            purchases={testPurchases}
            expenses={testExpenses}
            vouchers={testVouchers}
            parties={[mockCustomer]}
            items={[]}
            onNewInvoice={vi.fn()}
            onQuickPos={vi.fn()}
            onViewInvoice={vi.fn()}
            onNavigateTab={vi.fn()}
          />
        );
      });

      // DateFilterModal should initially not be visible
      expect(container.textContent).not.toContain('Filter by Date Range');

      // Open the DateFilterModal via the inline date period dropdown
      const datePeriodSelect = container.querySelector('#timeline-filter-period') as HTMLSelectElement;
      expect(datePeriodSelect).toBeTruthy();

      act(() => {
        datePeriodSelect.value = 'CUSTOM';
        datePeriodSelect.dispatchEvent(new Event('change', { bubbles: true }));
      });

      // DateFilterModal should now be open
      expect(container.textContent).toContain('Filter by Date Range');
      expect(container.textContent).toContain('Select Preset Period');
      expect(container.textContent).toContain('Fiscal Year (FY)');
    });
  });
});
