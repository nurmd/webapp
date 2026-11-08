import { describe, it, expect, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { DocumentLineItemsGrid, DocumentGridRow } from '../components/Common/Billing/DocumentLineItemsGrid.tsx';
import { PurchasesHubView } from '../components/Purchases/PurchasesHubView.tsx';
import { SalesHubView } from '../components/Sales/SalesHubView.tsx';
import { CreateInvoiceModal } from '../components/Invoicing/CreateInvoiceModal.tsx';
import { CompanyProfile } from '../models/company.ts';
import { Party } from '../models/party.ts';
import { InventoryItem } from '../models/item.ts';

const mockCompany = {
  id: 'comp-1',
  name: 'Test Company',
  tradeName: 'Test Trade',
  gstin: '27AABCU9603R1ZM',
  stateCode: '27',
  isGstEnabled: true,
  isCompositionScheme: false,
} as unknown as CompanyProfile;

const mockParty = {
  id: 'pty-1',
  name: 'Acme Corp',
  stateCode: '27',
  type: 'CUSTOMER',
} as unknown as Party;

const mockItems = [
  {
    id: 'item-1',
    name: 'Widget A',
    salePrice: 100,
    unit: 'PCS',
    gstRate: 18,
  },
  {
    id: 'item-2',
    name: 'Widget B',
    salePrice: 200,
    unit: 'PCS',
    gstRate: 18,
  },
] as unknown as InventoryItem[];

describe('Phase 0.5 — Stable React keys for editable line items and accessible backdrop buttons', () => {
  it('1. DocumentLineItemsGrid uses row.id and fallback to row.itemId with occurrence suffix for duplicates', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    const rows: DocumentGridRow[] = [
      {
        id: 'stable-row-1',
        itemId: 'itm-a',
        name: 'Item 1',
        quantity: 2,
        unit: 'PCS',
        unitPrice: 50,
        discountPercent: 0,
        gstRate: 18,
        hsnSacCode: '1234',
      },
      {
        // No id, fallback to itemId
        itemId: 'itm-b',
        name: 'Item 2',
        quantity: 1,
        unit: 'PCS',
        unitPrice: 100,
        discountPercent: 0,
        gstRate: 18,
        hsnSacCode: '1234',
      },
      {
        // Duplicate itemId, should get occurrence suffix
        itemId: 'itm-b',
        name: 'Item 2 Duplicate',
        quantity: 1,
        unit: 'PCS',
        unitPrice: 100,
        discountPercent: 0,
        gstRate: 18,
        hsnSacCode: '1234',
      },
    ];

    await act(async () => {
      root.render(
        <DocumentLineItemsGrid
          rows={rows}
          isGstActive={true}
          mode="interactive"
        />
      );
    });

    const trs = container.querySelectorAll('tbody tr');
    expect(trs.length).toBe(3);

    // Verify React key on internal fibers
    const getFiberKey = (el: Element | null) => {
      if (!el) return null;
      const keyProp = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
      return keyProp ? (el as unknown as Record<string, { key?: string }>)[keyProp]?.key : null;
    };

    expect(getFiberKey(trs[0])).toBe('stable-row-1');
    expect(getFiberKey(trs[1])).toBe('itm-b');
    expect(getFiberKey(trs[2])).toBe('itm-b-2');

    act(() => root.unmount());
  });

  it('2. PurchasesHubView renders an accessible backdrop button for the sort menu', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <PurchasesHubView
          company={mockCompany}
          purchases={[]}
          parties={[]}
          itemsCatalog={[]}
          onSavePurchase={vi.fn()}
          onDeletePurchase={vi.fn()}
          onEditPurchase={vi.fn()}
          onAddNewParty={vi.fn()}
        />
      );
    });

    // Click sort button to open dropdown
    const sortBtn = container.querySelector('button[aria-label="Sort purchases ledger"]') as HTMLButtonElement;
    expect(sortBtn).toBeTruthy();

    await act(async () => {
      sortBtn.click();
    });

    // Verify backdrop is a button with aria-label="Close sort menu" and className="fixed inset-0 z-40 cursor-default"
    const backdropBtn = container.querySelector('button[aria-label="Close sort menu"]') as HTMLButtonElement;
    expect(backdropBtn).toBeTruthy();
    expect(backdropBtn.tagName).toBe('BUTTON');
    expect(backdropBtn.type).toBe('button');
    expect(backdropBtn.className).toContain('fixed inset-0 z-40');
    expect(backdropBtn.className).toContain('cursor-default');

    // Click backdrop to close
    await act(async () => {
      backdropBtn.click();
    });

    expect(container.querySelector('button[aria-label="Close sort menu"]')).toBeNull();

    act(() => root.unmount());
  });

  it('3. SalesHubView renders an accessible backdrop button for the sort menu', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SalesHubView
          company={mockCompany}
          invoices={[]}
          onOpenStandardInvoice={vi.fn()}
          onOpenTableGridInvoice={vi.fn()}
          onViewInvoice={vi.fn()}
          onDeleteInvoice={vi.fn()}
        />
      );
    });

    // Click sort button to open dropdown
    const sortBtn = container.querySelector('button[aria-label="Sort sales ledger"]') as HTMLButtonElement;
    expect(sortBtn).toBeTruthy();

    await act(async () => {
      sortBtn.click();
    });

    // Verify backdrop is a button with aria-label="Close sort menu" and className="fixed inset-0 z-40 cursor-default"
    const backdropBtn = container.querySelector('button[aria-label="Close sort menu"]') as HTMLButtonElement;
    expect(backdropBtn).toBeTruthy();
    expect(backdropBtn.tagName).toBe('BUTTON');
    expect(backdropBtn.type).toBe('button');
    expect(backdropBtn.className).toContain('fixed inset-0 z-40');
    expect(backdropBtn.className).toContain('cursor-default');

    // Click backdrop to close
    await act(async () => {
      backdropBtn.click();
    });

    expect(container.querySelector('button[aria-label="Close sort menu"]')).toBeNull();

    act(() => root.unmount());
  });

  it('4. CreateInvoiceModal renders lines with stable line id instead of index', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CreateInvoiceModal
          company={mockCompany}
          parties={[mockParty]}
          itemsCatalog={mockItems}
          onClose={vi.fn()}
          onSave={vi.fn()}
        />
      );
    });

    // Add a line item
    const getAddLineBtn = () =>
      Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Add Line')
      );
    expect(getAddLineBtn()).toBeTruthy();

    await act(async () => {
      getAddLineBtn()!.click();
    });

    // Add a second line item
    expect(getAddLineBtn()).toBeTruthy();
    await act(async () => {
      getAddLineBtn()!.click();
    });

    const lineElements = container.querySelectorAll('.grid.grid-cols-12');
    expect(lineElements.length).toBe(2);

    const getFiberKey = (el: Element | null) => {
      if (!el) return null;
      const keyProp = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
      return keyProp ? (el as unknown as Record<string, { key?: string }>)[keyProp]?.key : null;
    };

    const firstKey = getFiberKey(lineElements[0]);
    const secondKey = getFiberKey(lineElements[1]);
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBeTruthy();
    expect(firstKey).toMatch(/^line-\d+-\d+$/);
    expect(secondKey).toMatch(/^line-\d+-\d+$/);
    expect(firstKey).not.toBe(secondKey);

    act(() => root.unmount());
  });
});
