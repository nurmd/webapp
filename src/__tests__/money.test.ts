import { describe, it, expect } from 'vitest';
import {
  roundMoney,
  toPaise,
  fromPaise,
  addMoney,
  subMoney,
  mulMoney,
  sumMoney,
  isZeroMoney,
} from '../core/money.ts';

describe('core/money Precision Utilities', () => {
  describe('roundMoney', () => {
    it('correctly handles classic 0.1 + 0.2 floating-point drift', () => {
      // In raw IEEE 754: 0.1 + 0.2 === 0.30000000000000004
      expect(0.1 + 0.2).not.toBe(0.3);
      expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    });

    it('correctly rounds 1.005 half-up to 1.01 using EPSILON', () => {
      // In raw JS: Math.round(1.005 * 100) / 100 === 1 due to 100.49999999999999
      expect(roundMoney(1.005)).toBe(1.01);
    });

    it('correctly rounds 2.675 half-up to 2.68 using EPSILON', () => {
      // In raw JS: Math.round(2.675 * 100) / 100 === 2.67 due to 267.49999999999994
      expect(roundMoney(2.675)).toBe(2.68);
    });

    it('handles negative values symmetrically without negative zero', () => {
      expect(roundMoney(-1.005)).toBe(-1.01);
      expect(roundMoney(-2.675)).toBe(-2.68);
      expect(roundMoney(-0.001)).toBe(0);
      expect(Object.is(roundMoney(-0.0001), -0)).toBe(false);
      expect(roundMoney(-150.755)).toBe(-150.76);
    });

    it('accurately rounds large currency figures without integer overflow', () => {
      expect(roundMoney(10_000_000.555)).toBe(10_000_000.56);
      expect(roundMoney(99_999_999.994)).toBe(99_999_999.99);
      expect(roundMoney(99_999_999.996)).toBe(100_000_000);
      expect(roundMoney(543_210_987.654)).toBe(543_210_987.65);
    });

    it('returns 0 for non-finite inputs', () => {
      expect(roundMoney(NaN)).toBe(0);
      expect(roundMoney(Infinity)).toBe(0);
      expect(roundMoney(-Infinity)).toBe(0);
    });
  });

  describe('toPaise & fromPaise (paise round-trip)', () => {
    it('converts between rupees and integer paise accurately', () => {
      expect(toPaise(0)).toBe(0);
      expect(toPaise(0.01)).toBe(1);
      expect(toPaise(1.005)).toBe(101);
      expect(toPaise(2.675)).toBe(268);
      expect(toPaise(-1.005)).toBe(-101);
      expect(toPaise(1234.56)).toBe(123456);

      expect(fromPaise(1)).toBe(0.01);
      expect(fromPaise(101)).toBe(1.01);
      expect(fromPaise(268)).toBe(2.68);
      expect(fromPaise(-101)).toBe(-1.01);
      expect(fromPaise(123456)).toBe(1234.56);
    });

    it('guarantees bidirectional paise round-trip across diverse values', () => {
      const testValues = [
        0,
        0.01,
        0.05,
        0.1,
        0.33,
        0.99,
        1.0,
        1.005,
        2.675,
        12.34,
        99.99,
        500.25,
        10000.5,
        1234567.89,
        -0.01,
        -12.34,
        -999.99,
      ];

      for (const val of testValues) {
        const expectedRounded = roundMoney(val);
        const paise = toPaise(val);
        expect(fromPaise(paise)).toBe(expectedRounded);
        expect(toPaise(fromPaise(paise))).toBe(paise);
      }
    });
  });

  describe('addMoney & subMoney', () => {
    it('adds amounts without binary floating point drift', () => {
      expect(addMoney(0.1, 0.2)).toBe(0.3);
      expect(addMoney(10.05, 20.05)).toBe(30.1);
      expect(addMoney(-50, 20)).toBe(-30);
    });

    it('subtracts amounts without binary floating point drift', () => {
      expect(subMoney(0.3, 0.2)).toBe(0.1);
      expect(subMoney(0.3, 0.1)).toBe(0.2);
      expect(subMoney(100, 33.33)).toBe(66.67);
      expect(subMoney(-30, 20)).toBe(-50);
    });
  });

  describe('mulMoney', () => {
    it('multiplies and rounds to 2 decimal places', () => {
      expect(mulMoney(10.5, 2)).toBe(21);
      expect(mulMoney(33.333, 3)).toBe(100);
      expect(mulMoney(1.005, 1)).toBe(1.01);
      expect(mulMoney(0, 50)).toBe(0);
      expect(mulMoney(NaN, 2)).toBe(0);
    });
  });

  describe('sumMoney', () => {
    it('ensures sum of split tenders exactly equals grand total', () => {
      // Three splits adding to 100.00 exactly
      const splits = [33.33, 33.33, 33.34];
      expect(sumMoney(splits)).toBe(100);

      // Complex multi-tender breakdown
      const tenders = [10.25, 20.5, 30.75, 40.0];
      expect(sumMoney(tenders)).toBe(101.5);

      // Decimals with float drift in vanilla JS:
      // [0.1, 0.2, 0.3].reduce((a, b) => a + b, 0) === 0.6000000000000001
      expect(sumMoney([0.1, 0.2, 0.3])).toBe(0.6);
    });

    it('returns 0 for empty or invalid lists', () => {
      expect(sumMoney([])).toBe(0);
      expect(sumMoney(undefined as unknown as number[])).toBe(0);
    });
  });

  describe('isZeroMoney', () => {
    it('returns true for zero and sub-paise amounts', () => {
      expect(isZeroMoney(0)).toBe(true);
      expect(isZeroMoney(-0)).toBe(true);
      expect(isZeroMoney(0.004)).toBe(true);
      expect(isZeroMoney(-0.004)).toBe(true);
      expect(isZeroMoney(NaN)).toBe(true);
      expect(isZeroMoney(Infinity)).toBe(true);
    });

    it('returns false for amounts >= 0.5 paise', () => {
      expect(isZeroMoney(0.005)).toBe(false);
      expect(isZeroMoney(0.01)).toBe(false);
      expect(isZeroMoney(-0.01)).toBe(false);
      expect(isZeroMoney(100)).toBe(false);
    });
  });
});
