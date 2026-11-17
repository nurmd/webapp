import { useMemo } from 'react';
import { PosCartItem } from '../types.ts';
import { calculateInvoice } from '../../../core/gst/calculator.ts';
import { inclusiveFromExclusive } from '../../../core/gst/pricing.ts';

export interface UsePosTotalsProps {
  cart: PosCartItem[];
  customerStateCode?: string;
  companyStateCode?: string;
  isGstActive?: boolean;
  isCompositionScheme?: boolean;
  cartDiscountType: 'PERCENT' | 'FLAT';
  cartDiscountValue: number;
  additionalCharges: number;
}

export function usePosTotals({
  cart,
  customerStateCode,
  companyStateCode,
  isGstActive = true,
  isCompositionScheme = false,
  cartDiscountType,
  cartDiscountValue,
  additionalCharges,
}: UsePosTotalsProps) {
  // Tax and Total Calculations
  const supplierStateCode = companyStateCode || '27';
  const recipientStateCode = customerStateCode || supplierStateCode;
  const isIntraState = supplierStateCode === recipientStateCode;

  const calcInputs = useMemo(() => {
    return cart.map((c) => {
      const gst = (!isGstActive || isCompositionScheme) ? 0 : (c.item.gstRate || 0);
      const excl = Number(c.unitPrice) || 0;
      let incl = Number(c.unitPriceInclusive) || 0;
      const mode = c.priceMode ?? 'EXCLUSIVE';
      if (!isGstActive || isCompositionScheme) {
        incl = excl;
      } else if (mode === 'EXCLUSIVE') {
        incl = inclusiveFromExclusive(excl, gst);
      } else if (mode === 'INCLUSIVE' && incl <= 0) {
        incl = inclusiveFromExclusive(excl, gst);
      }
      return {
        quantity: c.qty,
        unitPrice: excl,
        unitPriceInclusive: incl,
        priceMode: mode,
        cessPercent: isGstActive && !isCompositionScheme ? (c.cessRate || c.item.cessRate || 0) : 0,
        gstRate: gst,
        discountPercent: c.discountPercent || 0,
        discountAmount: c.discountAmount || 0,
      };
    });
  }, [cart, isGstActive, isCompositionScheme]);

  const calcSummary = useMemo(() => {
    return calculateInvoice(supplierStateCode, recipientStateCode, calcInputs);
  }, [supplierStateCode, recipientStateCode, calcInputs]);

  // Overall Discount calculation
  const overallDiscountAmt = useMemo(() => {
    if (cartDiscountType === 'FLAT') {
      return Math.min(calcSummary.totalTaxableAmount, cartDiscountValue || 0);
    } else {
      return Number(((calcSummary.totalTaxableAmount * (cartDiscountValue || 0)) / 100).toFixed(2));
    }
  }, [calcSummary.totalTaxableAmount, cartDiscountType, cartDiscountValue]);

  // Final Payable Grand Total
  const finalPayableTotal = useMemo(() => {
    const raw = Math.max(
      0,
      calcSummary.grandTotal - overallDiscountAmt + (additionalCharges || 0)
    );
    return Math.round(raw);
  }, [calcSummary.grandTotal, overallDiscountAmt, additionalCharges]);

  const totalCartCount = useMemo(() => {
    return cart.reduce((s, c) => s + c.qty, 0);
  }, [cart]);

  const isAllGstExempt = useMemo(() => {
    return cart.length > 0 && cart.every((c) => (Number(c.item.gstRate) || 0) === 0);
  }, [cart]);

  return {
    supplierStateCode,
    recipientStateCode,
    isIntraState,
    calcInputs,
    calcSummary,
    overallDiscountAmt,
    finalPayableTotal,
    totalCartCount,
    isAllGstExempt,
    subtotal: calcSummary.totalGrossAmount,
    totalTaxableAmount: calcSummary.totalTaxableAmount,
    totalTax: isGstActive ? calcSummary.totalTax : 0,
    totalCgst: isGstActive ? calcSummary.totalCgst : 0,
    totalSgst: isGstActive ? calcSummary.totalSgst : 0,
    totalUtgst: isGstActive ? (calcSummary.totalUtgst || 0) : 0,
    isUtgst: isGstActive ? Boolean(calcSummary.isUtgst) : false,
    totalIgst: isGstActive ? calcSummary.totalIgst : 0,
    totalCess: isGstActive ? calcSummary.totalCess : 0,
    roundOff: calcSummary.roundOff,
    discountAmount: overallDiscountAmt,
    grandTotal: finalPayableTotal,
  };
}
