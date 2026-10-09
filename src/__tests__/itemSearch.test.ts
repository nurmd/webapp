import { describe, it, expect } from 'vitest';
import type { InventoryItem } from '../models/item.ts';

const now = '2026-10-09T00:00:00Z';

const mockCatalog: InventoryItem[] = [
  {
    id: 'item-1',
    name: 'Amul Taaza Toned Milk 500ml',
    category: 'Dairy',
    unit: 'PKT',
    salePrice: 28,
    purchasePrice: 26,
    currentStock: 50,
    minStockAlert: 10,
    hsnSacCode: '0401',
    barcode: '8901262010012',
    sku: 'AML-MILK-500',
    gstRate: 5,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'item-2',
    name: 'Fortune Sunlite Refined Sunflower Oil 1L',
    category: 'Grocery',
    unit: 'LTR',
    salePrice: 145,
    purchasePrice: 130,
    currentStock: 25,
    minStockAlert: 5,
    hsnSacCode: '1512',
    barcode: '8906007281023',
    sku: 'FRT-OIL-1L',
    gstRate: 5,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'item-3',
    name: 'Parle-G Gold Glucose Biscuits 100g',
    category: 'Snacks',
    unit: 'PKT',
    salePrice: 10,
    purchasePrice: 8.5,
    currentStock: 120,
    minStockAlert: 20,
    hsnSacCode: '1905',
    barcode: '8901719101011',
    sku: 'PRL-GLD-100',
    gstRate: 18,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'item-4',
    name: 'Aashirvaad Superior MP Sharbati Atta 5kg',
    category: 'Grocery',
    unit: 'BAG',
    salePrice: 290,
    purchasePrice: 265,
    currentStock: 15,
    minStockAlert: 3,
    hsnSacCode: '1101',
    barcode: '8901030381024',
    sku: 'ASH-ATTA-5KG',
    gstRate: 0,
    createdAt: now,
    updatedAt: now,
  },
];

// Helper reproducing POS / Catalog containing search algorithm
function searchItemsContaining(items: InventoryItem[], query: string): InventoryItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const words = q.split(/\s+/).filter(Boolean);

  return items
    .filter((i) =>
      words.every(
        (w) =>
          i.name.toLowerCase().includes(w) ||
          (i.barcode && i.barcode.toLowerCase().includes(w)) ||
          (i.sku && i.sku.toLowerCase().includes(w)) ||
          (i.category && i.category.toLowerCase().includes(w))
      )
    )
    .sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      if (aName === q && bName !== q) return -1;
      if (bName === q && aName !== q) return 1;
      if (aName.startsWith(q) && !bName.startsWith(q)) return -1;
      if (bName.startsWith(q) && !aName.startsWith(q)) return 1;
      return 0;
    });
}

function findSingleItemContaining(items: InventoryItem[], query: string): InventoryItem | undefined {
  const clean = query.trim();
  if (!clean) return undefined;
  const lower = clean.toLowerCase();

  // 1. Exact match on barcode, SKU, ID, or name
  let found = items.find(
    (i) =>
      i.barcode === clean ||
      i.sku?.toLowerCase() === lower ||
      i.id === clean ||
      i.name.toLowerCase() === lower
  );

  // 2. Substring containing match
  if (!found) {
    found = items.find(
      (i) =>
        i.name.toLowerCase().includes(lower) ||
        (i.barcode && i.barcode.toLowerCase().includes(lower)) ||
        (i.sku && i.sku.toLowerCase().includes(lower))
    );
  }

  // 3. Multi-word match
  if (!found) {
    const words = lower.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      found = items.find((i) =>
        words.every(
          (w) =>
            i.name.toLowerCase().includes(w) ||
            (i.barcode && i.barcode.toLowerCase().includes(w)) ||
            (i.sku && i.sku.toLowerCase().includes(w))
        )
      );
    }
  }

  return found;
}

describe('Item Search Substring Containing Logic', () => {
  it('finds items containing partial words typed instead of requiring exact full name', () => {
    const results = searchItemsContaining(mockCatalog, 'milk');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Amul Taaza Toned Milk 500ml');
  });

  it('matches partial middle terms like "gold" or "biscuit"', () => {
    const byGold = searchItemsContaining(mockCatalog, 'gold');
    expect(byGold).toHaveLength(1);
    expect(byGold[0].id).toBe('item-3');

    const byBiscuit = searchItemsContaining(mockCatalog, 'biscuit');
    expect(byBiscuit).toHaveLength(1);
    expect(byBiscuit[0].id).toBe('item-3');
  });

  it('handles multi-word queries in arbitrary order', () => {
    const results = searchItemsContaining(mockCatalog, 'oil sunflower');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Fortune Sunlite Refined Sunflower Oil 1L');
  });

  it('finds items via partial barcode or partial SKU', () => {
    const bySku = searchItemsContaining(mockCatalog, 'atta-5kg');
    expect(bySku).toHaveLength(1);
    expect(bySku[0].name).toContain('Aashirvaad');

    const byPartialBarcode = searchItemsContaining(mockCatalog, '7281023');
    expect(byPartialBarcode).toHaveLength(1);
    expect(byPartialBarcode[0].id).toBe('item-2');
  });

  it('single-item lookup prioritizes exact barcode / name before falling back to containing', () => {
    // Exact barcode
    const exact = findSingleItemContaining(mockCatalog, '8901262010012');
    expect(exact?.id).toBe('item-1');

    // Partial name substring
    const partial = findSingleItemContaining(mockCatalog, 'sunflower');
    expect(partial?.id).toBe('item-2');

    // Partial brand name
    const brand = findSingleItemContaining(mockCatalog, 'parle');
    expect(brand?.id).toBe('item-3');
  });

  it('returns undefined gracefully for non-existent items', () => {
    const notFound = findSingleItemContaining(mockCatalog, 'xyz-non-existent');
    expect(notFound).toBeUndefined();
  });
});
