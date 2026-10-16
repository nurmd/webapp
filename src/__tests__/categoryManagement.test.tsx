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
import { ItemCategory, DEFAULT_ITEM_CATEGORIES } from '../models/category.ts';
import { InventoryItem } from '../models/item.ts';
import { CategoryManagementModal } from '../components/Settings/modals/CategoryManagementModal.tsx';
import { CategorySelector } from '../components/Inventory/CategorySelector.tsx';
import { ItemSettingsTab } from '../components/Settings/ItemSettingsTab.tsx';

describe('Category Management System', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    testStorage.clear();
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

  describe('Database Category CRUD & Hierarchy', () => {
    it('seeds default categories on first access', () => {
      const categories = db.getCategories();
      expect(categories.length).toBeGreaterThanOrEqual(DEFAULT_ITEM_CATEGORIES.length);
      const general = categories.find((c) => c.name === 'General');
      expect(general).toBeDefined();
      expect(general?.isSystem).toBe(true);
    });

    it('creates and persists a new category', () => {
      const newCat: ItemCategory = {
        id: 'cat_stationery',
        name: 'Stationery',
        description: 'Office supplies, pens, notebooks',
        color: '#ca8a04',
        icon: 'menu_book',
        defaultGstRate: 12,
        defaultHsn: '4820',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const saved = db.saveCategory(newCat);
      expect(saved.id).toBe('cat_stationery');

      const all = db.getCategories();
      const found = all.find((c) => c.id === 'cat_stationery');
      expect(found).toBeDefined();
      expect(found?.name).toBe('Stationery');
      expect(found?.defaultGstRate).toBe(12);
      expect(found?.defaultHsn).toBe('4820');
    });

    it('renames category and propagates changes to all existing items', () => {
      // Create a test item with category 'Old Category'
      const item: InventoryItem = {
        id: 'item_101',
        name: 'Item 101',
        sku: 'SKU-101',
        category: 'Old Category',
        unit: 'PCS',
        purchasePrice: 100,
        salePrice: 150,
        gstRate: 18,
        hsnSacCode: '1001',
        currentStock: 10,
        minStockAlert: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.saveItem(item);

      // Create category 'Old Category'
      const cat: ItemCategory = {
        id: 'cat_old',
        name: 'Old Category',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.saveCategory(cat);

      // Rename to 'Brand New Category'
      const updatedCat: ItemCategory = {
        ...cat,
        name: 'Brand New Category',
      };
      db.saveCategory(updatedCat, true);

      // Verify item category was updated in database
      const items = db.getItems();
      const updatedItem = items.find((i) => i.id === 'item_101');
      expect(updatedItem?.category).toBe('Brand New Category');
    });

    it('deletes category and safely reassigns items to target category (e.g. General)', () => {
      // Create an item with category 'ToDelete'
      const item: InventoryItem = {
        id: 'item_202',
        name: 'Item 202',
        sku: 'SKU-202',
        category: 'ToDelete',
        unit: 'PCS',
        purchasePrice: 50,
        salePrice: 80,
        gstRate: 5,
        hsnSacCode: '2002',
        currentStock: 5,
        minStockAlert: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.saveItem(item);

      const cat: ItemCategory = {
        id: 'cat_todelete',
        name: 'ToDelete',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.saveCategory(cat);

      // Delete and reassign to 'General'
      const delRes = db.deleteCategory('cat_todelete', 'General');
      expect(delRes.success).toBe(true);

      // Category should be gone
      const categories = db.getCategories();
      expect(categories.some((c) => c.id === 'cat_todelete')).toBe(false);

      // Item should now belong to 'General'
      const items = db.getItems();
      const itemAfter = items.find((i) => i.id === 'item_202');
      expect(itemAfter?.category).toBe('General');
    });

    it('protects system default category from deletion', () => {
      const general = db.getCategories().find((c) => c.name === 'General');
      expect(general).toBeDefined();

      const delRes = db.deleteCategory(general!.id);
      expect(delRes.success).toBe(false);

      const generalAfter = db.getCategories().find((c) => c.name === 'General');
      expect(generalAfter).toBeDefined();
    });

    it('includes categories in database backup and restores them accurately', async () => {
      // Add custom category
      db.saveCategory({
        id: 'cat_bakery',
        name: 'Bakery',
        color: '#ea580c',
        icon: 'restaurant',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const backup = db.createDatabaseBackup();
      expect(backup.data.categories).toBeDefined();
      expect(backup.data.categories!.some((c) => c.name === 'Bakery')).toBe(true);
      expect(backup.counts.categories).toBeGreaterThan(0);

      // Clear DB
      testStorage.clear();
      expect(testStorage.getItem('gst_item_categories')).toBeNull();

      // Restore
      const restoreResult = await db.restoreDatabaseBackup(backup);
      expect(restoreResult.success).toBe(true);

      const restoredCategories = db.getCategories();
      expect(restoredCategories.some((c) => c.name === 'Bakery')).toBe(true);
    });
  });

  describe('UI Component: CategoryManagementModal', () => {
    it('renders category list and overview when open', () => {
      act(() => {
        root!.render(
          <CategoryManagementModal
            isOpen={true}
            onClose={() => {}}
          />
        );
      });

      expect(container!.textContent).toContain('Item Categories');
      expect(container!.textContent).toContain('General');
      expect(container!.textContent).toContain('Groceries');
    });

    it('allows searching categories by text', () => {
      act(() => {
        root!.render(
          <CategoryManagementModal
            isOpen={true}
            onClose={() => {}}
          />
        );
      });

      const searchInput = container!.querySelector('input[placeholder*="Search categories"]') as HTMLInputElement;
      expect(searchInput).toBeTruthy();

      act(() => {
        searchInput.value = 'groceries';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      });

      expect(container!.textContent).toContain('Groceries');
    });
  });

  describe('UI Component: CategorySelector in Item Form', () => {
    it('displays selected category and triggers onChange when category is picked', () => {
      let selectedCategory = 'General';
      let selectedCategoryObj: ItemCategory | undefined;

      act(() => {
        root!.render(
          <CategorySelector
            value={selectedCategory}
            onChange={(name, obj) => {
              selectedCategory = name;
              selectedCategoryObj = obj;
            }}
          />
        );
      });

      expect(container!.textContent).toContain('General');

      // Click trigger button to open dropdown
      const triggerBtn = container!.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement;
      expect(triggerBtn).toBeTruthy();

      act(() => {
        triggerBtn.click();
      });

      // Find Groceries in dropdown list
      const buttons = Array.from(container!.querySelectorAll('button'));
      const groceriesBtn = buttons.find((b) => b.textContent?.includes('Groceries'));
      expect(groceriesBtn).toBeTruthy();

      act(() => {
        groceriesBtn!.click();
      });

      expect(selectedCategory).toBe('Groceries');
      expect(selectedCategoryObj?.defaultGstRate).toBe(5);
      expect(selectedCategoryObj?.defaultHsn).toBe('1006');
    });
  });

  describe('Settings Tab Integration: ItemSettingsTab', () => {
    it('renders Category Hierarchy card with category chips and action button', () => {
      act(() => {
        root!.render(
          <ItemSettingsTab
            allowNegativeStock={false}
            onToggleNegativeStock={() => {}}
            showBuyPricesGlobally={true}
            onToggleBuyPrices={() => {}}
            onOpenCategoryManager={() => {}}
          />
        );
      });

      expect(container!.textContent).toContain('Item Categories & Hierarchy');
      expect(container!.textContent).toContain('Configure & Manage Categories');
    });
  });
});
