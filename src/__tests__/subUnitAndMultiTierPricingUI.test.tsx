import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ItemDetailSheet } from '../components/Inventory/ItemDetailSheet.tsx';
import { ItemFormModal } from '../components/Inventory/ItemFormModal.tsx';
import { InvoiceItemModal } from '../components/Invoicing/InvoiceItemModal.tsx';
import { resetUnits } from '../services/db/unitSettings.ts';
import { db } from '../services/db.ts';
import type { InventoryItem } from '../models/item.ts';

function createMockItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'ITM-MOCK-' + Math.random().toString(36).slice(2, 7),
    name: 'Mock Item',
    hsnSacCode: '8443',
    category: 'General',
    unit: 'PCS',
    salePrice: 100,
    purchasePrice: 80,
    gstRate: 18,
    currentStock: 100,
    minStockAlert: 10,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function setInputValue(input: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = input instanceof HTMLInputElement ? window.HTMLInputElement.prototype : window.HTMLSelectElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('Sub-Units and Multi-Tier Pricing UI Components', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    resetUnits();
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

  describe('ItemDetailSheet', () => {
    const mockItem = createMockItem({
      id: 'ITM-SHEET-01',
      name: 'Organic Wheat Flour',
      hsnSacCode: '1101',
      category: 'Grains',
      unit: 'BAG',
      subUnit: 'KG',
      subUnitFactor: 50,
      salePrice: 2000,
      semiWholesalePrice: 1900,
      wholesalePrice: 1800,
      currentStock: 100,
      minStockAlert: 10,
    });

    it('displays sub-unit conversion ratio and multi-tier prices', () => {
      act(() => {
        root!.render(
          <ItemDetailSheet
            item={mockItem}
            onClose={vi.fn()}
            isGstActive={true}
            allInvoices={[]}
            allPurchases={[]}
            allAdjustments={[]}
            isBuyPriceVisible={() => true}
            toggleBuyPrice={vi.fn()}
            onOpenEdit={vi.fn()}
            onOpenAdjustment={vi.fn()}
            onToggleItemStatus={vi.fn()}
            onDeleteItem={vi.fn()}
            onReconcileItemStock={vi.fn()}
          />
        );
      });

      expect(container!.textContent).toContain('1 BAG = 50 KG');
      expect(container!.textContent).toContain('100 KG');
      expect(container!.textContent).toContain('(2 BAG)');
      expect(container!.textContent).toContain('Price Tiers:');
      expect(container!.textContent).toContain('Retail:');
      expect(container!.textContent).toContain('Semi-Wholesale:');
      expect(container!.textContent).toContain('Wholesale:');
    });

    it('hides tier bar when item has no semi-wholesale or wholesale price', () => {
      const basicItem: InventoryItem = {
        ...mockItem,
        semiWholesalePrice: undefined,
        wholesalePrice: undefined,
      };

      act(() => {
        root!.render(
          <ItemDetailSheet
            item={basicItem}
            onClose={vi.fn()}
            isGstActive={true}
            allInvoices={[]}
            allPurchases={[]}
            allAdjustments={[]}
            isBuyPriceVisible={() => true}
            toggleBuyPrice={vi.fn()}
            onOpenEdit={vi.fn()}
            onOpenAdjustment={vi.fn()}
            onToggleItemStatus={vi.fn()}
            onDeleteItem={vi.fn()}
            onReconcileItemStock={vi.fn()}
          />
        );
      });

      expect(container!.textContent).not.toContain('Price Tiers:');
    });
  });

  describe('ItemFormModal', () => {
    it('renders sub-unit and multi-tier pricing inputs', () => {
      act(() => {
        root!.render(
          <ItemFormModal
            isOpen={true}
            editingItem={null}
            onClose={vi.fn()}
            onSaveItem={vi.fn()}
            isGstActive={true}
          />
        );
      });

      expect(container!.textContent).toContain('Sub-Unit & Packaging Conversion');
      expect(container!.textContent).toContain('Semi-Wholesale Price');
      expect(container!.textContent).toContain('Wholesale Price');
    });

    it('shows Default Price Tier when editing an item with tier price', () => {
      act(() => {
        root!.render(
          <ItemFormModal
            isOpen={true}
            editingItem={createMockItem({ wholesalePrice: 400 })}
            onClose={vi.fn()}
            onSaveItem={vi.fn()}
            isGstActive={true}
          />
        );
      });

      expect(container!.textContent).toContain('Default Price Tier');
    });

    it('shows sub-unit factor input when editing item with sub-unit', () => {
      act(() => {
        root!.render(
          <ItemFormModal
            isOpen={true}
            editingItem={createMockItem({ subUnit: 'KGS', subUnitFactor: 25 })}
            onClose={vi.fn()}
            onSaveItem={vi.fn()}
            isGstActive={true}
          />
        );
      });

      const factorInput = container!.querySelector('input[aria-label="Sub-Unit Factor"]') as HTMLInputElement;
      expect(factorInput).toBeDefined();
      expect(factorInput.value).toBe('25');
    });
  });

  describe('InvoiceItemModal Tier Selector', () => {
    const catalogItem: InventoryItem = createMockItem({
      id: 'ITM-INVOICE-01',
      name: 'Industrial Valve',
      hsnSacCode: '8481',
      category: 'Hardware',
      unit: 'PCS',
      salePrice: 1000,
      semiWholesalePrice: 900,
      wholesalePrice: 800,
      defaultPriceTier: 'RETAIL',
      gstRate: 18,
      currentStock: 50,
      minStockAlert: 5,
    });

    it('renders pricing tier buttons when catalog item has tiers', () => {
      act(() => {
        root!.render(
          <InvoiceItemModal
            isOpen={true}
            onClose={vi.fn()}
            onSaveItem={vi.fn()}
            initialItem={{
              itemId: catalogItem.id,
              name: catalogItem.name,
              hsnSacCode: catalogItem.hsnSacCode,
              quantity: 1,
              unit: catalogItem.unit,
              unitPrice: 1000,
              discountPercent: 0,
              gstRate: 18,
            }}
            itemsCatalog={[catalogItem]}
            isIntraState={true}
            isGstActive={true}
          />
        );
      });

      expect(container!.textContent).toContain('Pricing Tier');
      expect(container!.textContent).toContain('Retail');
      expect(container!.textContent).toContain('Semi-Wholesale');
      expect(container!.textContent).toContain('Wholesale');
    });

    it('clicking Wholesale tier updates the line price', () => {
      act(() => {
        root!.render(
          <InvoiceItemModal
            isOpen={true}
            onClose={vi.fn()}
            onSaveItem={vi.fn()}
            initialItem={{
              itemId: catalogItem.id,
              name: catalogItem.name,
              hsnSacCode: catalogItem.hsnSacCode,
              quantity: 1,
              unit: catalogItem.unit,
              unitPrice: 1000,
              discountPercent: 0,
              gstRate: 18,
            }}
            itemsCatalog={[catalogItem]}
            isIntraState={true}
            isGstActive={true}
          />
        );
      });

      const wholesaleBtn = Array.from(container!.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Wholesale') && !b.textContent?.includes('Semi')
      );
      expect(wholesaleBtn).toBeDefined();

      act(() => {
        wholesaleBtn!.click();
      });

      const priceInput = container!.querySelector('input[aria-label="Sale Price (Excl. GST)"]') as HTMLInputElement;
      expect(priceInput.value).toBe('800');
    });

    it('disables tier button when tier price is not configured', () => {
      const itemWithoutWholesale: InventoryItem = {
        ...catalogItem,
        wholesalePrice: undefined,
      };

      act(() => {
        root!.render(
          <InvoiceItemModal
            isOpen={true}
            onClose={vi.fn()}
            onSaveItem={vi.fn()}
            initialItem={{
              itemId: itemWithoutWholesale.id,
              name: itemWithoutWholesale.name,
              hsnSacCode: itemWithoutWholesale.hsnSacCode,
              quantity: 1,
              unit: itemWithoutWholesale.unit,
              unitPrice: 1000,
              discountPercent: 0,
              gstRate: 18,
            }}
            itemsCatalog={[itemWithoutWholesale]}
            isIntraState={true}
            isGstActive={true}
          />
        );
      });

      const wholesaleBtn = Array.from(container!.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Wholesale') && !b.textContent?.includes('Semi')
      );
      expect(wholesaleBtn).toBeDefined();
      expect(wholesaleBtn?.disabled).toBe(true);
    });
  });

  describe('InvoiceItemModal Purchase Mode Sale Price Updating (New Task)', () => {
    const catalogItem: InventoryItem = createMockItem({
      id: 'ITM-PURCHASE-SP-1',
      name: 'Catalog Item For Purchase',
      salePrice: 150,
      salePriceMode: 'EXCLUSIVE',
      purchasePrice: 100,
      gstRate: 18,
    });

    it('pre-fills Sale Price input with catalog item salePrice in purchase mode', () => {
      act(() => {
        root!.render(
          <InvoiceItemModal
            isOpen={true}
            mode="purchase"
            onClose={vi.fn()}
            onSaveItem={vi.fn()}
            initialItem={{
              itemId: catalogItem.id,
              name: catalogItem.name,
              hsnSacCode: catalogItem.hsnSacCode,
              quantity: 1,
              unit: catalogItem.unit,
              unitPrice: 100,
              discountPercent: 0,
              gstRate: 18,
            }}
            itemsCatalog={[catalogItem]}
            isIntraState={true}
            isGstActive={true}
          />
        );
      });

      const salePriceInput = container!.querySelector('input[aria-label="Sale Price"]') as HTMLInputElement;
      expect(salePriceInput).toBeDefined();
      expect(salePriceInput.value).toBe('150');
    });

    it('pre-fills Sale Price input with salePriceInclusive when salePriceMode is INCLUSIVE', () => {
      const inclusiveCatalogItem: InventoryItem = createMockItem({
        id: 'ITM-PURCHASE-SP-2',
        name: 'Inclusive Catalog Item',
        salePrice: 100,
        salePriceInclusive: 118,
        salePriceMode: 'INCLUSIVE',
        purchasePrice: 80,
        gstRate: 18,
      });

      act(() => {
        root!.render(
          <InvoiceItemModal
            isOpen={true}
            mode="purchase"
            onClose={vi.fn()}
            onSaveItem={vi.fn()}
            initialItem={{
              itemId: inclusiveCatalogItem.id,
              name: inclusiveCatalogItem.name,
              hsnSacCode: inclusiveCatalogItem.hsnSacCode,
              quantity: 1,
              unit: inclusiveCatalogItem.unit,
              unitPrice: 80,
              discountPercent: 0,
              gstRate: 18,
            }}
            itemsCatalog={[inclusiveCatalogItem]}
            isIntraState={true}
            isGstActive={true}
          />
        );
      });

      const salePriceInput = container!.querySelector('input[aria-label="Sale Price"]') as HTMLInputElement;
      expect(salePriceInput).toBeDefined();
      expect(salePriceInput.value).toBe('118');
    });

    it('does not render catalog Sale Price updater input in sale mode', () => {
      act(() => {
        root!.render(
          <InvoiceItemModal
            isOpen={true}
            mode="sale"
            onClose={vi.fn()}
            onSaveItem={vi.fn()}
            initialItem={{
              itemId: catalogItem.id,
              name: catalogItem.name,
              hsnSacCode: catalogItem.hsnSacCode,
              quantity: 1,
              unit: catalogItem.unit,
              unitPrice: 150,
              discountPercent: 0,
              gstRate: 18,
            }}
            itemsCatalog={[catalogItem]}
            isIntraState={true}
            isGstActive={true}
          />
        );
      });

      const catalogSalePriceInput = container!.querySelector('input[aria-label="Sale Price"]');
      expect(catalogSalePriceInput).toBeNull();
    });

    it('updates catalog item salePrice via db.saveItem on save when edited in purchase mode', () => {
      const saveItemSpy = vi.spyOn(db, 'saveItem').mockReturnValue({} as any);
      const onItemCreated = vi.fn();

      act(() => {
        root!.render(
          <InvoiceItemModal
            isOpen={true}
            mode="purchase"
            onClose={vi.fn()}
            onSaveItem={vi.fn()}
            onItemCreated={onItemCreated}
            initialItem={{
              itemId: catalogItem.id,
              name: catalogItem.name,
              hsnSacCode: catalogItem.hsnSacCode,
              quantity: 1,
              unit: catalogItem.unit,
              unitPrice: 100,
              discountPercent: 0,
              gstRate: 18,
            }}
            itemsCatalog={[catalogItem]}
            isIntraState={true}
            isGstActive={true}
          />
        );
      });

      const salePriceInput = container!.querySelector('input[aria-label="Sale Price"]') as HTMLInputElement;
      expect(salePriceInput).toBeDefined();

      act(() => {
        setInputValue(salePriceInput, '175');
      });

      const submitBtn = container!.querySelector('button[type="submit"]') as HTMLButtonElement;
      act(() => {
        submitBtn.click();
      });

      expect(saveItemSpy).toHaveBeenCalledTimes(1);
      const savedItem = saveItemSpy.mock.calls[0][0];
      expect(savedItem.id).toBe(catalogItem.id);
      expect(savedItem.salePrice).toBe(175);
      expect(savedItem.salePriceInclusive).toBe(206.5);
      expect(onItemCreated).toHaveBeenCalledWith(savedItem);

      saveItemSpy.mockRestore();
    });

    it('handles INCLUSIVE mode by updating salePriceInclusive and deriving salePrice', () => {
      const inclusiveCatalogItem: InventoryItem = createMockItem({
        id: 'ITM-PURCHASE-SP-3',
        name: 'Inclusive Catalog Item 2',
        salePrice: 100,
        salePriceInclusive: 118,
        salePriceMode: 'INCLUSIVE',
        purchasePrice: 80,
        gstRate: 18,
      });

      const saveItemSpy = vi.spyOn(db, 'saveItem').mockReturnValue({} as any);

      act(() => {
        root!.render(
          <InvoiceItemModal
            isOpen={true}
            mode="purchase"
            onClose={vi.fn()}
            onSaveItem={vi.fn()}
            initialItem={{
              itemId: inclusiveCatalogItem.id,
              name: inclusiveCatalogItem.name,
              hsnSacCode: inclusiveCatalogItem.hsnSacCode,
              quantity: 1,
              unit: inclusiveCatalogItem.unit,
              unitPrice: 80,
              discountPercent: 0,
              gstRate: 18,
            }}
            itemsCatalog={[inclusiveCatalogItem]}
            isIntraState={true}
            isGstActive={true}
          />
        );
      });

      const salePriceInput = container!.querySelector('input[aria-label="Sale Price"]') as HTMLInputElement;

      act(() => {
        setInputValue(salePriceInput, '236');
      });

      const submitBtn = container!.querySelector('button[type="submit"]') as HTMLButtonElement;
      act(() => {
        submitBtn.click();
      });

      expect(saveItemSpy).toHaveBeenCalledTimes(1);
      const savedItem = saveItemSpy.mock.calls[0][0];
      expect(savedItem.id).toBe(inclusiveCatalogItem.id);
      expect(savedItem.salePriceInclusive).toBe(236);
      expect(savedItem.salePrice).toBe(200);

      saveItemSpy.mockRestore();
    });

    it('does not call db.saveItem when sale price is not changed', () => {
      const saveItemSpy = vi.spyOn(db, 'saveItem').mockReturnValue({} as any);

      act(() => {
        root!.render(
          <InvoiceItemModal
            isOpen={true}
            mode="purchase"
            onClose={vi.fn()}
            onSaveItem={vi.fn()}
            initialItem={{
              itemId: catalogItem.id,
              name: catalogItem.name,
              hsnSacCode: catalogItem.hsnSacCode,
              quantity: 1,
              unit: catalogItem.unit,
              unitPrice: 100,
              discountPercent: 0,
              gstRate: 18,
            }}
            itemsCatalog={[catalogItem]}
            isIntraState={true}
            isGstActive={true}
          />
        );
      });

      const submitBtn = container!.querySelector('button[type="submit"]') as HTMLButtonElement;
      act(() => {
        submitBtn.click();
      });

      expect(saveItemSpy).not.toHaveBeenCalled();
      saveItemSpy.mockRestore();
    });

    it('does not call db.saveItem for custom/non-catalog lines', () => {
      const saveItemSpy = vi.spyOn(db, 'saveItem').mockReturnValue({} as any);

      act(() => {
        root!.render(
          <InvoiceItemModal
            isOpen={true}
            mode="purchase"
            onClose={vi.fn()}
            onSaveItem={vi.fn()}
            initialItem={{
              itemId: 'CUSTOM-999',
              name: 'Ad-hoc Custom Purchase Item',
              hsnSacCode: '9999',
              quantity: 2,
              unit: 'PCS',
              unitPrice: 50,
              discountPercent: 0,
              gstRate: 18,
            }}
            itemsCatalog={[catalogItem]}
            isIntraState={true}
            isGstActive={true}
          />
        );
      });

      const submitBtn = container!.querySelector('button[type="submit"]') as HTMLButtonElement;
      act(() => {
        submitBtn.click();
      });

      expect(saveItemSpy).not.toHaveBeenCalled();
      saveItemSpy.mockRestore();
    });
  });
});
