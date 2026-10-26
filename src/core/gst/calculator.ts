import {
  PriceMode,
  exclusiveFromInclusive,
  inclusiveFromExclusive,
  calculateRateFromTotal,
  round2,
} from './pricing';

export type { PriceMode };
export { exclusiveFromInclusive, inclusiveFromExclusive, calculateRateFromTotal, round2 };

export interface GstTaxBreakdown {
  taxableAmount: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  utgstRate?: number;
  utgstAmount?: number;
  igstRate: number;
  igstAmount: number;
  cessRate: number;
  cessAmount: number;
  totalTax: number;
  totalAmount: number;
}

export const STATUTORY_GST_RATES = [0, 0.1, 0.25, 3, 5, 12, 18] as const;
export type StatutoryGstRate = (typeof STATUTORY_GST_RATES)[number];

export const UTGST_STATE_CODES: ReadonlySet<string> = new Set<string>([
  '04', // Chandigarh
  '25', // Daman and Diu (legacy)
  '26', // Dadra and Nagar Haveli and Daman and Diu
  '31', // Lakshadweep
  '34', // Puducherry
  '35', // Andaman and Nicobar Islands
  '38', // Ladakh
  '97', // Other Territory
]);

export function isUtgstState(stateCode?: string): boolean {
  if (!stateCode) return false;
  const trimmed = stateCode.trim();
  const normalized = trimmed.length === 1 ? trimmed.padStart(2, '0') : trimmed;
  return UTGST_STATE_CODES.has(normalized);
}

export interface InvoiceItemCalculationInput {
  quantity: number;
  unitPrice?: number;
  unitPriceInclusive?: number;
  priceMode?: PriceMode;
  discountPercent?: number;
  discountAmount?: number;
  gstRate: number; // e.g. 0, 0.1, 0.25, 3, 5, 12, 18, 28
  cessPercent?: number;
  cessPerUnit?: number;
}

export interface CalculatedItem extends GstTaxBreakdown {
  grossAmount: number;
  discountAmount: number;
  grossAmountExclusive?: number;
  grossAmountInclusive?: number;
  priceMode?: PriceMode;
  unitPriceExclusive?: number;
  unitPriceInclusive?: number;
  netInclusiveAmount?: number;
}

export interface InvoiceCalculationSummary {
  items: CalculatedItem[];
  totalGrossAmount: number;
  totalGrossAmountExclusive?: number;
  totalGrossAmountInclusive?: number;
  totalDiscount: number;
  totalTaxableAmount: number;
  totalCgst: number;
  totalSgst: number;
  totalUtgst?: number;
  isUtgst?: boolean;
  totalIgst: number;
  totalCess: number;
  totalTax: number;
  netAmount: number;
  roundOff: number;
  grandTotal: number;
  isIntraState: boolean;
}

/**
 * Calculates GST components for a single line item.
 * 
 * Rules:
 * 1. Price Mode support:
 *    - EXCLUSIVE (default): gross = qty * exclusiveRate, discount on exclusive gross, taxable = gross - discount.
 *    - INCLUSIVE: gross = qty * inclusiveRate, discount on inclusive gross, netInclusive = gross - discount.
 *      Inclusive covers GST only; CESS is added on top.
 *      taxable = round2(netInclusive * 100 / (100 + gstRate))
 *      gst = round2(netInclusive - taxable)
 * 2. Tax bifurcation:
 *    - Intra-State (Non-UT State): CGST (50% of GST rate) + SGST (50% of GST rate).
 *    - Intra-State (Union Territory): CGST (50% of GST rate) + UTGST (50% of GST rate), SGST = 0.
 *    - Inter-State (Different State/UT): IGST (100% of GST rate).
 *    In inclusive mode, CGST and SGST/UTGST sum exactly to total GST without losing a paisa.
 * 3. Applies Compensation Cess (percentage of taxable value and/or fixed per-unit cess).
 * 
 * @param input - Item input details including quantity, unit price, discounts, and GST/Cess rates.
 * @param isIntraState - True if Supplier State matches Recipient Place of Supply (POS).
 * @param isUtOrPos - Boolean indicating UT supply or state code string (e.g. '04', '35').
 * @returns Fully calculated item with breakdown of CGST, SGST/UTGST, IGST, Cess, total tax, and total amount.
 */
export function calculateItemGst(
  input: InvoiceItemCalculationInput,
  isIntraState: boolean,
  isUtOrPos: boolean | string = false
): CalculatedItem {
  const isUt = typeof isUtOrPos === 'string' ? isUtgstState(isUtOrPos) : Boolean(isUtOrPos);
  const isInclusive = input.priceMode === 'INCLUSIVE';

  if (isInclusive) {
    const inclusiveRate = input.unitPriceInclusive !== undefined
      ? input.unitPriceInclusive
      : (input.unitPrice !== undefined ? input.unitPrice : 0);

    // In INCLUSIVE mode, the inclusive rate is authoritative; derive exclusive from it and ignore supplied unitPrice
    const exclusiveRate = exclusiveFromInclusive(inclusiveRate, input.gstRate);

    const grossInclusive = round2(input.quantity * inclusiveRate);

    let discount = 0;
    if (input.discountAmount && input.discountAmount > 0) {
      discount = Math.min(grossInclusive, input.discountAmount);
    } else if (input.discountPercent && input.discountPercent > 0) {
      discount = Math.min(grossInclusive, round2((grossInclusive * input.discountPercent) / 100));
    }

    const netInclusive = Math.max(0, round2(grossInclusive - discount));
    const taxableAmount = input.gstRate > 0
      ? round2((netInclusive * 100) / (100 + input.gstRate))
      : netInclusive;
    const gst = round2(netInclusive - taxableAmount);

    let cgstRate = 0;
    let cgstAmount = 0;
    let sgstRate = 0;
    let sgstAmount = 0;
    let utgstRate = 0;
    let utgstAmount = 0;
    let igstRate = 0;
    let igstAmount = 0;

    if (isIntraState) {
      if (isUt) {
        cgstRate = input.gstRate / 2;
        utgstRate = input.gstRate / 2;
        cgstAmount = round2(gst / 2);
        utgstAmount = round2(gst - cgstAmount);
      } else {
        cgstRate = input.gstRate / 2;
        sgstRate = input.gstRate / 2;
        cgstAmount = round2(gst / 2);
        sgstAmount = round2(gst - cgstAmount);
      }
    } else {
      igstRate = input.gstRate;
      igstAmount = gst;
    }

    const cessPercent = input.cessPercent || 0;
    const cessPerUnit = input.cessPerUnit || 0;
    const cessAmount = round2(((taxableAmount * cessPercent) / 100) + (input.quantity * cessPerUnit));

    const totalTax = round2(cgstAmount + sgstAmount + utgstAmount + igstAmount + cessAmount);
    const totalAmount = round2(netInclusive + cessAmount);

    const grossAmountExclusive = round2(input.quantity * exclusiveRate);
    const grossAmountInclusive = grossInclusive;

    return {
      grossAmount: grossInclusive,
      discountAmount: discount,
      taxableAmount,
      cgstRate,
      cgstAmount,
      sgstRate,
      sgstAmount,
      utgstRate,
      utgstAmount,
      igstRate,
      igstAmount,
      cessRate: cessPercent,
      cessAmount,
      totalTax,
      totalAmount,
      priceMode: 'INCLUSIVE',
      unitPriceExclusive: exclusiveRate,
      unitPriceInclusive: inclusiveRate,
      grossAmountExclusive,
      grossAmountInclusive,
      netInclusiveAmount: netInclusive,
    };
  }

  // EXCLUSIVE MODE (backward compatible)
  const exclusiveRate = input.unitPrice !== undefined
    ? input.unitPrice
    : (input.unitPriceInclusive !== undefined ? exclusiveFromInclusive(input.unitPriceInclusive, input.gstRate) : 0);
  const grossAmount = Number((input.quantity * exclusiveRate).toFixed(2));

  let discount = 0;
  if (input.discountAmount && input.discountAmount > 0) {
    discount = Math.min(grossAmount, input.discountAmount);
  } else if (input.discountPercent && input.discountPercent > 0) {
    discount = Math.min(grossAmount, Number(((grossAmount * input.discountPercent) / 100).toFixed(2)));
  }

  const taxableAmount = Math.max(0, Number((grossAmount - discount).toFixed(2)));

  let cgstRate = 0;
  let cgstAmount = 0;
  let sgstRate = 0;
  let sgstAmount = 0;
  let utgstRate = 0;
  let utgstAmount = 0;
  let igstRate = 0;
  let igstAmount = 0;

  if (isIntraState) {
    if (isUt) {
      cgstRate = input.gstRate / 2;
      utgstRate = input.gstRate / 2;
      sgstRate = 0;
      cgstAmount = Number(((taxableAmount * cgstRate) / 100).toFixed(2));
      utgstAmount = Number(((taxableAmount * utgstRate) / 100).toFixed(2));
      sgstAmount = 0;
    } else {
      cgstRate = input.gstRate / 2;
      sgstRate = input.gstRate / 2;
      utgstRate = 0;
      cgstAmount = Number(((taxableAmount * cgstRate) / 100).toFixed(2));
      sgstAmount = Number(((taxableAmount * sgstRate) / 100).toFixed(2));
      utgstAmount = 0;
    }
  } else {
    igstRate = input.gstRate;
    igstAmount = Number(((taxableAmount * igstRate) / 100).toFixed(2));
  }

  const cessPercent = input.cessPercent || 0;
  const cessPerUnit = input.cessPerUnit || 0;
  const cessAmount = Number((((taxableAmount * cessPercent) / 100) + (input.quantity * cessPerUnit)).toFixed(2));

  const totalTax = Number((cgstAmount + sgstAmount + utgstAmount + igstAmount + cessAmount).toFixed(2));
  const totalAmount = Number((taxableAmount + totalTax).toFixed(2));

  // In EXCLUSIVE mode, the exclusive rate is authoritative; derive inclusive from it and ignore supplied unitPriceInclusive
  const inclusiveRate = inclusiveFromExclusive(exclusiveRate, input.gstRate);
  const grossAmountExclusive = grossAmount;
  const grossAmountInclusive = round2(input.quantity * inclusiveRate);

  return {
    grossAmount,
    discountAmount: discount,
    taxableAmount,
    cgstRate,
    cgstAmount,
    sgstRate,
    sgstAmount,
    utgstRate,
    utgstAmount,
    igstRate,
    igstAmount,
    cessRate: cessPercent,
    cessAmount,
    totalTax,
    totalAmount,
    priceMode: 'EXCLUSIVE',
    unitPriceExclusive: exclusiveRate,
    unitPriceInclusive: inclusiveRate,
    grossAmountExclusive,
    grossAmountInclusive,
  };
}

/**
 * Calculates entire Invoice totals, GST slabs summary, and mathematical round-off.
 * 
 * Rules:
 * 1. Automatically determines Intra vs Inter-State supply based on 2-digit GST state codes.
 * 2. Recognizes Union Territory intra-supplies and splits tax into CGST + UTGST.
 * 3. Maps every item through `calculateItemGst`.
 * 4. Aggregates gross, discounts, taxable value, CGST, SGST, UTGST, IGST, and cess.
 * 5. Applies mathematical rounding to the nearest Indian Rupee (₹), computing explicit roundOff delta.
 * 
 * @param supplierStateCode - Two-digit GST state code of supplier (e.g. '27' for Maharashtra).
 * @param placeOfSupplyStateCode - Two-digit GST state code of recipient POS (e.g. '24' for Gujarat).
 * @param items - Array of line item inputs.
 * @returns Summary containing item-by-item calculations, total taxes, round-off, and grand total.
 */
export function calculateInvoice(
  supplierStateCode: string,
  placeOfSupplyStateCode: string,
  items: InvoiceItemCalculationInput[]
): InvoiceCalculationSummary {
  const isIntraState = supplierStateCode === placeOfSupplyStateCode;
  const isUt = isIntraState && isUtgstState(placeOfSupplyStateCode);

  const calculatedItems = items.map((item) => calculateItemGst(item, isIntraState, isUt));

  let totalGrossAmount = 0;
  let totalGrossAmountExclusive = 0;
  let totalGrossAmountInclusive = 0;
  let totalDiscount = 0;
  let totalTaxableAmount = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalUtgst = 0;
  let totalIgst = 0;
  let totalCess = 0;

  for (const item of calculatedItems) {
    totalGrossAmount += item.grossAmount;
    totalGrossAmountExclusive += item.grossAmountExclusive ?? item.grossAmount;
    totalGrossAmountInclusive += item.grossAmountInclusive ?? item.grossAmount;
    totalDiscount += item.discountAmount;
    totalTaxableAmount += item.taxableAmount;
    totalCgst += item.cgstAmount;
    totalSgst += item.sgstAmount;
    totalUtgst += item.utgstAmount || 0;
    totalIgst += item.igstAmount;
    totalCess += item.cessAmount;
  }

  totalGrossAmount = Number(totalGrossAmount.toFixed(2));
  totalGrossAmountExclusive = Number(totalGrossAmountExclusive.toFixed(2));
  totalGrossAmountInclusive = Number(totalGrossAmountInclusive.toFixed(2));
  totalDiscount = Number(totalDiscount.toFixed(2));
  totalTaxableAmount = Number(totalTaxableAmount.toFixed(2));
  totalCgst = Number(totalCgst.toFixed(2));
  totalSgst = Number(totalSgst.toFixed(2));
  totalUtgst = Number(totalUtgst.toFixed(2));
  totalIgst = Number(totalIgst.toFixed(2));
  totalCess = Number(totalCess.toFixed(2));

  const totalTax = Number((totalCgst + totalSgst + totalUtgst + totalIgst + totalCess).toFixed(2));
  const netAmount = Number((totalTaxableAmount + totalTax).toFixed(2));

  // Mathematical rounding to nearest rupee
  const grandTotal = Math.round(netAmount);
  const roundOff = Number((grandTotal - netAmount).toFixed(2));

  return {
    items: calculatedItems,
    totalGrossAmount,
    totalGrossAmountExclusive,
    totalGrossAmountInclusive,
    totalDiscount,
    totalTaxableAmount,
    totalCgst,
    totalSgst,
    totalUtgst,
    isUtgst: totalUtgst > 0,
    totalIgst,
    totalCess,
    totalTax,
    netAmount,
    roundOff,
    grandTotal,
    isIntraState,
  };
}

export const calculateInvoiceTotals = calculateInvoice;

