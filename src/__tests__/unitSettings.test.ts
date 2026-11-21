import { describe, it, expect, beforeEach } from 'vitest';
import {
  listUnits,
  addUnit,
  deactivateUnit,
  activateUnit,
  getUnit,
  resetUnits,
  normalizeUnitCode,
  STANDARD_UNIT_SEEDS,
} from '../services/db/unitSettings.ts';
import { db } from '../services/db.ts';
import type { InventoryItem } from '../models/item.ts';
import type { InvoiceItemEntry } from '../models/invoice.ts';
import type { PurchaseItemEntry } from '../models/purchase.ts';

describe('Unit Registry (Part A1)', () => {
  beforeEach(() => {
    resetUnits();
  });

  describe('1. Seed Present', () => {
    it('seeds with the 13 standard GST units', () => {
      const units = listUnits();
      expect(units.length).toBe(13);

      const expectedStandardCodes = [
        'PCS',
        'NOS',
        'KGS',
        'GMS',
        'LTR',
        'ML',
        'MTR',
        'BOX',
        'PKT',
        'SET',
        'BAG',
        'HOURS',
        'DAYS',
      ];

      expectedStandardCodes.forEach((code) => {
        const found = units.find((u) => u.code === code);
        expect(found, `Expected seed ${code} to exist`).toBeDefined();
        expect(found?.kind).toBe('STANDARD');
        expect(found?.active).toBe(true);
        expect(found?.label).toBeTruthy();
      });
    });

    it('retrieves standard units by case-insensitive code', () => {
      expect(getUnit('pcs')?.code).toBe('PCS');
      expect(getUnit('  KGS  ')?.code).toBe('KGS');
      expect(getUnit('Box')?.code).toBe('BOX');
    });
  });

  describe('2. Add Custom Unit', () => {
    it('adds a new custom unit with uppercase code and label', () => {
      const added = addUnit('dozen', 'Dozen');
      expect(added).toEqual({
        code: 'DOZEN',
        label: 'Dozen',
        kind: 'CUSTOM',
        active: true,
      });

      const retrieved = getUnit('DOZEN');
      expect(retrieved).toEqual(added);

      const all = listUnits();
      expect(all.length).toBe(14);
      expect(all.some((u) => u.code === 'DOZEN')).toBe(true);
    });

    it('falls back to uppercase code when label is omitted or whitespace', () => {
      const added = addUnit('can', '   ');
      expect(added.code).toBe('CAN');
      expect(added.label).toBe('CAN');
      expect(added.kind).toBe('CUSTOM');
    });

    it('collapses internal whitespace in code', () => {
      const added = addUnit('sq   ft', 'Square Feet');
      expect(added.code).toBe('SQ FT');
      expect(getUnit('sq ft')?.label).toBe('Square Feet');
    });
  });

  describe('3. Duplicate and Empty Validation', () => {
    it('rejects duplicate code case-insensitively against standard units', () => {
      expect(() => addUnit('pcs', 'Pieces')).toThrow(/already exists/i);
      expect(() => addUnit('  PCS  ', 'Pieces')).toThrow(/already exists/i);
      expect(() => addUnit('kgs', 'Kilograms')).toThrow(/already exists/i);
    });

    it('rejects duplicate code case-insensitively against custom units', () => {
      addUnit('DOZEN', 'Dozen');
      expect(() => addUnit('dozen', 'Dozen copy')).toThrow(/already exists/i);
      expect(() => addUnit('  DOZEN  ', 'Dozen copy')).toThrow(/already exists/i);
    });

    it('rejects empty or whitespace-only code', () => {
      expect(() => addUnit('', 'Empty')).toThrow(/cannot be empty/i);
      expect(() => addUnit('   ', 'Whitespace')).toThrow(/cannot be empty/i);
    });
  });

  describe('4. Deactivate and Activate Unit', () => {
    it('deactivates a custom unit and places active units first in list', () => {
      addUnit('BRL', 'Barrels');
      expect(getUnit('BRL')?.active).toBe(true);

      const deactivated = deactivateUnit('BRL');
      expect(deactivated.active).toBe(false);
      expect(getUnit('BRL')?.active).toBe(false);

      const all = listUnits();
      // Active units must come first
      const brlIndex = all.findIndex((u) => u.code === 'BRL');
      expect(brlIndex).toBe(all.length - 1);
      expect(all[brlIndex].active).toBe(false);
    });

    it('reactivates a previously deactivated unit', () => {
      addUnit('DRUM', 'Drums');
      deactivateUnit('DRUM');
      expect(getUnit('DRUM')?.active).toBe(false);

      const reactivated = activateUnit('DRUM');
      expect(reactivated.active).toBe(true);
      expect(getUnit('DRUM')?.active).toBe(true);
    });

    it('throws when deactivating or activating a non-existent unit', () => {
      expect(() => deactivateUnit('NON_EXISTENT')).toThrow(/not found/i);
      expect(() => activateUnit('NON_EXISTENT')).toThrow(/not found/i);
    });
  });

  describe('5. Unknown Codes Tolerated (Type Widening)', () => {
    it('returns undefined for unknown unit codes without throwing', () => {
      expect(getUnit('NON_EXISTENT_UNIT')).toBeUndefined();
      expect(getUnit('')).toBeUndefined();
    });

    it('InventoryItem accepts arbitrary custom unit string codes', () => {
      const customItem: InventoryItem = {
        id: 'ITM-CUSTOM-1',
        name: 'Custom Product',
        hsnSacCode: '1234',
        category: 'General',
        unit: 'DOZEN',
        salePrice: 100,
        purchasePrice: 80,
        gstRate: 18,
        currentStock: 50,
        minStockAlert: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(customItem.unit).toBe('DOZEN');
    });

    it('InvoiceItemEntry and PurchaseItemEntry accept custom unit strings', () => {
      const invoiceLine: InvoiceItemEntry = {
        itemId: 'ITM-1',
        name: 'Product A',
        hsnSacCode: '1234',
        unit: 'CUSTOM_CRATE',
        quantity: 10,
        unitPrice: 50,
        taxableAmount: 500,
        gstRate: 18,
        cgstAmount: 45,
        sgstAmount: 45,
        igstAmount: 0,
        cessAmount: 0,
        totalAmount: 590,
      };

      const purchaseLine: PurchaseItemEntry = {
        itemId: 'ITM-1',
        name: 'Product A',
        hsnSacCode: '1234',
        unit: 'CUSTOM_BARREL',
        quantity: 5,
        unitPrice: 200,
        taxableAmount: 1000,
        gstRate: 18,
        cgstAmount: 90,
        sgstAmount: 90,
        igstAmount: 0,
        cessAmount: 0,
        totalAmount: 1180,
      };

      expect(invoiceLine.unit).toBe('CUSTOM_CRATE');
      expect(purchaseLine.unit).toBe('CUSTOM_BARREL');
    });
  });

  describe('6. DB Storage Facade Integration', () => {
    it('db exposes listUnits, addUnit, deactivateUnit, getUnit consistently', () => {
      const initialUnits = db.listUnits();
      expect(initialUnits.length).toBe(13);

      const added = db.addUnit('TIN', 'Tin Canister');
      expect(added.code).toBe('TIN');

      const found = db.getUnit('tin');
      expect(found?.label).toBe('Tin Canister');

      db.deactivateUnit('TIN');
      expect(db.getUnit('TIN')?.active).toBe(false);

      db.activateUnit('TIN');
      expect(db.getUnit('TIN')?.active).toBe(true);
    });
  });
});
