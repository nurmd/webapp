/**
 * Reconciliation — the anti-hallucination core.
 *
 * The model is allowed to be wrong about arithmetic; it is not allowed to be
 * wrong about what is printed on the page. We recompute the whole bill with the
 * statutory engine and diff it against the printed totals. A mismatch is never
 * "fixed" silently — it becomes a BLOCKER that forces human review.
 */
import { calculateInvoice, STATUTORY_GST_RATES } from '../../core/gst/calculator.ts';
import type { InvoiceCalculationSummary, InvoiceItemCalculationInput } from '../../core/gst/calculator.ts';
import type { ExtractedLine, ExtractedTotals, IntakeIssue, ReconciliationResult } from './types.ts';

/** Money tolerance: 1 rupee per head, or 0.1% of the printed value, whichever is larger. */
const toleranceFor = (printed: number): number => Math.max(1, Math.abs(printed) * 0.001);

export function toCalculationInputs(lines: ExtractedLine[]): InvoiceItemCalculationInput[] {
  return lines.map((line) => ({
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discountPercent: line.discountPercent,
    discountAmount: line.discountAmount,
    gstRate: line.gstRate,
    cessPercent: line.cessRate,
  }));
}

export function computeBill(
  supplierStateCode: string,
  placeOfSupplyStateCode: string,
  lines: ExtractedLine[]
): InvoiceCalculationSummary {
  return calculateInvoice(supplierStateCode, placeOfSupplyStateCode, toCalculationInputs(lines));
}

interface CompareInput {
  field: keyof ExtractedTotals;
  printed?: number;
  computed: number;
}

export function reconcile(
  summary: InvoiceCalculationSummary,
  printed: ExtractedTotals | undefined
): ReconciliationResult {
  if (!printed) {
    return { ok: true, comparedField: 'NONE', deltas: [], summary };
  }

  const checks: CompareInput[] = [
    { field: 'taxableValue', printed: printed.taxableValue, computed: summary.totalTaxableAmount },
    { field: 'cgst', printed: printed.cgst, computed: summary.totalCgst },
    { field: 'sgst', printed: printed.sgst, computed: summary.totalSgst },
    { field: 'utgst', printed: printed.utgst, computed: summary.totalUtgst || 0 },
    { field: 'igst', printed: printed.igst, computed: summary.totalIgst },
    { field: 'cess', printed: printed.cess, computed: summary.totalCess },
    { field: 'grandTotal', printed: printed.grandTotal, computed: summary.grandTotal },
  ];

  const deltas: ReconciliationResult['deltas'] = [];
  for (const check of checks) {
    if (check.printed === undefined) continue;
    const tolerance = toleranceFor(check.printed);
    const delta = Number((check.computed - check.printed).toFixed(2));
    if (Math.abs(delta) > tolerance) {
      deltas.push({ field: check.field, printed: check.printed, computed: check.computed, delta, tolerance });
    }
  }

  // A printed total with no printed breakdown is still comparable on grand total.
  const comparedAny = checks.some((c) => c.printed !== undefined);
  return {
    ok: deltas.length === 0,
    comparedField: comparedAny ? 'PRINTED' : 'NONE',
    deltas,
    summary,
  };
}

/** Issues derived from the reconciliation diff, phrased for an accountant, not a developer. */
export function reconciliationIssues(result: ReconciliationResult): IntakeIssue[] {
  if (result.deltas.length === 0) return [];
  return result.deltas.map((d) => ({
    code: 'TOTAL_MISMATCH',
    severity: 'BLOCKER' as const,
    message:
      `${labelFor(d.field)} on the bill is ₹${d.printed.toFixed(2)} but the GST engine computes ` +
      `₹${d.computed.toFixed(2)} (difference ₹${d.delta.toFixed(2)}).`,
    field: d.field,
  }));
}

function labelFor(field: string): string {
  const labels: Record<string, string> = {
    taxableValue: 'Taxable value',
    cgst: 'CGST',
    sgst: 'SGST',
    utgst: 'UTGST',
    igst: 'IGST',
    cess: 'Cess',
    grandTotal: 'Invoice total',
  };
  return labels[field] || field;
}

export function isStatutoryRate(rate: number): boolean {
  return (STATUTORY_GST_RATES as readonly number[]).some((r) => Math.abs(r - rate) < 0.001);
}
