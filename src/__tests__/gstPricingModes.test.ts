import { describe, it, expect } from 'vitest';
import {
  calculateItemGst,
  calculateInvoice,
  InvoiceItemCalculationInput,
} from '@/core/gst/calculator';
import {
  exclusiveFromInclusive,
  inclusiveFromExclusive,
  calculateRateFromTotal,
  round2,
  round4,
} from '@/core/gst/pricing';

describe('GST Inclusive / Exclusive Pricing - Phase 1 Engine Tests', () => {
  describe('Helper Module: pricing.ts', () => {
    it('rounds correctly with round2 and round4', () => {
      expect(round2(100.555)).toBe(100.56);
      expect(round2(100.554)).toBe(100.55);
      expect(round4(100.55555)).toBe(100.5556);
      expect(round4(100.55554)).toBe(100.5555);
    });

    it('converts exclusive to inclusive correctly (GST only, CESS excluded)', () => {
      expect(inclusiveFromExclusive(100, 18)).toBe(118);
      expect(inclusiveFromExclusive(100, 5)).toBe(105);
      expect(inclusiveFromExclusive(100, 12)).toBe(112);
      expect(inclusiveFromExclusive(100, 28)).toBe(128);
      expect(inclusiveFromExclusive(100, 0)).toBe(100);
      expect(inclusiveFromExclusive(0, 18)).toBe(0);
    });

    it('converts inclusive to exclusive correctly (GST only, CESS excluded)', () => {
      expect(exclusiveFromInclusive(118, 18)).toBe(100);
      expect(exclusiveFromInclusive(105, 5)).toBe(100);
      expect(exclusiveFromInclusive(112, 12)).toBe(100);
      expect(exclusiveFromInclusive(128, 28)).toBe(100);
      expect(exclusiveFromInclusive(100, 18)).toBe(84.75);
      expect(exclusiveFromInclusive(100, 0)).toBe(100);
      expect(exclusiveFromInclusive(0, 18)).toBe(0);
    });

    describe('calculateRateFromTotal (authoritative back-calculation)', () => {
      it('calculates rate in EXCLUSIVE mode without discount or cess', () => {
        const rate = calculateRateFromTotal({
          total: 236,
          quantity: 2,
          gstRate: 18,
          priceMode: 'EXCLUSIVE',
        });
        expect(rate).toBe(100);
      });

      it('calculates rate in INCLUSIVE mode without discount or cess', () => {
        const rate = calculateRateFromTotal({
          total: 236,
          quantity: 2,
          gstRate: 18,
          priceMode: 'INCLUSIVE',
        });
        expect(rate).toBe(118);
      });

      it('calculates rate in INCLUSIVE mode with discount and 18% GST (Spec Case 4)', () => {
        const rate = calculateRateFromTotal({
          total: 106.20,
          quantity: 1,
          discountPercent: 10,
          gstRate: 18,
          priceMode: 'INCLUSIVE',
        });
        expect(rate).toBe(118);
      });

      it('calculates rate in INCLUSIVE mode with discount, 18% GST, and 12% CESS (Spec Case 5)', () => {
        const rate = calculateRateFromTotal({
          total: 117.00,
          quantity: 1,
          discountPercent: 10,
          gstRate: 18,
          cessRate: 12,
          priceMode: 'INCLUSIVE',
        });
        expect(rate).toBe(118);
      });

      it('guards against division by zero, 100% discount, zero/negative qty or total', () => {
        expect(calculateRateFromTotal({ total: 0, quantity: 1, gstRate: 18 })).toBe(0);
        expect(calculateRateFromTotal({ total: -100, quantity: 1, gstRate: 18 })).toBe(0);
        expect(calculateRateFromTotal({ total: 100, quantity: 0, gstRate: 18 })).toBe(0);
        expect(calculateRateFromTotal({ total: 100, quantity: -2, gstRate: 18 })).toBe(0);
        expect(calculateRateFromTotal({ total: 100, quantity: 1, discountPercent: 100, gstRate: 18 })).toBe(0);
        expect(calculateRateFromTotal({ total: 100, quantity: 1, discountPercent: 110, gstRate: 18 })).toBe(0);
      });
    });
  });

  describe('Spec Section 4.3 Worked Acceptance Examples', () => {
    // Case 1: 2 × ₹100 exclusive, 18% GST, no CESS
    it('Case 1: 2 × ₹100 exclusive, 18% GST, no CESS -> taxable 200.00, GST 36.00, total 236.00', () => {
      const item: InvoiceItemCalculationInput = {
        quantity: 2,
        unitPrice: 100,
        gstRate: 18,
        priceMode: 'EXCLUSIVE',
      };
      const res = calculateItemGst(item, true);
      expect(res.grossAmount).toBe(200.00);
      expect(res.grossAmountExclusive).toBe(200.00);
      expect(res.grossAmountInclusive).toBe(236.00);
      expect(res.taxableAmount).toBe(200.00);
      expect(res.cgstAmount).toBe(18.00);
      expect(res.sgstAmount).toBe(18.00);
      expect(res.totalTax).toBe(36.00);
      expect(res.totalAmount).toBe(236.00);
    });

    // Case 2: 2 × ₹118 inclusive, 18% GST, no CESS
    it('Case 2: 2 × ₹118 inclusive, 18% GST, no CESS -> gross 236.00, taxable 200.00, GST 36.00, total 236.00', () => {
      const item: InvoiceItemCalculationInput = {
        quantity: 2,
        unitPrice: 100,
        unitPriceInclusive: 118,
        gstRate: 18,
        priceMode: 'INCLUSIVE',
      };
      const res = calculateItemGst(item, true);
      expect(res.grossAmount).toBe(236.00);
      expect(res.grossAmountInclusive).toBe(236.00);
      expect(res.grossAmountExclusive).toBe(200.00);
      expect(res.taxableAmount).toBe(200.00);
      expect(res.cgstAmount).toBe(18.00);
      expect(res.sgstAmount).toBe(18.00);
      expect(res.totalTax).toBe(36.00);
      expect(res.totalAmount).toBe(236.00);
    });

    // Case 3: 1 × ₹100 inclusive, 18% GST
    it('Case 3: 1 × ₹100 inclusive, 18% GST -> taxable 84.75, GST 15.25, total 100.00', () => {
      const item: InvoiceItemCalculationInput = {
        quantity: 1,
        unitPriceInclusive: 100,
        unitPrice: 84.75,
        gstRate: 18,
        priceMode: 'INCLUSIVE',
      };
      const res = calculateItemGst(item, true);
      expect(res.grossAmount).toBe(100.00);
      expect(res.taxableAmount).toBe(84.75);
      expect(res.totalTax).toBe(15.25);
      expect(res.totalAmount).toBe(100.00);
      // Tax split: 15.25 / 2 = 7.625 -> CGST 7.63, SGST 7.62
      expect(res.cgstAmount).toBe(7.63);
      expect(res.sgstAmount).toBe(7.62);
      expect(round2(res.cgstAmount + res.sgstAmount)).toBe(15.25);
    });

    // Case 4: 1 × ₹118 inclusive, 10% discount, 18% GST
    it('Case 4: 1 × ₹118 inclusive, 10% discount, 18% GST -> discount 11.80, net incl 106.20, taxable 90.00, GST 16.20, total 106.20', () => {
      const item: InvoiceItemCalculationInput = {
        quantity: 1,
        unitPrice: 100,
        unitPriceInclusive: 118,
        discountPercent: 10,
        gstRate: 18,
        priceMode: 'INCLUSIVE',
      };
      const res = calculateItemGst(item, true);
      expect(res.grossAmount).toBe(118.00);
      expect(res.discountAmount).toBe(11.80);
      expect(res.netInclusiveAmount).toBe(106.20);
      expect(res.taxableAmount).toBe(90.00);
      expect(res.cgstAmount).toBe(8.10);
      expect(res.sgstAmount).toBe(8.10);
      expect(res.totalTax).toBe(16.20);
      expect(res.totalAmount).toBe(106.20);
    });

    // Case 5: 1 × ₹118 inclusive, 10% discount, 18% GST + 12% CESS on taxable 90.00
    it('Case 5: Above + 12% CESS on taxable 90.00 -> CESS 10.80, total 117.00', () => {
      const item: InvoiceItemCalculationInput = {
        quantity: 1,
        unitPrice: 100,
        unitPriceInclusive: 118,
        discountPercent: 10,
        gstRate: 18,
        cessPercent: 12,
        priceMode: 'INCLUSIVE',
      };
      const res = calculateItemGst(item, true);
      expect(res.discountAmount).toBe(11.80);
      expect(res.netInclusiveAmount).toBe(106.20);
      expect(res.taxableAmount).toBe(90.00);
      expect(res.cgstAmount).toBe(8.10);
      expect(res.sgstAmount).toBe(8.10);
      expect(res.cessAmount).toBe(10.80);
      expect(res.totalTax).toBe(27.00); // 16.20 GST + 10.80 CESS
      expect(res.totalAmount).toBe(117.00);
    });

    // Case 6: 1 × ₹99.99 inclusive, 18% GST
    it('Case 6: 1 × ₹99.99 inclusive, 18% GST -> taxable + GST must equal 99.99 exactly at 2 decimals', () => {
      const item: InvoiceItemCalculationInput = {
        quantity: 1,
        unitPriceInclusive: 99.99,
        unitPrice: 84.74,
        gstRate: 18,
        priceMode: 'INCLUSIVE',
      };
      const res = calculateItemGst(item, true);
      expect(res.taxableAmount).toBe(84.74);
      expect(res.totalTax).toBe(15.25);
      expect(round2(res.taxableAmount + res.totalTax)).toBe(99.99);
      expect(res.totalAmount).toBe(99.99);
      expect(round2(res.cgstAmount + res.sgstAmount)).toBe(15.25);
    });

    // Case 7: 1 × ₹100 inclusive, 0% GST
    it('Case 7: 1 × ₹100 inclusive, 0% GST -> taxable 100.00, GST 0.00, total 100.00', () => {
      const item: InvoiceItemCalculationInput = {
        quantity: 1,
        unitPrice: 100,
        unitPriceInclusive: 100,
        gstRate: 0,
        priceMode: 'INCLUSIVE',
      };
      const res = calculateItemGst(item, true);
      expect(res.grossAmount).toBe(100.00);
      expect(res.taxableAmount).toBe(100.00);
      expect(res.cgstAmount).toBe(0);
      expect(res.sgstAmount).toBe(0);
      expect(res.totalTax).toBe(0);
      expect(res.totalAmount).toBe(100.00);
    });

    // Case 8: Flat discount > gross
    it('Case 8: Flat discount > gross -> discount capped at gross, taxable 0, total 0 (plus no negative values)', () => {
      const item: InvoiceItemCalculationInput = {
        quantity: 1,
        unitPriceInclusive: 100,
        unitPrice: 84.75,
        discountAmount: 150,
        gstRate: 18,
        priceMode: 'INCLUSIVE',
      };
      const res = calculateItemGst(item, true);
      expect(res.grossAmount).toBe(100.00);
      expect(res.discountAmount).toBe(100.00);
      expect(res.taxableAmount).toBe(0);
      expect(res.cgstAmount).toBe(0);
      expect(res.sgstAmount).toBe(0);
      expect(res.totalTax).toBe(0);
      expect(res.totalAmount).toBe(0);
    });
  });

  describe('Tax Bifurcation & Paisa Conservation Invariants', () => {
    it('Intra-state Non-UT: CGST + SGST strictly equals total GST for odd paisa amounts', () => {
      // 1 × ₹77.77 @ 18% GST
      const item: InvoiceItemCalculationInput = {
        quantity: 1,
        unitPriceInclusive: 77.77,
        gstRate: 18,
        priceMode: 'INCLUSIVE',
      };
      const res = calculateItemGst(item, true, false);
      const gst = round2(res.totalAmount - res.taxableAmount);
      expect(round2(res.cgstAmount + res.sgstAmount)).toBe(gst);
      expect(res.utgstAmount).toBe(0);
      expect(res.igstAmount).toBe(0);
    });

    it('Intra-state Union Territory (e.g. Chandigarh "04"): CGST + UTGST strictly equals total GST, SGST = 0', () => {
      const item: InvoiceItemCalculationInput = {
        quantity: 1,
        unitPriceInclusive: 100,
        gstRate: 18,
        priceMode: 'INCLUSIVE',
      };
      const res = calculateItemGst(item, true, '04');
      expect(res.cgstRate).toBe(9);
      expect(res.utgstRate).toBe(9);
      expect(res.sgstRate).toBe(0);
      expect(res.sgstAmount).toBe(0);
      expect(res.cgstAmount).toBe(7.63);
      expect(res.utgstAmount).toBe(7.62);
      expect(round2(res.cgstAmount + (res.utgstAmount || 0))).toBe(res.totalTax);
    });

    it('Inter-state supply: IGST strictly equals total GST, CGST = 0, SGST = 0, UTGST = 0', () => {
      const item: InvoiceItemCalculationInput = {
        quantity: 1,
        unitPriceInclusive: 100,
        gstRate: 18,
        priceMode: 'INCLUSIVE',
      };
      const res = calculateItemGst(item, false);
      expect(res.igstRate).toBe(18);
      expect(res.igstAmount).toBe(15.25);
      expect(res.cgstAmount).toBe(0);
      expect(res.sgstAmount).toBe(0);
      expect(res.utgstAmount).toBe(0);
      expect(res.totalTax).toBe(15.25);
      expect(res.totalAmount).toBe(100.00);
    });
  });

  describe('Statutory GST Slabs in Inclusive Mode', () => {
    const slabs = [
      { rate: 0, gross: 100, expectedTaxable: 100, expectedGst: 0 },
      { rate: 0.1, gross: 100.10, expectedTaxable: 100.00, expectedGst: 0.10 },
      { rate: 0.25, gross: 100.25, expectedTaxable: 100.00, expectedGst: 0.25 },
      { rate: 3, gross: 103, expectedTaxable: 100.00, expectedGst: 3.00 },
      { rate: 5, gross: 105, expectedTaxable: 100.00, expectedGst: 5.00 },
      { rate: 12, gross: 112, expectedTaxable: 100.00, expectedGst: 12.00 },
      { rate: 18, gross: 118, expectedTaxable: 100.00, expectedGst: 18.00 },
      { rate: 28, gross: 128, expectedTaxable: 100.00, expectedGst: 28.00 },
    ];

    slabs.forEach(({ rate, gross, expectedTaxable, expectedGst }) => {
      it(`calculates statutory slab ${rate}% correctly for gross ₹${gross}`, () => {
        const res = calculateItemGst(
          {
            quantity: 1,
            unitPriceInclusive: gross,
            gstRate: rate,
            priceMode: 'INCLUSIVE',
          },
          true
        );
        expect(res.taxableAmount).toBe(expectedTaxable);
        expect(res.totalTax).toBe(expectedGst);
        expect(res.totalAmount).toBe(gross);
        expect(round2(res.cgstAmount + res.sgstAmount)).toBe(expectedGst);
      });
    });

    it('calculates compound CESS on top of inclusive 28% GST item', () => {
      // 1 × ₹128 inclusive (28% GST) + 12% CESS + ₹15 per-unit CESS
      const res = calculateItemGst(
        {
          quantity: 2,
          unitPriceInclusive: 128,
          gstRate: 28,
          cessPercent: 12,
          cessPerUnit: 15,
          priceMode: 'INCLUSIVE',
        },
        true
      );
      // gross = 256.00
      // taxable = 200.00
      // GST = 56.00 (CGST 28.00, SGST 28.00)
      // CESS = 200 * 12% + 2 * 15 = 24.00 + 30.00 = 54.00
      // totalTax = 56.00 + 54.00 = 110.00
      // totalAmount = 256.00 + 54.00 = 310.00
      expect(res.grossAmount).toBe(256.00);
      expect(res.taxableAmount).toBe(200.00);
      expect(res.cgstAmount).toBe(28.00);
      expect(res.sgstAmount).toBe(28.00);
      expect(res.cessAmount).toBe(54.00);
      expect(res.totalTax).toBe(110.00);
      expect(res.totalAmount).toBe(310.00);
    });
  });

  describe('Invoice Totals Aggregation (calculateInvoice) with Mixed Modes', () => {
    it('aggregates multi-item invoice with mixed EXCLUSIVE and INCLUSIVE lines', () => {
      const invoice = calculateInvoice('27', '27', [
        // Item 1: Exclusive 2 × ₹100, 18% GST -> taxable 200, GST 36, total 236
        {
          quantity: 2,
          unitPrice: 100,
          gstRate: 18,
          priceMode: 'EXCLUSIVE',
        },
        // Item 2: Inclusive 2 × ₹118, 18% GST -> taxable 200, GST 36, total 236
        {
          quantity: 2,
          unitPrice: 100,
          unitPriceInclusive: 118,
          gstRate: 18,
          priceMode: 'INCLUSIVE',
        },
        // Item 3: Inclusive 1 × ₹100, 18% GST -> taxable 84.75, GST 15.25, total 100
        {
          quantity: 1,
          unitPriceInclusive: 100,
          gstRate: 18,
          priceMode: 'INCLUSIVE',
        },
      ]);

      expect(invoice.isIntraState).toBe(true);
      // Item 1 gross: 200 (excl), Item 2 gross: 236 (incl), Item 3 gross: 100 (incl)
      // totalGrossAmount in active modes: 200 + 236 + 100 = 536
      expect(invoice.totalGrossAmount).toBe(536);
      expect(invoice.totalTaxableAmount).toBe(484.75); // 200 + 200 + 84.75
      expect(invoice.totalTax).toBe(87.25); // 36 + 36 + 15.25
      expect(invoice.netAmount).toBe(572.00); // 484.75 + 87.25 = 572.00
      expect(invoice.grandTotal).toBe(572);
      expect(invoice.roundOff).toBe(0);

      // Verify explicit gross amounts are available
      expect(invoice.totalGrossAmountExclusive).toBe(484.75); // 200 + 200 + 84.75
      expect(invoice.totalGrossAmountInclusive).toBe(572.00); // 236 + 236 + 100
    });

    it('computes mathematical rounding correctly for inclusive invoice with fractional total', () => {
      // 1 × ₹99.99 inclusive, 18% GST -> net 99.99 -> round to ₹100.00, roundOff = +0.01
      const invoice = calculateInvoice('27', '27', [
        {
          quantity: 1,
          unitPriceInclusive: 99.99,
          gstRate: 18,
          priceMode: 'INCLUSIVE',
        },
      ]);
      expect(invoice.netAmount).toBe(99.99);
      expect(invoice.grandTotal).toBe(100.00);
      expect(invoice.roundOff).toBe(0.01);
      expect(invoice.grandTotal).toBe(round2(invoice.netAmount + invoice.roundOff));
    });
  });

  describe('Correctness & Priority Invariants', () => {
    describe('Discount Priority: Flat discountAmount wins over discountPercent in both modes', () => {
      it('INCLUSIVE mode: flat discountAmount takes precedence over discountPercent when both supplied', () => {
        // Gross inclusive = 100
        // discountAmount = 25 (flat ₹25 off)
        // discountPercent = 10 (10% would be ₹10 off)
        // Since discountAmount > 0, discount must be 25, NOT 10
        const item: InvoiceItemCalculationInput = {
          quantity: 1,
          unitPriceInclusive: 100,
          discountAmount: 25,
          discountPercent: 10,
          gstRate: 18,
          priceMode: 'INCLUSIVE',
        };
        const res = calculateItemGst(item, true);
        expect(res.grossAmount).toBe(100.00);
        expect(res.discountAmount).toBe(25.00); // flat amount wins!
        expect(res.netInclusiveAmount).toBe(75.00);
        expect(res.taxableAmount).toBe(round2((75.00 * 100) / 118));
      });

      it('EXCLUSIVE mode: flat discountAmount takes precedence over discountPercent when both supplied', () => {
        const item: InvoiceItemCalculationInput = {
          quantity: 1,
          unitPrice: 100,
          discountAmount: 25,
          discountPercent: 10,
          gstRate: 18,
          priceMode: 'EXCLUSIVE',
        };
        const res = calculateItemGst(item, true);
        expect(res.grossAmount).toBe(100.00);
        expect(res.discountAmount).toBe(25.00); // flat amount wins!
        expect(res.taxableAmount).toBe(75.00);
      });
    });

    describe('Percentage Discount Cap: 150% discount capped at gross in both modes', () => {
      it('INCLUSIVE mode: 150% discount is capped at gross amount, taxable 0, total 0', () => {
        const item: InvoiceItemCalculationInput = {
          quantity: 1,
          unitPriceInclusive: 100,
          discountPercent: 150,
          gstRate: 18,
          priceMode: 'INCLUSIVE',
        };
        const res = calculateItemGst(item, true);
        expect(res.grossAmount).toBe(100.00);
        expect(res.discountAmount).toBe(100.00); // capped at gross 100.00
        expect(res.netInclusiveAmount).toBe(0);
        expect(res.taxableAmount).toBe(0);
        expect(res.totalTax).toBe(0);
        expect(res.totalAmount).toBe(0);
      });

      it('EXCLUSIVE mode: 150% discount is capped at gross amount, taxable 0, total 0', () => {
        const item: InvoiceItemCalculationInput = {
          quantity: 1,
          unitPrice: 100,
          discountPercent: 150,
          gstRate: 18,
          priceMode: 'EXCLUSIVE',
        };
        const res = calculateItemGst(item, true);
        expect(res.grossAmount).toBe(100.00);
        expect(res.discountAmount).toBe(100.00); // capped at gross 100.00
        expect(res.taxableAmount).toBe(0);
        expect(res.totalTax).toBe(0);
        expect(res.totalAmount).toBe(0);
      });
    });

    describe('Flat Discount Cap: Flat discountAmount exceeding gross is capped at gross in both modes', () => {
      it('INCLUSIVE mode: flat discount exceeding gross is capped at gross amount, taxable 0, total 0', () => {
        const item: InvoiceItemCalculationInput = {
          quantity: 1,
          unitPriceInclusive: 100,
          discountAmount: 180, // > 100
          gstRate: 18,
          priceMode: 'INCLUSIVE',
        };
        const res = calculateItemGst(item, true);
        expect(res.grossAmount).toBe(100.00);
        expect(res.discountAmount).toBe(100.00); // capped at 100.00
        expect(res.netInclusiveAmount).toBe(0);
        expect(res.taxableAmount).toBe(0);
        expect(res.totalTax).toBe(0);
        expect(res.totalAmount).toBe(0);
      });

      it('EXCLUSIVE mode: flat discount exceeding gross is capped at gross amount, taxable 0, total 0', () => {
        const item: InvoiceItemCalculationInput = {
          quantity: 1,
          unitPrice: 100,
          discountAmount: 180, // > 100
          gstRate: 18,
          priceMode: 'EXCLUSIVE',
        };
        const res = calculateItemGst(item, true);
        expect(res.grossAmount).toBe(100.00);
        expect(res.discountAmount).toBe(100.00); // capped at 100.00
        expect(res.taxableAmount).toBe(0);
        expect(res.totalTax).toBe(0);
        expect(res.totalAmount).toBe(0);
      });
    });

    describe('Authoritative Field Invariant: Last-edited priceMode field strictly wins over inconsistent non-authoritative values', () => {
      it('INCLUSIVE mode: derives exclusive rate from unitPriceInclusive and completely ignores inconsistent unitPrice', () => {
        // Authoritative: unitPriceInclusive = 118 @ 18% GST -> true exclusive is 100.00
        // Inconsistent supplied unitPrice: 999.00
        const item: InvoiceItemCalculationInput = {
          quantity: 2,
          unitPriceInclusive: 118,
          unitPrice: 999, // deliberately wrong
          gstRate: 18,
          priceMode: 'INCLUSIVE',
        };
        const res = calculateItemGst(item, true);
        expect(res.priceMode).toBe('INCLUSIVE');
        expect(res.unitPriceInclusive).toBe(118);
        expect(res.unitPriceExclusive).toBe(100); // derived from inclusive, 999 ignored
        expect(res.grossAmount).toBe(236.00); // 2 * 118
        expect(res.grossAmountInclusive).toBe(236.00);
        expect(res.grossAmountExclusive).toBe(200.00); // 2 * 100, NOT 2 * 999
        expect(res.taxableAmount).toBe(200.00);
        expect(res.totalTax).toBe(36.00);
        expect(res.totalAmount).toBe(236.00);
      });

      it('EXCLUSIVE mode: derives inclusive rate from unitPrice and completely ignores inconsistent unitPriceInclusive', () => {
        // Authoritative: unitPrice = 100 @ 18% GST -> true inclusive is 118.00
        // Inconsistent supplied unitPriceInclusive: 999.00
        const item: InvoiceItemCalculationInput = {
          quantity: 2,
          unitPrice: 100,
          unitPriceInclusive: 999, // deliberately wrong
          gstRate: 18,
          priceMode: 'EXCLUSIVE',
        };
        const res = calculateItemGst(item, true);
        expect(res.priceMode).toBe('EXCLUSIVE');
        expect(res.unitPriceExclusive).toBe(100);
        expect(res.unitPriceInclusive).toBe(118); // derived from exclusive, 999 ignored
        expect(res.grossAmount).toBe(200.00); // 2 * 100
        expect(res.grossAmountExclusive).toBe(200.00);
        expect(res.grossAmountInclusive).toBe(236.00); // 2 * 118, NOT 2 * 999
        expect(res.taxableAmount).toBe(200.00);
        expect(res.totalTax).toBe(36.00);
        expect(res.totalAmount).toBe(236.00);
      });
    });
  });
});
