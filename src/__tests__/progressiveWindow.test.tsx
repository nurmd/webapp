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
import { InventoryItem } from '../models/item.ts';
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

  describe('Static Source File Assertions', () => {
    it('SalesHubView, PartiesView, and InventoryView import useProgressiveWindow and use slice(0, ...visibleCount)', () => {
      const salesPath = path.resolve(__dirname, '../components/Sales/SalesHubView.tsx');
      const partiesPath = path.resolve(__dirname, '../components/Parties/PartiesView.tsx');
      const inventoryPath = path.resolve(__dirname, '../components/Inventory/InventoryView.tsx');

      const salesCode = fs.readFileSync(salesPath, 'utf-8');
      const partiesCode = fs.readFileSync(partiesPath, 'utf-8');
      const inventoryCode = fs.readFileSync(inventoryPath, 'utf-8');

      // Assert hook import
      expect(salesCode).toContain('useProgressiveWindow');
      expect(partiesCode).toContain('useProgressiveWindow');
      expect(inventoryCode).toContain('useProgressiveWindow');

      // Assert slice usage with visibleCount
      expect(salesCode).toMatch(/\.slice\(0,\s*[a-zA-Z0-9_]*\.visibleCount\)/);
      expect(partiesCode).toMatch(/\.slice\(0,\s*[a-zA-Z0-9_]*\.visibleCount\)/);
      expect(inventoryCode).toMatch(/\.slice\(0,\s*[a-zA-Z0-9_]*\.visibleCount\)/);

      // Assert testids present
      expect(salesCode).toContain('invoices-show-more');
      expect(salesCode).toContain('invoices-window-status');
      expect(partiesCode).toContain('parties-show-more');
      expect(partiesCode).toContain('parties-window-status');
      expect(inventoryCode).toContain('items-show-more');
      expect(inventoryCode).toContain('items-window-status');
    });
  });
});
