// @vitest-environment happy-dom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, Root } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';

// Mock pouchdb
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
    migrateFromLocalStorage: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock heavy child modals for InventoryView
vi.mock('../components/Invoicing/SimplifiedInvoiceModal.tsx', () => ({
  SimplifiedInvoiceModal: () => <div data-testid="mock-invoice-modal" />,
}));
vi.mock('../components/Purchases/SimplifiedPurchaseModal.tsx', () => ({
  SimplifiedPurchaseModal: () => <div data-testid="mock-purchase-modal" />,
}));
vi.mock('../components/Inventory/ItemFormModal.tsx', () => ({
  ItemFormModal: () => <div data-testid="mock-item-form-modal" />,
}));
vi.mock('../components/Inventory/StockAdjustmentModal.tsx', () => ({
  StockAdjustmentModal: () => <div data-testid="mock-stock-adj-modal" />,
}));
vi.mock('../components/Inventory/InventoryFilterSheet.tsx', () => ({
  InventoryFilterSheet: () => <div data-testid="mock-filter-sheet" />,
}));
vi.mock('../components/Inventory/BarcodeLabelModal.tsx', () => ({
  BarcodeLabelModal: () => <div data-testid="mock-barcode-modal" />,
}));
vi.mock('../components/Common/ConfirmDeleteModal.tsx', () => ({
  ConfirmDeleteModal: () => <div data-testid="mock-confirm-delete" />,
}));

import {
  useProgressiveWindow,
  ProgressiveWindow,
  ProgressiveWindowOptions,
} from '../core/utils/useProgressiveWindow.ts';
import { InventoryView } from '../components/Inventory/InventoryView.tsx';
import { ExpensesView } from '../components/Expenses/ExpensesView.tsx';
import { PurchasesHubView } from '../components/Purchases/PurchasesHubView.tsx';
import { PartyPassbookTable } from '../components/Parties/PartyPassbookTable.tsx';
import { InventoryItem } from '../models/item.ts';
import { Expense } from '../models/expense.ts';
import { PurchaseBill } from '../models/purchase.ts';
import { CompanyProfile } from '../models/company.ts';
import { PassbookEntry } from '../components/Parties/usePartyPassbook.ts';
import { formatINR } from '../core/utils/formatters.ts';
import { db } from '../services/db.ts';

// Helper component for testing useProgressiveWindow hook in happy-dom
let latestHookResult: ProgressiveWindow | null = null;

function HookTestHarness({
  totalCount,
  options,
}: {
  totalCount: number;
  options?: ProgressiveWindowOptions;
}) {
  const windowState = useProgressiveWindow(totalCount, options);
  latestHookResult = windowState;
  return (
    <div>
      <div ref={windowState.sentinelRef} data-testid="sentinel" />
      <span data-testid="visible">{windowState.visibleCount}</span>
      <span data-testid="enabled">{String(windowState.enabled)}</span>
      <span data-testid="remaining">{windowState.remaining}</span>
      <span data-testid="hasMore">{String(windowState.hasMore)}</span>
      <button data-testid="btn-load-more" onClick={windowState.loadMore}>
        Load More
      </button>
      <button data-testid="btn-reset" onClick={windowState.reset}>
        Reset
      </button>
    </div>
  );
}

describe('Progressive Windowing Suite (Phase 2.2)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    latestHookResult = null;
    db.clearMemoryCache();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  describe('useProgressiveWindow Hook Unit Tests', () => {
    it('below threshold renders all and enabled is false (zero overhead)', () => {
      act(() => {
        root.render(<HookTestHarness totalCount={50} />);
      });

      expect(latestHookResult).not.toBeNull();
      expect(latestHookResult!.enabled).toBe(false);
      expect(latestHookResult!.visibleCount).toBe(50);
      expect(latestHookResult!.hasMore).toBe(false);
      expect(latestHookResult!.remaining).toBe(0);

      // Threshold boundary (exactly 100)
      act(() => {
        root.render(<HookTestHarness totalCount={100} />);
      });
      expect(latestHookResult!.enabled).toBe(false);
      expect(latestHookResult!.visibleCount).toBe(100);
      expect(latestHookResult!.hasMore).toBe(false);
      expect(latestHookResult!.remaining).toBe(0);
    });

    it('above threshold initial window is 60 with remaining correct', () => {
      act(() => {
        root.render(<HookTestHarness totalCount={150} />);
      });

      expect(latestHookResult).not.toBeNull();
      expect(latestHookResult!.enabled).toBe(true);
      expect(latestHookResult!.visibleCount).toBe(60);
      expect(latestHookResult!.hasMore).toBe(true);
      expect(latestHookResult!.remaining).toBe(90);
    });

    it('loadMore grows by step and clamps to totalCount', () => {
      act(() => {
        root.render(<HookTestHarness totalCount={150} />);
      });

      expect(latestHookResult!.visibleCount).toBe(60);
      expect(latestHookResult!.remaining).toBe(90);

      // Step 1: 60 -> 120
      act(() => {
        latestHookResult!.loadMore();
      });

      expect(latestHookResult!.visibleCount).toBe(120);
      expect(latestHookResult!.remaining).toBe(30);
      expect(latestHookResult!.hasMore).toBe(true);

      // Step 2: 120 -> 150 (clamped from 180 to 150)
      act(() => {
        latestHookResult!.loadMore();
      });

      expect(latestHookResult!.visibleCount).toBe(150);
      expect(latestHookResult!.remaining).toBe(0);
      expect(latestHookResult!.hasMore).toBe(false);
    });

    it('totalCount shrink clamps visibleCount and expands when <= threshold', () => {
      act(() => {
        root.render(<HookTestHarness totalCount={150} />);
      });

      // Advance to 120
      act(() => {
        latestHookResult!.loadMore();
      });
      expect(latestHookResult!.visibleCount).toBe(120);

      // Shrink totalCount to 110: visibleCount clamps to 110
      act(() => {
        root.render(<HookTestHarness totalCount={110} />);
      });
      expect(latestHookResult!.visibleCount).toBe(110);
      expect(latestHookResult!.remaining).toBe(0);
      expect(latestHookResult!.hasMore).toBe(false);
      expect(latestHookResult!.enabled).toBe(true);

      // Shrink totalCount to 40 (<= threshold 100): expands to all 40 and disables windowing
      act(() => {
        root.render(<HookTestHarness totalCount={40} />);
      });
      expect(latestHookResult!.enabled).toBe(false);
      expect(latestHookResult!.visibleCount).toBe(40);
      expect(latestHookResult!.remaining).toBe(0);
      expect(latestHookResult!.hasMore).toBe(false);
    });

    it('reset works and resets visibleCount back to initial window', () => {
      act(() => {
        root.render(<HookTestHarness totalCount={150} />);
      });

      act(() => {
        latestHookResult!.loadMore();
      });
      expect(latestHookResult!.visibleCount).toBe(120);

      act(() => {
        latestHookResult!.reset();
      });
      expect(latestHookResult!.visibleCount).toBe(60);
      expect(latestHookResult!.remaining).toBe(90);
      expect(latestHookResult!.hasMore).toBe(true);
    });

    it('works safely when IntersectionObserver is undefined without crashing', () => {
      const originalIO = globalThis.IntersectionObserver;
      try {
        delete (globalThis as any).IntersectionObserver;

        expect(typeof IntersectionObserver).toBe('undefined');

        act(() => {
          root.render(<HookTestHarness totalCount={150} />);
        });

        expect(latestHookResult).not.toBeNull();
        expect(latestHookResult!.enabled).toBe(true);
        expect(latestHookResult!.visibleCount).toBe(60);

        // Calling sentinelRef directly should not crash
        const div = document.createElement('div');
        expect(() => {
          latestHookResult!.sentinelRef(div);
        }).not.toThrow();
      } finally {
        globalThis.IntersectionObserver = originalIO;
      }
    });
  });

  describe('InventoryView Render Integration with 150 items', () => {
    it('renders 60 items initially, shows status line, and clicking Show more renders 120', () => {
      const mockItems: InventoryItem[] = Array.from({ length: 150 }, (_, i) => ({
        id: `item-pw-${i + 1}`,
        name: `Progressive Widget ${String(i + 1).padStart(3, '0')}`,
        sku: `PW-${i + 1}`,
        hsnSacCode: '8471',
        category: 'Hardware',
        unit: 'PCS',
        salePrice: 100 + i,
        purchasePrice: 60 + i,
        gstRate: 18,
        currentStock: 50,
        minStockAlert: 10,
        createdAt: '2026-11-10T00:00:00Z',
        updatedAt: '2026-11-10T00:00:00Z',
      }));

      act(() => {
        root.render(
          <InventoryView
            items={mockItems}
            invoices={[]}
            purchases={[]}
            adjustments={[]}
            onSaveItem={() => {}}
            onDeleteItem={() => {}}
            onSaveAdjustment={() => {}}
          />
        );
      });

      // 1. Initial render: exactly 60 cards
      const initialCards = container.querySelectorAll('div[aria-label^="Select "]');
      expect(initialCards.length).toBe(60);

      // 2. Status line reads 'Showing 60 of 150'
      const statusEl = container.querySelector('[data-testid="items-window-status"]');
      expect(statusEl).not.toBeNull();
      expect(statusEl!.textContent).toContain('Showing 60 of 150 items');

      // 3. Show more button indicates 90 remaining
      const showMoreBtn = container.querySelector('[data-testid="items-show-more"]') as HTMLButtonElement;
      expect(showMoreBtn).not.toBeNull();
      expect(showMoreBtn.textContent).toContain('Show more (90 remaining)');

      // 4. Click Show more: expands to 120 cards
      act(() => {
        showMoreBtn.click();
      });

      const expandedCards = container.querySelectorAll('div[aria-label^="Select "]');
      expect(expandedCards.length).toBe(120);

      // 5. Updated status line reads 'Showing 120 of 150'
      expect(statusEl!.textContent).toContain('Showing 120 of 150 items');
      expect(showMoreBtn.textContent).toContain('Show more (30 remaining)');
    });
  });

  describe('ExpensesView Render Integration', () => {
    const makeExpenses = (count: number): Expense[] =>
      Array.from({ length: count }, (_, i) => ({
        id: `exp-${i + 1}`,
        title: `Expense ${String(i + 1).padStart(3, '0')}`,
        category: 'Rent & Utilities',
        amount: 500 + i,
        taxableAmount: 500 + i,
        gstRate: 0,
        taxAmount: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        date: '2026-11-01',
        paymentMode: 'CASH',
        itcEligible: false,
        voucherNumber: `VCH-${String(i + 1).padStart(3, '0')}`,
        createdAt: '2026-11-01T10:00:00Z',
      }));

    it('renders 60 expenses initially, shows status line, and clicking Show more renders 120', () => {
      act(() => {
        root.render(
          <ExpensesView
            expenses={makeExpenses(150)}
            onSaveExpense={() => {}}
            onDeleteExpense={() => {}}
          />
        );
      });

      // 1. Initial render: 60 desktop cards (h3 tags)
      const initialCards = container.querySelectorAll('h3');
      expect(initialCards.length).toBe(60);

      // 2. Status line reads 'Showing 60 of 150 expenses'
      const statusEl = container.querySelector('[data-testid="expenses-window-status"]');
      expect(statusEl).not.toBeNull();
      expect(statusEl!.textContent).toContain('Showing 60 of 150 expenses');

      // 3. Show more button indicates 90 remaining
      const showMoreBtn = container.querySelector('[data-testid="expenses-show-more"]') as HTMLButtonElement;
      expect(showMoreBtn).not.toBeNull();
      expect(showMoreBtn.textContent).toContain('Show more (90 remaining)');

      // 4. Click Show more: expands to 120 cards
      act(() => {
        showMoreBtn.click();
      });

      const expandedCards = container.querySelectorAll('h3');
      expect(expandedCards.length).toBe(120);

      // 5. Updated status line reads 'Showing 120 of 150 expenses'
      expect(statusEl!.textContent).toContain('Showing 120 of 150 expenses');
      expect(showMoreBtn.textContent).toContain('Show more (30 remaining)');
    });

    it('renders all expenses and no footer when count <= 100', () => {
      act(() => {
        root.render(
          <ExpensesView
            expenses={makeExpenses(50)}
            onSaveExpense={() => {}}
            onDeleteExpense={() => {}}
          />
        );
      });

      expect(container.querySelectorAll('h3').length).toBe(50);
      expect(container.querySelector('[data-testid="expenses-window-status"]')).toBeNull();
      expect(container.querySelector('[data-testid="expenses-show-more"]')).toBeNull();
    });
  });

  describe('PurchasesHubView Render Integration', () => {
    const mockCompany: CompanyProfile = {
      id: 'comp-1',
      businessName: 'Test Business',
      isGstEnabled: true,
      gstin: '27AABCT1234H1Z0',
      pan: 'AABCT1234H',
      stateCode: '27',
      address: 'Mumbai',
      pincode: '400001',
      phone: '9876543210',
      email: 'test@example.com',
    };

    const makePurchases = (count: number): PurchaseBill[] =>
      Array.from({ length: count }, (_, i) => ({
        id: `pur-${i + 1}`,
        billNumber: `BILL-${String(i + 1).padStart(3, '0')}`,
        purchaseType: 'BILL',
        date: '2026-11-01',
        supplierId: `supp-${i + 1}`,
        supplierName: `Supplier ${i + 1}`,
        supplierAddress: 'Mumbai',
        supplierStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        totalGrossAmount: 1000,
        totalDiscount: 0,
        totalTaxableAmount: 1000,
        totalCgst: 90,
        totalSgst: 90,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 180,
        roundOff: 0,
        grandTotal: 1180,
        amountInWords: 'One Thousand One Hundred Eighty',
        paymentMode: 'CREDIT',
        paymentStatus: 'UNPAID',
        paidAmount: 0,
        balanceAmount: 1180,
        itcEligibility: 'ALL_OTHER_ITC',
        isRcm: false,
        createdAt: '2026-11-01T10:00:00Z',
        updatedAt: '2026-11-01T10:00:00Z',
      }));

    it('renders 60 purchases initially, shows status line, preserves select-all on full list, and clicking Show more renders 120', () => {
      act(() => {
        root.render(
          <PurchasesHubView
            purchases={makePurchases(150)}
            parties={[]}
            itemsCatalog={[]}
            company={mockCompany}
            onSavePurchase={() => {}}
            onDeletePurchase={() => {}}
          />
        );
      });

      // 1. Initial render: 60 purchase cards
      const initialCards = container.querySelectorAll('div[title="Select purchase bill"]');
      expect(initialCards.length).toBe(60);

      // 2. Select All label indicates the FULL 150 items
      expect(container.textContent).toContain('Select All (150)');

      // 3. Status line reads 'Showing 60 of 150 purchases'
      const statusEl = container.querySelector('[data-testid="purchases-window-status"]');
      expect(statusEl).not.toBeNull();
      expect(statusEl!.textContent).toContain('Showing 60 of 150 purchases');

      // 4. Show more button indicates 90 remaining
      const showMoreBtn = container.querySelector('[data-testid="purchases-show-more"]') as HTMLButtonElement;
      expect(showMoreBtn).not.toBeNull();
      expect(showMoreBtn.textContent).toContain('Show more (90 remaining)');

      // 5. Click Show more: expands to 120 cards
      act(() => {
        showMoreBtn.click();
      });

      const expandedCards = container.querySelectorAll('div[title="Select purchase bill"]');
      expect(expandedCards.length).toBe(120);

      // 6. Updated status line reads 'Showing 120 of 150 purchases'
      expect(statusEl!.textContent).toContain('Showing 120 of 150 purchases');
      expect(showMoreBtn.textContent).toContain('Show more (30 remaining)');
    });

    it('renders all purchases and no footer when count <= 100', () => {
      act(() => {
        root.render(
          <PurchasesHubView
            purchases={makePurchases(50)}
            parties={[]}
            itemsCatalog={[]}
            company={mockCompany}
            onSavePurchase={() => {}}
            onDeletePurchase={() => {}}
          />
        );
      });

      expect(container.querySelectorAll('div[title="Select purchase bill"]').length).toBe(50);
      expect(container.querySelector('[data-testid="purchases-window-status"]')).toBeNull();
      expect(container.querySelector('[data-testid="purchases-show-more"]')).toBeNull();
    });
  });

  describe('PartyPassbookTable Render Integration', () => {
    const makePassbookEntries = (count: number): PassbookEntry[] =>
      Array.from({ length: count }, (_, i) => ({
        id: `pb-${i + 1}`,
        date: '2026-11-01',
        docNumber: `INV-${String(i + 1).padStart(3, '0')}`,
        type: 'SALE' as const,
        description: `Sale ${i + 1}`,
        debit: 1000,
        credit: 0,
        runningBalance: (i + 1) * 1000,
        paymentMode: 'CREDIT',
        status: 'UNPAID',
      }));

    it('renders 60 entries initially, shows status line, and clicking Show more renders 120', () => {
      act(() => {
        root.render(
          <PartyPassbookTable
            filteredPassbook={makePassbookEntries(150)}
            txnFilter="ALL"
            setTxnFilter={() => {}}
            txnSortOrder="NEWEST"
            setTxnSortOrder={() => {}}
            searchTxn=""
            setSearchTxn={() => {}}
            onTransactionClick={() => {}}
          />
        );
      });

      // 1. Initial render: 60 entries
      const initialCards = container.querySelectorAll('span.font-currency-display-mobile');
      expect(initialCards.length).toBe(60);

      // 2. Status line reads 'Showing 60 of 150 entries'
      const statusEl = container.querySelector('[data-testid="passbook-window-status"]');
      expect(statusEl).not.toBeNull();
      expect(statusEl!.textContent).toContain('Showing 60 of 150 entries');

      // 3. Show more button indicates 90 remaining
      const showMoreBtn = container.querySelector('[data-testid="passbook-show-more"]') as HTMLButtonElement;
      expect(showMoreBtn).not.toBeNull();
      expect(showMoreBtn.textContent).toContain('Show more (90 remaining)');

      // 4. Click Show more: expands to 120 entries
      act(() => {
        showMoreBtn.click();
      });

      const expandedCards = container.querySelectorAll('span.font-currency-display-mobile');
      expect(expandedCards.length).toBe(120);

      // 5. Updated status line reads 'Showing 120 of 150 entries'
      expect(statusEl!.textContent).toContain('Showing 120 of 150 entries');
      expect(showMoreBtn.textContent).toContain('Show more (30 remaining)');
    });

    it('renders all entries and no footer when count <= 100', () => {
      act(() => {
        root.render(
          <PartyPassbookTable
            filteredPassbook={makePassbookEntries(50)}
            txnFilter="ALL"
            setTxnFilter={() => {}}
            txnSortOrder="NEWEST"
            setTxnSortOrder={() => {}}
            searchTxn=""
            setSearchTxn={() => {}}
            onTransactionClick={() => {}}
          />
        );
      });

      expect(container.querySelectorAll('span.font-currency-display-mobile').length).toBe(50);
      expect(container.querySelector('[data-testid="passbook-window-status"]')).toBeNull();
      expect(container.querySelector('[data-testid="passbook-show-more"]')).toBeNull();
    });

    it('in descending order the first rendered row is newest and OPENING remains last with running balances preserved', () => {
      // 120 entries sorted newest first, ending with OPENING as baseline
      const descendingEntries: PassbookEntry[] = [
        ...Array.from({ length: 119 }, (_, i) => {
          const num = 120 - i;
          return {
            id: `entry-${num}`,
            date: `2026-11-${String(Math.min(30, num)).padStart(2, '0')}`,
            docNumber: `INV-${num}`,
            type: 'SALE' as const,
            description: `Invoice ${num}`,
            debit: 1000,
            credit: 0,
            runningBalance: num * 1000,
            paymentMode: 'CREDIT',
            status: 'UNPAID',
          };
        }),
        {
          id: 'entry-opening',
          date: '2026-01-01',
          docNumber: 'OPENING',
          type: 'OPENING' as const,
          description: 'Opening Balance',
          debit: 1000,
          credit: 0,
          runningBalance: 1000,
          isOpening: true,
        },
      ];

      act(() => {
        root.render(
          <PartyPassbookTable
            filteredPassbook={descendingEntries}
            txnFilter="ALL"
            setTxnFilter={() => {}}
            txnSortOrder="NEWEST"
            setTxnSortOrder={() => {}}
            searchTxn=""
            setSearchTxn={() => {}}
            onTransactionClick={() => {}}
          />
        );
      });

      // Initial window (60)
      const renderedCards = container.querySelectorAll('span.font-currency-display-mobile');
      expect(renderedCards.length).toBe(60);

      // First rendered row is newest (INV-120 with running balance 120,000)
      expect(container.textContent).toContain('#INV-120');
      expect(container.textContent).toContain(`Bal: ${formatINR(120000)}`);

      // Click show more to expand to 120
      const showMoreBtn = container.querySelector('[data-testid="passbook-show-more"]') as HTMLButtonElement;
      act(() => {
        showMoreBtn.click();
      });

      // Full 120 rows now rendered
      expect(container.querySelectorAll('span.font-currency-display-mobile').length).toBe(120);

      // OPENING row is rendered at the end with its correct running balance
      expect(container.textContent).toContain('#OPENING');
      expect(container.textContent).toContain('Opening Balance');
      expect(container.textContent).toContain(`Bal: ${formatINR(1000)}`);
    });
  });

  describe('Static Source File Assertions', () => {
    it('SalesHubView, PartiesView, InventoryView, ExpensesView, PurchasesHubView, and PartyPassbookTable import useProgressiveWindow and use slice(0, ...visibleCount)', () => {
      const salesPath = path.resolve(__dirname, '../components/Sales/SalesHubView.tsx');
      const partiesPath = path.resolve(__dirname, '../components/Parties/PartiesView.tsx');
      const inventoryPath = path.resolve(__dirname, '../components/Inventory/InventoryView.tsx');
      const expensesPath = path.resolve(__dirname, '../components/Expenses/ExpensesView.tsx');
      const purchasesPath = path.resolve(__dirname, '../components/Purchases/PurchasesHubView.tsx');
      const passbookPath = path.resolve(__dirname, '../components/Parties/PartyPassbookTable.tsx');

      const salesCode = fs.readFileSync(salesPath, 'utf-8');
      const partiesCode = fs.readFileSync(partiesPath, 'utf-8');
      const inventoryCode = fs.readFileSync(inventoryPath, 'utf-8');
      const expensesCode = fs.readFileSync(expensesPath, 'utf-8');
      const purchasesCode = fs.readFileSync(purchasesPath, 'utf-8');
      const passbookCode = fs.readFileSync(passbookPath, 'utf-8');

      // Assert hook import
      expect(salesCode).toContain('useProgressiveWindow');
      expect(partiesCode).toContain('useProgressiveWindow');
      expect(inventoryCode).toContain('useProgressiveWindow');
      expect(expensesCode).toContain('useProgressiveWindow');
      expect(purchasesCode).toContain('useProgressiveWindow');
      expect(passbookCode).toContain('useProgressiveWindow');

      // Assert slice usage with visibleCount
      expect(salesCode).toMatch(/\.slice\(0,\s*[a-zA-Z0-9_]*\.visibleCount\)/);
      expect(partiesCode).toMatch(/\.slice\(0,\s*[a-zA-Z0-9_]*\.visibleCount\)/);
      expect(inventoryCode).toMatch(/\.slice\(0,\s*[a-zA-Z0-9_]*\.visibleCount\)/);
      expect(expensesCode).toMatch(/\.slice\(0,\s*[a-zA-Z0-9_]*\.visibleCount\)/);
      expect(purchasesCode).toMatch(/\.slice\(0,\s*[a-zA-Z0-9_]*\.visibleCount\)/);
      expect(passbookCode).toMatch(/\.slice\(0,\s*[a-zA-Z0-9_]*\.visibleCount\)/);

      // Assert testids present
      expect(salesCode).toContain('invoices-show-more');
      expect(salesCode).toContain('invoices-window-status');
      expect(partiesCode).toContain('parties-show-more');
      expect(partiesCode).toContain('parties-window-status');
      expect(inventoryCode).toContain('items-show-more');
      expect(inventoryCode).toContain('items-window-status');
      expect(expensesCode).toContain('expenses-show-more');
      expect(expensesCode).toContain('expenses-window-status');
      expect(purchasesCode).toContain('purchases-show-more');
      expect(purchasesCode).toContain('purchases-window-status');
      expect(passbookCode).toContain('passbook-show-more');
      expect(passbookCode).toContain('passbook-window-status');
    });
  });
});
