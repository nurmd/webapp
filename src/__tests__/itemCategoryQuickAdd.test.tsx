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

// Mock pouchdb
vi.mock('../services/pouchdb.ts', () => ({
  pouch: {
    putDoc: vi.fn(),
    deleteDoc: vi.fn(),
    getAllDocs: vi.fn(async () => []),
    getSyncState: vi.fn(() => ({ status: 'offline', remoteUrl: '', pendingChanges: 0 })),
    subscribeSync: vi.fn(() => () => {}),
    syncNow: vi.fn(async () => {}),
    startSync: vi.fn(),
    stopSync: vi.fn(),
    migrateFromLocalStorage: vi.fn(async () => {}),
  },
}));

// Mock auditTrail
vi.mock('../services/auditTrail.ts', () => ({
  auditTrail: {
    logEvent: vi.fn(async () => {}),
    getRecentLogs: vi.fn(async () => []),
    getLogsByDocument: vi.fn(async () => []),
  },
}));

import { db } from '../services/db.ts';
import { InventoryItem } from '../models/item.ts';
import { ItemFormModal } from '../components/Inventory/ItemFormModal.tsx';
import { CategorySelector } from '../components/Inventory/CategorySelector.tsx';

function changeInput(input: HTMLInputElement, value: string) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  nativeInputValueSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('Item Category Quick-Add (P1 Fix)', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    testStorage.clear();
    (db as any).clearMemoryCache?.();
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

  it('contains exactly one form in ItemFormModal (no nested form warning or descendant forms)', () => {
    act(() => {
      root!.render(
        <ItemFormModal
          isOpen={true}
          onClose={() => {}}
          editingItem={null}
          onSaveItem={() => {}}
          isGstActive={true}
          existingItems={[]}
        />
      );
    });

    // Verify there is only 1 <form> element rendered in the entire modal
    const forms = container!.querySelectorAll('form');
    expect(forms.length).toBe(1);

    // Open category dropdown
    const categoryBtn = container!.querySelector('button[title="Select or change category"]') as HTMLButtonElement;
    expect(categoryBtn).toBeTruthy();

    act(() => {
      categoryBtn.click();
    });

    // Open quick add by clicking "+ Add Category" button
    const addCatBtn = Array.from(container!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add Category')
    );
    expect(addCatBtn).toBeTruthy();

    act(() => {
      addCatBtn!.click();
    });

    // Still exactly 1 form in the document!
    const formsAfterExpand = container!.querySelectorAll('form');
    expect(formsAfterExpand.length).toBe(1);
  });

  it('quick-add creates and selects category in creation mode without submitting item form', () => {
    let savedItemResult: InventoryItem | null = null;
    let modalClosed = false;

    act(() => {
      root!.render(
        <ItemFormModal
          isOpen={true}
          onClose={() => {
            modalClosed = true;
          }}
          editingItem={null}
          onSaveItem={(item) => {
            savedItemResult = item;
          }}
          isGstActive={true}
          existingItems={[]}
        />
      );
    });

    // Fill Item Name
    const nameInput = container!.querySelector('input[placeholder*="Basmati Rice"]') as HTMLInputElement;
    act(() => {
      changeInput(nameInput, 'Premium Basmati Rice 10kg');
    });

    // Open Category dropdown
    const categoryBtn = container!.querySelector('button[title="Select or change category"]') as HTMLButtonElement;
    act(() => {
      categoryBtn.click();
    });

    // Click "+ Add Category"
    const addCatBtn = Array.from(container!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add Category')
    );
    act(() => {
      addCatBtn!.click();
    });

    // Find the category name input
    const quickCatInput = container!.querySelector('input[placeholder="Category Name"]') as HTMLInputElement;
    expect(quickCatInput).toBeTruthy();

    act(() => {
      changeInput(quickCatInput, 'Grains & Pulses');
    });

    // Press Enter in category name input: should create category and NOT submit item form
    act(() => {
      quickCatInput.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      );
    });

    // Item form should NOT have been submitted, and modal should still be open
    expect(savedItemResult).toBeNull();
    expect(modalClosed).toBe(false);

    // Verify category was saved in db
    const categoriesInDb = db.getCategories();
    expect(categoriesInDb.some((c) => c.name === 'Grains & Pulses')).toBe(true);

    // Verify CategorySelector button now displays the newly created category
    const updatedCategoryBtn = container!.querySelector('button[title="Select or change category"]');
    expect(updatedCategoryBtn?.textContent).toContain('Grains & Pulses');

    // Now save the item form
    const form = container!.querySelector('form');
    expect(form).toBeTruthy();

    act(() => {
      form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(savedItemResult).not.toBeNull();
    expect((savedItemResult as any)?.category).toBe('Grains & Pulses');
    expect(modalClosed).toBe(true);
  });

  it('quick-add works in edit-item flow with Save & Select button', () => {
    const existingItem: InventoryItem = {
      id: 'item_101',
      name: 'Organic Honey',
      hsnSacCode: '0409',
      unit: 'PCS',
      salePrice: 250,
      purchasePrice: 180,
      gstRate: 5,
      currentStock: 20,
      minStockAlert: 5,
      category: 'General',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    let updatedItem: InventoryItem | null = null;

    act(() => {
      root!.render(
        <ItemFormModal
          isOpen={true}
          onClose={() => {}}
          editingItem={existingItem}
          onSaveItem={(item) => {
            updatedItem = item;
          }}
          isGstActive={true}
          existingItems={[existingItem]}
        />
      );
    });

    // Open category dropdown
    const categoryBtn = container!.querySelector('button[title="Select or change category"]') as HTMLButtonElement;
    act(() => {
      categoryBtn.click();
    });

    // Click "+ Add Category"
    const addCatBtn = Array.from(container!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Add Category')
    );
    act(() => {
      addCatBtn!.click();
    });

    const quickCatInput = container!.querySelector('input[placeholder="Category Name"]') as HTMLInputElement;
    act(() => {
      changeInput(quickCatInput, 'Organic Foods');
    });

    // Click "Save & Select" button
    const saveSelectBtn = Array.from(container!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save & Select')
    );
    expect(saveSelectBtn).toBeTruthy();

    act(() => {
      saveSelectBtn!.click();
    });

    // The item modal should stay open
    expect(updatedItem).toBeNull();

    // Verify CategorySelector updated
    expect(container!.querySelector('button[title="Select or change category"]')?.textContent).toContain(
      'Organic Foods'
    );

    // Save the item
    const form = container!.querySelector('form');
    expect(form).toBeTruthy();

    act(() => {
      form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(updatedItem).not.toBeNull();
    expect((updatedItem as any)?.category).toBe('Organic Foods');
  });

  it('pressing Escape in quick-add closes quick-add without closing item modal', () => {
    let modalClosed = false;

    act(() => {
      root!.render(
        <ItemFormModal
          isOpen={true}
          onClose={() => {
            modalClosed = true;
          }}
          editingItem={null}
          onSaveItem={() => {}}
          isGstActive={true}
          existingItems={[]}
        />
      );
    });

    // Open dropdown and quick add
    act(() => {
      (container!.querySelector('button[title="Select or change category"]') as HTMLButtonElement).click();
    });
    act(() => {
      Array.from(container!.querySelectorAll('button'))
        .find((b) => b.textContent?.includes('Add Category'))!
        .click();
    });

    const quickCatInput = container!.querySelector('input[placeholder="Category Name"]') as HTMLInputElement;
    expect(quickCatInput).toBeTruthy();

    // Press Escape
    act(() => {
      quickCatInput.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      );
    });

    // Quick add is closed
    expect(container!.querySelector('input[placeholder="Category Name"]')).toBeNull();
    // Item modal is still open
    expect(modalClosed).toBe(false);
  });
});
