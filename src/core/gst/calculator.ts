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
  unitPrice: number;
  discountPercent?: number;
  discountAmount?: number;
  gstRate: number; // e.g. 0, 0.1, 0.25, 3, 5, 12, 18, 28
  cessPercent?: number;
  cessPerUnit?: number;
}

export interface CalculatedItem extends GstTaxBreakdown {
  grossAmount: number;
  discountAmount: number;
}

export interface InvoiceCalculationSummary {
  items: CalculatedItem[];
  totalGrossAmount: number;
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
 * 1. Computes Gross Amount = quantity * unitPrice.
 * 2. Applies flat discount amount or percentage discount.
 * 3. Taxable Amount = Gross Amount - Discount Amount.
 * 4. Tax bifurcation:
 *    - Intra-State (Non-UT State): CGST (50% of GST rate) + SGST (50% of GST rate).
 *    - Intra-State (Union Territory): CGST (50% of GST rate) + UTGST (50% of GST rate), SGST = 0.
 *    - Inter-State (Different State/UT): IGST (100% of GST rate).
 * 5. Applies Compensation Cess (percentage of taxable value and/or fixed per-unit cess).
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
  const grossAmount = Number((input.quantity * input.unitPrice).toFixed(2));

  let discount = 0;
  if (input.discountAmount && input.discountAmount > 0) {
    discount = input.discountAmount;
  } else if (input.discountPercent && input.discountPercent > 0) {
    discount = Number(((grossAmount * input.discountPercent) / 100).toFixed(2));
  }

  const taxableAmount = Math.max(0, Number((grossAmount - discount).toFixed(2)));
  const isUt = typeof isUtOrPos === 'string' ? isUtgstState(isUtOrPos) : Boolean(isUtOrPos);

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
  let totalDiscount = 0;
  let totalTaxableAmount = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalUtgst = 0;
  let totalIgst = 0;
  let totalCess = 0;

  for (const item of calculatedItems) {
    totalGrossAmount += item.grossAmount;
    totalDiscount += item.discountAmount;
    totalTaxableAmount += item.taxableAmount;
    totalCgst += item.cgstAmount;
    totalSgst += item.sgstAmount;
    totalUtgst += item.utgstAmount || 0;
    totalIgst += item.igstAmount;
    totalCess += item.cessAmount;
  }

  totalGrossAmount = Number(totalGrossAmount.toFixed(2));
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

