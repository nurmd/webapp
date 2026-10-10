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
import { CustomItemModal } from '../components/POS/CustomItemModal.tsx';

describe('Bill Item Quantity and Discount Enhancements', () => {
  let container: HTMLDivElement;
  let root: Root;

  function changeInput(input: HTMLInputElement, value: string) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    nativeInputValueSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const sampleCatalog: InventoryItem[] = [
    {
      id: 'ITM-001',
      name: 'Basmati Rice',
      salePrice: 150,
      purchasePrice: 120,
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
      name: 'Sunflower Cooking Oil',
      salePrice: 200,
      purchasePrice: 170,
      unit: 'LTR',
      hsnSacCode: '151219',
      gstRate: 5,
      currentStock: 50,
      minStockAlert: 5,
      category: 'Oils',
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

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

  it('TC-QTY-01: When adding a new item, quantity starts empty so user can input directly', async () => {
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

    const qtyInput = container.querySelector('input[inputmode="decimal"]') as HTMLInputElement;
    expect(qtyInput).not.toBeNull();
    // Quantity starts empty so user can type directly, with placeholder '1' (defaults to 1 if left empty)
    expect(qtyInput.value).toBe('');
    expect(qtyInput.placeholder).toBe('1');
  });

  it('TC-QTY-02: Quantity input has no increment or decrement (+ / -) buttons', async () => {
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

    // Check all buttons inside modal
    const allButtons = Array.from(container.querySelectorAll('button'));
    const incrementBtn = allButtons.find((btn) => btn.textContent?.trim() === '+');
    const decrementBtn = allButtons.find((btn) => btn.textContent?.trim() === '-');

    expect(incrementBtn).toBeUndefined();
    expect(decrementBtn).toBeUndefined();
  });

  it('TC-QTY-03: User can input decimal quantity (e.g. 2.5 KGS) and calculates accurately', async () => {
    let savedItem: InvoiceItemData | null = null;
    const onSaveItem = vi.fn((item) => {
      savedItem = item;
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

    // 1. Enter Name
    const nameInput = container.querySelector('input[placeholder*="Type item name"]') as HTMLInputElement;
    act(() => {
      changeInput(nameInput, 'Organic Wheat');
    });

    // 2. Enter Decimal Quantity 2.5
    const qtyInput = container.querySelector('input[inputmode="decimal"]') as HTMLInputElement;
    act(() => {
      changeInput(qtyInput, '2.5');
    });

    // 3. Enter Price 100
    const priceInput = container.querySelector('input[placeholder="0.00"]') as HTMLInputElement;
    act(() => {
      changeInput(priceInput, '100');
    });

    // 4. Submit form
    const form = container.querySelector('form') as HTMLFormElement;
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(onSaveItem).toHaveBeenCalled();
    expect(savedItem).not.toBeNull();
    expect(savedItem!.quantity).toBe(2.5);
    expect(savedItem!.unitPrice).toBe(100);
  });

  it('TC-DISC-01: When discount amount is given, calculates decimal discount percent cleanly', async () => {
    let savedItem: InvoiceItemData | null = null;
    const onSaveItem = vi.fn((item) => {
      savedItem = item;
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

    // Name
    const nameInput = container.querySelector('input[placeholder*="Type item name"]') as HTMLInputElement;
    act(() => {
      changeInput(nameInput, 'Test Item');
    });

    // Qty = 1
    const qtyInput = container.querySelector('input[inputmode="decimal"]') as HTMLInputElement;
    act(() => {
      changeInput(qtyInput, '1');
    });

    // Unit Price = 150
    const priceInput = container.querySelector('input[placeholder="0.00"]') as HTMLInputElement;
    act(() => {
      changeInput(priceInput, '150');
    });

    // Discount inputs
    const discountInputs = Array.from(container.querySelectorAll('input[inputmode="decimal"]'));
    const discPercentInput = discountInputs[1] as HTMLInputElement;
    const discAmountInput = discountInputs[2] as HTMLInputElement;

    expect(discPercentInput).toBeDefined();
    expect(discAmountInput).toBeDefined();

    // Enter discount amount ₹10 on ₹150 gross:
    // (10 / 150) * 100 = 6.6666...% -> formatted as 6.67%
    act(() => {
      changeInput(discAmountInput, '10');
    });

    expect(discPercentInput.value).toBe('6.67');

    // Submit form and verify exact discountAmount preservation
    const form = container.querySelector('form') as HTMLFormElement;
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(onSaveItem).toHaveBeenCalled();
    expect(savedItem!.discountPercent).toBe(6.67);
    expect(savedItem!.discountAmount).toBe(10);
  });

  it('TC-DISC-02: Decimal discount percent (e.g. 2.5%) calculates discount amount accurately', async () => {
    let savedItem: InvoiceItemData | null = null;
    const onSaveItem = vi.fn((item) => {
      savedItem = item;
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

    const nameInput = container.querySelector('input[placeholder*="Type item name"]') as HTMLInputElement;
    act(() => {
      changeInput(nameInput, 'Cotton Shirt');
    });

    // Qty = 2
    const qtyInput = container.querySelectorAll('input[inputmode="decimal"]')[0] as HTMLInputElement;
    act(() => {
      changeInput(qtyInput, '2');
    });

    // Price = 500 -> Gross = 1000
    const priceInput = container.querySelector('input[placeholder="0.00"]') as HTMLInputElement;
    act(() => {
      changeInput(priceInput, '500');
    });

    // Discount Percent = 2.5%
    const discPercentInput = container.querySelectorAll('input[inputmode="decimal"]')[1] as HTMLInputElement;
    const discAmountInput = container.querySelectorAll('input[inputmode="decimal"]')[2] as HTMLInputElement;

    act(() => {
      changeInput(discPercentInput, '2.5');
    });

    // 2.5% of 1000 = 25.00
    expect(discAmountInput.value).toBe('25.00');

    const form = container.querySelector('form') as HTMLFormElement;
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(savedItem!.discountPercent).toBe(2.5);
    expect(savedItem!.discountAmount).toBe(25);
  });

  it('TC-CUSTOM-01: CustomItemModal quantity starts empty and supports decimal quantities', async () => {
    let addedItem: InventoryItem | null = null;
    let addedQty: number | null = null;
    const onAddCustomItem = vi.fn((item, qty) => {
      addedItem = item;
      addedQty = qty;
    });

    await act(async () => {
      root.render(
        <CustomItemModal
          isOpen={true}
          onClose={vi.fn()}
          onAddCustomItem={onAddCustomItem}
        />
      );
    });

    const qtyInput = container.querySelector('input[inputmode="decimal"]') as HTMLInputElement;
    expect(qtyInput).not.toBeNull();
    expect(qtyInput.value).toBe('');

    // Enter name
    const nameInput = container.querySelector('input[placeholder*="Gift Wrapping"]') as HTMLInputElement;
    act(() => {
      changeInput(nameInput, 'Special Packaging');
    });

    // Enter price
    const priceInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    act(() => {
      changeInput(priceInput, '45');
    });

    // Enter decimal quantity 1.5
    act(() => {
      changeInput(qtyInput, '1.5');
    });

    const form = container.querySelector('form') as HTMLFormElement;
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(onAddCustomItem).toHaveBeenCalled();
    expect(addedQty).toBe(1.5);
    expect(addedItem!.name).toBe('Special Packaging');
  });

  it('TC-QTY-04: When quantity is left empty, assumes 1 upon adding item to bill and saving', async () => {
    let savedItem: InvoiceItemData | null = null;
    const onSaveItem = vi.fn((item) => {
      savedItem = item;
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

    // 1. Enter Name
    const nameInput = container.querySelector('input[placeholder*="Type item name"]') as HTMLInputElement;
    act(() => {
      changeInput(nameInput, 'Cotton Towel');
    });

    // 2. Enter Price 120
    const priceInput = container.querySelector('input[placeholder="0.00"]') as HTMLInputElement;
    act(() => {
      changeInput(priceInput, '120');
    });

    // 3. Leave quantity empty (value is '')
    const qtyInput = container.querySelector('input[inputmode="decimal"]') as HTMLInputElement;
    expect(qtyInput.value).toBe('');

    // 4. Submit form
    const form = container.querySelector('form') as HTMLFormElement;
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    // Verified: savedItem received quantity = 1
    expect(onSaveItem).toHaveBeenCalled();
    expect(savedItem).not.toBeNull();
    expect(savedItem!.quantity).toBe(1);
    expect(savedItem!.unitPrice).toBe(120);
  });

  it('TC-DUP-01: Quick item creation modal triggers duplicate alert for lowercase item duplicate', async () => {
    await act(async () => {
      root.render(
        <InvoiceItemModal
          isOpen={true}
          onClose={vi.fn()}
          onSaveItem={vi.fn()}
          itemsCatalog={sampleCatalog} // has 'Basmati Rice'
          isIntraState={true}
          isGstActive={false}
        />
      );
    });

    // Open quick add item modal with a lowercase duplicate name
    const nameInput = container.querySelector('input[placeholder*="Type item name"]') as HTMLInputElement;
    act(() => {
      changeInput(nameInput, 'basmati rice');
    });

    // Dropdown should not show + Add New Item when exact case-insensitive match exists
    expect(container.textContent).not.toContain('+ Add New Item');
  });

  it('TC-DUP-02: Quick item creation form blocks duplicate lowercase item, disables button, and displays warning', async () => {
    const onItemCreated = vi.fn();
    await act(async () => {
      root.render(
        <InvoiceItemModal
          isOpen={true}
          onClose={vi.fn()}
          onSaveItem={vi.fn()}
          onItemCreated={onItemCreated}
          itemsCatalog={sampleCatalog} // has 'Basmati Rice'
          isIntraState={true}
          isGstActive={false}
        />
      );
    });

    // 1. Search for unique name so "+ Add New Item" appears
    const nameInput = container.querySelector('input[placeholder*="Type item name"]') as HTMLInputElement;
    act(() => {
      nameInput.focus();
      changeInput(nameInput, 'Brand New Item');
    });

    // 2. Click "+ Add New Item" button in search dropdown
    const addBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('+ Add New Item')
    ) as HTMLButtonElement;
    expect(addBtn).toBeTruthy();
    act(() => {
      addBtn.click();
    });

    // Quick create modal is now open. Locate quick item name input
    const quickNameInput = container.querySelector('input[placeholder*="Wireless Mouse"]') as HTMLInputElement;
    expect(quickNameInput).toBeTruthy();

    // 3. Change quick item name to lowercase existing item: 'basmati rice'
    act(() => {
      changeInput(quickNameInput, '   basmati rice   ');
    });

    // 4. Verify duplicate warning alert is rendered
    expect(container.textContent).toContain('An item with this name already exists in inventory');

    // 5. Verify the "Save & Use in Bill" button is strictly disabled
    const saveAndUseBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Save & Use in Bill')
    ) as HTMLButtonElement;
    expect(saveAndUseBtn).toBeTruthy();
    expect(saveAndUseBtn.disabled).toBe(true);

    // 6. Attempt form submission -> strictly blocked
    const quickForm = quickNameInput.closest('form');
    expect(quickForm).toBeTruthy();
    act(() => {
      quickForm?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(onItemCreated).not.toHaveBeenCalled();
  });

  it('TC-DUP-03: Dispatches app_show_toast event when duplicate item name is entered', async () => {
    const toastSpy = vi.fn();
    window.addEventListener('app_show_toast', toastSpy);

    await act(async () => {
      root.render(
        <InvoiceItemModal
          isOpen={true}
          onClose={vi.fn()}
          onSaveItem={vi.fn()}
          itemsCatalog={sampleCatalog} // has 'Basmati Rice'
          isIntraState={true}
          isGstActive={false}
        />
      );
    });

    // Open quick modal
    const nameInput = container.querySelector('input[placeholder*="Type item name"]') as HTMLInputElement;
    act(() => {
      nameInput.focus();
      changeInput(nameInput, 'Unique Widget');
    });
    const addBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('+ Add New Item')
    ) as HTMLButtonElement;
    expect(addBtn).toBeTruthy();
    act(() => {
      addBtn.click();
    });

    const quickNameInput = container.querySelector('input[placeholder*="Wireless Mouse"]') as HTMLInputElement;
    expect(quickNameInput).toBeTruthy();
    act(() => {
      changeInput(quickNameInput, 'basmati rice');
    });

    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: 'An item with this name already exists in inventory',
      })
    );

    window.removeEventListener('app_show_toast', toastSpy);
  });

  it('TC-DUP-04: Ignores ad-hoc items in CustomItemModal and allows submission even if name matches catalog', async () => {
    const onAddCustomItem = vi.fn();
    await act(async () => {
      root.render(
        <CustomItemModal
          isOpen={true}
          onClose={vi.fn()}
          onAddCustomItem={onAddCustomItem}
        />
      );
    });

    const nameInput = container.querySelector('input[placeholder*="Gift Wrapping"]') as HTMLInputElement;
    const priceInput = container.querySelector('input[placeholder="0.00"]') as HTMLInputElement;
    const qtyInput = container.querySelector('input[inputmode="decimal"]') as HTMLInputElement;

    expect(nameInput).toBeTruthy();
    expect(priceInput).toBeTruthy();
    expect(qtyInput).toBeTruthy();

    // Type a name matching catalog item
    act(() => {
      changeInput(nameInput, 'Basmati Rice');
      changeInput(priceInput, '250');
      // Leave qty empty
      changeInput(qtyInput, '');
    });

    // Submit button should NOT be disabled
    const submitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add to Bill')
    ) as HTMLButtonElement;
    expect(submitBtn).toBeTruthy();
    expect(submitBtn.disabled).toBe(false);

    // Submit form -> empty qty defaults to 1, ad-hoc item added successfully
    const form = container.querySelector('form');
    act(() => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(onAddCustomItem).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Basmati Rice',
        salePrice: 250,
      }),
      1
    );
  });
});
