(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PosCatalogGridCard, PosCatalogListRow } from '../components/POS/pos/PosCatalogCard.tsx';
import { InventoryItemCard } from '../components/Inventory/InventoryItemCard.tsx';
import { DocumentLineItemsGrid } from '../components/Common/Billing/DocumentLineItemsGrid.tsx';
import type { InventoryItem } from '../models/item.ts';

const LONG_NAME = 'Fortune Mustard Oil 1L Pouch Cold Pressed Premium Family Pack';

const mockItem: InventoryItem = {
  id: 'item-long-1',
  name: LONG_NAME,
  hsnSacCode: '1507',
  category: 'Groceries',
  unit: 'PCS',
  salePrice: 180,
  purchasePrice: 150,
  gstRate: 5,
  currentStock: 24,
  minStockAlert: 5,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const isWrappingName = (el: Element | null) => {
  expect(el).not.toBeNull();
  const cls = el?.className || '';
  // Item names wrap onto a second line instead of being hidden with an ellipsis
  expect(cls).toContain('line-clamp-2');
  expect(cls).toContain('break-words');
  expect(cls).not.toContain('truncate');
  expect(el?.getAttribute('title')).toBe(LONG_NAME);
};

describe('Item name is never hidden by space constraints', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

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

  it('POS catalog grid card wraps the full item name to two lines', () => {
    act(() => {
      root.render(
        <PosCatalogGridCard item={mockItem} inCartQty={0} isGstActive={true} onAdd={vi.fn()} />
      );
    });

    const nameEl = Array.from(container.querySelectorAll('p')).find(
      (el) => el.textContent?.trim() === LONG_NAME
    );
    isWrappingName(nameEl ?? null);
  });

  it('POS catalog list row wraps the full item name to two lines', () => {
    act(() => {
      root.render(
        <PosCatalogListRow item={mockItem} inCartQty={0} isGstActive={true} onAdd={vi.fn()} />
      );
    });

    const nameEl = Array.from(container.querySelectorAll('span')).find(
      (el) => el.textContent?.trim() === LONG_NAME
    );
    isWrappingName(nameEl ?? null);
  });

  it('Inventory list card wraps the full item name to two lines', () => {
    act(() => {
      root.render(
        <InventoryItemCard
          item={mockItem}
          isBuyPriceVisible={false}
          onToggleBuyPrice={vi.fn()}
          onClick={vi.fn()}
        />
      );
    });

    const nameEl = container.querySelector('h3');
    expect(nameEl?.textContent).toContain(LONG_NAME);
    isWrappingName(nameEl);
  });

  it('Document line items card view wraps the full item name to two lines', () => {
    act(() => {
      root.render(
        <DocumentLineItemsGrid
          kind="invoice"
          rows={[
            {
              itemId: mockItem.id,
              name: LONG_NAME,
              hsnSacCode: mockItem.hsnSacCode,
              quantity: 2,
              unit: 'PCS',
              unitPrice: 180,
              discountPercent: 0,
              gstRate: 5,
            },
          ]}
          isGstActive={true}
          isCompositionScheme={false}
        />
      );
    });

    const nameEl = Array.from(container.querySelectorAll('h4')).find(
      (el) => el.textContent?.trim() === LONG_NAME
    );
    isWrappingName(nameEl ?? null);

    // The name must not live inside a horizontally scrolling container
    expect(nameEl?.parentElement?.className || '').not.toContain('overflow-x-auto');
  });
});
