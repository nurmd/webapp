import { describe, it, expect } from 'vitest';
import { sanitizeQuantityInput, formatQuantity, roundQuantity } from '../core/utils/formatters.ts';

describe('Item Quantity Decimal Precision (up to 4 decimals)', () => {
  describe('sanitizeQuantityInput', () => {
    it('allows clean integers and whole quantities', () => {
      expect(sanitizeQuantityInput('5')).toBe('5');
      expect(sanitizeQuantityInput('100')).toBe('100');
    });

    it('allows typing decimal points without erasing in progress', () => {
      expect(sanitizeQuantityInput('1.')).toBe('1.');
      expect(sanitizeQuantityInput('0.')).toBe('0.');
    });

    it('allows 1 to 4 decimal places dynamically', () => {
      expect(sanitizeQuantityInput('1.5')).toBe('1.5');
      expect(sanitizeQuantityInput('1.25')).toBe('1.25');
      expect(sanitizeQuantityInput('1.250')).toBe('1.250');
      expect(sanitizeQuantityInput('1.2345')).toBe('1.2345');
    });

    it('strictly clamps/truncates decimal places exceeding 4 digits', () => {
      expect(sanitizeQuantityInput('1.23456')).toBe('1.2345');
      expect(sanitizeQuantityInput('1.123456789')).toBe('1.1234');
      expect(sanitizeQuantityInput('0.00001')).toBe('0.0000');
    });

    it('strips non-numeric characters and extra decimal separators', () => {
      expect(sanitizeQuantityInput('1.2.3')).toBe('1.23');
      expect(sanitizeQuantityInput('abc 2.750 kgs')).toBe('2.750');
      expect(sanitizeQuantityInput('₹ 4.50')).toBe('4.50');
    });
  });

  describe('formatQuantity', () => {
    it('removes unnecessary trailing zeros', () => {
      expect(formatQuantity(2.5000)).toBe('2.5');
      expect(formatQuantity(1.200)).toBe('1.2');
      expect(formatQuantity(5.0)).toBe('5');
      expect(formatQuantity(0)).toBe('0');
    });

    it('displays 3 and 4 decimal places cleanly', () => {
      expect(formatQuantity(1.125)).toBe('1.125');
      expect(formatQuantity(1.2345)).toBe('1.2345');
      expect(formatQuantity(0.0005)).toBe('0.0005');
    });

    it('handles NaN safely', () => {
      expect(formatQuantity(NaN)).toBe('0');
    });
  });

  describe('roundQuantity', () => {
    it('rounds floating point quantities to 4 decimal places', () => {
      expect(roundQuantity(1.23456)).toBe(1.2346);
      expect(roundQuantity(1.23454)).toBe(1.2345);
      expect(roundQuantity(2.5)).toBe(2.5);
      expect(roundQuantity(0)).toBe(0);
    });

    it('cleans up floating point precision anomalies', () => {
      const floatSum = 0.1001 + 0.2002; // 0.30030000000000004
      expect(roundQuantity(floatSum)).toBe(0.3003);
    });
  });
});
