import fs from 'fs';
import path from 'path';
import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { db } from '../services/db.ts';
import {
  withWalkInCustomerBalance,
  withWalkInCustomer,
  SYSTEM_WALK_IN_PARTY_ID,
  SYSTEM_WALK_IN_PARTY_NAME,
} from '../core/utils/systemParties.ts';
import { getWalkInVirtualBalanceSnapshot } from '../core/store/useDataStore.ts';

import * as partyDuesModule from '../core/accounting/partyDues.ts';
import { computeAgingBreakdown, AgingItemInput } from '../core/accounting/aging.ts';
import { DaybookView } from '../components/Reports/DaybookView.tsx';
import { CompanyProfile } from '../models/company.ts';
import { Party } from '../models/party.ts';
import { Invoice } from '../models/invoice.ts';
import { Voucher } from '../core/accounting/voucherTypes.ts';
import { formatINR } from '../core/utils/formatters.ts';

import { DashboardView } from '../components/Dashboard/DashboardView.tsx';
import { SalesHubView } from '../components/Sales/SalesHubView.tsx';
import { PurchasesHubView } from '../components/Purchases/PurchasesHubView.tsx';
import { PartiesView } from '../components/Parties/PartiesView.tsx';
import { InventoryView } from '../components/Inventory/InventoryView.tsx';
import { BusinessReportsView } from '../components/Reports/BusinessReportsView.tsx';
import { CompanySettingsView } from '../components/Settings/CompanySettingsView.tsx';
import { Header } from '../components/Shell/Header.tsx';
import { TabletSidebar } from '../components/Shell/TabletSidebar.tsx';
import { BottomNav } from '../components/Shell/BottomNav.tsx';

// Mock storage for happy-dom environment
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
if (typeof globalThis.localStorage === 'undefined' || !globalThis.localStorage) {
  Object.defineProperty(globalThis, 'localStorage', { value: testStorage, writable: true, configurable: true });
}
if (typeof window !== 'undefined' && (!window.localStorage || typeof window.localStorage.getItem !== 'function')) {
  Object.defineProperty(window, 'localStorage', { value: testStorage, writable: true, configurable: true });
}

const mockCompany: CompanyProfile = {
  id: 'comp_test',
  businessName: 'Memo Test Corp',
  tradeName: 'Memo Test Corp',
  gstin: '27AABCU9603R1ZN',
  pan: 'AABCU9603R',
  stateCode: '27',
  address: '123 Market St',
  pincode: '400001',
  city: 'Mumbai',
  phone: '9876543210',
  email: 'test@example.com',
  isGstEnabled: true,
};

describe('Phase 2.5: View Memoization & App Prop Stability', () => {
  const memoizedViews = [
    { name: 'DashboardView', file: 'src/components/Dashboard/DashboardView.tsx', component: DashboardView },
    { name: 'SalesHubView', file: 'src/components/Sales/SalesHubView.tsx', component: SalesHubView },
    { name: 'PurchasesHubView', file: 'src/components/Purchases/PurchasesHubView.tsx', component: PurchasesHubView },
    { name: 'PartiesView', file: 'src/components/Parties/PartiesView.tsx', component: PartiesView },
    { name: 'InventoryView', file: 'src/components/Inventory/InventoryView.tsx', component: InventoryView },
    { name: 'BusinessReportsView', file: 'src/components/Reports/BusinessReportsView.tsx', component: BusinessReportsView },
    { name: 'CompanySettingsView', file: 'src/components/Settings/CompanySettingsView.tsx', component: CompanySettingsView },
    { name: 'Header', file: 'src/components/Shell/Header.tsx', component: Header },
    { name: 'TabletSidebar', file: 'src/components/Shell/TabletSidebar.tsx', component: TabletSidebar },
    { name: 'BottomNav', file: 'src/components/Shell/BottomNav.tsx', component: BottomNav },
  ];

  describe('1. Static Code Assertions: React.memo() declarations and exports', () => {
    memoizedViews.forEach(({ name, file }) => {
      it(`${name} file (${file}) contains React.memo( and exports the memoized const`, () => {
        const filePath = path.resolve(process.cwd(), file);
        expect(fs.existsSync(filePath), `File ${file} should exist`).toBe(true);
        const source = fs.readFileSync(filePath, 'utf-8');

        // Check file contains React.memo(
        expect(source).toContain('React.memo(');

        // Check that it exports the memoized const
        const exportMemoRegex = new RegExp(`export const ${name}(?::[a-zA-Z0-9_<>\\s.]+)?\\s*=\\s*React\\.memo\\(`);
        const altExportRegex = new RegExp(`export const ${name}\\s*=\\s*React\\.memo\\(`);
        const isExported = exportMemoRegex.test(source) || altExportRegex.test(source);
        expect(isExported, `${name} must be exported as a React.memo(...) component`).toBe(true);
      });
    });
  });

  describe('2. Static Code Assertions: App.tsx prop stability (no inline arrow props)', () => {
    it('App.tsx does not pass inline arrow props (={( or ={() => or ={(x) =>) to memoized views or shell components', () => {
      const appPath = path.resolve(process.cwd(), 'src/App.tsx');
      const appSource = fs.readFileSync(appPath, 'utf-8');

      const targetComponents = [
        'DashboardView',
        'SalesHubView',
        'PurchasesHubView',
        'PartiesView',
        'InventoryView',
        'BusinessReportsView',
        'CompanySettingsView',
        'Header',
        'TabletSidebar',
        'BottomNav',
      ];

      targetComponents.forEach((compName) => {
        // Regex to extract JSX element for compName: <CompName ... />
        const tagRegex = new RegExp(`<${compName}[\\s\\S]*?\\/>`, 'g');
        const matches = appSource.match(tagRegex);
        expect(matches, `App.tsx should render <${compName}>`).not.toBeNull();

        matches?.forEach((jsxElement) => {
          // Check for inline arrow function prop assignments like:
          // prop={() => ...} or prop={(x) => ...} or prop={x => ...} or prop={(() => ...)}
          const inlinePropMatches = jsxElement.match(/\b\w+=\{\s*(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>/g);
          expect(
            inlinePropMatches,
            `Component <${compName}> in App.tsx should not receive inline arrow props, found: ${inlinePropMatches?.join(', ')} in:\n${jsxElement}`
          ).toBeNull();

          // Also check for ={( style inline anonymous functions or function expressions
          const inlineFnMatches = jsxElement.match(/\b\w+=\{\s*function\s*\(/g);
          expect(
            inlineFnMatches,
            `Component <${compName}> in App.tsx should not receive inline function expressions`
          ).toBeNull();
        });
      });
    });
  });

  describe('3. Runtime Assertions: $$typeof === Symbol.for("react.memo")', () => {
    const memoSymbol = Symbol.for('react.memo');

    memoizedViews.forEach(({ name, component }) => {
      it(`${name} runtime export is a valid React.memo component`, () => {
        expect(component).toBeDefined();
        expect(typeof component).toBe('object');
        expect((component as { $$typeof?: symbol }).$$typeof).toBe(memoSymbol);
      });
    });
  });

  describe('4. Shell Subscription Narrowing: App.tsx domain hook limits (Phase 2.5)', () => {
    // Note: useWalkInVirtualBalance is a derived primitive selector (number),
    // not a domain collection subscription — so the "no domain collection cascade"
    // intent is preserved.
    const ALLOWED_DOMAIN_HOOKS = [
      'useCompany',
      'useParties',
      'useItems',
      'useWalkInVirtualBalance',
    ] as const;

    it('App.tsx imports at most 4 useDataStore hooks, restricted to allowed set', () => {
      const appPath = path.resolve(process.cwd(), 'src/App.tsx');
      const appSource = fs.readFileSync(appPath, 'utf-8');

      const importRegex = /import\s*\{([^}]*)\}\s*from\s*['"][^'"]*useDataStore(?:\.ts)?['"]/;
      const match = appSource.match(importRegex);
      expect(match, 'App.tsx must import from useDataStore').not.toBeNull();

      const importedItems = match![1]
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.startsWith('use'));

      expect(
        importedItems.length,
        `App.tsx imports ${importedItems.length} hooks (${importedItems.join(', ')}), but must import <= 4`
      ).toBeLessThanOrEqual(4);

      importedItems.forEach((hookName) => {
        expect(
          ALLOWED_DOMAIN_HOOKS,
          `App.tsx imports unauthorized domain hook: ${hookName}`
        ).toContain(hookName);
      });

      expect(importedItems).toEqual(expect.arrayContaining([...ALLOWED_DOMAIN_HOOKS]));
    });

    it('App.tsx calls at most 4 useDataStore domain hooks in its component body', () => {
      const appPath = path.resolve(process.cwd(), 'src/App.tsx');
      const appSource = fs.readFileSync(appPath, 'utf-8');

      const allKnownStoreHooks = [
        'useCompany',
        'useParties',
        'useItems',
        'useWalkInVirtualBalance',
        'useInvoices',
        'usePurchases',
        'useExpenses',
        'useVouchers',
        'useBankAccounts',
        'useCashBankTxns',
        'usePartyGroups',
        'usePartyCategories',
        'useItemCategories',
        'useSettings',
        'useStockAdjustments',
      ];

      const invokedHooks = allKnownStoreHooks.filter((hook) => {
        const callRegex = new RegExp(`\\b${hook}\\s*\\(`, 'g');
        return callRegex.test(appSource);
      });

      expect(
        invokedHooks.length,
        `App.tsx invokes ${invokedHooks.length} domain hooks (${invokedHooks.join(', ')}), expected <= 4`
      ).toBeLessThanOrEqual(4);

      invokedHooks.forEach((hook) => {
        expect(
          ALLOWED_DOMAIN_HOOKS,
          `App.tsx invokes disallowed domain hook: ${hook}`
        ).toContain(hook);
      });
    });

    it('asserts App.tsx has no db.get calls in render paths (no render-time db.get calls at all)', () => {
      const appPath = path.resolve(process.cwd(), 'src/App.tsx');
      const appSource = fs.readFileSync(appPath, 'utf-8');

      // The render path of App component spans from component definition
      // through hook/memo setup until the first handler function declaration.
      const componentStart = appSource.indexOf('export const App: React.FC = () => {');
      expect(componentStart).toBeGreaterThan(-1);
      const handlersStart = appSource.search(/\bconst handle[A-Za-z0-9_]+\s*=/);
      expect(handlersStart).toBeGreaterThan(componentStart);

      const renderSetupCode = appSource.slice(componentStart, handlersStart);

      // Verify no db.get calls exist in the top-level component render setup / useMemo initializers
      expect(renderSetupCode).not.toMatch(/\bdb\.get[A-Za-z0-9_]*\s*\(/);

      // Also verify JSX render return has no db.get calls
      const jsxReturnStart = appSource.lastIndexOf('return (\n    <PaymentModalProvider');
      expect(jsxReturnStart).toBeGreaterThan(handlersStart);
      const jsxReturnCode = appSource.slice(jsxReturnStart);
      expect(jsxReturnCode).not.toMatch(/\bdb\.get[A-Za-z0-9_]*\s*\(/);
    });
  });

  describe('5. Regression Test: Derived Values Memoization and Stability (Phase 2.4)', () => {
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
      vi.restoreAllMocks();
    });

    it('asserts representative derived values (total sales, to-collect, to-pay) are computed and stable across unrelated re-renders', () => {
      const spyComputePartyDues = vi.spyOn(partyDuesModule, 'computePartyDues');

      const mockInvoices: Invoice[] = [
        {
          id: 'inv-1',
          invoiceNumber: 'INV-001',
          date: '2026-11-01',
          partyId: 'party-1',
          partyName: 'Alpha Customer',
          items: [],
          totalTaxableAmount: 10000,
          totalCgst: 900,
          totalSgst: 900,
          totalIgst: 0,
          grandTotal: 11800,
          paidAmount: 11800,
          balanceAmount: 0,
          paymentStatus: 'PAID',
          invoiceType: 'TAX_INVOICE',
        } as unknown as Invoice,
        {
          id: 'inv-2',
          invoiceNumber: 'INV-002',
          date: '2026-11-02',
          partyId: 'party-2',
          partyName: 'Beta Customer',
          items: [],
          totalTaxableAmount: 5000,
          totalCgst: 450,
          totalSgst: 450,
          totalIgst: 0,
          grandTotal: 5900,
          paidAmount: 2000,
          balanceAmount: 3900,
          paymentStatus: 'PARTIAL',
          invoiceType: 'TAX_INVOICE',
        } as unknown as Invoice,
      ];

      const mockParties: Party[] = [
        {
          id: 'party-1',
          name: 'Alpha Customer',
          type: 'CUSTOMER',
          currentBalance: 5000,
          currentBalancePaise: 500000,
          paiseSchema: 1,
        } as unknown as Party,
        {
          id: 'party-2',
          name: 'Beta Customer',
          type: 'CUSTOMER',
          currentBalance: 3900,
          currentBalancePaise: 390000,
          paiseSchema: 1,
        } as unknown as Party,
        {
          id: 'party-3',
          name: 'Gamma Supplier',
          type: 'SUPPLIER',
          currentBalance: -4500,
          currentBalancePaise: -450000,
          paiseSchema: 1,
        } as unknown as Party,
      ];

      // Wrapper component to simulate parent state updates unrelated to Dashboard data
      let setExternalCounter: React.Dispatch<React.SetStateAction<number>> = () => {};
      const TestDashboardWrapper: React.FC = () => {
        const [counter, setCounter] = useState(0);
        setExternalCounter = setCounter;
        return (
          <div>
            <span data-testid="unrelated-counter">{counter}</span>
            <DashboardView
              company={mockCompany}
              invoices={mockInvoices}
              parties={mockParties}
              items={[]}
              onNavigateTab={() => {}}
              onNewInvoice={() => {}}
              onQuickPos={() => {}}
              onViewInvoice={() => {}}
            />
          </div>
        );
      };

      act(() => {
        root.render(<TestDashboardWrapper />);
      });

      // Total Sales = 11800 + 5900 = 17700
      const expectedTotalSalesFormatted = formatINR(17700);
      // To Collect = 5000 + 3900 = 8900
      const expectedToCollectFormatted = formatINR(8900);
      // To Pay = 4500
      const expectedToPayFormatted = formatINR(4500);

      expect(container.textContent).toContain(expectedTotalSalesFormatted);
      expect(container.textContent).toContain(expectedToCollectFormatted);
      expect(container.textContent).toContain(expectedToPayFormatted);

      const initialCallCount = spyComputePartyDues.mock.calls.length;
      expect(initialCallCount).toBeGreaterThanOrEqual(1);

      // Trigger unrelated parent state change
      act(() => {
        setExternalCounter((c) => c + 1);
      });

      expect(container.querySelector('[data-testid="unrelated-counter"]')?.textContent).toBe('1');

      // Assert derived values remain unchanged in the DOM
      expect(container.textContent).toContain(expectedTotalSalesFormatted);
      expect(container.textContent).toContain(expectedToCollectFormatted);
      expect(container.textContent).toContain(expectedToPayFormatted);

      // Assert memoized builder did not recompute when unrelated state changed
      expect(spyComputePartyDues.mock.calls.length).toBe(initialCallCount);
    });

    it('asserts DaybookView memoizes filtered rows and debit/credit totals across unrelated re-renders', () => {
      const mockVouchers: Voucher[] = [
        {
          id: 'vch-1',
          voucherNumber: 'VCH-001',
          voucherType: 'RECEIPT',
          date: '2026-11-01',
          entries: [
            { accountId: 'acc-1', accountName: 'Cash', debit: 12000, credit: 0 },
            { accountId: 'party-1', accountName: 'Alpha Customer', debit: 0, credit: 12000 },
          ],
        } as unknown as Voucher,
        {
          id: 'vch-2',
          voucherNumber: 'VCH-002',
          voucherType: 'PAYMENT',
          date: '2026-11-02',
          entries: [
            { accountId: 'party-3', accountName: 'Gamma Supplier', debit: 8000, credit: 0 },
            { accountId: 'acc-1', accountName: 'Cash', debit: 0, credit: 8000 },
          ],
        } as unknown as Voucher,
      ];

      let setExternalCounter: React.Dispatch<React.SetStateAction<number>> = () => {};
      const TestDaybookWrapper: React.FC = () => {
        const [counter, setCounter] = useState(0);
        setExternalCounter = setCounter;
        return (
          <div>
            <span data-testid="unrelated-counter">{counter}</span>
            <DaybookView vouchers={mockVouchers} company={mockCompany} />
          </div>
        );
      };

      act(() => {
        root.render(<TestDaybookWrapper />);
      });

      // Total debits = 12000 + 8000 = 20000; Total credits = 12000 + 8000 = 20000
      const expectedDebits = formatINR(20000);
      const expectedCredits = formatINR(20000);

      expect(container.textContent).toContain(expectedDebits);
      expect(container.textContent).toContain(expectedCredits);

      // Trigger unrelated parent state update
      act(() => {
        setExternalCounter((c) => c + 1);
      });

      expect(container.querySelector('[data-testid="unrelated-counter"]')?.textContent).toBe('1');
      expect(container.textContent).toContain(expectedDebits);
      expect(container.textContent).toContain(expectedCredits);
    });

    it('asserts computeAgingBreakdown produces identical bucket totals and preserves invariants', () => {
      const fixedAsOfDate = new Date('2026-11-17T00:00:00Z');
      const agingInputs: AgingItemInput[] = [
        {
          date: '2026-11-10',
          dueDate: '2026-11-10', // 7 days overdue -> '0-30'
          balanceDue: 2500,
          balanceDuePaise: 250000,
          paiseSchema: 1,
          partyId: 'p-1',
          partyName: 'Customer A',
        },
        {
          date: '2026-10-01',
          dueDate: '2026-10-01', // 47 days overdue -> '31-60'
          balanceDue: 4500,
          balanceDuePaise: 450000,
          paiseSchema: 1,
          partyId: 'p-2',
          partyName: 'Customer B',
        },
        {
          date: '2026-08-15',
          dueDate: '2026-08-15', // 94 days overdue -> '90+'
          balanceDue: 7000,
          balanceDuePaise: 700000,
          paiseSchema: 1,
          partyId: 'p-3',
          partyName: 'Customer C',
        },
      ];

      const breakdown = computeAgingBreakdown(agingInputs, fixedAsOfDate);

      expect(breakdown.totalOutstanding).toBe(14000);
      expect(breakdown.summary['0-30']).toBe(2500);
      expect(breakdown.summary['31-60']).toBe(4500);
      expect(breakdown.summary['61-90']).toBe(0);
      expect(breakdown.summary['90+']).toBe(7000);
      expect(breakdown.counts['0-30']).toBe(1);
      expect(breakdown.counts['31-60']).toBe(1);
      expect(breakdown.counts['61-90']).toBe(0);
      expect(breakdown.counts['90+']).toBe(1);
    });

    it('withWalkInCustomerBalance yields the identical result as withWalkInCustomer with computed virtual balance', () => {
      const sampleParties: Party[] = [
        {
          id: 'party-cust-1',
          name: 'Regular Customer',
          type: 'CUSTOMER',
          currentBalance: 500,
        } as unknown as Party,
      ];

      const invoicesThatComputeTo1234: Invoice[] = [
        {
          id: 'inv-1',
          partyId: SYSTEM_WALK_IN_PARTY_ID,
          partyName: SYSTEM_WALK_IN_PARTY_NAME,
          balanceAmount: 1000,
          isCancelled: false,
        } as unknown as Invoice,
        {
          id: 'inv-2',
          partyName: 'walk in customer',
          balanceAmount: 234,
          isCancelled: false,
        } as unknown as Invoice,
        // Cancelled or non-walk-in invoices should not contribute to the 1234 balance
        {
          id: 'inv-cancelled',
          partyId: SYSTEM_WALK_IN_PARTY_ID,
          balanceAmount: 500,
          isCancelled: true,
        } as unknown as Invoice,
        {
          id: 'inv-other',
          partyId: 'party-cust-1',
          partyName: 'Regular Customer',
          balanceAmount: 9999,
          isCancelled: false,
        } as unknown as Invoice,
      ];

      const withComputedInvoices = withWalkInCustomer(sampleParties, '27', invoicesThatComputeTo1234);
      const withPrecomputedBalance = withWalkInCustomerBalance(sampleParties, '27', 1234);

      expect(withPrecomputedBalance).toEqual(withComputedInvoices);
      expect(withPrecomputedBalance[0].currentBalance).toBe(1234);
      expect(withPrecomputedBalance[0].id).toBe(SYSTEM_WALK_IN_PARTY_ID);
    });

    it('changing an unrelated invoice field that does not alter walk-in balance returns the identical primitive from getWalkInVirtualBalanceSnapshot', () => {
      const baseInvoices: Invoice[] = [
        {
          id: 'inv-walk-1',
          partyId: SYSTEM_WALK_IN_PARTY_ID,
          partyName: 'Walk-in Customer',
          balanceAmount: 1234,
          isCancelled: false,
          notes: 'Initial walk-in sale',
        } as unknown as Invoice,
        {
          id: 'inv-b2b-1',
          partyId: 'party-b2b',
          partyName: 'B2B Enterprise',
          balanceAmount: 50000,
          isCancelled: false,
          notes: 'Major client invoice',
        } as unknown as Invoice,
      ];

      const getInvoicesSpy = vi.spyOn(db, 'getInvoices').mockReturnValue(baseInvoices);

      const snapshot1 = getWalkInVirtualBalanceSnapshot();
      expect(snapshot1).toBe(1234);

      // Mutate an unrelated field on a non-walk-in invoice or notes that do not alter the walk-in balance
      const updatedInvoices: Invoice[] = [
        {
          ...baseInvoices[0],
          notes: 'Updated receipt notes (unrelated field)',
        },
        {
          ...baseInvoices[1],
          notes: 'Client payment terms changed',
          paidAmount: 25000,
          balanceAmount: 25000,
        },
      ];

      getInvoicesSpy.mockReturnValue(updatedInvoices);

      const snapshot2 = getWalkInVirtualBalanceSnapshot();
      expect(snapshot2).toBe(1234);
      // Strictly identical primitive reference: Object.is bails out of component re-render
      expect(Object.is(snapshot1, snapshot2)).toBe(true);
    });
  });
});
