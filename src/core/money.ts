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
