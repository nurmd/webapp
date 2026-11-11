/**
 * Precision money and currency calculation utility.
 * Guarantees sign-aware EPSILON-safe rounding to 2 decimal places (paise/cents).
 * Avoids IEEE 754 floating-point errors in financial aggregations.
 */

/**
 * Sign-aware EPSILON-safe rounding to 2 decimal places.
 * Formula: sign * Math.round((abs(value) + Number.EPSILON) * 100) / 100
 */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const rounded = (sign * Math.round((abs + Number.EPSILON) * 100)) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Converts a rupee amount to integer paise using EPSILON-safe rounding.
 */
export function toPaise(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const paise = sign * Math.round((abs + Number.EPSILON) * 100);
  return Object.is(paise, -0) ? 0 : paise;
}

/**
 * Converts integer paise back to rupee float with 2 decimal places.
 */
export function fromPaise(paise: number): number {
  if (!Number.isFinite(paise)) return 0;
  return roundMoney(paise / 100);
}

/**
 * Safely adds two monetary amounts via integer paise.
 */
export function addMoney(a: number, b: number): number {
  return fromPaise(toPaise(a) + toPaise(b));
}

/**
 * Safely subtracts two monetary amounts via integer paise.
 */
export function subMoney(a: number, b: number): number {
  return fromPaise(toPaise(a) - toPaise(b));
}

/**
 * Multiplies an amount by a numeric factor and rounds to 2 decimal places.
 */
export function mulMoney(amount: number, factor: number): number {
  if (!Number.isFinite(amount) || !Number.isFinite(factor)) return 0;
  return roundMoney(amount * factor);
}

/**
 * Sums an array of monetary amounts without floating-point drift.
 */
export function sumMoney(values: number[]): number {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const totalPaise = values.reduce((acc, val) => acc + toPaise(val), 0);
  return fromPaise(totalPaise);
}

/**
 * Checks whether a monetary amount is effectively zero (less than half a paisa).
 */
export function isZeroMoney(value: number): boolean {
  if (!Number.isFinite(value)) return true;
  return toPaise(value) === 0;
}

/**
 * Integer representation of money in paise (1 INR = 100 paise).
 * Signed integer. Avoids IEEE 754 floating-point drift.
 */
export type Paise = number;

/**
 * Adds two paise amounts with -0 normalization.
 * Non-finite inputs are treated as 0 (returning the other operand where sensible).
 */
export function addPaise(a: Paise, b: Paise): Paise {
  const safeA = Number.isFinite(a) ? Math.round(a) : 0;
  const safeB = Number.isFinite(b) ? Math.round(b) : 0;
  const res = safeA + safeB;
  return Object.is(res, -0) ? 0 : res;
}

/**
 * Subtracts two paise amounts (a - b) with -0 normalization.
 * Non-finite inputs are treated as 0.
 */
export function subPaise(a: Paise, b: Paise): Paise {
  const safeA = Number.isFinite(a) ? Math.round(a) : 0;
  const safeB = Number.isFinite(b) ? Math.round(b) : 0;
  const res = safeA - safeB;
  return Object.is(res, -0) ? 0 : res;
}

/**
 * Multiplies paise by a percentage rate (e.g., 18 for 18%) using integer math:
 * Math.round(paise * ratePercent / 100) with EPSILON safety, sign-aware.
 * Non-finite inputs return 0. -0 normalized to 0.
 */
export function mulPaiseByRate(paise: Paise, ratePercent: number): Paise {
  if (!Number.isFinite(paise) || !Number.isFinite(ratePercent)) return 0;
  const raw = (paise * ratePercent) / 100;
  if (raw === 0) return 0;
  const sign = raw < 0 ? -1 : 1;
  const abs = Math.abs(raw);
  const rounded = sign * Math.round(abs + Number.EPSILON);
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Divides paise by a divisor with rounding to nearest paisa, sign-aware.
 * Divisor 0 or non-finite inputs return 0. -0 normalized to 0.
 */
export function divPaise(paise: Paise, divisor: number): Paise {
  if (!Number.isFinite(paise) || !Number.isFinite(divisor) || divisor === 0) return 0;
  const raw = paise / divisor;
  if (raw === 0) return 0;
  const sign = raw < 0 ? -1 : 1;
  const abs = Math.abs(raw);
  const rounded = sign * Math.round(abs + Number.EPSILON);
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Multiplies paise by a dimensionless factor (e.g. quantity) and rounds to nearest paisa.
 * Non-finite inputs return 0. -0 normalized to 0.
 */
export function mulPaiseByFactor(paise: Paise, factor: number): Paise {
  if (!Number.isFinite(paise) || !Number.isFinite(factor)) return 0;
  const raw = paise * factor;
  if (raw === 0) return 0;
  const sign = raw < 0 ? -1 : 1;
  const abs = Math.abs(raw);
  const rounded = sign * Math.round(abs + Number.EPSILON);
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Negates a paise amount with -0 normalization.
 * Non-finite inputs return 0.
 */
export function negatePaise(paise: Paise): Paise {
  if (!Number.isFinite(paise)) return 0;
  const safe = Math.round(paise);
  if (safe === 0) return 0;
  const res = -safe;
  return Object.is(res, -0) ? 0 : res;
}

/**
 * Computes absolute value of paise with -0 normalization.
 * Non-finite inputs return 0.
 */
export function absPaise(paise: Paise): Paise {
  if (!Number.isFinite(paise)) return 0;
  const safe = Math.round(paise);
  const res = Math.abs(safe);
  return Object.is(res, -0) ? 0 : res;
}

/**
 * Checks whether a paise amount is zero or sub-paise.
 * Non-finite inputs return true.
 */
export function isZeroPaise(paise: Paise): boolean {
  if (!Number.isFinite(paise)) return true;
  const abs = Math.abs(paise);
  return Math.round(abs + Number.EPSILON) === 0;
}

/**
 * Clamps a paise amount between min and max bounds.
 * Non-finite inputs return 0 (or clamped safely). -0 normalized to 0.
 */
export function clampPaise(paise: Paise, min: Paise, max: Paise): Paise {
  const p = Number.isFinite(paise) ? Math.round(paise) : 0;
  const lo = Number.isFinite(min) ? Math.round(min) : -Infinity;
  const hi = Number.isFinite(max) ? Math.round(max) : Infinity;
  const lower = Math.min(lo, hi);
  const upper = Math.max(lo, hi);
  const clamped = Math.min(Math.max(p, lower), upper);
  if (!Number.isFinite(clamped)) return 0;
  return Object.is(clamped, -0) ? 0 : clamped;
}

/**
 * Compares two paise amounts.
 * Returns -1 if a < b, 1 if a > b, and 0 if a === b.
 * Non-finite inputs are normalized to 0.
 */
export function comparePaise(a: Paise, b: Paise): -1 | 0 | 1 {
  const safeA = Number.isFinite(a) ? Math.round(a) : 0;
  const safeB = Number.isFinite(b) ? Math.round(b) : 0;
  if (safeA < safeB) return -1;
  if (safeA > safeB) return 1;
  return 0;
}
