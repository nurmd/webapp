import { describe, it, expect } from 'vitest';
import { isItemInBills, getActiveItems } from '@/core/utils/itemStatus';
import { isItemDisabled, isItemActive } from '@/models/item';
import {
  applyInvoiceStockDecrement,
  revertInvoiceStockAdjustment,
  restoreInvoiceStock,
  applyPurchaseStockIncrement,
  applyPurchaseStockDecrement,
  calculateStockDecrement,
  calculateStockIncrement,
  isLowStock,
  createInvoiceLineSnapshot,
} from '@/core/inventory/stockEngine';
import type { InventoryItem } from '@/models/item';
import type { Invoice, InvoiceItemEntry } from '@/models/invoice';
import type { PurchaseBill, PurchaseItemEntry } from '@/models/purchase';

describe('Suite 6: Inventory Constraints & Historic Integrity', () => {
  // =========================================================================
  // TC-INVC-01: Referential Integrity Check for Unbilled Items
  // =========================================================================
  it('TC-INVC-01: isItemInBills returns false for unbilled items', () => {
    expect(isItemInBills('ITM-NEW', [], [])).toBe(false);
    expect(isItemInBills('', [], [])).toBe(false);

    const invoices: Partial<Invoice>[] = [
      {
        id: 'inv1',
        items: [
          {
            itemId: 'ITM-OTHER',
            name: 'Other Item',
            quantity: 1,
            unit: 'PCS',
            unitPrice: 100,
            taxableAmount: 100,
            gstRate: 18,
            cgstAmount: 9,
            sgstAmount: 9,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 118,
            hsnSacCode: '1234',
          },
        ],
      },
    ];
    expect(isItemInBills('ITM-NEW', invoices as Invoice[], [])).toBe(false);
  });

  // =========================================================================
  // TC-INVC-02: Referential Integrity Check for Sales Invoices
  // =========================================================================
  it('TC-INVC-02: isItemInBills returns true when item is referenced in any sales invoice', () => {
    const invoices: Partial<Invoice>[] = [
      {
        id: 'inv1',
        items: [
          {
            itemId: 'ITM-SOLD',
            name: 'Sold Item',
            quantity: 2,
            unit: 'PCS',
            unitPrice: 500,
            taxableAmount: 1000,
            gstRate: 18,
            cgstAmount: 90,
            sgstAmount: 90,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 1180,
            hsnSacCode: '1234',
          },
        ],
      },
    ];
    expect(isItemInBills('ITM-SOLD', invoices as Invoice[], [])).toBe(true);
  });

  // =========================================================================
  // TC-INVC-03: Referential Integrity Check for Purchase Bills
  // =========================================================================
  it('TC-INVC-03: isItemInBills returns true when item is referenced in any purchase bill', () => {
    const purchases: Partial<PurchaseBill>[] = [
      {
        id: 'pur1',
        items: [
          {
            itemId: 'ITM-PURCHASED',
            name: 'Purchased Item',
            quantity: 10,
            unit: 'PCS',
            unitPrice: 300,
            taxableAmount: 3000,
            gstRate: 18,
            cgstAmount: 270,
            sgstAmount: 270,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 3540,
            hsnSacCode: '1234',
          },
        ],
      },
    ];
    expect(isItemInBills('ITM-PURCHASED', [], purchases as PurchaseBill[])).toBe(true);
  });

  // =========================================================================
  // TC-INVC-04: Catalog Filtering for Disabled Items
  // =========================================================================
  it('TC-INVC-04: getActiveItems includes active items and excludes disabled (isDisabled: true) items', () => {
    const items: Partial<InventoryItem>[] = [
      { id: 'itm1', name: 'Active 1', isDisabled: false, isActive: true },
      { id: 'itm2', name: 'Disabled Item', isDisabled: true, isActive: true },
      { id: 'itm3', name: 'Active 2', isDisabled: undefined, isActive: true },
    ];
    const active = getActiveItems(items as InventoryItem[]);
    expect(active).toHaveLength(2);
    expect(active.map((i) => i.id)).toEqual(['itm1', 'itm3']);

    // Also assert model predicate functions
    expect(isItemDisabled(items[1] as InventoryItem)).toBe(true);
    expect(isItemActive(items[0] as InventoryItem)).toBe(true);
  });

  // =========================================================================
  // TC-INVC-05: Catalog Filtering for Deactivated Items
  // =========================================================================
  it('TC-INVC-05: getActiveItems excludes deactivated (isActive: false) items', () => {
    const items: Partial<InventoryItem>[] = [
      { id: 'itm1', name: 'Active Item', isActive: true },
      { id: 'itm2', name: 'Inactive Item', isActive: false },
    ];
    const active = getActiveItems(items as InventoryItem[]);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('itm1');

    // Also assert model predicate functions
    expect(isItemDisabled(items[1] as InventoryItem)).toBe(true);
    expect(isItemActive(items[0] as InventoryItem)).toBe(true);
  });

  // =========================================================================
  // TC-INVC-06: Stock Decrement on Sales Billing with Non-Negative Clamping
  // =========================================================================
  it('TC-INVC-06: Invoice save decrements item stock by line quantity without dropping below zero', () => {
    const catalog: InventoryItem[] = [
      {
        id: 'ITM-01',
        name: 'Industrial Widget',
        hsnSacCode: '8443',
        category: 'Hardware',
        unit: 'PCS',
        salePrice: 100,
        purchasePrice: 60,
        gstRate: 18,
        currentStock: 10,
        minStockAlert: 5,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    const invoiceLines: InvoiceItemEntry[] = [
      {
        itemId: 'ITM-01',
        name: 'Industrial Widget',
        hsnSacCode: '8443',
        unit: 'PCS',
        quantity: 4,
        unitPrice: 100,
        taxableAmount: 400,
        gstRate: 18,
        cgstAmount: 36,
        sgstAmount: 36,
        igstAmount: 0,
        cessAmount: 0,
        totalAmount: 472,
      },
    ];

    // Standard sale: 10 - 4 = 6
    const updated = applyInvoiceStockDecrement(catalog, invoiceLines);
    expect(updated[0].currentStock).toBe(6);
    expect(calculateStockDecrement(10, 4)).toBe(6);

    // Clamping to 0 on overselling: selling 10 more when stock is 6 -> clamps to 0
    const excessiveSaleLines: InvoiceItemEntry[] = [
      { ...invoiceLines[0], quantity: 10 },
    ];
    const clamped = applyInvoiceStockDecrement(updated, excessiveSaleLines);
    expect(clamped[0].currentStock).toBe(0);
    expect(calculateStockDecrement(6, 10)).toBe(0);
    expect(calculateStockDecrement(0, 5)).toBe(0);
  });

  // =========================================================================
  // TC-INVC-07: Invoice Edit Quantity Reversion and Re-application
  // =========================================================================
  it('TC-INVC-07: Invoice edit restores previous quantities before decrementing new quantities', () => {
    const catalog: InventoryItem[] = [
      {
        id: 'ITM-01',
        name: 'Industrial Widget',
        hsnSacCode: '8443',
        category: 'Hardware',
        unit: 'PCS',
        salePrice: 100,
        purchasePrice: 60,
        gstRate: 18,
        currentStock: 10, // Stock after initial sale of 5 from original 15
        minStockAlert: 5,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    const previousLines: InvoiceItemEntry[] = [
      {
        itemId: 'ITM-01',
        name: 'Industrial Widget',
        hsnSacCode: '8443',
        unit: 'PCS',
        quantity: 5,
        unitPrice: 100,
        taxableAmount: 500,
        gstRate: 18,
        cgstAmount: 45,
        sgstAmount: 45,
        igstAmount: 0,
        cessAmount: 0,
        totalAmount: 590,
      },
    ];

    const newLines: InvoiceItemEntry[] = [
      {
        ...previousLines[0],
        quantity: 3,
        taxableAmount: 300,
        cgstAmount: 27,
        sgstAmount: 27,
        totalAmount: 354,
      },
    ];

    // Reverts 5 units (10 -> 15), then applies 3 units (15 -> 12)
    const updated = revertInvoiceStockAdjustment(catalog, previousLines, newLines);
    expect(updated[0].currentStock).toBe(12);

    // Edge case: edit quantity increased from 5 to 20 (restores to 15, then 15 - 20 clamps to 0)
    const largeNewLines: InvoiceItemEntry[] = [
      { ...newLines[0], quantity: 20 },
    ];
    const clampedEdit = revertInvoiceStockAdjustment(catalog, previousLines, largeNewLines);
    expect(clampedEdit[0].currentStock).toBe(0);
  });

  // =========================================================================
  // TC-INVC-08: Invoice Deletion Stock Restoration
  // =========================================================================
  it('TC-INVC-08: Invoice deletion restores line quantities back to inventory stock', () => {
    const catalog: InventoryItem[] = [
      {
        id: 'ITM-01',
        name: 'Industrial Widget',
        hsnSacCode: '8443',
        category: 'Hardware',
        unit: 'PCS',
        salePrice: 100,
        purchasePrice: 60,
        gstRate: 18,
        currentStock: 8,
        minStockAlert: 5,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    const deletedLines: InvoiceItemEntry[] = [
      {
        itemId: 'ITM-01',
        name: 'Industrial Widget',
        hsnSacCode: '8443',
        unit: 'PCS',
        quantity: 5,
        unitPrice: 100,
        taxableAmount: 500,
        gstRate: 18,
        cgstAmount: 45,
        sgstAmount: 45,
        igstAmount: 0,
        cessAmount: 0,
        totalAmount: 590,
      },
    ];

    // Restores 5 units: 8 + 5 = 13
    const restored = restoreInvoiceStock(catalog, deletedLines);
    expect(restored[0].currentStock).toBe(13);
    expect(calculateStockIncrement(8, 5)).toBe(13);
  });

  // =========================================================================
  // TC-INVC-09: Purchase Bill Stock Increment & Latest Purchase Price Update
  // =========================================================================
  it('TC-INVC-09: Purchase bill save increments item stock by bill quantity', () => {
    const catalog: InventoryItem[] = [
      {
        id: 'ITM-01',
        name: 'Industrial Widget',
        hsnSacCode: '8443',
        category: 'Hardware',
        unit: 'PCS',
        salePrice: 100,
        purchasePrice: 60,
        gstRate: 18,
        currentStock: 12,
        minStockAlert: 5,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    const purchaseLines: PurchaseItemEntry[] = [
      {
        itemId: 'ITM-01',
        name: 'Industrial Widget',
        hsnSacCode: '8443',
        unit: 'PCS',
        quantity: 8,
        unitPrice: 65,
        taxableAmount: 520,
        gstRate: 18,
        cgstAmount: 46.8,
        sgstAmount: 46.8,
        igstAmount: 0,
        cessAmount: 0,
        totalAmount: 613.6,
      },
    ];

    // Increases stock: 12 + 8 = 20, and updates purchasePrice: 60 -> 65
    const updated = applyPurchaseStockIncrement(catalog, purchaseLines);
    expect(updated[0].currentStock).toBe(20);
    expect(updated[0].purchasePrice).toBe(65);
    expect(calculateStockIncrement(12, 8)).toBe(20);
  });

  // =========================================================================
  // TC-INVC-10: Purchase Bill Deletion Stock Decrement & Non-Negative Clamping
  // =========================================================================
  it('TC-INVC-10: Purchase bill deletion decrements item stock', () => {
    const catalog: InventoryItem[] = [
      {
        id: 'ITM-01',
        name: 'Industrial Widget',
        hsnSacCode: '8443',
        category: 'Hardware',
        unit: 'PCS',
        salePrice: 100,
        purchasePrice: 60,
        gstRate: 18,
        currentStock: 20,
        minStockAlert: 5,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    const deletedPurchaseLines: PurchaseItemEntry[] = [
      {
        itemId: 'ITM-01',
        name: 'Industrial Widget',
        hsnSacCode: '8443',
        unit: 'PCS',
        quantity: 8,
        unitPrice: 60,
        taxableAmount: 480,
        gstRate: 18,
        cgstAmount: 43.2,
        sgstAmount: 43.2,
        igstAmount: 0,
        cessAmount: 0,
        totalAmount: 566.4,
      },
    ];

    // Decrements stock: 20 - 8 = 12
    const updated = applyPurchaseStockDecrement(catalog, deletedPurchaseLines);
    expect(updated[0].currentStock).toBe(12);
    expect(calculateStockDecrement(20, 8)).toBe(12);

    // Clamping on oversold/excess decrement
    const excessiveDeleted: PurchaseItemEntry[] = [
      { ...deletedPurchaseLines[0], quantity: 25 },
    ];
    const clamped = applyPurchaseStockDecrement(updated, excessiveDeleted);
    expect(clamped[0].currentStock).toBe(0);
    expect(calculateStockDecrement(12, 25)).toBe(0);
  });

  // =========================================================================
  // TC-INVC-11: Historical Invoice Immutability on Master Catalog Changes
  // =========================================================================
  it('TC-INVC-11: Modifying master item sale price or GST rate does NOT mutate existing stored invoices', () => {
    const masterItem: InventoryItem = {
      id: 'ITM-99',
      name: 'Industrial Widget',
      hsnSacCode: '8443',
      category: 'Hardware',
      unit: 'PCS',
      salePrice: 100,
      purchasePrice: 60,
      gstRate: 18,
      currentStock: 50,
      minStockAlert: 5,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    // Create an immutable invoice line snapshot using domain engine
    const snapshotLine = createInvoiceLineSnapshot(masterItem, 1);
    const historicalInvoice: Partial<Invoice> = {
      id: 'INV-PAST',
      items: [snapshotLine],
      grandTotal: snapshotLine.totalAmount,
    };

    // Master catalog item is modified later (price surge and tax revision)
    masterItem.salePrice = 150;
    masterItem.gstRate = 12;
    masterItem.name = 'Industrial Widget v2';

    // Verify historical invoice items remain completely immutable and unperturbed
    expect(historicalInvoice.items![0].unitPrice).toBe(100);
    expect(historicalInvoice.items![0].gstRate).toBe(18);
    expect(historicalInvoice.items![0].name).toBe('Industrial Widget');
    expect(historicalInvoice.items![0].totalAmount).toBe(118);

    expect(historicalInvoice.items![0].unitPrice).not.toBe(masterItem.salePrice);
    expect(historicalInvoice.items![0].gstRate).not.toBe(masterItem.gstRate);
    expect(historicalInvoice.items![0].name).not.toBe(masterItem.name);
  });

  // =========================================================================
  // TC-INVC-12: Low Stock Threshold Alert Calculation
  // =========================================================================
  it('TC-INVC-12: Low stock threshold alert triggers when currentStock <= minStockAlert', () => {
    const item1: Partial<InventoryItem> = {
      id: 'itm1',
      currentStock: 3,
      minStockAlert: 5,
    };
    expect(isLowStock(item1 as InventoryItem)).toBe(true);

    const item2: Partial<InventoryItem> = {
      id: 'itm2',
      currentStock: 10,
      minStockAlert: 5,
    };
    expect(isLowStock(item2 as InventoryItem)).toBe(false);

    // Exact boundary condition (currentStock === minStockAlert)
    const item3: Partial<InventoryItem> = {
      id: 'itm3',
      currentStock: 5,
      minStockAlert: 5,
    };
    expect(isLowStock(item3 as InventoryItem)).toBe(true);

    // Out of stock condition (currentStock === 0)
    const item4: Partial<InventoryItem> = {
      id: 'itm4',
      currentStock: 0,
      minStockAlert: 5,
    };
    expect(isLowStock(item4 as InventoryItem)).toBe(true);

    // Negative stock condition (oversold)
    const item5: Partial<InventoryItem> = {
      id: 'itm5',
      currentStock: -2,
      minStockAlert: 5,
    };
    expect(isLowStock(item5 as InventoryItem)).toBe(true);
  });
});
