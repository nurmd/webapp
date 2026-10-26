/**
 * Pricing helper module for GST Inclusive and Exclusive rate conversions and calculations.
 *
 * Architectural Invariants:
 * - The inclusive price covers GST ONLY. CESS is added on top.
 * - If gstRate <= 0, conversions return the rate itself rounded to 2 decimals.
 * - exclusiveFromInclusive: round2((inclusive * 100) / (100 + gstRate))
 * - inclusiveFromExclusive: round2((exclusive * (100 + gstRate)) / 100)
 * - Rate back-calculation derives the authoritative rate from total with divide-by-zero protection.
 */

export type PriceMode = 'EXCLUSIVE' | 'INCLUSIVE';

/**
 * Rounds a number to two decimal places (half-up, resilient against IEEE-754 precision artifacts).
 */
export function round2(val: number): number {
  if (!val || isNaN(val)) return 0;
  return Number(Math.round(Number(val + 'e2')) + 'e-2');
}

/**
 * Rounds a number to four decimal places.
 */
export function round4(val: number): number {
  if (!val || isNaN(val)) return 0;
  return Number(Math.round(Number(val + 'e4')) + 'e-4');
}

/**
 * Derives the GST-exclusive rate from a GST-inclusive rate.
 * Note: Inclusive pricing covers GST only (CESS is added on top).
 */
export function exclusiveFromInclusive(inclusive: number, gstRate: number): number {
  if (!inclusive || isNaN(inclusive)) return 0;
  if (!gstRate || gstRate <= 0) return round2(inclusive);
  return round2((inclusive * 100) / (100 + gstRate));
}

/**
 * Derives the GST-inclusive rate from a GST-exclusive rate.
 * Note: Inclusive pricing covers GST only (CESS is added on top).
 */
export function inclusiveFromExclusive(exclusive: number, gstRate: number): number {
  if (!exclusive || isNaN(exclusive)) return 0;
  if (!gstRate || gstRate <= 0) return round2(exclusive);
  return round2((exclusive * (100 + gstRate)) / 100);
}

export interface CalculateRateFromTotalOptions {
  total: number;
  quantity: number;
  discountPercent?: number;
  gstRate?: number;
  cessRate?: number;
  priceMode?: PriceMode;
}

/**
 * Back-calculates the authoritative unit rate from total amount, quantity, discount %, and tax rates.
 * Supports both EXCLUSIVE and INCLUSIVE price modes.
 *
 * Formulas:
 * - EXCLUSIVE: rate = total / (qty * (1 - discPct/100) * (1 + gstRate/100 + cessRate/100))
 * - INCLUSIVE: rate = total / (qty * (1 - discPct/100) * (1 + cessRate / (100 + gstRate)))
 */
export function calculateRateFromTotal(options: CalculateRateFromTotalOptions): number {
  const { total, quantity, discountPercent = 0, gstRate = 0, cessRate = 0, priceMode = 'EXCLUSIVE' } = options;

  if (total <= 0 || quantity <= 0) return 0;

  const clampedDisc = Math.min(100, Math.max(0, discountPercent));
  if (clampedDisc >= 100) return 0;

  const discFactor = 1 - clampedDisc / 100;
  const validGst = Math.max(0, gstRate);
  const validCess = Math.max(0, cessRate);

  let denom = 0;
  if (priceMode === 'INCLUSIVE') {
    const cessFactor = 1 + validCess / (100 + validGst);
    denom = quantity * discFactor * cessFactor;
  } else {
    const taxFactor = 1 + (validGst + validCess) / 100;
    denom = quantity * discFactor * taxFactor;
  }

  if (denom <= 0) return 0;

  return round4(total / denom);
}
