// @vitest-environment happy-dom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act, useCallback, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';

// ---------------------------------------------------------------------------
// Mock Storage Implementation for Test Environment
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Mocks for External Storage Engines (PouchDB & AuditTrail)
// ---------------------------------------------------------------------------
vi.mock('../services/pouchdb.ts', () => ({
  pouch: {
    putDoc: vi.fn(async () => {}),
    deleteDoc: vi.fn(async () => {}),
    getAllDocs: vi.fn(async () => []),
    getSyncState: vi.fn(() => ({ status: 'offline', remoteUrl: '', pendingChanges: 0 })),
    subscribeSync: vi.fn(() => () => {}),
    syncNow: vi.fn(async () => {}),
    startSync: vi.fn(),
    stopSync: vi.fn(),
    migrateFromLocalStorage: vi.fn(async () => {}),
  },
}));

vi.mock('../services/auditTrail.ts', () => ({
  auditTrail: {
    logEvent: vi.fn(async () => {}),
    getRecentLogs: vi.fn(async () => []),
    getLogsByDocument: vi.fn(async () => []),
  },
}));

import { db } from '../services/db.ts';
import { CompanyProfile } from '../models/company.ts';
import { Party } from '../models/party.ts';
import { InventoryItem } from '../models/item.ts';
import { Expense } from '../models/expense.ts';
import { Header } from '../components/Shell/Header.tsx';
import { BottomNav } from '../components/Shell/BottomNav.tsx';
import { Drawer, AppTab } from '../components/Shell/Drawer.tsx';
import { TabletSidebar } from '../components/Shell/TabletSidebar.tsx';
import {
  useCompany,
  useParties,
  useItems,
  useInvoices,
  usePurchases,
  useExpenses,
} from '../core/store/useDataStore.ts';

const createSampleExpense = (overrides?: Partial<Expense>): Expense => ({
  id: 'EXP-101',
  title: 'Office Stationary',
  amount: 450,
  taxableAmount: 450,
  gstRate: 0,
  taxAmount: 0,
  cgstAmount: 0,
  sgstAmount: 0,
  igstAmount: 0,
  category: 'General Operational',
  date: '2026-10-19',
  paymentMode: 'CASH',
  itcEligible: false,
  createdAt: '2026-10-19T00:00:00.000Z',
  ...overrides,
});

const createSampleParty = (overrides?: Partial<Party>): Party => ({
  id: 'PARTY-M3-01',
  name: 'Decoupled Systems Private Limited',
  type: 'CUSTOMER',
  phone: '9876543210',
  stateCode: '27',
  billingAddress: 'Navi Mumbai',
  currentBalance: 0,
  createdAt: '2026-10-19T00:00:00.000Z',
  updatedAt: '2026-10-19T00:00:00.000Z',
  ...overrides,
});

const createSampleItem = (overrides?: Partial<InventoryItem>): InventoryItem => ({
  id: 'ITEM-M3-01',
  name: 'Thermal Paper Roll 80mm',
  hsnSacCode: '4802',
  category: 'General',
  unit: 'PCS',
  salePrice: 75,
  purchasePrice: 45,
  currentStock: 100,
  minStockAlert: 10,
  gstRate: 18,
  createdAt: '2026-10-19T00:00:00.000Z',
  updatedAt: '2026-10-19T00:00:00.000Z',
  ...overrides,
});

describe('Milestone 3: Granular State Decoupling & Render Isolation Suite', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    testStorage.clear();
    db.clearMemoryCache();
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root!.unmount();
      });
      container.remove();
    }
    container = null;
    root = null;
  });

  // Helper to flush batched DB notifications
  const flushDbNotifications = () => {
    if (typeof (db as any).notify === 'function') {
      (db as any).notify();
    } else {
      (db as any).notifyListeners();
    }
  };

  // ==========================================================================
  // 1. In-Memory Referential Stability Across Unrelated Domain Mutations
  // ==========================================================================
  describe('1. In-Memory Referential Stability Across Unrelated Mutations', () => {
    it('TC-GSD-01: saving an expense updates getExpenses() but preserves exact stable references for all other domains', () => {
      // Warm up heap cache for all domains
      const initialParties = db.getParties();
      const initialItems = db.getItems();
      const initialInvoices = db.getInvoices();
      const initialPurchases = db.getPurchases();
      const initialExpenses = db.getExpenses();
      const initialCompany = db.getCompany();
      const initialBankAccounts = db.getBankAccounts();
      const initialCashBankTxns = db.getCashBankTransactions();
      const initialVouchers = db.getVouchers();

      // Mutate domain: Expenses
      const newExpense = createSampleExpense({ id: 'EXP-101', title: 'Office Stationary' });
      db.saveExpense(newExpense);

      const updatedExpenses = db.getExpenses();

      // Expense cache must be fresh reference with new item
      expect(updatedExpenses).not.toBe(initialExpenses);
      expect(updatedExpenses).toHaveLength(1);
      expect(updatedExpenses[0].id).toBe('EXP-101');

      // Crucial: ALL other 8 domain collections must retain identical heap references
      expect(db.getParties()).toBe(initialParties);
      expect(db.getItems()).toBe(initialItems);
      expect(db.getInvoices()).toBe(initialInvoices);
      expect(db.getPurchases()).toBe(initialPurchases);
      expect(db.getCompany()).toBe(initialCompany);
      expect(db.getBankAccounts()).toBe(initialBankAccounts);
      expect(db.getCashBankTransactions()).toBe(initialCashBankTxns);
      expect(db.getVouchers()).toBe(initialVouchers);
    });

    it('TC-GSD-02: saving a party updates getParties() but preserves exact stable references for all other domains', () => {
      const initialExpenses = db.getExpenses();
      const initialItems = db.getItems();
      const initialInvoices = db.getInvoices();
      const initialPurchases = db.getPurchases();
      const initialCompany = db.getCompany();

      const newParty = createSampleParty({ id: 'PARTY-M3-01' });
      db.saveParty(newParty);

      const updatedParties = db.getParties();
      expect(updatedParties.find((p) => p.id === 'PARTY-M3-01')).toBeDefined();

      // All unrelated domain references strictly preserved
      expect(db.getExpenses()).toBe(initialExpenses);
      expect(db.getItems()).toBe(initialItems);
      expect(db.getInvoices()).toBe(initialInvoices);
      expect(db.getPurchases()).toBe(initialPurchases);
      expect(db.getCompany()).toBe(initialCompany);
    });

    it('TC-GSD-03: saving an inventory item updates getItems() but preserves parties and expenses references', () => {
      const initialParties = db.getParties();
      const initialExpenses = db.getExpenses();
      const initialCompany = db.getCompany();

      const newItem = createSampleItem({ id: 'ITEM-M3-01' });
      db.saveItem(newItem);

      expect(db.getItems().find((i) => i.id === 'ITEM-M3-01')).toBeDefined();
      expect(db.getParties()).toBe(initialParties);
      expect(db.getExpenses()).toBe(initialExpenses);
      expect(db.getCompany()).toBe(initialCompany);
    });
  });

  // ==========================================================================
  // 2. React 18 useSyncExternalStore Hook Reactivity & Granular Isolation
  // ==========================================================================
  describe('2. React 18 useSyncExternalStore Hook Reactivity & Granular Isolation', () => {
    it('TC-GSD-04: useSyncExternalStore hooks update reactively when db mutations occur', async () => {
      let renderCount = 0;
      const ExpenseWidget: React.FC = () => {
        const expenses = useExpenses();
        renderCount++;
        return (
          <div data-testid="expense-widget">
            <span data-testid="count">{expenses.length}</span>
            <ul>
              {expenses.map((e) => (
                <li key={e.id} data-testid={`expense-${e.id}`}>
                  {e.title} - {e.amount}
                </li>
              ))}
            </ul>
          </div>
        );
      };

      act(() => {
        root!.render(<ExpenseWidget />);
      });

      expect(container!.querySelector('[data-testid="count"]')?.textContent).toBe('0');
      expect(renderCount).toBe(1);

      // Add expense in act()
      act(() => {
        db.saveExpense(
          createSampleExpense({
            id: 'EXP-1',
            title: 'Internet Fiber',
            amount: 999,
          })
        );
        flushDbNotifications();
      });

      await new Promise((r) => setTimeout(r, 25));

      expect(container!.querySelector('[data-testid="count"]')?.textContent).toBe('1');
      expect(container!.querySelector('[data-testid="expense-EXP-1"]')?.textContent).toContain('Internet Fiber');
      expect(renderCount).toBe(2);
    });

    it('TC-GSD-05: render isolation — adding an expense causes ZERO re-renders in Party, Item, and Invoice consumers', async () => {
      let expenseRenders = 0;
      let partyRenders = 0;
      let itemRenders = 0;
      let invoiceRenders = 0;

      const ExpenseObserver: React.FC = () => {
        const expenses = useExpenses();
        expenseRenders++;
        return <div data-testid="expense-obs">{expenses.length}</div>;
      };

      const PartyObserver: React.FC = () => {
        const parties = useParties();
        partyRenders++;
        return <div data-testid="party-obs">{parties.length}</div>;
      };

      const ItemObserver: React.FC = () => {
        const items = useItems();
        itemRenders++;
        return <div data-testid="item-obs">{items.length}</div>;
      };

      const InvoiceObserver: React.FC = () => {
        const invoices = useInvoices();
        invoiceRenders++;
        return <div data-testid="invoice-obs">{invoices.length}</div>;
      };

      const Harness: React.FC = () => (
        <div>
          <ExpenseObserver />
          <PartyObserver />
          <ItemObserver />
          <InvoiceObserver />
        </div>
      );

      act(() => {
        root!.render(<Harness />);
      });

      // Initial mount: all 4 components rendered exactly once
      expect(expenseRenders).toBe(1);
      expect(partyRenders).toBe(1);
      expect(itemRenders).toBe(1);
      expect(invoiceRenders).toBe(1);

      // Trigger Expense Mutation
      act(() => {
        db.saveExpense(
          createSampleExpense({
            id: 'EXP-ISO-1',
            title: 'Electricity Bill',
            amount: 2500,
          })
        );
        flushDbNotifications();
      });

      await new Promise((r) => setTimeout(r, 25));

      // ONLY ExpenseObserver re-renders!
      expect(expenseRenders).toBe(2);
      expect(partyRenders).toBe(1); // 0 extra renders
      expect(itemRenders).toBe(1); // 0 extra renders
      expect(invoiceRenders).toBe(1); // 0 extra renders
    });

    it('TC-GSD-06: render isolation — adding a party causes ZERO re-renders in Expense, Item, and Invoice consumers', async () => {
      let expenseRenders = 0;
      let partyRenders = 0;
      let itemRenders = 0;

      const ExpenseObserver: React.FC = () => {
        const expenses = useExpenses();
        expenseRenders++;
        return <div data-testid="expense-obs">{expenses.length}</div>;
      };

      const PartyObserver: React.FC = () => {
        const parties = useParties();
        partyRenders++;
        return <div data-testid="party-obs">{parties.length}</div>;
      };

      const ItemObserver: React.FC = () => {
        const items = useItems();
        itemRenders++;
        return <div data-testid="item-obs">{items.length}</div>;
      };

      act(() => {
        root!.render(
          <div>
            <ExpenseObserver />
            <PartyObserver />
            <ItemObserver />
          </div>
        );
      });

      expect(expenseRenders).toBe(1);
      expect(partyRenders).toBe(1);
      expect(itemRenders).toBe(1);

      // Trigger Party Mutation
      act(() => {
        db.saveParty(
          createSampleParty({
            id: 'PTY-ISO-1',
            name: 'Green Energy Ltd',
          })
        );
        flushDbNotifications();
      });

      await new Promise((r) => setTimeout(r, 25));

      // ONLY PartyObserver re-renders!
      expect(partyRenders).toBe(2);
      expect(expenseRenders).toBe(1); // 0 extra renders
      expect(itemRenders).toBe(1); // 0 extra renders
    });
  });

  // ==========================================================================
  // 3. Navigation Chrome Memoization & Zero Re-render Guarantee
  // ==========================================================================
  describe('3. Navigation Chrome Memoization & Zero Re-render Guarantee', () => {
    it('TC-GSD-07: memoized Header re-renders ONLY on company update, NOT on expense or party changes', async () => {
      let headerRenderCount = 0;

      const HeaderWrapper: React.FC<{
        company: CompanyProfile;
        onOpenDrawer: () => void;
        onNewInvoice: () => void;
      }> = (props) => {
        headerRenderCount++;
        return <Header {...props} />;
      };

      const ChromeHarness: React.FC = () => {
        const company = useCompany();
        const handleOpenDrawer = useCallback(() => {}, []);
        const handleNewInvoice = useCallback(() => {}, []);

        return (
          <HeaderWrapper
            company={company}
            onOpenDrawer={handleOpenDrawer}
            onNewInvoice={handleNewInvoice}
          />
        );
      };

      act(() => {
        root!.render(<ChromeHarness />);
      });

      expect(headerRenderCount).toBe(1);

      // 1. Add an expense -> Header MUST NOT re-render
      act(() => {
        db.saveExpense(
          createSampleExpense({
            id: 'EXP-CHROME-1',
            title: 'Office Tea',
            amount: 150,
          })
        );
        flushDbNotifications();
      });

      await new Promise((r) => setTimeout(r, 25));
      expect(headerRenderCount).toBe(1); // Header remained untouched!

      // 2. Add a party -> Header MUST NOT re-render
      act(() => {
        db.saveParty(
          createSampleParty({
            id: 'PTY-CHROME-1',
            name: 'Chrome Test Party',
          })
        );
        flushDbNotifications();
      });

      await new Promise((r) => setTimeout(r, 25));
      expect(headerRenderCount).toBe(1); // Header still remained untouched!

      // 3. Mutate Company Profile -> Header SHOULD re-render
      act(() => {
        const currentCompany = db.getCompany();
        db.saveCompany({
          ...currentCompany,
          businessName: 'Decoupled Enterprises Ltd',
        });
        flushDbNotifications();
      });

      await new Promise((r) => setTimeout(r, 25));
      expect(headerRenderCount).toBe(2); // Header cleanly re-rendered to reflect new company name!
    });

    it('TC-GSD-08: memoized BottomNav is completely decoupled from domain mutations and re-renders ONLY on tab change', async () => {
      let bottomNavRenderCount = 0;

      const BottomNavWrapper: React.FC<{
        activeTab: AppTab;
        onSelectTab: (tab: AppTab) => void;
        onNewInvoice: () => void;
      }> = (props) => {
        bottomNavRenderCount++;
        return <BottomNav {...props} />;
      };

      let setTabExternal: (t: AppTab) => void = () => {};

      const BottomNavHarness: React.FC = () => {
        const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
        setTabExternal = setActiveTab;
        const handleSelectTab = useCallback((t: AppTab) => setActiveTab(t), []);
        const handleNewInvoice = useCallback(() => {}, []);

        return (
          <BottomNavWrapper
            activeTab={activeTab}
            onSelectTab={handleSelectTab}
            onNewInvoice={handleNewInvoice}
          />
        );
      };

      act(() => {
        root!.render(<BottomNavHarness />);
      });

      expect(bottomNavRenderCount).toBe(1);

      // Mutate multiple domain entities: expenses, parties, items
      act(() => {
        db.saveExpense(
          createSampleExpense({
            id: 'EXP-BN-1',
            title: 'Stationery',
            amount: 200,
          })
        );
        db.saveParty(
          createSampleParty({
            id: 'PTY-BN-1',
            name: 'BN Party',
          })
        );
        flushDbNotifications();
      });

      await new Promise((r) => setTimeout(r, 25));

      // BottomNav had ZERO re-renders from domain state changes
      expect(bottomNavRenderCount).toBe(1);

      // Switching tabs triggers exactly 1 re-render for navigation active state
      act(() => {
        setTabExternal('parties');
      });

      expect(bottomNavRenderCount).toBe(2);
    });

    it('TC-GSD-09: memoized Drawer and TabletSidebar experience ZERO re-renders when parties or expenses mutate', async () => {
      let drawerRenders = 0;
      let sidebarRenders = 0;

      const DrawerTracker: React.FC<any> = (props) => {
        drawerRenders++;
        return <Drawer {...props} />;
      };

      const SidebarTracker: React.FC<any> = (props) => {
        sidebarRenders++;
        return <TabletSidebar {...props} />;
      };

      const NavHarness: React.FC = () => {
        const company = useCompany();
        const [activeTab] = useState<AppTab>('dashboard');
        const handleClose = useCallback(() => {}, []);
        const handleSelectTab = useCallback(() => {}, []);
        const handleNewInvoice = useCallback(() => {}, []);

        return (
          <div>
            <DrawerTracker
              isOpen={false}
              activeTab={activeTab}
              company={company}
              onClose={handleClose}
              onSelectTab={handleSelectTab}
            />
            <SidebarTracker
              activeTab={activeTab}
              company={company}
              onSelectTab={handleSelectTab}
              onNewInvoice={handleNewInvoice}
            />
          </div>
        );
      };

      act(() => {
        root!.render(<NavHarness />);
      });

      expect(drawerRenders).toBe(1);
      expect(sidebarRenders).toBe(1);

      // Mutate party and expense
      act(() => {
        db.saveExpense(
          createSampleExpense({
            id: 'EXP-NAV-1',
            title: 'Postage',
            amount: 50,
          })
        );
        db.saveParty(
          createSampleParty({
            id: 'PTY-NAV-1',
            name: 'Postal Dept',
            type: 'SUPPLIER',
          })
        );
        flushDbNotifications();
      });

      await new Promise((r) => setTimeout(r, 25));

      // Neither Drawer nor TabletSidebar re-rendered
      expect(drawerRenders).toBe(1);
      expect(sidebarRenders).toBe(1);
    });
  });

  // ==========================================================================
  // 4. Cross-Tab / BroadcastChannel Entity Mutation Decoupling
  // ==========================================================================
  describe('4. Cross-Tab / BroadcastChannel Entity Mutation Decoupling', () => {
    it('TC-GSD-10: incoming BroadcastChannel ENTITY_MUTATION updates only the matching store hook', async () => {
      let expenseRenders = 0;
      let partyRenders = 0;

      const ExpenseSub: React.FC = () => {
        const expenses = useExpenses();
        expenseRenders++;
        return <div data-testid="bc-exp">{expenses.length}</div>;
      };

      const PartySub: React.FC = () => {
        const parties = useParties();
        partyRenders++;
        return <div data-testid="bc-pty">{parties.length}</div>;
      };

      act(() => {
        root!.render(
          <div>
            <ExpenseSub />
            <PartySub />
          </div>
        );
      });

      expect(expenseRenders).toBe(1);
      expect(partyRenders).toBe(1);

      // Simulate BroadcastChannel ENTITY_MUTATION from external device/tab for 'expense'
      const externalExpense = createSampleExpense({
        id: 'EXP-REMOTE-01',
        title: 'Remote Counter Expense',
        amount: 1200,
      });

      act(() => {
        (db as any).applyLocalEntityMutation('expense', 'save', externalExpense.id, externalExpense);
        flushDbNotifications();
      });

      await new Promise((r) => setTimeout(r, 25));

      // ExpenseSub updated, PartySub untouched
      expect(expenseRenders).toBe(2);
      expect(partyRenders).toBe(1);
      expect(container!.querySelector('[data-testid="bc-exp"]')?.textContent).toBe('1');
    });
  });

  // ==========================================================================
  // 5. Subscription Cleanup & Lifecycle Invariants
  // ==========================================================================
  describe('5. Subscription Cleanup & Lifecycle Invariants', () => {
    it('TC-GSD-11: unsubscribes cleanly upon unmount without memory leaks or dangling listeners', async () => {
      let renderCount = 0;

      const EphemeralComponent: React.FC = () => {
        const items = useItems();
        renderCount++;
        return <div>{items.length}</div>;
      };

      act(() => {
        root!.render(<EphemeralComponent />);
      });

      expect(renderCount).toBe(1);

      // Unmount the component
      act(() => {
        root!.render(<div>Completely Unmounted</div>);
      });

      // Subsequent DB mutations must not trigger any callbacks or errors
      expect(() => {
        db.saveItem(
          createSampleItem({
            id: 'ITEM-LEAK-TEST',
            name: 'Leak Test Item',
          })
        );
        flushDbNotifications();
      }).not.toThrow();

      await new Promise((r) => setTimeout(r, 25));

      // Render count for unmounted component strictly remains 1
      expect(renderCount).toBe(1);
    });
  });
});
