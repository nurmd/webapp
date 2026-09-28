export interface GstTaxBreakdown {
  taxableAmount: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  cessRate: number;
  cessAmount: number;
  totalTax: number;
  totalAmount: number;
}

export interface InvoiceItemCalculationInput {
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  discountAmount?: number;
  gstRate: number; // e.g. 5, 12, 18, 28
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
 */
export function calculateItemGst(
  input: InvoiceItemCalculationInput,
  isIntraState: boolean
): CalculatedItem {
  const grossAmount = Number((input.quantity * input.unitPrice).toFixed(2));

  let discount = 0;
  if (input.discountAmount && input.discountAmount > 0) {
    discount = input.discountAmount;
  } else if (input.discountPercent && input.discountPercent > 0) {
    discount = Number(((grossAmount * input.discountPercent) / 100).toFixed(2));
  }

  const taxableAmount = Math.max(0, Number((grossAmount - discount).toFixed(2)));

  let cgstRate = 0;
  let cgstAmount = 0;
  let sgstRate = 0;
  let sgstAmount = 0;
  let igstRate = 0;
  let igstAmount = 0;

  if (isIntraState) {
    cgstRate = input.gstRate / 2;
    sgstRate = input.gstRate / 2;
    cgstAmount = Number(((taxableAmount * cgstRate) / 100).toFixed(2));
    sgstAmount = Number(((taxableAmount * sgstRate) / 100).toFixed(2));
  } else {
    igstRate = input.gstRate;
    igstAmount = Number(((taxableAmount * igstRate) / 100).toFixed(2));
  }

  const cessPercent = input.cessPercent || 0;
  const cessPerUnit = input.cessPerUnit || 0;
  const cessAmount = Number((((taxableAmount * cessPercent) / 100) + (input.quantity * cessPerUnit)).toFixed(2));

  const totalTax = Number((cgstAmount + sgstAmount + igstAmount + cessAmount).toFixed(2));
  const totalAmount = Number((taxableAmount + totalTax).toFixed(2));

  return {
    grossAmount,
    discountAmount: discount,
    taxableAmount,
    cgstRate,
    cgstAmount,
    sgstRate,
    sgstAmount,
    igstRate,
    igstAmount,
    cessRate: cessPercent,
    cessAmount,
    totalTax,
    totalAmount,
  };
}

/**
 * Calculates entire Invoice totals, GST slabs summary, and round-off.
 */
export function calculateInvoice(
  supplierStateCode: string,
  placeOfSupplyStateCode: string,
  items: InvoiceItemCalculationInput[]
): InvoiceCalculationSummary {
  const isIntraState = supplierStateCode === placeOfSupplyStateCode;

  const calculatedItems = items.map((item) => calculateItemGst(item, isIntraState));

  let totalGrossAmount = 0;
  let totalDiscount = 0;
  let totalTaxableAmount = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalCess = 0;

  for (const item of calculatedItems) {
    totalGrossAmount += item.grossAmount;
    totalDiscount += item.discountAmount;
    totalTaxableAmount += item.taxableAmount;
    totalCgst += item.cgstAmount;
    totalSgst += item.sgstAmount;
    totalIgst += item.igstAmount;
    totalCess += item.cessAmount;
  }

  totalGrossAmount = Number(totalGrossAmount.toFixed(2));
  totalDiscount = Number(totalDiscount.toFixed(2));
  totalTaxableAmount = Number(totalTaxableAmount.toFixed(2));
  totalCgst = Number(totalCgst.toFixed(2));
  totalSgst = Number(totalSgst.toFixed(2));
  totalIgst = Number(totalIgst.toFixed(2));
  totalCess = Number(totalCess.toFixed(2));

  const totalTax = Number((totalCgst + totalSgst + totalIgst + totalCess).toFixed(2));
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
    totalIgst,
    totalCess,
    totalTax,
    netAmount,
    roundOff,
    grandTotal,
    isIntraState,
  };
}
