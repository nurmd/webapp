import { describe, it, expect } from 'vitest';
import {
  isItemActive,
  isItemNeedingRestock,
  isItemLowStock,
  isItemOutOfStock,
  countLowStockItems,
  getStockAlertCounts,
  getItemsNeedingRestock,
} from '../core/utils/itemStatus.ts';
import { aggregateStockValuation } from '../components/Reports/utils/reportAggregations.ts';
import { InventoryItem } from '../models/item.ts';

describe('Unified Low Stock & Restock Alert Invariants', () => {
  const baseItem: InventoryItem = {
    id: 'item-1',
    name: 'Sample Item',
    category: 'General',
    gstRate: 18,
    sku: 'SKU-001',
    hsnSacCode: '8539',
    unit: 'PCS',
    salePrice: 100,
    purchasePrice: 60,
    currentStock: 10,
    minStockAlert: 5,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  describe('1. Active State Classification (isDisabled and isActive)', () => {
    it('treats item as active when isDisabled is false and isActive is undefined or true', () => {
      expect(isItemActive({ ...baseItem, isDisabled: false })).toBe(true);
      expect(isItemActive({ ...baseItem, isDisabled: false, isActive: true })).toBe(true);
      expect(isItemActive({ ...baseItem, isDisabled: undefined, isActive: undefined })).toBe(true);
    });

    it('excludes item when isDisabled is true', () => {
      expect(isItemActive({ ...baseItem, isDisabled: true, isActive: true })).toBe(false);
      expect(isItemActive({ ...baseItem, isDisabled: true })).toBe(false);
    });

    it('excludes item when isActive is false', () => {
      expect(isItemActive({ ...baseItem, isDisabled: false, isActive: false })).toBe(false);
      expect(isItemActive({ ...baseItem, isActive: false })).toBe(false);
    });
  });

  describe('2. Need Restock Evaluation (currentStock <= (minStockAlert ?? 5))', () => {
    it('flags strictly low stock (0 < currentStock <= minStockAlert)', () => {
      const item: InventoryItem = { ...baseItem, currentStock: 3, minStockAlert: 5 };
      expect(isItemNeedingRestock(item)).toBe(true);
      expect(isItemLowStock(item)).toBe(true);
      expect(isItemOutOfStock(item)).toBe(false);
    });

    it('flags zero stock (currentStock === 0) as needing restock and out of stock', () => {
      const item: InventoryItem = { ...baseItem, currentStock: 0, minStockAlert: 5 };
      expect(isItemNeedingRestock(item)).toBe(true);
      expect(isItemLowStock(item)).toBe(false);
      expect(isItemOutOfStock(item)).toBe(true);
    });

    it('flags negative stock (currentStock < 0) as needing restock and out of stock', () => {
      const item: InventoryItem = { ...baseItem, currentStock: -4, minStockAlert: 5 };
      expect(isItemNeedingRestock(item)).toBe(true);
      expect(isItemLowStock(item)).toBe(false);
      expect(isItemOutOfStock(item)).toBe(true);
    });

    it('falls back to threshold 5 when minStockAlert is undefined or null', () => {
      const itemWithoutAlert: InventoryItem = { ...baseItem, currentStock: 4, minStockAlert: undefined as any };
      expect(isItemNeedingRestock(itemWithoutAlert)).toBe(true);

      const itemAboveDefault: InventoryItem = { ...baseItem, currentStock: 6, minStockAlert: undefined as any };
      expect(isItemNeedingRestock(itemAboveDefault)).toBe(false);
    });

    it('does not flag healthy stock above threshold', () => {
      const item: InventoryItem = { ...baseItem, currentStock: 15, minStockAlert: 5 };
      expect(isItemNeedingRestock(item)).toBe(false);
      expect(isItemLowStock(item)).toBe(false);
      expect(isItemOutOfStock(item)).toBe(false);
    });

    it('strictly excludes disabled items even when zero or negative stock', () => {
      const disabledZero: InventoryItem = { ...baseItem, currentStock: 0, isDisabled: true };
      const disabledNegative: InventoryItem = { ...baseItem, currentStock: -10, isDisabled: true };
      const disabledLow: InventoryItem = { ...baseItem, currentStock: 2, isDisabled: true };

      expect(isItemNeedingRestock(disabledZero)).toBe(false);
      expect(isItemNeedingRestock(disabledNegative)).toBe(false);
      expect(isItemNeedingRestock(disabledLow)).toBe(false);
    });

    it('strictly excludes inactive items even when zero or negative stock', () => {
      const inactiveZero: InventoryItem = { ...baseItem, currentStock: 0, isActive: false };
      const inactiveNegative: InventoryItem = { ...baseItem, currentStock: -5, isActive: false };
      const inactiveLow: InventoryItem = { ...baseItem, currentStock: 1, isActive: false };

      expect(isItemNeedingRestock(inactiveZero)).toBe(false);
      expect(isItemNeedingRestock(inactiveNegative)).toBe(false);
      expect(isItemNeedingRestock(inactiveLow)).toBe(false);
    });
  });

  describe('3. Multi-Item Stock Alert Aggregation', () => {
    it('correctly calculates needRestock = lowStock + outOfStock and filters items', () => {
      const mixedItems: InventoryItem[] = [
        { ...baseItem, id: '1', name: 'Low Stock 1', currentStock: 3, minStockAlert: 5 },       // Low (1)
        { ...baseItem, id: '2', name: 'Low Stock 2', currentStock: 1, minStockAlert: 2 },       // Low (2)
        { ...baseItem, id: '3', name: 'Zero Stock', currentStock: 0, minStockAlert: 5 },         // Out (1)
        { ...baseItem, id: '4', name: 'Negative Stock', currentStock: -3, minStockAlert: 5 },    // Out (2)
        { ...baseItem, id: '5', name: 'Healthy Stock', currentStock: 20, minStockAlert: 5 },     // Normal
        { ...baseItem, id: '6', name: 'Disabled Zero', currentStock: 0, isDisabled: true },      // Excluded
        { ...baseItem, id: '7', name: 'Inactive Negative', currentStock: -2, isActive: false },  // Excluded
      ];

      const counts = getStockAlertCounts(mixedItems);
      expect(counts.lowStock).toBe(2);
      expect(counts.outOfStock).toBe(2);
      expect(counts.needRestock).toBe(4); // 2 low + 2 out
      expect(countLowStockItems(mixedItems)).toBe(4);

      const needingRestock = getItemsNeedingRestock(mixedItems);
      expect(needingRestock.map((i) => i.id)).toEqual(['1', '2', '3', '4']);
    });
  });

  describe('4. Reports Valuation & Restock Subcount Parity', () => {
    it('aggregates needRestockCount = lowStockCount + outOfStockCount + negativeStockCount with disabled/inactive exclusion', () => {
      const items: InventoryItem[] = [
        { ...baseItem, id: '1', currentStock: 2, minStockAlert: 5 },     // lowStockCount = 1
        { ...baseItem, id: '2', currentStock: 0, minStockAlert: 5 },     // outOfStockCount = 1
        { ...baseItem, id: '3', currentStock: -5, minStockAlert: 5 },    // negativeStockCount = 1
        { ...baseItem, id: '4', currentStock: 15, minStockAlert: 5 },    // normal
        { ...baseItem, id: '5', currentStock: 0, isDisabled: true },     // excluded
        { ...baseItem, id: '6', currentStock: -3, isActive: false },     // excluded
      ];

      const reportVal = aggregateStockValuation(items);
      expect(reportVal.totalItems).toBe(4); // excludes id 5 and 6
      expect(reportVal.lowStockCount).toBe(1);
      expect(reportVal.outOfStockCount).toBe(1);
      expect(reportVal.negativeStockCount).toBe(1);
      // Need Restock = low (1) + out (1 + 1) = 3
      expect(reportVal.needRestockCount).toBe(3);
    });
  });
});
