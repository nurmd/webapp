import { InventoryItem, ItemCategory, DEFAULT_ITEM_CATEGORIES } from '../../models/item.ts';
import { pouch } from '../pouchdb.ts';
import { isLowStock } from '../../core/inventory/stockEngine.ts';
import { STORAGE_KEYS, DEFAULT_ITEMS } from './storageEngine.ts';
import { PartyStorage } from './partyStorage.ts';

/**
 * Inventory Items and Categories domain storage.
 * Handles catalog CRUD, category auto-discovery and reassignment,
 * and atomic stock updates.
 */
export class ItemStorage extends PartyStorage {
  getItems(): InventoryItem[] {
    return this.get<InventoryItem[]>(STORAGE_KEYS.ITEMS, DEFAULT_ITEMS);
  }

  saveItem(item: InventoryItem): void {
    const list = [...this.getItems()];
    const idx = list.findIndex((i) => i.id === item.id);
    if (idx >= 0) {
      list[idx] = item;
    } else {
      list.push(item);
    }
    this.removeTombstone('item', item.id);
    this.set(STORAGE_KEYS.ITEMS, list);
    pouch.putDoc('item', item);
    this.broadcastChange('item', 'save', item.id, item);
    this.notifyListeners();
  }

  deleteItem(id: string): void {
    const list = this.getItems().filter((i) => i.id !== id);
    this.recordTombstone('item', id);
    this.set(STORAGE_KEYS.ITEMS, list);
    pouch.deleteDoc('item', id);
    this.broadcastChange('item', 'delete', id);
    this.notifyListeners();
  }

  saveItems(items: InventoryItem[]): void {
    const current = this.getItems();
    this.persistStockUpdates(current, items);
  }

  isItemLowStock(item: InventoryItem): boolean {
    return isLowStock(item);
  }

  protected persistStockUpdates(currentItems: InventoryItem[], updatedItems: InventoryItem[]): void {
    this.set(STORAGE_KEYS.ITEMS, updatedItems);
    for (const updated of updatedItems) {
      const orig = currentItems.find((i) => i.id === updated.id);
      if (!orig || orig.currentStock !== updated.currentStock || orig.purchasePrice !== updated.purchasePrice) {
        pouch.putDoc('item', updated);
        this.broadcastChange('item', 'save', updated.id, updated);
      }
    }
    this.notifyListeners();
  }

  // Categories Management
  getCategories(): ItemCategory[] {
    const stored = this.get<ItemCategory[] | null>(STORAGE_KEYS.CATEGORIES, null);
    if (!stored || stored.length === 0) {
      // Seed default categories and auto-discover any categories used in existing items
      const existingItems = this.getItems();
      const categoryNames = new Set(DEFAULT_ITEM_CATEGORIES.map((c) => c.name.toLowerCase()));
      const initial = [...DEFAULT_ITEM_CATEGORIES];

      for (const item of existingItems) {
        const catName = item.category?.trim();
        if (catName && !categoryNames.has(catName.toLowerCase())) {
          categoryNames.add(catName.toLowerCase());
          initial.push({
            id: `cat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            name: catName,
            description: `Auto-imported from catalog`,
            color: '#64748b',
            icon: 'category',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }

      this.set(STORAGE_KEYS.CATEGORIES, initial);
      return initial;
    }
    return stored;
  }

  saveCategory(category: ItemCategory, renameItems: boolean = true): ItemCategory {
    const list = this.getCategories();
    const idx = list.findIndex((c) => c.id === category.id);
    const prevCategory = idx >= 0 ? list[idx] : null;

    let savedItem: ItemCategory;
    if (idx >= 0) {
      savedItem = { ...category, updatedAt: new Date().toISOString() };
      list[idx] = savedItem;
    } else {
      savedItem = {
        ...category,
        createdAt: category.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      list.push(savedItem);
    }
    this.set(STORAGE_KEYS.CATEGORIES, list);

    // If category name was renamed, synchronize all existing items under this category
    if (renameItems && prevCategory && prevCategory.name !== category.name) {
      const items = this.getItems();
      let changed = false;
      const updatedItems = items.map((item) => {
        if (item.category === prevCategory.name) {
          changed = true;
          return { ...item, category: category.name, updatedAt: new Date().toISOString() };
        }
        return item;
      });
      if (changed) {
        this.set(STORAGE_KEYS.ITEMS, updatedItems);
        this.broadcastChange('item', 'save', category.id);
      }
    }

    this.broadcastChange('category', 'save', category.id, savedItem);
    this.notifyListeners();
    return savedItem;
  }

  deleteCategory(id: string, reassignTo: string = 'General'): { success: boolean; affectedItems: number } {
    const list = this.getCategories();
    const catToDelete = list.find((c) => c.id === id);
    if (!catToDelete) return { success: false, affectedItems: 0 };
    if (catToDelete.isSystem) return { success: false, affectedItems: 0 };

    const remaining = list.filter((c) => c.id !== id);
    this.set(STORAGE_KEYS.CATEGORIES, remaining);

    // Reassign items that belonged to this category
    const items = this.getItems();
    let affectedItems = 0;
    const updatedItems = items.map((item) => {
      if (item.category === catToDelete.name) {
        affectedItems++;
        return { ...item, category: reassignTo, updatedAt: new Date().toISOString() };
      }
      return item;
    });

    if (affectedItems > 0) {
      this.set(STORAGE_KEYS.ITEMS, updatedItems);
      this.broadcastChange('item', 'save', id);
    }

    this.broadcastChange('category', 'delete', id);
    this.notifyListeners();
    return { success: true, affectedItems };
  }

  resetCategoriesToDefault(): void {
    this.set(STORAGE_KEYS.CATEGORIES, DEFAULT_ITEM_CATEGORIES);
    this.broadcastChange('category', 'save', 'all');
    this.notifyListeners();
  }
}
