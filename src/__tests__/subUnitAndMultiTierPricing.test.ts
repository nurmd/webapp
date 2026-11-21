import { describe, it, expect, beforeEach } from 'vitest';
import {
  convertQuantityToBase,
  convertQuantityFromBase,
  applyInvoiceStockDecrement,
  restoreInvoiceStock,
  applyPurchaseStockIncrement,
  applyPurchaseStockDecrement,
} from '../core/inventory/stockEngine.ts';
import { normalizeInvoiceLineItem } from '../core/invoicing/lineItemEngine.ts';
import { exclusiveFromInclusive, inclusiveFromExclusive } from '../core/gst/pricing.ts';
import { createPosCartItem } from '../components/POS/types.ts';
import { db } from '../services/db.ts';
import type { InventoryItem } from '../models/item.ts';
import type { InvoiceItemEntry } from '../models/invoice.ts';
import type { PurchaseItemEntry } from '../models/purchase.ts';

function createTestItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'ITM-' + Math.random().toString(36).slice(2, 8),
    name: 'Test Item',
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

function createTestInvoiceLine(overrides: Partial<InvoiceItemEntry> = {}): InvoiceItemEntry {
  return {
    itemId: 'ITM-TEST',
    name: 'Test Item',
    hsnSacCode: '8443',
    unit: 'PCS',
    quantity: 1,
    unitPrice: 100,
    discountPercent: 0,
    taxableAmount: 100,
    cgstAmount: 9,
    sgstAmount: 9,
    igstAmount: 0,
    cessAmount: 0,
    totalAmount: 118,
    gstRate: 18,
    ...overrides,
  };
}

function createTestPurchaseLine(overrides: Partial<PurchaseItemEntry> = {}): PurchaseItemEntry {
  return {
    itemId: 'ITM-TEST',
    name: 'Test Item',
    hsnSacCode: '8443',
    unit: 'PCS',
    quantity: 1,
    unitPrice: 80,
    discountPercent: 0,
    taxableAmount: 80,
    cgstAmount: 7.2,
    sgstAmount: 7.2,
    igstAmount: 0,
    cessAmount: 0,
    totalAmount: 94.4,
    gstRate: 18,
    ...overrides,
  };
}

describe('Sub-Units and Multi-Tier Pricing (Phases 2 & 3)', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  // =========================================================================
  // Part A: Sub-Unit Conversion & Stock Math
  // =========================================================================
  describe('Sub-Unit Conversion Math', () => {
    const dozenItem: Pick<InventoryItem, 'unit' | 'subUnit' | 'subUnitFactor'> = {
      unit: 'DOZEN',
      subUnit: 'PCS',
      subUnitFactor: 12,
    };

    const bagItem: Pick<InventoryItem, 'unit' | 'subUnit' | 'subUnitFactor'> = {
      unit: 'BAG',
      subUnit: 'KG',
      subUnitFactor: 40,
    };

    const plainItem: Pick<InventoryItem, 'unit' | 'subUnit' | 'subUnitFactor'> = {
      unit: 'PCS',
    };

    it('converts main unit to base unit (DOZEN acceptance: 2 DOZEN -> 24 PCS)', () => {
      const baseQty = convertQuantityToBase(2, 'DOZEN', dozenItem);
      expect(baseQty).toBe(24);
    });

    it('converts base unit back to main unit (24 PCS -> 2 DOZEN)', () => {
      const mainQty = convertQuantityFromBase(24, 'DOZEN', dozenItem);
      expect(mainQty).toBe(2);
    });

    it('converts main unit to base unit (BAG acceptance: 1 BAG -> 40 KG)', () => {
      const baseQty = convertQuantityToBase(1, 'BAG', bagItem);
      expect(baseQty).toBe(40);
    });

    it('converts base unit back to main unit (40 KG -> 1 BAG)', () => {
      const mainQty = convertQuantityFromBase(40, 'BAG', bagItem);
      expect(mainQty).toBe(1);
    });

    it('retains quantity when already expressed in sub-unit (24 PCS -> 24 PCS)', () => {
      const baseQty = convertQuantityToBase(24, 'PCS', dozenItem);
      expect(baseQty).toBe(24);

      const fromBase = convertQuantityFromBase(24, 'PCS', dozenItem);
      expect(fromBase).toBe(24);
    });

    it('handles decimal quantities in main unit (0.5 DOZEN -> 6 PCS, 2.5 BAG -> 100 KG)', () => {
      expect(convertQuantityToBase(0.5, 'DOZEN', dozenItem)).toBe(6);
      expect(convertQuantityToBase(2.5, 'BAG', bagItem)).toBe(100);
      expect(convertQuantityFromBase(6, 'DOZEN', dozenItem)).toBe(0.5);
      expect(convertQuantityFromBase(100, 'BAG', bagItem)).toBe(2.5);
    });

    it('falls back to raw quantity when no subUnit or factor <= 0', () => {
      expect(convertQuantityToBase(5, 'PCS', plainItem)).toBe(5);
      expect(convertQuantityFromBase(5, 'PCS', plainItem)).toBe(5);

      const zeroFactorItem = { unit: 'BOX', subUnit: 'PCS', subUnitFactor: 0 };
      expect(convertQuantityToBase(5, 'BOX', zeroFactorItem)).toBe(5);
      expect(convertQuantityFromBase(5, 'BOX', zeroFactorItem)).toBe(5);

      const negFactorItem = { unit: 'BOX', subUnit: 'PCS', subUnitFactor: -1 };
      expect(convertQuantityToBase(5, 'BOX', negFactorItem)).toBe(5);
      expect(convertQuantityFromBase(5, 'BOX', negFactorItem)).toBe(5);
    });
  });

  // =========================================================================
  // Part A Acceptance: Stock Decrement in Base Units
  // =========================================================================
  describe('Stock Decrement in Base Units (Acceptance Criteria)', () => {
    it('DOZEN acceptance: selling 2 DOZEN decrements 24 PCS from stock', () => {
      const catalog: InventoryItem[] = [
        createTestItem({
          id: 'ITM-DOZEN',
          name: 'Premium Eggs',
          hsnSacCode: '0407',
          category: 'Grocery',
          unit: 'DOZEN',
          subUnit: 'PCS',
          subUnitFactor: 12,
          salePrice: 120,
          currentStock: 100, // 100 base units (PCS)
        }),
      ];

      const invoiceLines: InvoiceItemEntry[] = [
        createTestInvoiceLine({
          itemId: 'ITM-DOZEN',
          name: 'Premium Eggs',
          hsnSacCode: '0407',
          unit: 'DOZEN',
          quantity: 2, // 2 DOZEN
          unitPrice: 120,
          totalAmount: 240,
        }),
      ];

      const updated = applyInvoiceStockDecrement(catalog, invoiceLines);
      // 100 - (2 * 12) = 76 PCS
      expect(updated[0].currentStock).toBe(76);
    });

    it('BAG acceptance: selling 1 BAG decrements 40 KG from stock', () => {
      const catalog: InventoryItem[] = [
        createTestItem({
          id: 'ITM-BAG',
          name: 'Basmati Rice',
          hsnSacCode: '1006',
          category: 'Grains',
          unit: 'BAG',
          subUnit: 'KG',
          subUnitFactor: 40,
          salePrice: 2000,
          currentStock: 200, // 200 KG
        }),
      ];

      const invoiceLines: InvoiceItemEntry[] = [
        createTestInvoiceLine({
          itemId: 'ITM-BAG',
          name: 'Basmati Rice',
          hsnSacCode: '1006',
          unit: 'BAG',
          quantity: 1, // 1 BAG
          unitPrice: 2000,
          totalAmount: 2100,
        }),
      ];

      const updated = applyInvoiceStockDecrement(catalog, invoiceLines);
      // 200 - (1 * 40) = 160 KG
      expect(updated[0].currentStock).toBe(160);
    });

    it('selling directly in sub-unit decrements exact sub-unit quantity', () => {
      const catalog: InventoryItem[] = [
        createTestItem({
          id: 'ITM-DOZEN',
          name: 'Premium Eggs',
          hsnSacCode: '0407',
          category: 'Grocery',
          unit: 'DOZEN',
          subUnit: 'PCS',
          subUnitFactor: 12,
          salePrice: 120,
          currentStock: 100, // 100 PCS
        }),
      ];

      // Selling 5 PCS directly
      const invoiceLines: InvoiceItemEntry[] = [
        createTestInvoiceLine({
          itemId: 'ITM-DOZEN',
          name: 'Premium Eggs',
          hsnSacCode: '0407',
          unit: 'PCS',
          quantity: 5,
          subUnit: 'PCS',
          subUnitQuantity: 5,
          unitPrice: 10,
          totalAmount: 50,
        }),
      ];

      const updated = applyInvoiceStockDecrement(catalog, invoiceLines);
      // 100 - 5 = 95 PCS
      expect(updated[0].currentStock).toBe(95);
    });

    it('restores stock in base units when invoice is cancelled or edited', () => {
      const catalog: InventoryItem[] = [
        createTestItem({
          id: 'ITM-DOZEN',
          name: 'Premium Eggs',
          hsnSacCode: '0407',
          category: 'Grocery',
          unit: 'DOZEN',
          subUnit: 'PCS',
          subUnitFactor: 12,
          salePrice: 120,
          currentStock: 76,
        }),
      ];

      const restored = restoreInvoiceStock(catalog, [
        createTestInvoiceLine({
          itemId: 'ITM-DOZEN',
          name: 'Premium Eggs',
          hsnSacCode: '0407',
          unit: 'DOZEN',
          quantity: 2,
          unitPrice: 120,
          totalAmount: 240,
        }),
      ]);

      // 76 + 24 = 100 PCS
      expect(restored[0].currentStock).toBe(100);
    });

    it('increments and decrements purchase stock in base units', () => {
      const catalog: InventoryItem[] = [
        createTestItem({
          id: 'ITM-BAG',
          name: 'Basmati Rice',
          hsnSacCode: '1006',
          category: 'Grains',
          unit: 'BAG',
          subUnit: 'KG',
          subUnitFactor: 40,
          salePrice: 2000,
          purchasePrice: 1600,
          currentStock: 100,
        }),
      ];

      const purchaseLines: PurchaseItemEntry[] = [
        createTestPurchaseLine({
          itemId: 'ITM-BAG',
          name: 'Basmati Rice',
          hsnSacCode: '1006',
          unit: 'BAG',
          quantity: 3, // 3 BAG = 120 KG
          unitPrice: 1600,
          totalAmount: 5040,
        }),
      ];

      const afterPurchase = applyPurchaseStockIncrement(catalog, purchaseLines);
      // 100 + 120 = 220 KG
      expect(afterPurchase[0].currentStock).toBe(220);

      const afterReturn = applyPurchaseStockDecrement(afterPurchase, purchaseLines);
      // 220 - 120 = 100 KG
      expect(afterReturn[0].currentStock).toBe(100);
    });
  });

  // =========================================================================
  // Part B: Multi-Tier Pricing Model & Line Selector Logic
  // =========================================================================
  describe('Multi-Tier Pricing Logic', () => {
    const tieredItem: InventoryItem = createTestItem({
      id: 'ITM-TIER-01',
      name: 'Wireless Mouse',
      hsnSacCode: '8471',
      category: 'Electronics',
      unit: 'PCS',
      salePrice: 500, // Retail
      semiWholesalePrice: 450, // Semi-Wholesale
      wholesalePrice: 400, // Wholesale
      defaultPriceTier: 'RETAIL',
      gstRate: 18,
      currentStock: 50,
    });

    it('initializes POS cart item with default price tier (Retail)', () => {
      const cartItem = createPosCartItem(tieredItem, 1);
      expect(cartItem.priceTier).toBe('RETAIL');
      expect(cartItem.unitPrice).toBe(500);
      expect(cartItem.unitPriceInclusive).toBe(inclusiveFromExclusive(500, 18));
    });

    it('initializes POS cart item with configured default tier (Wholesale)', () => {
      const wholesaleDefaultItem: InventoryItem = {
        ...tieredItem,
        defaultPriceTier: 'WHOLESALE',
      };
      const cartItem = createPosCartItem(wholesaleDefaultItem, 1);
      expect(cartItem.priceTier).toBe('WHOLESALE');
      expect(cartItem.unitPrice).toBe(400);
      expect(cartItem.unitPriceInclusive).toBe(inclusiveFromExclusive(400, 18));
    });

    it('initializes POS cart item with configured default tier (Semi-Wholesale)', () => {
      const semiDefaultItem: InventoryItem = {
        ...tieredItem,
        defaultPriceTier: 'SEMI_WHOLESALE',
      };
      const cartItem = createPosCartItem(semiDefaultItem, 1);
      expect(cartItem.priceTier).toBe('SEMI_WHOLESALE');
      expect(cartItem.unitPrice).toBe(450);
      expect(cartItem.unitPriceInclusive).toBe(inclusiveFromExclusive(450, 18));
    });

    it('EXCLUSIVE mode: selecting tier sets unitPrice and derives unitPriceInclusive', () => {
      const gst = 18;
      // Semi-Wholesale in EXCLUSIVE
      const semiExcl = 450;
      const semiIncl = inclusiveFromExclusive(semiExcl, gst);
      expect(semiIncl).toBe(531);

      // Wholesale in EXCLUSIVE
      const wholeExcl = 400;
      const wholeIncl = inclusiveFromExclusive(wholeExcl, gst);
      expect(wholeIncl).toBe(472);
    });

    it('INCLUSIVE mode: selecting tier sets unitPriceInclusive and derives unitPrice', () => {
      const gst = 18;
      // Wholesale in INCLUSIVE (400 is gross inclusive price)
      const wholeIncl = 400;
      const wholeExcl = exclusiveFromInclusive(wholeIncl, gst);
      expect(wholeExcl).toBeCloseTo(338.98, 2);
    });

    it('falls back to Retail when non-retail tier price is missing or zero', () => {
      const partialTierItem: InventoryItem = createTestItem({
        id: 'ITM-PARTIAL',
        name: 'Keyboard',
        hsnSacCode: '8471',
        category: 'Electronics',
        unit: 'PCS',
        salePrice: 800,
        semiWholesalePrice: undefined,
        wholesalePrice: 0,
        defaultPriceTier: 'RETAIL',
        gstRate: 18,
        currentStock: 20,
      });

      const cartItem = createPosCartItem(partialTierItem, 1);
      expect(cartItem.priceTier).toBe('RETAIL');
      expect(cartItem.unitPrice).toBe(800);
    });
  });

  // =========================================================================
  // Part C: End-to-End Billing Line & Line Item Engine Normalization
  // =========================================================================
  describe('End-to-End Billing Line & Engine Normalization', () => {
    it('normalizes invoice line item preserving subUnit, subUnitQuantity, and priceTier', () => {
      const raw = {
        itemId: 'ITM-DOZEN',
        name: 'Organic Bananas',
        hsnSacCode: '0803',
        unit: 'DOZEN',
        subUnit: 'PCS',
        subUnitQuantity: 36,
        priceTier: 'WHOLESALE' as const,
        quantity: 3,
        unitPrice: 60, // Wholesale rate
        priceMode: 'EXCLUSIVE' as const,
        discountPercent: 10,
        gstRate: 5,
      };

      const normalized = normalizeInvoiceLineItem(
        raw,
        {
          taxableAmount: 162,
          totalAmount: 170.1,
          discountAmount: 18,
          cgstAmount: 4.05,
          sgstAmount: 4.05,
        },
        { isGstActive: true, isComposition: false },
        0
      );

      expect(normalized.subUnit).toBe('PCS');
      expect(normalized.subUnitQuantity).toBe(36);
      expect(normalized.priceTier).toBe('WHOLESALE');
      expect(normalized.unitPrice).toBe(60);
      expect(normalized.quantity).toBe(3);
      expect(normalized.discountPercent).toBe(10);
      // Taxable: 3 * 60 = 180, less 10% disc = 162
      expect(normalized.taxableAmount).toBe(162);
      // 5% GST on 162 = 8.10 (CGST 4.05, SGST 4.05)
      expect(normalized.totalAmount).toBe(170.1);
    });

    it('end-to-end: saved line with wholesale price decrements inventory correctly', () => {
      const catalog: InventoryItem[] = [
        createTestItem({
          id: 'ITM-COTTON',
          name: 'Cotton Rolls',
          hsnSacCode: '5201',
          category: 'Textiles',
          unit: 'BOX',
          subUnit: 'PCS',
          subUnitFactor: 20,
          salePrice: 1000,
          semiWholesalePrice: 900,
          wholesalePrice: 800,
          currentStock: 200, // 200 PCS
        }),
      ];

      // Customer buys 2 BOX at Wholesale tier (800/box)
      const invoiceLine = normalizeInvoiceLineItem(
        {
          itemId: 'ITM-COTTON',
          name: 'Cotton Rolls',
          hsnSacCode: '5201',
          unit: 'BOX',
          subUnit: 'PCS',
          subUnitQuantity: 40, // 2 BOX * 20 PCS/BOX = 40 PCS
          priceTier: 'WHOLESALE',
          quantity: 2,
          unitPrice: 800,
          priceMode: 'EXCLUSIVE',
          discountPercent: 0,
          gstRate: 5,
        },
        undefined,
        { isGstActive: true, isComposition: false },
        0
      );

      expect(invoiceLine.priceTier).toBe('WHOLESALE');
      expect(invoiceLine.unitPrice).toBe(800);

      // Decrement stock
      const updatedCatalog = applyInvoiceStockDecrement(catalog, [invoiceLine]);
      // 200 - 40 = 160 PCS
      expect(updatedCatalog[0].currentStock).toBe(160);
    });
  });

  // =========================================================================
  // Part D: Database Persistence Roundtrip
  // =========================================================================
  describe('Database Item Persistence Roundtrip', () => {
    it('saves and retrieves item with subUnit, subUnitFactor, and price tiers', () => {
      const itemToSave: InventoryItem = createTestItem({
        id: 'ITM-TEST-RT',
        name: 'Castor Oil Bottle',
        hsnSacCode: '1515',
        category: 'Oils',
        unit: 'BOX',
        subUnit: 'BOTTLE',
        subUnitFactor: 24,
        salePrice: 2400,
        semiWholesalePrice: 2200,
        wholesalePrice: 2000,
        defaultPriceTier: 'SEMI_WHOLESALE',
        gstRate: 12,
        currentStock: 48,
      });

      db.saveItem(itemToSave);

      const retrieved = db.getItems().find((i) => i.id === 'ITM-TEST-RT');
      expect(retrieved).toBeDefined();
      expect(retrieved?.unit).toBe('BOX');
      expect(retrieved?.subUnit).toBe('BOTTLE');
      expect(retrieved?.subUnitFactor).toBe(24);
      expect(retrieved?.salePrice).toBe(2400);
      expect(retrieved?.semiWholesalePrice).toBe(2200);
      expect(retrieved?.wholesalePrice).toBe(2000);
      expect(retrieved?.defaultPriceTier).toBe('SEMI_WHOLESALE');
    });
  });

  // =========================================================================
  // Part E: Stock Valuation & Display Units (Defect 1)
  // =========================================================================
  describe('Stock Valuation and Display Unit Alignment (Defect 1)', () => {
    it('computes stock value by converting base units back to main unit', () => {
      // 100 PCS of DOZEN item (factor 12) at ₹120/DOZEN
      const dozenItem = createTestItem({
        unit: 'DOZEN',
        subUnit: 'PCS',
        subUnitFactor: 12,
        currentStock: 100, // 100 PCS
        purchasePrice: 120, // ₹120 per DOZEN (which is ₹10 per PCS)
      });

      const stockInMain = convertQuantityFromBase(dozenItem.currentStock, dozenItem.unit, dozenItem);
      // 100 / 12 = 8.3333 DOZEN
      expect(stockInMain).toBeCloseTo(8.3333, 4);

      const stockValue = stockInMain * dozenItem.purchasePrice;
      // 8.3333 * 120 = 1000, NOT 100 * 120 = 12000
      expect(stockValue).toBeCloseTo(1000, 2);
    });

    it('computes stock value correctly for standard unit with sub-unit (BAG of KG)', () => {
      // 200 KG of BAG item (factor 40) at ₹2000/BAG
      const bagItem = createTestItem({
        unit: 'BAG',
        subUnit: 'KG',
        subUnitFactor: 40,
        currentStock: 200, // 200 KG = 5 BAG
        purchasePrice: 2000, // ₹2000 per BAG
      });

      const stockInMain = convertQuantityFromBase(bagItem.currentStock, bagItem.unit, bagItem);
      expect(stockInMain).toBe(5);

      const stockValue = stockInMain * bagItem.purchasePrice;
      // 5 * 2000 = 10,000, NOT 200 * 2000 = 400,000
      expect(stockValue).toBe(10000);
    });
  });

  // =========================================================================
  // Part F: Documented Tier Price Tax Mode Convention (Defect 2)
  // =========================================================================
  describe('Tier Price Tax Mode Convention (Defect 2)', () => {
    it('in EXCLUSIVE mode, tier prices are GST-exclusive and derive inclusive prices', () => {
      const gst = 18;
      const wholesalePrice = 500;
      // In EXCLUSIVE mode:
      const excl = wholesalePrice;
      const incl = inclusiveFromExclusive(excl, gst);
      expect(excl).toBe(500);
      expect(incl).toBe(590);
    });

    it('in INCLUSIVE mode, tier prices are GST-inclusive and derive exclusive prices', () => {
      const gst = 18;
      const wholesalePrice = 590;
      // In INCLUSIVE mode:
      const incl = wholesalePrice;
      const excl = exclusiveFromInclusive(incl, gst);
      expect(incl).toBe(590);
      expect(excl).toBe(500);
    });
  });
});
