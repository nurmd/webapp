import { describe, it, expect } from 'vitest';
import { calculateInvoice, calculateItemGst } from '@/core/gst/calculator';

describe('Suite 1: Statutory Indian GST Calculations', () => {
  it('TC-CALC-01: Intra-state 18% slab splits equally into 9% CGST and 9% SGST with 0 IGST', () => {
    const res = calculateInvoice('27', '27', [
      { quantity: 2, unitPrice: 1000, gstRate: 18 },
    ]);
    expect(res.isIntraState).toBe(true);
    expect(res.totalGrossAmount).toBe(2000);
    expect(res.totalTaxableAmount).toBe(2000);
    expect(res.totalCgst).toBe(180);
    expect(res.totalSgst).toBe(180);
    expect(res.totalIgst).toBe(0);
    expect(res.totalTax).toBe(360);
    expect(res.grandTotal).toBe(2360);
  });

  it('TC-CALC-02: Intra-state 5%, 12%, and 28% slabs calculate exact statutory 50/50 tax split', () => {
    const slab5 = calculateItemGst({ quantity: 1, unitPrice: 100, gstRate: 5 }, true);
    expect(slab5.cgstRate).toBe(2.5);
    expect(slab5.sgstRate).toBe(2.5);
    expect(slab5.cgstAmount).toBe(2.5);
    expect(slab5.sgstAmount).toBe(2.5);
    expect(slab5.igstAmount).toBe(0);
    expect(slab5.totalAmount).toBe(105);

    const slab12 = calculateItemGst({ quantity: 1, unitPrice: 100, gstRate: 12 }, true);
    expect(slab12.cgstRate).toBe(6);
    expect(slab12.sgstRate).toBe(6);
    expect(slab12.cgstAmount).toBe(6);
    expect(slab12.sgstAmount).toBe(6);
    expect(slab12.igstAmount).toBe(0);
    expect(slab12.totalAmount).toBe(112);

    const slab28 = calculateItemGst({ quantity: 1, unitPrice: 100, gstRate: 28 }, true);
    expect(slab28.cgstRate).toBe(14);
    expect(slab28.sgstRate).toBe(14);
    expect(slab28.cgstAmount).toBe(14);
    expect(slab28.sgstAmount).toBe(14);
    expect(slab28.igstAmount).toBe(0);
    expect(slab28.totalAmount).toBe(128);
  });

  it('TC-CALC-03: Intra-state 0% slab (exempt / nil-rated) yields exactly zero CGST and SGST', () => {
    const res = calculateInvoice('27', '27', [
      { quantity: 5, unitPrice: 200, gstRate: 0 },
    ]);
    expect(res.totalTaxableAmount).toBe(1000);
    expect(res.totalCgst).toBe(0);
    expect(res.totalSgst).toBe(0);
    expect(res.totalIgst).toBe(0);
    expect(res.totalTax).toBe(0);
    expect(res.grandTotal).toBe(1000);
  });

  it('TC-CALC-04: Inter-state 18% slab assigns 100% of tax to IGST with zero CGST and zero SGST', () => {
    const res = calculateInvoice('27', '24', [
      { quantity: 1, unitPrice: 5000, gstRate: 18 },
    ]);
    expect(res.isIntraState).toBe(false);
    expect(res.totalTaxableAmount).toBe(5000);
    expect(res.totalCgst).toBe(0);
    expect(res.totalSgst).toBe(0);
    expect(res.totalIgst).toBe(900);
    expect(res.totalTax).toBe(900);
    expect(res.grandTotal).toBe(5900);
  });

  it('TC-CALC-05: Inter-state 5%, 12%, and 28% slabs assign 100% of tax to IGST', () => {
    const slab5 = calculateItemGst({ quantity: 1, unitPrice: 100, gstRate: 5 }, false);
    expect(slab5.cgstAmount).toBe(0);
    expect(slab5.sgstAmount).toBe(0);
    expect(slab5.igstRate).toBe(5);
    expect(slab5.igstAmount).toBe(5);
    expect(slab5.totalAmount).toBe(105);

    const slab12 = calculateItemGst({ quantity: 1, unitPrice: 100, gstRate: 12 }, false);
    expect(slab12.cgstAmount).toBe(0);
    expect(slab12.sgstAmount).toBe(0);
    expect(slab12.igstRate).toBe(12);
    expect(slab12.igstAmount).toBe(12);
    expect(slab12.totalAmount).toBe(112);

    const slab28 = calculateItemGst({ quantity: 1, unitPrice: 100, gstRate: 28 }, false);
    expect(slab28.cgstAmount).toBe(0);
    expect(slab28.sgstAmount).toBe(0);
    expect(slab28.igstRate).toBe(28);
    expect(slab28.igstAmount).toBe(28);
    expect(slab28.totalAmount).toBe(128);
  });

  it('TC-CALC-06: Percentage discount correctly reduces gross amount before calculating taxable amount', () => {
    const res = calculateInvoice('27', '27', [
      { quantity: 2, unitPrice: 1000, discountPercent: 10, gstRate: 18 },
    ]);
    expect(res.totalGrossAmount).toBe(2000);
    expect(res.totalDiscount).toBe(200);
    expect(res.totalTaxableAmount).toBe(1800);
    expect(res.totalCgst).toBe(162);
    expect(res.totalSgst).toBe(162);
    expect(res.totalTax).toBe(324);
    expect(res.grandTotal).toBe(2124);
  });

  it('TC-CALC-07: Flat rupee discount correctly reduces gross amount before calculating taxable amount', () => {
    const res = calculateInvoice('27', '27', [
      { quantity: 1, unitPrice: 2000, discountAmount: 300, gstRate: 18 },
    ]);
    expect(res.totalGrossAmount).toBe(2000);
    expect(res.totalDiscount).toBe(300);
    expect(res.totalTaxableAmount).toBe(1700);
    expect(res.totalCgst).toBe(153);
    expect(res.totalSgst).toBe(153);
    expect(res.totalTax).toBe(306);
    expect(res.grandTotal).toBe(2006);
  });

  it('TC-CALC-08: Discount exceeding gross amount clamps taxable amount to zero without negative tax', () => {
    const item = calculateItemGst({ quantity: 1, unitPrice: 500, discountAmount: 600, gstRate: 18 }, true);
    expect(item.grossAmount).toBe(500);
    expect(item.discountAmount).toBe(600);
    expect(item.taxableAmount).toBe(0);
    expect(item.cgstAmount).toBe(0);
    expect(item.sgstAmount).toBe(0);
    expect(item.igstAmount).toBe(0);
    expect(item.totalTax).toBe(0);
    expect(item.totalAmount).toBe(0);
  });

  it('TC-CALC-09: Ad-valorem percentage cess calculates correct tax on taxable amount', () => {
    const item = calculateItemGst({ quantity: 1, unitPrice: 10000, gstRate: 28, cessPercent: 12 }, true);
    expect(item.taxableAmount).toBe(10000);
    expect(item.cgstAmount).toBe(1400);
    expect(item.sgstAmount).toBe(1400);
    expect(item.cessRate).toBe(12);
    expect(item.cessAmount).toBe(1200);
    expect(item.totalTax).toBe(4000);
    expect(item.totalAmount).toBe(14000);
  });

  it('TC-CALC-10: Specific per-unit cess calculates correct fixed tax based on quantity', () => {
    const item = calculateItemGst({ quantity: 5, unitPrice: 2000, gstRate: 18, cessPerUnit: 50 }, true);
    expect(item.taxableAmount).toBe(10000);
    expect(item.cgstAmount).toBe(900);
    expect(item.sgstAmount).toBe(900);
    expect(item.cessAmount).toBe(250); // 5 units * 50
    expect(item.totalTax).toBe(2050);
    expect(item.totalAmount).toBe(12050);
  });

  it('TC-CALC-11: Compound cess (ad-valorem % + per-unit cess) correctly sums both cess components', () => {
    const item = calculateItemGst({
      quantity: 10,
      unitPrice: 1000,
      gstRate: 28,
      cessPercent: 5,
      cessPerUnit: 20,
    }, true);
    expect(item.taxableAmount).toBe(10000);
    expect(item.cgstAmount).toBe(1400);
    expect(item.sgstAmount).toBe(1400);
    // (10000 * 5%) + (10 * 20) = 500 + 200 = 700
    expect(item.cessAmount).toBe(700);
    expect(item.totalTax).toBe(3500);
    expect(item.totalAmount).toBe(13500);
  });

  it('TC-CALC-12: Multi-item invoice with mixed tax slabs (0%, 5%, 18%, 28%) calculates accurate aggregate totals', () => {
    const res = calculateInvoice('27', '27', [
      { quantity: 1, unitPrice: 1000, gstRate: 0 },
      { quantity: 2, unitPrice: 500, gstRate: 5 },
      { quantity: 1, unitPrice: 2000, gstRate: 18 },
      { quantity: 1, unitPrice: 3000, gstRate: 28 },
    ]);
    expect(res.totalGrossAmount).toBe(7000);
    expect(res.totalTaxableAmount).toBe(7000);
    expect(res.totalCgst).toBe(625);
    expect(res.totalSgst).toBe(625);
    expect(res.totalIgst).toBe(0);
    expect(res.totalTax).toBe(1250);
    expect(res.netAmount).toBe(8250);
    expect(res.grandTotal).toBe(8250);
    expect(res.roundOff).toBe(0);
  });

  it('TC-CALC-13: Half-up rounding rounds ₹100.50 to ₹101.00 with roundOff = +0.50', () => {
    const res = calculateInvoice('27', '27', [
      { quantity: 1, unitPrice: 100.50, gstRate: 0 },
    ]);
    expect(res.netAmount).toBe(100.50);
    expect(res.grandTotal).toBe(101);
    expect(res.roundOff).toBe(0.50);
  });

  it('TC-CALC-14: Half-down rounding rounds ₹100.49 to ₹100.00 with roundOff = -0.49', () => {
    const res = calculateInvoice('27', '27', [
      { quantity: 1, unitPrice: 100.49, gstRate: 0 },
    ]);
    expect(res.netAmount).toBe(100.49);
    expect(res.grandTotal).toBe(100);
    expect(res.roundOff).toBe(-0.49);
  });

  it('TC-CALC-15: Whole rupee invoice (₹100.00) produces grandTotal = ₹100.00 with roundOff = 0.00', () => {
    const res = calculateInvoice('27', '27', [
      { quantity: 1, unitPrice: 100, gstRate: 0 },
    ]);
    expect(res.netAmount).toBe(100.00);
    expect(res.grandTotal).toBe(100);
    expect(res.roundOff).toBe(0);
  });

  it('TC-CALC-16: Mathematical invariant grandTotal === Number((netAmount + roundOff).toFixed(2)) holds across fractional quantities', () => {
    const res = calculateInvoice('27', '24', [
      { quantity: 3.333, unitPrice: 127.45, discountPercent: 7.5, gstRate: 18, cessPercent: 1.5 },
    ]);
    const reconstructed = Number((res.netAmount + res.roundOff).toFixed(2));
    expect(res.grandTotal).toBe(reconstructed);
  });
});
