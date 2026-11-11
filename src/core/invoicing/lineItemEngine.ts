import type { InvoiceItemEntry } from '../../models/invoice.ts';
import type { PurchaseItemEntry } from '../../models/purchase.ts';
import type { UnitOfMeasurement, ItemPriceMode } from '../../models/item.ts';
import { exclusiveFromInclusive, inclusiveFromExclusive } from '../gst/pricing.ts';
import type { InvoiceCalculationSummary, CalculatedItem } from '../gst/calculator.ts';

export interface RawLineItem {
  id?: string;
  itemId?: string;
  name?: string;
  description?: string;
  hsnSacCode?: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number;
  unitPriceInclusive?: number;
  priceMode?: string;
  discountPercent?: number;
  discountAmount?: number;
  gstRate?: number;
  cessRate?: number;
  mrp?: number;
}

export interface LineItemContext {
  isGstActive: boolean;
  isComposition: boolean;
}

export interface TotalsContext extends LineItemContext {
  shippingAmount?: number;
  overallDiscountAmount?: number;
}

export interface FinalizedTotals {
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
  roundOff: number;
  grandTotal: number;
}

/**
 * Normalizes price mode to statutory EXCLUSIVE or INCLUSIVE.
 * Always resolves to EXCLUSIVE when GST is disabled or under composition scheme.
 */
export function normalizePriceMode(
  raw: RawLineItem,
  gst: number,
  ctx: LineItemContext
): 'EXCLUSIVE' | 'INCLUSIVE' {
  void gst;
  if (!ctx.isGstActive || ctx.isComposition) {
    return 'EXCLUSIVE';
  }
  return raw.priceMode === 'INCLUSIVE' ? 'INCLUSIVE' : 'EXCLUSIVE';
}

/**
 * Recomputes exclusive and inclusive unit prices according to the active price mode.
 * - Under non-GST or composition, excl == incl == unitPrice.
 * - Under EXCLUSIVE mode, incl is derived from excl and GST rate.
 * - Under INCLUSIVE mode, finite positive unitPriceInclusive is prioritized, then excl is back-calculated.
 */
export function recomputePrices(
  raw: RawLineItem,
  gst: number,
  ctx: LineItemContext
): { excl: number; incl: number } {
  if (!ctx.isGstActive || ctx.isComposition) {
    const price = Number(raw.unitPrice) || 0;
    return { excl: price, incl: price };
  }

  const mode = normalizePriceMode(raw, gst, ctx);
  let excl = Number(raw.unitPrice) || 0;

  if (mode === 'EXCLUSIVE') {
    const incl = inclusiveFromExclusive(excl, gst);
    return { excl, incl };
  } else {
    const rawInclusive = Number(raw.unitPriceInclusive);
    const incl =
      Number.isFinite(rawInclusive) && rawInclusive > 0
        ? rawInclusive
        : inclusiveFromExclusive(excl, gst);
    excl = exclusiveFromInclusive(incl, gst);
    return { excl, incl };
  }
}

/**
 * Normalizes an outbound sales invoice line-item entry.
 * Tax rates and amounts are zeroed when GST is inactive or the dealer is under composition.
 */
export function normalizeInvoiceLineItem(
  raw: RawLineItem,
  calcItem: Partial<CalculatedItem> | null | undefined,
  ctx: LineItemContext,
  index: number
): InvoiceItemEntry {
  const isTaxActive = ctx.isGstActive && !ctx.isComposition;
  const gstRate = isTaxActive ? (Number(raw.gstRate) || 0) : 0;
  const cessRate = isTaxActive ? (Number(raw.cessRate) || 0) : 0;
  const priceMode = normalizePriceMode(raw, gstRate, ctx) as ItemPriceMode;
  const { excl, incl } = recomputePrices(raw, gstRate, ctx);

  return {
    id: raw.id,
    itemId: raw.itemId || `CUSTOM-${Date.now()}-${index}`,
    name: raw.name || 'Billed Product / Service',
    description: raw.description,
    hsnSacCode: ctx.isGstActive ? (raw.hsnSacCode || '') : '',
    unit: (raw.unit as UnitOfMeasurement) || 'PCS',
    quantity: Number(raw.quantity) || 0,
    unitPrice: excl,
    unitPriceInclusive: incl,
    priceMode,
    mrp: raw.mrp,
    discountPercent: raw.discountPercent,
    discountAmount: calcItem?.discountAmount || 0,
    taxableAmount: calcItem?.taxableAmount || 0,
    gstRate,
    cgstAmount: isTaxActive ? (calcItem?.cgstAmount || 0) : 0,
    sgstAmount: isTaxActive ? (calcItem?.sgstAmount || 0) : 0,
    utgstAmount: isTaxActive ? (calcItem?.utgstAmount || 0) : 0,
    igstAmount: isTaxActive ? (calcItem?.igstAmount || 0) : 0,
    cessRate,
    cessAmount: isTaxActive ? (calcItem?.cessAmount || 0) : 0,
    totalAmount: !isTaxActive
      ? (calcItem?.taxableAmount || 0)
      : (calcItem?.totalAmount || 0),
  };
}

/**
 * Normalizes an inward purchase bill line-item entry.
 *
 * Architectural Note on Composition Gating:
 * Inward supply / purchase bills gate GST and Cess calculations solely on
 * `ctx.isGstActive` (composition is NOT gated). Under Indian GST rules,
 * composition dealers still incur and pay statutory GST on purchases from
 * suppliers (they are merely ineligible to claim ITC on it). Zeroing inward
 * purchase taxes based on composition would be a behavioral regression.
 */
export function normalizePurchaseLineItem(
  raw: RawLineItem,
  calcItem: Partial<CalculatedItem> | null | undefined,
  ctx: LineItemContext,
  index: number
): PurchaseItemEntry {
  const purchaseCtx: LineItemContext = {
    isGstActive: ctx.isGstActive,
    isComposition: false,
  };
  const gstRate = ctx.isGstActive ? (Number(raw.gstRate) || 0) : 0;
  const cessRate = ctx.isGstActive ? (Number(raw.cessRate) || 0) : 0;
  const priceMode = normalizePriceMode(raw, gstRate, purchaseCtx) as ItemPriceMode;
  const { excl, incl } = recomputePrices(raw, gstRate, purchaseCtx);

  const qty = Number(raw.quantity) || 0;
  const disc = Number(raw.discountPercent) || 0;
  const fallbackTotal = qty * excl * (1 - disc / 100);

  return {
    id: raw.id,
    itemId: raw.itemId || `CUSTOM-${Date.now()}-${index}`,
    name: raw.name || 'Purchased Item',
    description: raw.description,
    hsnSacCode: ctx.isGstActive ? (raw.hsnSacCode || '') : '',
    unit: (raw.unit as UnitOfMeasurement) || 'PCS',
    quantity: qty,
    unitPrice: excl,
    unitPriceInclusive: incl,
    priceMode,
    discountPercent: raw.discountPercent,
    discountAmount: calcItem?.discountAmount || 0,
    taxableAmount: calcItem?.taxableAmount || 0,
    gstRate,
    cgstAmount: ctx.isGstActive ? (calcItem?.cgstAmount || 0) : 0,
    sgstAmount: ctx.isGstActive ? (calcItem?.sgstAmount || 0) : 0,
    utgstAmount: ctx.isGstActive ? (calcItem?.utgstAmount || 0) : 0,
    igstAmount: ctx.isGstActive ? (calcItem?.igstAmount || 0) : 0,
    cessRate,
    cessAmount: ctx.isGstActive ? (calcItem?.cessAmount || 0) : 0,
    totalAmount: calcItem?.totalAmount || fallbackTotal,
  };
}

/**
 * Finalizes document totals by applying GST-active gating, overall discount,
 * shipping additions, and integer-rupee rounding.
 *
 * Callers may override finalGrandTotal and finalRoundOff with their own custom
 * rounding states (e.g., TableGridInvoiceModal maintains dedicated rounding states).
 */
export function finalizeTotals(
  calcSummary: InvoiceCalculationSummary,
  ctx: TotalsContext
): FinalizedTotals {
  const isGst = ctx.isGstActive;
  const shipping = ctx.shippingAmount || 0;
  const overallDiscount = ctx.overallDiscountAmount || 0;

  const totalGrossAmount = calcSummary.totalGrossAmount;
  const totalDiscount = Number((calcSummary.totalDiscount + overallDiscount).toFixed(2));
  const totalTaxableAmount = calcSummary.totalTaxableAmount;

  const totalCgst = isGst ? calcSummary.totalCgst : 0;
  const totalSgst = isGst ? calcSummary.totalSgst : 0;
  const totalUtgst = isGst ? (calcSummary.totalUtgst || 0) : 0;
  const isUtgst = isGst ? Boolean(calcSummary.isUtgst) : false;
  const totalIgst = isGst ? calcSummary.totalIgst : 0;
  const totalCess = isGst ? calcSummary.totalCess : 0;
  const totalTax = isGst ? calcSummary.totalTax : 0;

  const grandTotal = Math.round(calcSummary.grandTotal - overallDiscount + shipping);
  const effectiveNet = calcSummary.netAmount - overallDiscount + shipping;
  const roundOff = Number((grandTotal - effectiveNet).toFixed(2));

  return {
    totalGrossAmount,
    totalDiscount,
    totalTaxableAmount,
    totalCgst,
    totalSgst,
    totalUtgst,
    isUtgst,
    totalIgst,
    totalCess,
    totalTax,
    roundOff,
    grandTotal,
  };
}

/**
 * Derives payment status based on paid amount relative to grand total.
 * - PAID if paidAmount >= grandTotal - 0.01 (accounts for 1 paisa rounding variance)
 * - PARTIAL if paidAmount > 0
 * - UNPAID otherwise
 */
export function derivePaymentStatus(
  paidAmount: number,
  grandTotal: number
): 'PAID' | 'PARTIAL' | 'UNPAID' {
  if (paidAmount >= grandTotal - 0.01) {
    return 'PAID';
  }
  if (paidAmount > 0) {
    return 'PARTIAL';
  }
  return 'UNPAID';
}
