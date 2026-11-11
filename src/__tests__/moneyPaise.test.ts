import { describe, it, expect } from 'vitest';
import {
  type Paise,
  addPaise,
  subPaise,
  mulPaiseByRate,
  divPaise,
  mulPaiseByFactor,
  negatePaise,
  absPaise,
  isZeroPaise,
  clampPaise,
  comparePaise,
} from '../core/money';

describe('core/money Integer-Paise Operations', () => {
  describe('type Paise', () => {
    it('accepts integer signed paise values', () => {
      const p1: Paise = 100;
      const p2: Paise = -50;
      expect(p1 + p2).toBe(50);
    });
  });

  describe('addPaise & subPaise exactness (0.1+0.2 scenario in paise)', () => {
    it('eliminates 0.1 + 0.2 floating-point drift using integer paise', () => {
      // In floating-point rupees: 0.10 + 0.20 = 0.30000000000000004
      expect(0.1 + 0.2).not.toBe(0.3);

      // In integer paise: 10 paise + 20 paise === 30 paise exactly
      const tenPaise: Paise = 10;
      const twentyPaise: Paise = 20;
      expect(addPaise(tenPaise, twentyPaise)).toBe(30);

      // Subtraction exactness
      expect(subPaise(30, 20)).toBe(10);
      expect(subPaise(30, 10)).toBe(20);
    });

    it('performs exact addition and subtraction across signed amounts', () => {
      expect(addPaise(1005, 2005)).toBe(3010);
      expect(addPaise(-5000, 2000)).toBe(-3000);
      expect(subPaise(10000, 3333)).toBe(6667);
      expect(subPaise(-3000, 2000)).toBe(-5000);
      expect(subPaise(1000, -500)).toBe(1500);
    });

    it('normalizes -0 to 0 in addPaise and subPaise', () => {
      expect(Object.is(addPaise(-0, 0), -0)).toBe(false);
      expect(Object.is(addPaise(-0, -0), -0)).toBe(false);
      expect(Object.is(addPaise(-50, 50), -0)).toBe(false);
      expect(addPaise(-0, 0)).toBe(0);

      expect(Object.is(subPaise(100, 100), -0)).toBe(false);
      expect(Object.is(subPaise(0, 0), -0)).toBe(false);
      expect(Object.is(subPaise(-0, 0), -0)).toBe(false);
      expect(subPaise(100, 100)).toBe(0);
    });

    it('handles non-finite inputs by returning other operand or 0', () => {
      expect(addPaise(100, NaN)).toBe(100);
      expect(addPaise(NaN, 100)).toBe(100);
      expect(addPaise(NaN, NaN)).toBe(0);
      expect(addPaise(Infinity, 100)).toBe(100);
      expect(addPaise(100, -Infinity)).toBe(100);

      expect(subPaise(100, NaN)).toBe(100);
      expect(subPaise(NaN, 100)).toBe(-100);
      expect(subPaise(NaN, NaN)).toBe(0);
      expect(subPaise(100, Infinity)).toBe(100);
    });
  });

  describe('mulPaiseByRate', () => {
    it('computes 18% of 10000 paise = 1800 paise', () => {
      expect(mulPaiseByRate(10000, 18)).toBe(1800);
    });

    it('accurately computes standard GST tax rates on diverse amounts', () => {
      // 5% of 100 paise = 5 paise
      expect(mulPaiseByRate(100, 5)).toBe(5);

      // 12% of 5000 paise = 600 paise
      expect(mulPaiseByRate(5000, 12)).toBe(600);

      // 28% of 25000 paise = 7000 paise
      expect(mulPaiseByRate(25000, 28)).toBe(7000);

      // Fractional rate: 2.5% of 100 paise = 3 paise (rounds half-up)
      expect(mulPaiseByRate(100, 2.5)).toBe(3);
    });

    it('uses sign-aware EPSILON-safe rounding to nearest paisa', () => {
      // 5% of 10 paise = 0.5 paise -> rounds to 1 paisa
      expect(mulPaiseByRate(10, 5)).toBe(1);

      // 5% of -10 paise = -0.5 paise -> rounds symmetrically to -1 paisa
      expect(mulPaiseByRate(-10, 5)).toBe(-1);

      // 18% of 333 paise = 59.94 paise -> rounds to 60 paise
      expect(mulPaiseByRate(333, 18)).toBe(60);

      // Negative paise with 18%
      expect(mulPaiseByRate(-10000, 18)).toBe(-1800);
    });

    it('normalizes -0 to 0', () => {
      expect(Object.is(mulPaiseByRate(0, 18), -0)).toBe(false);
      expect(Object.is(mulPaiseByRate(-0, 18), -0)).toBe(false);
      expect(Object.is(mulPaiseByRate(-1, 0.01), -0)).toBe(false);
      expect(mulPaiseByRate(0, 18)).toBe(0);
      expect(mulPaiseByRate(-0, 18)).toBe(0);
    });

    it('handles non-finite inputs gracefully returning 0', () => {
      expect(mulPaiseByRate(NaN, 18)).toBe(0);
      expect(mulPaiseByRate(10000, NaN)).toBe(0);
      expect(mulPaiseByRate(Infinity, 18)).toBe(0);
      expect(mulPaiseByRate(10000, -Infinity)).toBe(0);
      expect(mulPaiseByRate(NaN, NaN)).toBe(0);
    });
  });

  describe('divPaise', () => {
    it('returns 0 when divisor is 0', () => {
      expect(divPaise(1000, 0)).toBe(0);
      expect(divPaise(0, 0)).toBe(0);
      expect(divPaise(-500, 0)).toBe(0);
    });

    it('rounds integer division to nearest paisa', () => {
      // 100 / 3 = 33.333... -> 33
      expect(divPaise(100, 3)).toBe(33);

      // 200 / 3 = 66.666... -> 67
      expect(divPaise(200, 3)).toBe(67);

      // 100 / 2 = 50
      expect(divPaise(100, 2)).toBe(50);

      // 1 / 2 = 0.5 -> 1
      expect(divPaise(1, 2)).toBe(1);
    });

    it('is sign-aware across dividend and divisor', () => {
      expect(divPaise(-100, 3)).toBe(-33);
      expect(divPaise(100, -3)).toBe(-33);
      expect(divPaise(-100, -3)).toBe(33);
      expect(divPaise(-1, 2)).toBe(-1);
      expect(divPaise(1, -2)).toBe(-1);
    });

    it('normalizes -0 to 0', () => {
      expect(Object.is(divPaise(0, 5), -0)).toBe(false);
      expect(Object.is(divPaise(-0, 5), -0)).toBe(false);
      expect(Object.is(divPaise(0, -5), -0)).toBe(false);
      expect(Object.is(divPaise(1, -100), -0)).toBe(false);
      expect(divPaise(0, 5)).toBe(0);
    });

    it('handles non-finite inputs returning 0', () => {
      expect(divPaise(NaN, 3)).toBe(0);
      expect(divPaise(100, NaN)).toBe(0);
      expect(divPaise(Infinity, 3)).toBe(0);
      expect(divPaise(100, Infinity)).toBe(0);
      expect(divPaise(NaN, NaN)).toBe(0);
    });
  });

  describe('mulPaiseByFactor', () => {
    it('multiplies paise by dimensionless quantity factors and rounds to nearest paisa', () => {
      // E.g., 2.5 kg at 1000 paise (₹10) = 2500 paise (₹25)
      expect(mulPaiseByFactor(1000, 2.5)).toBe(2500);

      // 3 items at 499 paise = 1497 paise
      expect(mulPaiseByFactor(499, 3)).toBe(1497);

      // 100 paise * 1.333333 = 133.3333 paise -> 133 paise
      expect(mulPaiseByFactor(100, 1.333333)).toBe(133);

      // 100 paise * 1.335 = 133.5 paise -> 134 paise
      expect(mulPaiseByFactor(100, 1.335)).toBe(134);
    });

    it('is sign-aware', () => {
      expect(mulPaiseByFactor(-1000, 2)).toBe(-2000);
      expect(mulPaiseByFactor(1000, -2)).toBe(-2000);
      expect(mulPaiseByFactor(-1000, -2)).toBe(2000);
      expect(mulPaiseByFactor(-100, 1.335)).toBe(-134);
    });

    it('normalizes -0 to 0', () => {
      expect(Object.is(mulPaiseByFactor(0, 5), -0)).toBe(false);
      expect(Object.is(mulPaiseByFactor(-0, 5), -0)).toBe(false);
      expect(Object.is(mulPaiseByFactor(-1, 0.001), -0)).toBe(false);
      expect(mulPaiseByFactor(0, 5)).toBe(0);
    });

    it('handles non-finite inputs returning 0', () => {
      expect(mulPaiseByFactor(NaN, 2)).toBe(0);
      expect(mulPaiseByFactor(1000, NaN)).toBe(0);
      expect(mulPaiseByFactor(Infinity, 2)).toBe(0);
      expect(mulPaiseByFactor(1000, Infinity)).toBe(0);
      expect(mulPaiseByFactor(NaN, NaN)).toBe(0);
    });
  });

  describe('negatePaise & absPaise', () => {
    it('negates paise amounts and normalizes -0 to 0', () => {
      expect(negatePaise(150)).toBe(-150);
      expect(negatePaise(-150)).toBe(150);
      expect(negatePaise(0)).toBe(0);
      expect(negatePaise(-0)).toBe(0);
      expect(Object.is(negatePaise(0), -0)).toBe(false);
      expect(Object.is(negatePaise(-0), -0)).toBe(false);
    });

    it('negatePaise handles non-finite inputs returning 0', () => {
      expect(negatePaise(NaN)).toBe(0);
      expect(negatePaise(Infinity)).toBe(0);
      expect(negatePaise(-Infinity)).toBe(0);
    });

    it('computes absolute paise and normalizes -0 to 0', () => {
      expect(absPaise(150)).toBe(150);
      expect(absPaise(-150)).toBe(150);
      expect(absPaise(0)).toBe(0);
      expect(absPaise(-0)).toBe(0);
      expect(Object.is(absPaise(-0), -0)).toBe(false);
    });

    it('absPaise handles non-finite inputs returning 0', () => {
      expect(absPaise(NaN)).toBe(0);
      expect(absPaise(Infinity)).toBe(0);
      expect(absPaise(-Infinity)).toBe(0);
    });
  });

  describe('isZeroPaise', () => {
    it('returns true for zero and sub-paise values', () => {
      expect(isZeroPaise(0)).toBe(true);
      expect(isZeroPaise(-0)).toBe(true);
      expect(isZeroPaise(0.4)).toBe(true);
      expect(isZeroPaise(-0.4)).toBe(true);
    });

    it('returns false for amounts >= 0.5 paise', () => {
      expect(isZeroPaise(0.5)).toBe(false);
      expect(isZeroPaise(-0.5)).toBe(false);
      expect(isZeroPaise(1)).toBe(false);
      expect(isZeroPaise(-1)).toBe(false);
      expect(isZeroPaise(1000)).toBe(false);
    });

    it('returns true for non-finite inputs', () => {
      expect(isZeroPaise(NaN)).toBe(true);
      expect(isZeroPaise(Infinity)).toBe(true);
      expect(isZeroPaise(-Infinity)).toBe(true);
    });
  });

  describe('clampPaise', () => {
    it('clamps paise within min and max boundaries', () => {
      expect(clampPaise(150, 100, 200)).toBe(150);
      expect(clampPaise(50, 100, 200)).toBe(100);
      expect(clampPaise(250, 100, 200)).toBe(200);
    });

    it('handles negative bounds and inverted bounds safely', () => {
      expect(clampPaise(-50, -100, 0)).toBe(-50);
      expect(clampPaise(-150, -100, 0)).toBe(-100);
      expect(clampPaise(50, -100, 0)).toBe(0);

      // Inverted bounds (min > max)
      expect(clampPaise(150, 200, 100)).toBe(150);
      expect(clampPaise(50, 200, 100)).toBe(100);
      expect(clampPaise(250, 200, 100)).toBe(200);
    });

    it('normalizes -0 to 0', () => {
      expect(Object.is(clampPaise(-0, -100, 100), -0)).toBe(false);
      expect(clampPaise(-0, -100, 100)).toBe(0);
    });

    it('handles non-finite inputs safely', () => {
      expect(clampPaise(NaN, 100, 200)).toBe(100);
      expect(clampPaise(NaN, -100, 100)).toBe(0);
      expect(clampPaise(NaN, NaN, NaN)).toBe(0);
      expect(clampPaise(150, NaN, 200)).toBe(150);
      expect(clampPaise(150, 100, NaN)).toBe(150);
    });
  });

  describe('comparePaise', () => {
    it('returns -1, 0, or 1 based on numerical comparison', () => {
      expect(comparePaise(100, 200)).toBe(-1);
      expect(comparePaise(200, 100)).toBe(1);
      expect(comparePaise(100, 100)).toBe(0);

      expect(comparePaise(-200, -100)).toBe(-1);
      expect(comparePaise(-100, -200)).toBe(1);
      expect(comparePaise(-100, -100)).toBe(0);

      expect(comparePaise(0, -0)).toBe(0);
      expect(comparePaise(-0, 0)).toBe(0);
    });

    it('handles non-finite inputs by treating them as 0', () => {
      expect(comparePaise(NaN, 100)).toBe(-1);
      expect(comparePaise(100, NaN)).toBe(1);
      expect(comparePaise(NaN, NaN)).toBe(0);
      expect(comparePaise(NaN, 0)).toBe(0);
    });
  });
});
