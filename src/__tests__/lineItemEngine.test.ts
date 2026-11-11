import { describe, it, expect } from 'vitest';
import {
  normalizePriceMode,
  recomputePrices,
  normalizeInvoiceLineItem,
  normalizePurchaseLineItem,
  finalizeTotals,
  derivePaymentStatus,
  RawLineItem,
  LineItemContext,
  TotalsContext,
} from '../core/invoicing/lineItemEngine';
import type { InvoiceCalculationSummary } from '../core/gst/calculator';

describe('lineItemEngine', () => {
  describe('normalizePriceMode', () => {
    it('returns EXCLUSIVE when GST is inactive', () => {
      const raw: RawLineItem = { priceMode: 'INCLUSIVE' };
      const ctx: LineItemContext = { isGstActive: false, isComposition: false };
      expect(normalizePriceMode(raw, 18, ctx)).toBe('EXCLUSIVE');
    });

    it('returns EXCLUSIVE under composition scheme', () => {
      const raw: RawLineItem = { priceMode: 'INCLUSIVE' };
      const ctx: LineItemContext = { isGstActive: true, isComposition: true };
      expect(normalizePriceMode(raw, 18, ctx)).toBe('EXCLUSIVE');
    });

    it('returns raw priceMode when GST is active and non-composition', () => {
      const ctx: LineItemContext = { isGstActive: true, isComposition: false };
      expect(normalizePriceMode({ priceMode: 'INCLUSIVE' }, 18, ctx)).toBe('INCLUSIVE');
      expect(normalizePriceMode({ priceMode: 'EXCLUSIVE' }, 18, ctx)).toBe('EXCLUSIVE');
      expect(normalizePriceMode({}, 18, ctx)).toBe('EXCLUSIVE');
    });
  });

  describe('recomputePrices', () => {
    it('returns excl == incl == unitPrice under non-GST or composition scheme', () => {
      const raw: RawLineItem = {
        unitPrice: 100,
        unitPriceInclusive: 118,
        priceMode: 'INCLUSIVE',
      };

      const nonGstCtx: LineItemContext = { isGstActive: false, isComposition: false };
      expect(recomputePrices(raw, 18, nonGstCtx)).toEqual({ excl: 100, incl: 100 });

      const compCtx: LineItemContext = { isGstActive: true, isComposition: true };
      expect(recomputePrices(raw, 18, compCtx)).toEqual({ excl: 100, incl: 100 });
    });

    it('recomputes incl from excl in EXCLUSIVE mode', () => {
      const raw: RawLineItem = {
        unitPrice: 100,
        priceMode: 'EXCLUSIVE',
      };
      const ctx: LineItemContext = { isGstActive: true, isComposition: false };
      const prices = recomputePrices(raw, 18, ctx);
      expect(prices.excl).toBe(100);
      expect(prices.incl).toBe(118);
    });

    it('recomputes excl from incl in INCLUSIVE mode with finite positive unitPriceInclusive', () => {
      const raw: RawLineItem = {
        unitPrice: 0,
        unitPriceInclusive: 118,
        priceMode: 'INCLUSIVE',
      };
      const ctx: LineItemContext = { isGstActive: true, isComposition: false };
      const prices = recomputePrices(raw, 18, ctx);
      expect(prices.incl).toBe(118);
      expect(prices.excl).toBe(100);
    });

    it('falls back to inclusiveFromExclusive when unitPriceInclusive is missing/invalid in INCLUSIVE mode', () => {
      const raw: RawLineItem = {
        unitPrice: 100,
        unitPriceInclusive: 0,
        priceMode: 'INCLUSIVE',
      };
      const ctx: LineItemContext = { isGstActive: true, isComposition: false };
      const prices = recomputePrices(raw, 18, ctx);
      expect(prices.incl).toBe(118);
      expect(prices.excl).toBe(100);
    });
  });

  describe('normalizeInvoiceLineItem', () => {
    it('normalizes line item with composition → gstRate 0, totalAmount = taxableAmount, cessRate 0', () => {
      const raw: RawLineItem = {
        id: 'row-1',
        name: 'Consulting Service',
        hsnSacCode: '998313',
        quantity: 2,
        unitPrice: 500,
        gstRate: 18,
        cessRate: 5,
        priceMode: 'EXCLUSIVE',
      };
      const calcItem = {
        taxableAmount: 1000,
        totalAmount: 1230,
        cgstAmount: 90,
        sgstAmount: 90,
        cessAmount: 50,
        discountAmount: 0,
      };
      const ctx: LineItemContext = { isGstActive: true, isComposition: true };

      const item = normalizeInvoiceLineItem(raw, calcItem, ctx, 0);

      expect(item.id).toBe('row-1');
      expect(item.name).toBe('Consulting Service');
      expect(item.hsnSacCode).toBe('998313');
      expect(item.quantity).toBe(2);
      expect(item.priceMode).toBe('EXCLUSIVE');
      expect(item.gstRate).toBe(0);
      expect(item.cessRate).toBe(0);
      expect(item.cgstAmount).toBe(0);
      expect(item.sgstAmount).toBe(0);
      expect(item.utgstAmount).toBe(0);
      expect(item.igstAmount).toBe(0);
      expect(item.cessAmount).toBe(0);
      expect(item.totalAmount).toBe(1000); // Equals taxableAmount
    });

    it('normalizes line item with non-GST → hsnSacCode "", gstRate 0, taxes 0', () => {
      const raw: RawLineItem = {
        id: 'row-2',
        name: 'General Goods',
        hsnSacCode: '123456',
        quantity: 1,
        unitPrice: 200,
        gstRate: 18,
        cessRate: 1,
      };
      const calcItem = {
        taxableAmount: 200,
        totalAmount: 238,
        cgstAmount: 18,
        sgstAmount: 18,
        cessAmount: 2,
        discountAmount: 0,
      };
      const ctx: LineItemContext = { isGstActive: false, isComposition: false };

      const item = normalizeInvoiceLineItem(raw, calcItem, ctx, 1);

      expect(item.hsnSacCode).toBe('');
      expect(item.gstRate).toBe(0);
      expect(item.cessRate).toBe(0);
      expect(item.cgstAmount).toBe(0);
      expect(item.sgstAmount).toBe(0);
      expect(item.utgstAmount).toBe(0);
      expect(item.igstAmount).toBe(0);
      expect(item.cessAmount).toBe(0);
      expect(item.totalAmount).toBe(200); // Equals taxableAmount
      expect(item.unitPrice).toBe(200);
      expect(item.unitPriceInclusive).toBe(200);
    });

    it('populates defaults for optional line item attributes', () => {
      const raw: RawLineItem = {};
      const ctx: LineItemContext = { isGstActive: true, isComposition: false };

      const item = normalizeInvoiceLineItem(raw, null, ctx, 3);

      expect(item.name).toBe('Billed Product / Service');
      expect(item.unit).toBe('PCS');
      expect(item.quantity).toBe(0);
      expect(item.itemId).toMatch(/^CUSTOM-\d+-3$/);
      expect(item.totalAmount).toBe(0);
      expect(item.taxableAmount).toBe(0);
    });
  });

  describe('normalizePurchaseLineItem', () => {
    it('composition-gating note: taxes follow isGstActive only (composition not gated) — documents current behavior', () => {
      const raw: RawLineItem = {
        id: 'p-row-1',
        name: 'Raw Materials',
        hsnSacCode: '844332',
        quantity: 5,
        unitPrice: 100,
        gstRate: 18,
        cessRate: 2,
      };
      const calcItem = {
        taxableAmount: 500,
        totalAmount: 600,
        cgstAmount: 45,
        sgstAmount: 45,
        cessAmount: 10,
        discountAmount: 0,
      };
      // Buyer is under composition scheme, but GST is active.
      // Under Indian GST laws, composition dealers still pay taxes on inward purchases.
      const ctx: LineItemContext = { isGstActive: true, isComposition: true };

      const item = normalizePurchaseLineItem(raw, calcItem, ctx, 0);

      expect(item.id).toBe('p-row-1');
      expect(item.name).toBe('Raw Materials');
      expect(item.hsnSacCode).toBe('844332');
      expect(item.gstRate).toBe(18); // Preserved
      expect(item.cessRate).toBe(2); // Preserved
      expect(item.cgstAmount).toBe(45); // Follows isGstActive
      expect(item.sgstAmount).toBe(45);
      expect(item.cessAmount).toBe(10);
      expect(item.totalAmount).toBe(600); // Follows calcItem.totalAmount
    });

    it('zeros taxes and HSN for purchase when isGstActive is false', () => {
      const raw: RawLineItem = {
        id: 'p-row-2',
        hsnSacCode: '844332',
        quantity: 2,
        unitPrice: 150,
        discountPercent: 10,
        gstRate: 18,
      };
      const ctx: LineItemContext = { isGstActive: false, isComposition: false };

      const item = normalizePurchaseLineItem(raw, null, ctx, 0);

      expect(item.name).toBe('Purchased Item');
      expect(item.hsnSacCode).toBe('');
      expect(item.gstRate).toBe(0);
      expect(item.cessRate).toBe(0);
      expect(item.cgstAmount).toBe(0);
      expect(item.sgstAmount).toBe(0);
      // Fallback totalAmount: 2 * 150 * (1 - 0.1) = 270
      expect(item.totalAmount).toBe(270);
    });
  });

  describe('finalizeTotals', () => {
    const baseSummary: InvoiceCalculationSummary = {
      items: [],
      totalGrossAmount: 1000,
      totalDiscount: 50,
      totalTaxableAmount: 950,
      totalCgst: 85.5,
      totalSgst: 85.5,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 171,
      netAmount: 1121,
      roundOff: 0,
      grandTotal: 1121,
      isIntraState: true,
    };

    it('finalizes totals with shipping and overallDiscount', () => {
      const ctx: TotalsContext = {
        isGstActive: true,
        isComposition: false,
        shippingAmount: 40,
        overallDiscountAmount: 20,
      };

      const result = finalizeTotals(baseSummary, ctx);

      // totalDiscount = 50 + 20 = 70
      expect(result.totalDiscount).toBe(70);
      // grandTotal = Math.round(1121 - 20 + 40) = 1141
      expect(result.grandTotal).toBe(1141);
      // effectiveNet = 1121 - 20 + 40 = 1141
      // roundOff = 1141 - 1141 = 0
      expect(result.roundOff).toBe(0);
      expect(result.totalTaxableAmount).toBe(950);
      expect(result.totalCgst).toBe(85.5);
      expect(result.totalSgst).toBe(85.5);
      expect(result.totalTax).toBe(171);
    });

    it('correctly calculates fractional roundOff with shipping and discount', () => {
      const summaryWithFractions: InvoiceCalculationSummary = {
        ...baseSummary,
        netAmount: 1121.4,
        grandTotal: 1121,
        roundOff: -0.4,
      };

      const ctx: TotalsContext = {
        isGstActive: true,
        isComposition: false,
        shippingAmount: 35.25,
        overallDiscountAmount: 10,
      };

      const result = finalizeTotals(summaryWithFractions, ctx);

      // grandTotal = Math.round(1121 - 10 + 35.25) = Math.round(1146.25) = 1146
      expect(result.grandTotal).toBe(1146);
      // effectiveNet = 1121.40 - 10 + 35.25 = 1146.65
      // roundOff = 1146 - 1146.65 = -0.65
      expect(result.roundOff).toBe(-0.65);
      // Accounting check: effectiveNet + roundOff === grandTotal
      expect(Number((1146.65 + result.roundOff).toFixed(2))).toBe(result.grandTotal);
    });

    it('zeros tax fields when isGstActive is false', () => {
      const ctx: TotalsContext = {
        isGstActive: false,
        isComposition: false,
      };

      const result = finalizeTotals(baseSummary, ctx);

      expect(result.totalCgst).toBe(0);
      expect(result.totalSgst).toBe(0);
      expect(result.totalUtgst).toBe(0);
      expect(result.isUtgst).toBe(false);
      expect(result.totalIgst).toBe(0);
      expect(result.totalCess).toBe(0);
      expect(result.totalTax).toBe(0);
      expect(result.grandTotal).toBe(baseSummary.grandTotal);
    });
  });

  describe('derivePaymentStatus', () => {
    it('returns PAID for full payment', () => {
      expect(derivePaymentStatus(1000, 1000)).toBe('PAID');
    });

    it('returns PAID within 1 paisa rounding margin', () => {
      expect(derivePaymentStatus(999.99, 1000)).toBe('PAID');
    });

    it('returns PAID for overpayment', () => {
      expect(derivePaymentStatus(1050, 1000)).toBe('PAID');
    });

    it('returns PAID for zero amount bill with zero paid', () => {
      expect(derivePaymentStatus(0, 0)).toBe('PAID');
    });

    it('returns PARTIAL for partial payments', () => {
      expect(derivePaymentStatus(500, 1000)).toBe('PARTIAL');
      expect(derivePaymentStatus(0.01, 1000)).toBe('PARTIAL');
      expect(derivePaymentStatus(999.98, 1000)).toBe('PARTIAL');
    });

    it('returns UNPAID for zero or negative payment', () => {
      expect(derivePaymentStatus(0, 1000)).toBe('UNPAID');
      expect(derivePaymentStatus(-50, 1000)).toBe('UNPAID');
    });
  });
});
