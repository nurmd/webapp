import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import { InvoiceLineItemsGrid, GridRow } from '../components/Invoicing/components/InvoiceLineItemsGrid.tsx';
import { PurchaseLineItemsGrid, PurchaseGridRow } from '../components/Purchases/components/PurchaseLineItemsGrid.tsx';
import { DocumentTotalsSummary } from '../components/Common/Billing/DocumentTotalsSummary.tsx';

describe('GST Phase 3B — Sales/Purchase Grids and Totals Pricing Modes Suite', () => {
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

  it('1. Render InvoiceLineItemsGrid with one inclusive row: unitPrice: 100, unitPriceInclusive: 118, priceMode: "INCLUSIVE", gstRate: 18, cessRate: 12, qty 1, no discount; calcItems with totalAmount: 130', async () => {
    const rows: GridRow[] = [
      {
        itemId: 'ITM-001',
        name: 'Aerated Drink Can',
        hsnSacCode: '2202',
        quantity: 1,
        unit: 'NOS',
        unitPrice: 100,
        unitPriceInclusive: 118,
        priceMode: 'INCLUSIVE',
        discountPercent: 0,
        gstRate: 18,
        cessRate: 12,
      },
    ];

    const calcItems = [
      {
        discountAmount: 0,
        taxableAmount: 100,
        cgstAmount: 9,
        sgstAmount: 9,
        igstAmount: 0,
        cessAmount: 12,
        totalAmount: 130,
      },
    ];

    await act(async () => {
      root.render(
        <InvoiceLineItemsGrid
          rows={rows}
          calcItems={calcItems}
          isGstActive={true}
          onAddItem={vi.fn()}
          onEditItem={vi.fn()}
          onOpenScanner={vi.fn()}
        />
      );
    });

    const text = container.textContent || '';
    expect(text).toContain('100');
    expect(text).toContain('118');
    expect(text).toContain('CESS 12%');
    expect(text).toContain('130');
  });

  it('2. Render PurchaseLineItemsGrid with the same row/calcItems; same assertions', async () => {
    const rows: PurchaseGridRow[] = [
      {
        itemId: 'ITM-001',
        name: 'Aerated Drink Wholesale Pack',
        hsnSacCode: '2202',
        quantity: 1,
        unit: 'BOX',
        unitPrice: 100,
        unitPriceInclusive: 118,
        priceMode: 'INCLUSIVE',
        discountPercent: 0,
        gstRate: 18,
        cessRate: 12,
      },
    ];

    const calcItems = [
      {
        discountAmount: 0,
        taxableAmount: 100,
        cgstAmount: 9,
        sgstAmount: 9,
        igstAmount: 0,
        cessAmount: 12,
        totalAmount: 130,
      },
    ];

    await act(async () => {
      root.render(
        <PurchaseLineItemsGrid
          rows={rows}
          calcItems={calcItems}
          isGstActive={true}
          onAddItem={vi.fn()}
          onEditItem={vi.fn()}
          onRemoveItem={vi.fn()}
          onOpenScanner={vi.fn()}
        />
      );
    });

    const text = container.textContent || '';
    expect(text).toContain('100');
    expect(text).toContain('118');
    expect(text).toContain('CESS 12%');
    expect(text).toContain('130');
  });

  it('3. Render DocumentTotalsSummary with totalTax: 36, totalCgst: 18, totalSgst: 18, totalCess: 12, totalTaxableAmount: 200, isTaxDetailsOpen: true; assert CESS label and 12.00 appear', async () => {
    await act(async () => {
      root.render(
        <DocumentTotalsSummary
          totalGrossAmount={200}
          totalTax={48}
          totalCgst={18}
          totalSgst={18}
          totalIgst={0}
          totalCess={12}
          totalTaxableAmount={200}
          isIntraState={true}
          isGstActive={true}
          roundOff={0}
          isTaxDetailsOpen={true}
          onToggleTaxDetails={vi.fn()}
          totalUnits={1}
          finalGrandTotal={248}
        />
      );
    });

    const text = container.textContent || '';
    expect(text).toContain('CESS');
    expect(text).toMatch(/12\.00/);
  });

  it('4. Render DocumentTotalsSummary with totalCess: 0; assert no CESS row', async () => {
    await act(async () => {
      root.render(
        <DocumentTotalsSummary
          totalGrossAmount={200}
          totalTax={36}
          totalCgst={18}
          totalSgst={18}
          totalIgst={0}
          totalCess={0}
          totalTaxableAmount={200}
          isIntraState={true}
          isGstActive={true}
          roundOff={0}
          isTaxDetailsOpen={true}
          onToggleTaxDetails={vi.fn()}
          totalUnits={1}
          finalGrandTotal={236}
        />
      );
    });

    const text = container.textContent || '';
    expect(text).not.toContain('CESS');
  });

  it('5. GST inactive: render both grids with isGstActive={false} and assert no Incl./CESS text', async () => {
    const invoiceRows: GridRow[] = [
      {
        itemId: 'ITM-001',
        name: 'General Hardware Item',
        hsnSacCode: '',
        quantity: 1,
        unit: 'PCS',
        unitPrice: 100,
        unitPriceInclusive: 118,
        priceMode: 'INCLUSIVE',
        discountPercent: 0,
        gstRate: 18,
        cessRate: 12,
      },
    ];

    const purchaseRows: PurchaseGridRow[] = [
      {
        itemId: 'ITM-002',
        name: 'General Material Item',
        hsnSacCode: '',
        quantity: 1,
        unit: 'PCS',
        unitPrice: 100,
        unitPriceInclusive: 118,
        priceMode: 'INCLUSIVE',
        discountPercent: 0,
        gstRate: 18,
        cessRate: 12,
      },
    ];

    const calcItems = [
      {
        discountAmount: 0,
        taxableAmount: 100,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        cessAmount: 0,
        totalAmount: 100,
      },
    ];

    // Render InvoiceLineItemsGrid with isGstActive={false}
    await act(async () => {
      root.render(
        <InvoiceLineItemsGrid
          rows={invoiceRows}
          calcItems={calcItems}
          isGstActive={false}
          onAddItem={vi.fn()}
          onEditItem={vi.fn()}
          onOpenScanner={vi.fn()}
        />
      );
    });

    let text = container.textContent || '';
    expect(text).not.toContain('Incl.');
    expect(text).not.toContain('CESS');

    // Render PurchaseLineItemsGrid with isGstActive={false}
    await act(async () => {
      root.render(
        <PurchaseLineItemsGrid
          rows={purchaseRows}
          calcItems={calcItems}
          isGstActive={false}
          onAddItem={vi.fn()}
          onEditItem={vi.fn()}
          onRemoveItem={vi.fn()}
          onOpenScanner={vi.fn()}
        />
      );
    });

    text = container.textContent || '';
    expect(text).not.toContain('Incl.');
    expect(text).not.toContain('CESS');
  });
});
