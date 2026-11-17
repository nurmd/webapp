import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import {
  finalizePurchaseTotals,
  derivePurchasePaymentStatus,
} from '../core/invoicing/lineItemEngine.ts';
import type { PaymentStatus } from '../models/invoice.ts';

/**
 * Historical baseline formulas previously inlined in TableGridPurchaseModal.tsx:
 *
 * const preRound = calcSummary.netAmount + (Number(shippingAmount) || 0);
 * const finalGrandTotal = Math.max(0, Math.round(preRound));
 * const finalRoundOff = Number((finalGrandTotal - preRound).toFixed(2));
 */
function baselinePurchaseTotals(
  netAmount: number,
  shippingAmount: number
): { grandTotal: number; roundOff: number } {
  const preRound = netAmount + (Number(shippingAmount) || 0);
  const grandTotal = Math.max(0, Math.round(preRound));
  const roundOff = Number((grandTotal - preRound).toFixed(2));
  return { grandTotal, roundOff };
}

/**
 * Historical baseline payment status derivation previously inlined in TableGridPurchaseModal.tsx:
 *
 * if (finalGrandTotal <= 0) return 'PAID';
 * if (totalPaid >= finalGrandTotal) return 'PAID';
 * if (totalPaid > 0) return 'PARTIAL';
 * return 'UNPAID';
 */
function baselinePurchasePaymentStatus(
  grandTotal: number,
  totalPaid: number
): PaymentStatus {
  if (grandTotal <= 0) return 'PAID';
  if (totalPaid >= grandTotal) return 'PAID';
  if (totalPaid > 0) return 'PARTIAL';
  return 'UNPAID';
}

describe('Purchase Totals & Payment Status Engine (Phase 3.1 Equivalence)', () => {
  describe('Totals & Round-Off Equivalence Matrix', () => {
    const netAmountSamples = [
      0,
      0.01,
      0.49,
      0.5,
      0.51,
      1,
      10.49,
      10.5,
      10.51,
      99.49,
      99.5,
      99.51,
      100,
      1000.25,
      4567.89,
      -0.49,
      -0.5,
      -0.51,
      -1,
      -50,
      -100.25,
      1000000.75,
      99999999.49,
      99999999.5,
    ];

    const shippingAmountSamples = [
      0,
      50,
      100,
      0.49,
      0.5,
      0.51,
      15.5,
      22.49,
      22.51,
      -10,
      -0.5,
    ];

    it('reproduces baseline grandTotal and roundOff byte-for-byte across the sample matrix', () => {
      for (const net of netAmountSamples) {
        for (const shipping of shippingAmountSamples) {
          const baseline = baselinePurchaseTotals(net, shipping);
          const result = finalizePurchaseTotals(
            { netAmount: net },
            { shippingAmount: shipping }
          );

          expect(
            result.grandTotal,
            `grandTotal mismatch for netAmount=${net}, shippingAmount=${shipping}`
          ).toBe(baseline.grandTotal);

          expect(
            result.roundOff,
            `roundOff mismatch for netAmount=${net}, shippingAmount=${shipping}`
          ).toBe(baseline.roundOff);
        }
      }
    });

    it('handles zero or negative pre-round totals by clamping grandTotal to 0', () => {
      const negativeResult = finalizePurchaseTotals({ netAmount: -100 }, { shippingAmount: 0 });
      expect(negativeResult.grandTotal).toBe(0);
      expect(negativeResult.roundOff).toBe(100);

      const zeroResult = finalizePurchaseTotals({ netAmount: 0 }, { shippingAmount: 0 });
      expect(zeroResult.grandTotal).toBe(0);
      expect(zeroResult.roundOff).toBe(0);
    });

    it('handles fractional paise boundaries identically to Math.round', () => {
      // .50 rounds up
      const roundUp = finalizePurchaseTotals({ netAmount: 100.5 }, { shippingAmount: 0 });
      expect(roundUp.grandTotal).toBe(101);
      expect(roundUp.roundOff).toBe(0.5);

      // .49 rounds down
      const roundDown = finalizePurchaseTotals({ netAmount: 100.49 }, { shippingAmount: 0 });
      expect(roundDown.grandTotal).toBe(100);
      expect(roundDown.roundOff).toBe(-0.49);
    });
  });

  describe('Payment Status Derivation Equivalence', () => {
    const testCases: Array<{
      grandTotal: number;
      totalPaid: number;
      expected: PaymentStatus;
      description: string;
    }> = [
      { grandTotal: 0, totalPaid: 0, expected: 'PAID', description: 'zero grandTotal with zero paid' },
      { grandTotal: -10, totalPaid: 0, expected: 'PAID', description: 'negative grandTotal' },
      { grandTotal: 0, totalPaid: 50, expected: 'PAID', description: 'zero grandTotal with paid amount' },
      { grandTotal: 500, totalPaid: 0, expected: 'UNPAID', description: 'positive grandTotal with zero paid' },
      { grandTotal: 500, totalPaid: -10, expected: 'UNPAID', description: 'positive grandTotal with non-positive paid' },
      { grandTotal: 500, totalPaid: 200, expected: 'PARTIAL', description: 'partial payment' },
      { grandTotal: 500, totalPaid: 499.99, expected: 'PARTIAL', description: 'sub-rupee underpayment' },
      { grandTotal: 500, totalPaid: 500, expected: 'PAID', description: 'exact full payment' },
      { grandTotal: 500, totalPaid: 600, expected: 'PAID', description: 'overpayment' },
    ];

    for (const { grandTotal, totalPaid, expected, description } of testCases) {
      it(`derives status ${expected} for ${description} (grandTotal=${grandTotal}, totalPaid=${totalPaid})`, () => {
        const baseline = baselinePurchasePaymentStatus(grandTotal, totalPaid);
        const result = derivePurchasePaymentStatus(grandTotal, totalPaid);

        expect(result).toBe(expected);
        expect(result).toBe(baseline);
      });
    }
  });

  describe('TableGridPurchaseModal Integration Guard', () => {
    it('verifies TableGridPurchaseModal imports both engine functions and has no inline legacy formulas', () => {
      const modalPath = path.resolve(
        __dirname,
        '../components/Purchases/TableGridPurchaseModal.tsx'
      );
      const content = fs.readFileSync(modalPath, 'utf8');

      // Must import both new functions
      expect(content).toContain('finalizePurchaseTotals');
      expect(content).toContain('derivePurchasePaymentStatus');

      // Must no longer contain the inline grandTotal rounding math
      expect(content).not.toContain('Math.max(0, Math.round(calcSummary.netAmount');

      // Must no longer contain the inline autoPaymentStatus ternary/if-else chain
      expect(content).not.toContain('if (finalGrandTotal <= 0)');
      expect(content).not.toContain('if (totalPaid >= finalGrandTotal)');
    });
  });
});
