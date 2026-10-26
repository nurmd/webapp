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
import { ItemFormModal } from '../components/Inventory/ItemFormModal.tsx';

describe('GST Phase 2 — Item Form Pricing Modes Suite', () => {
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
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    nativeInputValueSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  it('1. New item sync: at 18% GST, enter sale exclusive 100 -> inclusive shows 118; enter sale inclusive 236 -> exclusive shows 200; purchase 50 -> 59', async () => {
    await act(async () => {
      root.render(
        <ItemFormModal
          isOpen={true}
          onClose={vi.fn()}
          editingItem={null}
          onSaveItem={vi.fn()}
          isGstActive={true}
        />
      );
    });

    const saleExclInput = container.querySelector('input[aria-label="Sale Price (Excl. GST)"]') as HTMLInputElement;
    const saleInclInput = container.querySelector('input[aria-label="Sale Price (Incl. GST)"]') as HTMLInputElement;
    const purchExclInput = container.querySelector('input[aria-label="Purchase Price (Excl. GST)"]') as HTMLInputElement;
    const purchInclInput = container.querySelector('input[aria-label="Purchase Price (Incl. GST)"]') as HTMLInputElement;

    expect(saleExclInput).toBeTruthy();
    expect(saleInclInput).toBeTruthy();
    expect(purchExclInput).toBeTruthy();
    expect(purchInclInput).toBeTruthy();

    // Enter sale exclusive 100 -> inclusive shows 118
    act(() => {
      changeInput(saleExclInput, '100');
    });
    expect(saleInclInput.value).toBe('118');

    // Enter sale inclusive 236 -> exclusive shows 200
    act(() => {
      changeInput(saleInclInput, '236');
    });
    expect(saleExclInput.value).toBe('200');

    // Enter purchase exclusive 50 -> inclusive shows 59
    act(() => {
      changeInput(purchExclInput, '50');
    });
    expect(purchInclInput.value).toBe('59');
  });

  it('2. Last-edited authoritative: enter sale inclusive 100 -> exclusive 84.75; click GST 12% -> exclusive becomes 89.29, inclusive stays 100; enter exclusive 100 -> inclusive 112; click GST 18% -> inclusive 118, exclusive stays 100', async () => {
    await act(async () => {
      root.render(
        <ItemFormModal
          isOpen={true}
          onClose={vi.fn()}
          editingItem={null}
          onSaveItem={vi.fn()}
          isGstActive={true}
        />
      );
    });

    const saleExclInput = container.querySelector('input[aria-label="Sale Price (Excl. GST)"]') as HTMLInputElement;
    const saleInclInput = container.querySelector('input[aria-label="Sale Price (Incl. GST)"]') as HTMLInputElement;

    // Enter sale inclusive 100 -> exclusive becomes 84.75
    act(() => {
      changeInput(saleInclInput, '100');
    });
    expect(saleExclInput.value).toBe('84.75');
    expect(saleInclInput.value).toBe('100');
    expect(container.textContent).toContain('Last edited: Incl. GST');

    // Click GST 12% -> exclusive becomes 89.29 (100 * 100 / 112 = 89.2857 -> 89.29), inclusive stays 100
    const btn12 = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === '12%');
    expect(btn12).toBeTruthy();
    act(() => {
      btn12?.click();
    });
    expect(saleExclInput.value).toBe('89.29');
    expect(saleInclInput.value).toBe('100');

    // Enter exclusive 100 -> inclusive becomes 112
    act(() => {
      changeInput(saleExclInput, '100');
    });
    expect(saleExclInput.value).toBe('100');
    expect(saleInclInput.value).toBe('112');
    expect(container.textContent).toContain('Last edited: Excl. GST');

    // Click GST 18% -> inclusive becomes 118, exclusive stays 100
    const btn18 = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === '18%');
    expect(btn18).toBeTruthy();
    act(() => {
      btn18?.click();
    });
    expect(saleExclInput.value).toBe('100');
    expect(saleInclInput.value).toBe('118');
  });

  it('3. Save payload: enter name, sale exclusive 100, purchase inclusive 118, GST 18%, CESS 12%, submit; assert onSaveItem receives correct payload', async () => {
    const onSaveItem = vi.fn();
    await act(async () => {
      root.render(
        <ItemFormModal
          isOpen={true}
          onClose={vi.fn()}
          editingItem={null}
          onSaveItem={onSaveItem}
          isGstActive={true}
        />
      );
    });

    const nameInput = container.querySelector('input[placeholder*="Basmati Rice"]') as HTMLInputElement;
    const saleExclInput = container.querySelector('input[aria-label="Sale Price (Excl. GST)"]') as HTMLInputElement;
    const purchInclInput = container.querySelector('input[aria-label="Purchase Price (Incl. GST)"]') as HTMLInputElement;
    const cessInput = container.querySelector('input[placeholder="0.00"]') as HTMLInputElement;

    act(() => {
      changeInput(nameInput, 'Roasted Almonds 200g');
      changeInput(saleExclInput, '100');
      changeInput(purchInclInput, '118');
      changeInput(cessInput, '12');
    });

    const btn18 = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === '18%');
    act(() => {
      btn18?.click();
    });

    const form = container.querySelector('form')!;
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(onSaveItem).toHaveBeenCalledTimes(1);
    const saved = onSaveItem.mock.calls[0][0] as InventoryItem;
    expect(saved.name).toBe('Roasted Almonds 200g');
    expect(saved.salePrice).toBe(100);
    expect(saved.salePriceInclusive).toBe(118);
    expect(saved.salePriceMode).toBe('EXCLUSIVE');
    expect(saved.purchasePrice).toBe(100); // 118 inclusive @ 18% GST -> 100 exclusive
    expect(saved.purchasePriceInclusive).toBe(118);
    expect(saved.purchasePriceMode).toBe('INCLUSIVE');
    expect(saved.gstRate).toBe(18);
    expect(saved.cessRate).toBe(12);
  });

  it('4. Legacy edit: item with only salePrice: 100, purchasePrice: 50, gstRate: 18 loads exclusive 100/50, inclusive 118/59, modes EXCLUSIVE; save preserves both', async () => {
    const legacyItem: InventoryItem = {
      id: 'legacy-item-1',
      name: 'Legacy Widget',
      category: 'General',
      unit: 'PCS',
      salePrice: 100,
      purchasePrice: 50,
      gstRate: 18,
      hsnSacCode: '844332',
      currentStock: 25,
      minStockAlert: 5,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const onSaveItem = vi.fn();
    await act(async () => {
      root.render(
        <ItemFormModal
          isOpen={true}
          onClose={vi.fn()}
          editingItem={legacyItem}
          onSaveItem={onSaveItem}
          isGstActive={true}
        />
      );
    });

    const saleExclInput = container.querySelector('input[aria-label="Sale Price (Excl. GST)"]') as HTMLInputElement;
    const saleInclInput = container.querySelector('input[aria-label="Sale Price (Incl. GST)"]') as HTMLInputElement;
    const purchExclInput = container.querySelector('input[aria-label="Purchase Price (Excl. GST)"]') as HTMLInputElement;
    const purchInclInput = container.querySelector('input[aria-label="Purchase Price (Incl. GST)"]') as HTMLInputElement;

    expect(saleExclInput.value).toBe('100');
    expect(saleInclInput.value).toBe('118');
    expect(purchExclInput.value).toBe('50');
    expect(purchInclInput.value).toBe('59');

    const form = container.querySelector('form')!;
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(onSaveItem).toHaveBeenCalledTimes(1);
    const saved = onSaveItem.mock.calls[0][0] as InventoryItem;
    expect(saved.salePrice).toBe(100);
    expect(saved.salePriceInclusive).toBe(118);
    expect(saved.salePriceMode).toBe('EXCLUSIVE');
    expect(saved.purchasePrice).toBe(50);
    expect(saved.purchasePriceInclusive).toBe(59);
    expect(saved.purchasePriceMode).toBe('EXCLUSIVE');
  });

  it('5. GST inactive: no inclusive inputs/labels; save salePrice: 100, purchasePrice: 50, inclusive 100/50, modes EXCLUSIVE', async () => {
    const onSaveItem = vi.fn();
    await act(async () => {
      root.render(
        <ItemFormModal
          isOpen={true}
          onClose={vi.fn()}
          editingItem={null}
          onSaveItem={onSaveItem}
          isGstActive={false}
        />
      );
    });

    // Assert no inclusive inputs or labels exist
    expect(container.querySelector('input[aria-label="Sale Price (Incl. GST)"]')).toBeNull();
    expect(container.querySelector('input[aria-label="Purchase Price (Incl. GST)"]')).toBeNull();
    expect(container.textContent).not.toContain('Incl. GST');

    const nameInput = container.querySelector('input[placeholder*="Basmati Rice"]') as HTMLInputElement;
    const saleExclInput = container.querySelector('input[aria-label="Sale Price (Excl. GST)"]') as HTMLInputElement;
    const purchExclInput = container.querySelector('input[aria-label="Purchase Price (Excl. GST)"]') as HTMLInputElement;

    act(() => {
      changeInput(nameInput, 'GST Exempt Item');
      changeInput(saleExclInput, '100');
      changeInput(purchExclInput, '50');
    });

    const form = container.querySelector('form')!;
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(onSaveItem).toHaveBeenCalledTimes(1);
    const saved = onSaveItem.mock.calls[0][0] as InventoryItem;
    expect(saved.salePrice).toBe(100);
    expect(saved.purchasePrice).toBe(50);
    expect(saved.salePriceInclusive).toBe(100);
    expect(saved.purchasePriceInclusive).toBe(50);
    expect(saved.salePriceMode).toBe('EXCLUSIVE');
    expect(saved.purchasePriceMode).toBe('EXCLUSIVE');
  });

  it('6. CESS note: form contains "Inclusive price covers GST only. CESS is added on top."; entering inclusive 118 yields exclusive 100; CESS 12 saves', async () => {
    const onSaveItem = vi.fn();
    await act(async () => {
      root.render(
        <ItemFormModal
          isOpen={true}
          onClose={vi.fn()}
          editingItem={null}
          onSaveItem={onSaveItem}
          isGstActive={true}
        />
      );
    });

    expect(container.textContent).toContain('Inclusive price covers GST only. CESS is added on top.');

    const nameInput = container.querySelector('input[placeholder*="Basmati Rice"]') as HTMLInputElement;
    const saleExclInput = container.querySelector('input[aria-label="Sale Price (Excl. GST)"]') as HTMLInputElement;
    const saleInclInput = container.querySelector('input[aria-label="Sale Price (Incl. GST)"]') as HTMLInputElement;
    const cessInput = container.querySelector('input[placeholder="0.00"]') as HTMLInputElement;

    act(() => {
      changeInput(nameInput, 'Aerated Soft Drink 2L');
      changeInput(saleInclInput, '118');
      changeInput(cessInput, '12');
    });

    expect(saleExclInput.value).toBe('100');

    const form = container.querySelector('form')!;
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(onSaveItem).toHaveBeenCalledTimes(1);
    const saved = onSaveItem.mock.calls[0][0] as InventoryItem;
    expect(saved.salePrice).toBe(100);
    expect(saved.salePriceInclusive).toBe(118);
    expect(saved.cessRate).toBe(12);
  });

  it('7. Negative input guard: entering -5 in either price field results in 0/non-negative values', async () => {
    await act(async () => {
      root.render(
        <ItemFormModal
          isOpen={true}
          onClose={vi.fn()}
          editingItem={null}
          onSaveItem={vi.fn()}
          isGstActive={true}
        />
      );
    });

    const saleExclInput = container.querySelector('input[aria-label="Sale Price (Excl. GST)"]') as HTMLInputElement;
    const saleInclInput = container.querySelector('input[aria-label="Sale Price (Incl. GST)"]') as HTMLInputElement;
    const purchExclInput = container.querySelector('input[aria-label="Purchase Price (Excl. GST)"]') as HTMLInputElement;
    const purchInclInput = container.querySelector('input[aria-label="Purchase Price (Incl. GST)"]') as HTMLInputElement;

    act(() => {
      changeInput(saleExclInput, '-5');
    });
    expect(Number(saleExclInput.value)).toBe(0);
    expect(Number(saleExclInput.value) >= 0).toBe(true);

    act(() => {
      changeInput(saleInclInput, '-5');
    });
    expect(Number(saleInclInput.value)).toBe(0);
    expect(Number(saleInclInput.value) >= 0).toBe(true);

    act(() => {
      changeInput(purchExclInput, '-5');
    });
    expect(Number(purchExclInput.value)).toBe(0);
    expect(Number(purchExclInput.value) >= 0).toBe(true);

    act(() => {
      changeInput(purchInclInput, '-5');
    });
    expect(Number(purchInclInput.value)).toBe(0);
    expect(Number(purchInclInput.value) >= 0).toBe(true);
  });

  describe('8. Enforce last-edited authority when loading an existing item with inconsistent pairs', () => {
    it('INCLUSIVE mode authority: derives exclusive from stored inclusive price and ignores inconsistent stored exclusive price (sale and purchase)', async () => {
      const inconsistentItem: InventoryItem = {
        id: 'inconsistent-incl-1',
        name: 'Inconsistent Incl Item',
        category: 'General',
        unit: 'PCS',
        gstRate: 18,
        hsnSacCode: '844332',
        currentStock: 10,
        minStockAlert: 2,
        // Inconsistent values:
        salePriceMode: 'INCLUSIVE',
        salePriceInclusive: 118,
        salePrice: 999, // Inconsistent! Should be 100
        purchasePriceMode: 'INCLUSIVE',
        purchasePriceInclusive: 236,
        purchasePrice: 888, // Inconsistent! Should be 200
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };

      const onSaveItem = vi.fn();
      await act(async () => {
        root.render(
          <ItemFormModal
            isOpen={true}
            onClose={vi.fn()}
            editingItem={inconsistentItem}
            onSaveItem={onSaveItem}
            isGstActive={true}
          />
        );
      });

      const saleExclInput = container.querySelector('input[aria-label="Sale Price (Excl. GST)"]') as HTMLInputElement;
      const saleInclInput = container.querySelector('input[aria-label="Sale Price (Incl. GST)"]') as HTMLInputElement;
      const purchExclInput = container.querySelector('input[aria-label="Purchase Price (Excl. GST)"]') as HTMLInputElement;
      const purchInclInput = container.querySelector('input[aria-label="Purchase Price (Incl. GST)"]') as HTMLInputElement;

      // Authoritative INCLUSIVE field wins; exclusive is re-derived
      expect(saleInclInput.value).toBe('118');
      expect(saleExclInput.value).toBe('100'); // 999 ignored
      expect(purchInclInput.value).toBe('236');
      expect(purchExclInput.value).toBe('200'); // 888 ignored

      // Submit and verify saved payload preserves authoritative values
      const form = container.querySelector('form')!;
      act(() => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(onSaveItem).toHaveBeenCalledTimes(1);
      const saved = onSaveItem.mock.calls[0][0] as InventoryItem;
      expect(saved.salePrice).toBe(100);
      expect(saved.salePriceInclusive).toBe(118);
      expect(saved.salePriceMode).toBe('INCLUSIVE');
      expect(saved.purchasePrice).toBe(200);
      expect(saved.purchasePriceInclusive).toBe(236);
      expect(saved.purchasePriceMode).toBe('INCLUSIVE');
    });

    it('EXCLUSIVE mode authority: derives inclusive from stored exclusive price and ignores inconsistent stored inclusive price (sale and purchase)', async () => {
      const inconsistentItem: InventoryItem = {
        id: 'inconsistent-excl-1',
        name: 'Inconsistent Excl Item',
        category: 'General',
        unit: 'PCS',
        gstRate: 18,
        hsnSacCode: '844332',
        currentStock: 10,
        minStockAlert: 2,
        // Inconsistent values:
        salePriceMode: 'EXCLUSIVE',
        salePrice: 100,
        salePriceInclusive: 999, // Inconsistent! Should be 118
        purchasePriceMode: 'EXCLUSIVE',
        purchasePrice: 50,
        purchasePriceInclusive: 888, // Inconsistent! Should be 59
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };

      const onSaveItem = vi.fn();
      await act(async () => {
        root.render(
          <ItemFormModal
            isOpen={true}
            onClose={vi.fn()}
            editingItem={inconsistentItem}
            onSaveItem={onSaveItem}
            isGstActive={true}
          />
        );
      });

      const saleExclInput = container.querySelector('input[aria-label="Sale Price (Excl. GST)"]') as HTMLInputElement;
      const saleInclInput = container.querySelector('input[aria-label="Sale Price (Incl. GST)"]') as HTMLInputElement;
      const purchExclInput = container.querySelector('input[aria-label="Purchase Price (Excl. GST)"]') as HTMLInputElement;
      const purchInclInput = container.querySelector('input[aria-label="Purchase Price (Incl. GST)"]') as HTMLInputElement;

      // Authoritative EXCLUSIVE field wins; inclusive is re-derived
      expect(saleExclInput.value).toBe('100');
      expect(saleInclInput.value).toBe('118'); // 999 ignored
      expect(purchExclInput.value).toBe('50');
      expect(purchInclInput.value).toBe('59'); // 888 ignored

      // Submit and verify saved payload preserves authoritative values
      const form = container.querySelector('form')!;
      act(() => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(onSaveItem).toHaveBeenCalledTimes(1);
      const saved = onSaveItem.mock.calls[0][0] as InventoryItem;
      expect(saved.salePrice).toBe(100);
      expect(saved.salePriceInclusive).toBe(118);
      expect(saved.salePriceMode).toBe('EXCLUSIVE');
      expect(saved.purchasePrice).toBe(50);
      expect(saved.purchasePriceInclusive).toBe(59);
      expect(saved.purchasePriceMode).toBe('EXCLUSIVE');
    });
  });
});
