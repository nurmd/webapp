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

vi.mock('../services/pouchdb.ts', () => ({
  pouch: {
    putDoc: vi.fn(),
    deleteDoc: vi.fn(),
    getAllDocs: vi.fn(async () => []),
    getSyncState: vi.fn(() => ({ isSyncing: false, isOnline: true })),
    subscribeSync: vi.fn(() => () => {}),
    syncNow: vi.fn(),
    startSync: vi.fn(),
    stopSync: vi.fn(),
    migrateFromLocalStorage: vi.fn(async () => {}),
  },
}));

import { InventoryItem } from '../models/item.ts';
import { InvoiceItemModal, InvoiceItemData } from '../components/Invoicing/InvoiceItemModal.tsx';

describe('GST Phase 3A — Shared Line Editor (InvoiceItemModal) Suite', () => {
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
  });

  function changeInput(input: HTMLInputElement, value: string) {
    const tracker = (input as any)._valueTracker;
    if (tracker) {
      tracker.setValue(value === '0' ? '1' : '0');
    }
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    nativeInputValueSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function changeSelect(select: HTMLSelectElement, value: string) {
    const nativeSelectValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
    nativeSelectValueSetter?.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const sampleCatalog: InventoryItem[] = [
    {
      id: 'ITM-001',
      name: 'Basmati Rice',
      salePrice: 100,
      salePriceInclusive: 105,
      salePriceMode: 'EXCLUSIVE',
      purchasePrice: 80,
      purchasePriceInclusive: 84,
      purchasePriceMode: 'EXCLUSIVE',
      unit: 'KGS',
      hsnSacCode: '100630',
      gstRate: 5,
      currentStock: 100,
      minStockAlert: 10,
      category: 'Grains',
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'ITM-002',
      name: 'Premium Soda Drink',
      salePrice: 100,
      salePriceInclusive: 118,
      salePriceMode: 'INCLUSIVE',
      purchasePrice: 200,
      purchasePriceInclusive: 236,
      purchasePriceMode: 'INCLUSIVE',
      unit: 'NOS',
      hsnSacCode: '2202',
      gstRate: 18,
      cessRate: 12,
      currentStock: 50,
      minStockAlert: 5,
      category: 'Beverages',
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  it('1. Inclusive load + CESS: render with initialItem (qty 1, unitPriceInclusive: 118, gstRate: 18, cessRate: 12, priceMode: "INCLUSIVE", 10% discount)', async () => {
    let savedData: InvoiceItemData | null = null;
    const onSaveItem = vi.fn((data: InvoiceItemData) => {
      savedData = data;
    });

    const initialItem: InvoiceItemData = {
      itemId: 'ITM-002',
      name: 'Premium Soda Drink',
      hsnSacCode: '2202',
      quantity: 1,
      unit: 'NOS',
      unitPrice: 100,
      unitPriceInclusive: 118,
      priceMode: 'INCLUSIVE',
      gstRate: 18,
      cessRate: 12,
      discountPercent: 10,
    };

    await act(async () => {
      root.render(
        <InvoiceItemModal
          isOpen={true}
          onClose={vi.fn()}
          onSaveItem={onSaveItem}
          initialItem={initialItem}
          itemsCatalog={sampleCatalog}
          isIntraState={true}
          isGstActive={true}
        />
      );
    });

    // Assert Taxable Value ₹90.00
    expect(container.textContent).toContain('90.00');
    // Assert GST ₹16.20
    expect(container.textContent).toContain('16.20');
    // Assert CESS ₹10.80
    expect(container.textContent).toContain('10.80');
    // Assert Total ₹117.00 in total input
    const totalInput = container.querySelector('#modal-item-total') as HTMLInputElement;
    expect(totalInput).not.toBeNull();
    expect(totalInput.value).toBe('117.00');

    // Submit form and verify saved payload
    const form = container.querySelector('form') as HTMLFormElement;
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(onSaveItem).toHaveBeenCalled();
    expect(savedData).not.toBeNull();
    expect(savedData!.unitPrice).toBe(100);
    expect(savedData!.unitPriceInclusive).toBe(118);
    expect(savedData!.priceMode).toBe('INCLUSIVE');
    expect(savedData!.cessRate).toBe(12);
    expect(savedData!.discountPercent).toBe(10);
    expect(savedData!.discountAmount).toBe(11.8);
  });

  it('2. Bidirectional sync + GST authority: exclusive 100 at 18% -> inclusive 118; enter inclusive 118 -> exclusive 100; change GST 12% -> inclusive 118, exclusive 105.36; enter exclusive 100 -> inclusive 112; change GST 18% -> inclusive 118, exclusive 100', async () => {
    await act(async () => {
      root.render(
        <InvoiceItemModal
          isOpen={true}
          onClose={vi.fn()}
          onSaveItem={vi.fn()}
          itemsCatalog={sampleCatalog}
          isIntraState={true}
          isGstActive={true}
        />
      );
    });

    const exclInput = container.querySelector('input[aria-label="Sale Price (Excl. GST)"]') as HTMLInputElement;
    const inclInput = container.querySelector('input[aria-label="Sale Price (Incl. GST)"]') as HTMLInputElement;
    const gstSelect = container.querySelector('select[aria-label="GST Tax Rate"]') as HTMLSelectElement;

    expect(exclInput).not.toBeNull();
    expect(inclInput).not.toBeNull();
    expect(gstSelect).not.toBeNull();

    // Default GST is 18%. Enter exclusive 100 -> inclusive becomes 118
    act(() => {
      changeInput(exclInput, '100');
    });
    expect(inclInput.value).toBe('118');

    // Enter inclusive 118 -> exclusive becomes 100 (now priceMode = INCLUSIVE)
    act(() => {
      changeInput(inclInput, '118');
    });
    expect(exclInput.value).toBe('100');

    // Change GST to 12% -> inclusive stays 118, exclusive becomes 105.36
    act(() => {
      changeSelect(gstSelect, '12');
    });
    expect(inclInput.value).toBe('118');
    expect(exclInput.value).toBe('105.36');

    // Enter exclusive 100 -> inclusive becomes 112 (now priceMode = EXCLUSIVE)
    act(() => {
      changeInput(exclInput, '100');
    });
    expect(inclInput.value).toBe('112');

    // Change GST back to 18% -> exclusive stays 100, inclusive becomes 118
    act(() => {
      changeSelect(gstSelect, '18');
    });
    expect(exclInput.value).toBe('100');
    expect(inclInput.value).toBe('118');
  });

  it('3. Discount on inclusive gross: inclusive 118, 10% -> discount ₹11.80, total ₹106.20 (no CESS). Switch to discount ₹10 -> percent 8.47, total ₹108.00', async () => {
    let savedData: InvoiceItemData | null = null;
    const onSaveItem = vi.fn((data: InvoiceItemData) => {
      savedData = data;
    });

    await act(async () => {
      root.render(
        <InvoiceItemModal
          isOpen={true}
          onClose={vi.fn()}
          onSaveItem={onSaveItem}
          itemsCatalog={sampleCatalog}
          isIntraState={true}
          isGstActive={true}
        />
      );
    });

    const nameInput = container.querySelector('input[placeholder*="Type item name"]') as HTMLInputElement;
    act(() => {
      changeInput(nameInput, 'Custom Item');
    });

    const inclInput = container.querySelector('input[aria-label="Sale Price (Incl. GST)"]') as HTMLInputElement;
    act(() => {
      changeInput(inclInput, '118');
    });

    // Enter 10% discount
    const discountInputs = Array.from(container.querySelectorAll('input[inputmode="decimal"]'));
    const discPercentInput = discountInputs[1] as HTMLInputElement;
    const discAmountInput = discountInputs[2] as HTMLInputElement;

    act(() => {
      changeInput(discPercentInput, '10');
    });

    expect(discAmountInput.value).toBe('11.80');
    const totalInput = container.querySelector('#modal-item-total') as HTMLInputElement;
    expect(totalInput.value).toBe('106.20');

    // Switch to discount ₹10
    act(() => {
      changeInput(discAmountInput, '10');
    });

    expect(discPercentInput.value).toBe('8.47');
    expect(totalInput.value).toBe('108.00');

    // Submit form and verify saved values
    const form = container.querySelector('form') as HTMLFormElement;
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(onSaveItem).toHaveBeenCalled();
    expect(savedData).not.toBeNull();
    expect(savedData!.discountPercent).toBe(8.47);
    expect(savedData!.discountAmount).toBe(10);
  });

  it('4. Total edit with CESS: inclusive 118, 10% discount, 12% CESS, total 117.00 -> rates remain 118/100. Then set total 100 with 0% discount/CESS -> inclusive 100, exclusive 84.75', async () => {
    const initialItem: InvoiceItemData = {
      itemId: 'ITM-002',
      name: 'Premium Soda Drink',
      hsnSacCode: '2202',
      quantity: 1,
      unit: 'NOS',
      unitPrice: 100,
      unitPriceInclusive: 118,
      priceMode: 'INCLUSIVE',
      gstRate: 18,
      cessRate: 12,
      discountPercent: 10,
    };

    await act(async () => {
      root.render(
        <InvoiceItemModal
          isOpen={true}
          onClose={vi.fn()}
          onSaveItem={vi.fn()}
          initialItem={initialItem}
          itemsCatalog={sampleCatalog}
          isIntraState={true}
          isGstActive={true}
        />
      );
    });

    const exclInput = container.querySelector('input[aria-label="Sale Price (Excl. GST)"]') as HTMLInputElement;
    const inclInput = container.querySelector('input[aria-label="Sale Price (Incl. GST)"]') as HTMLInputElement;
    const cessInput = container.querySelector('input[aria-label="CESS Rate (%)"]') as HTMLInputElement;
    const totalInput = container.querySelector('#modal-item-total') as HTMLInputElement;

    // Rates remain 118/100 initially at total 117.00
    expect(totalInput.value).toBe('117.00');
    expect(inclInput.value).toBe('118');
    expect(exclInput.value).toBe('100');

    // Now clear discount and CESS
    const discountInputs = Array.from(container.querySelectorAll('input[inputmode="decimal"]'));
    const discPercentInput = discountInputs[1] as HTMLInputElement;

    act(() => {
      changeInput(discPercentInput, '0');
      changeInput(cessInput, '0');
    });

    // Set total 100
    act(() => {
      changeInput(totalInput, '100');
    });

    // Inclusive rate becomes 100, exclusive becomes 84.75
    expect(inclInput.value).toBe('100');
    expect(exclInput.value).toBe('84.75');
  });

  it('5. Purchase mode: render mode="purchase" with a purchase item; labels and saved payload use purchase rates, priceMode, cessRate', async () => {
    let savedData: InvoiceItemData | null = null;
    const onSaveItem = vi.fn((data: InvoiceItemData) => {
      savedData = data;
    });

    await act(async () => {
      root.render(
        <InvoiceItemModal
          isOpen={true}
          onClose={vi.fn()}
          onSaveItem={onSaveItem}
          itemsCatalog={sampleCatalog}
          isIntraState={true}
          isGstActive={true}
          mode="purchase"
        />
      );
    });

    // Verify purchase labels
    const exclInput = container.querySelector('input[aria-label="Purchase Rate (Excl. GST)"]') as HTMLInputElement;
    const inclInput = container.querySelector('input[aria-label="Purchase Rate (Incl. GST)"]') as HTMLInputElement;
    expect(exclInput).not.toBeNull();
    expect(inclInput).not.toBeNull();

    // Select catalog item 'Premium Soda Drink' (which has purchasePrice: 200, purchasePriceInclusive: 236, purchasePriceMode: 'INCLUSIVE', cessRate: 12)
    const nameInput = container.querySelector('input[placeholder*="Type item name"]') as HTMLInputElement;
    act(() => {
      changeInput(nameInput, 'Premium Soda Drink');
    });

    // Click on suggestion
    const suggestionItem = Array.from(container.querySelectorAll('div.cursor-pointer')).find((el) =>
      el.textContent?.includes('Premium Soda Drink') && el.textContent?.includes('Stock:')
    );
    expect(suggestionItem).toBeDefined();
    act(() => {
      suggestionItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(inclInput.value).toBe('236');
    expect(exclInput.value).toBe('200');

    // Submit form and verify saved payload
    const form = container.querySelector('form') as HTMLFormElement;
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(onSaveItem).toHaveBeenCalled();
    expect(savedData).not.toBeNull();
    expect(savedData!.unitPrice).toBe(200);
    expect(savedData!.unitPriceInclusive).toBe(236);
    expect(savedData!.priceMode).toBe('INCLUSIVE');
    expect(savedData!.cessRate).toBe(12);
  });

  it('6. Legacy initial item: only unitPrice: 100, gstRate: 18 -> mode EXCLUSIVE, inclusive 118; save includes both fields', async () => {
    let savedData: InvoiceItemData | null = null;
    const onSaveItem = vi.fn((data: InvoiceItemData) => {
      savedData = data;
    });

    const legacyItem: InvoiceItemData = {
      itemId: 'LEGACY-001',
      name: 'Old Stock Item',
      hsnSacCode: '8471',
      quantity: 1,
      unit: 'PCS',
      unitPrice: 100,
      discountPercent: 0,
      gstRate: 18,
    };

    await act(async () => {
      root.render(
        <InvoiceItemModal
          isOpen={true}
          onClose={vi.fn()}
          onSaveItem={onSaveItem}
          initialItem={legacyItem}
          itemsCatalog={sampleCatalog}
          isIntraState={true}
          isGstActive={true}
        />
      );
    });

    const exclInput = container.querySelector('input[aria-label="Sale Price (Excl. GST)"]') as HTMLInputElement;
    const inclInput = container.querySelector('input[aria-label="Sale Price (Incl. GST)"]') as HTMLInputElement;

    expect(exclInput.value).toBe('100');
    expect(inclInput.value).toBe('118');

    // Submit form and verify both fields saved
    const form = container.querySelector('form') as HTMLFormElement;
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(onSaveItem).toHaveBeenCalled();
    expect(savedData).not.toBeNull();
    expect(savedData!.unitPrice).toBe(100);
    expect(savedData!.unitPriceInclusive).toBe(118);
    expect(savedData!.priceMode).toBe('EXCLUSIVE');
    expect(savedData!.cessRate).toBe(0);
  });

  it('7. GST inactive: only one price input; save unitPriceInclusive == unitPrice, priceMode: "EXCLUSIVE", cessRate: 0', async () => {
    let savedData: InvoiceItemData | null = null;
    const onSaveItem = vi.fn((data: InvoiceItemData) => {
      savedData = data;
    });

    await act(async () => {
      root.render(
        <InvoiceItemModal
          isOpen={true}
          onClose={vi.fn()}
          onSaveItem={onSaveItem}
          itemsCatalog={sampleCatalog}
          isIntraState={true}
          isGstActive={false}
        />
      );
    });

    // Inclusive input and mode toggle should not be present
    const inclInput = container.querySelector('input[aria-label="Sale Price (Incl. GST)"]');
    const exclToggle = container.querySelector('button[aria-pressed]');
    expect(inclInput).toBeNull();
    expect(exclToggle).toBeNull();

    // Enter name & price
    const nameInput = container.querySelector('input[placeholder*="Type item name"]') as HTMLInputElement;
    act(() => {
      changeInput(nameInput, 'Non-GST Item');
    });

    const priceInput = container.querySelector('input[placeholder="0.00"]') as HTMLInputElement;
    act(() => {
      changeInput(priceInput, '250');
    });

    // Submit form and verify save payload
    const form = container.querySelector('form') as HTMLFormElement;
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(onSaveItem).toHaveBeenCalled();
    expect(savedData).not.toBeNull();
    expect(savedData!.unitPrice).toBe(250);
    expect(savedData!.unitPriceInclusive).toBe(250);
    expect(savedData!.priceMode).toBe('EXCLUSIVE');
    expect(savedData!.cessRate).toBe(0);
  });
});
