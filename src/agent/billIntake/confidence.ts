/**
 * Confidence scoring.
 *
 * Deliberately independent of the model's self-reported confidence: models are
 * confidently wrong on exactly the fields that cost money (GSTIN digits, 5 vs 8,
 * 1,180 vs 1,1800). Score is built from things we can verify locally.
 *
 * Auto-posting is gated on BOTH the score and the absence of blockers.
 */
import { validateGstin } from '../../core/gst/validator.ts';
import type { ConfidenceResult, IntakeIssue, RawBillExtraction, ReconciliationResult, ResolvedLine, ResolvedSupplier } from './types.ts';
import { isStatutoryRate } from './reconcile.ts';

export const DEFAULT_AUTO_POST_THRESHOLD = 0.92;

interface ScoreInput {
  raw: RawBillExtraction;
  supplier: ResolvedSupplier;
  lines: ResolvedLine[];
  reconciliation: ReconciliationResult;
  issues: IntakeIssue[];
  duplicateFound: boolean;
}

export function scoreDraft(input: ScoreInput): ConfidenceResult {
  const { raw, supplier, lines, reconciliation, issues } = input;
  const reasons: string[] = [];
  let score = 0;

  // 1. Supplier GSTIN — checksum verified, not just present.
  const gstin = raw.supplier.gstin || '';
  if (gstin) {
    const check = validateGstin(gstin);
    if (check.isValid) {
      score += 0.16;
      reasons.push('Supplier GSTIN passes the Luhn Mod-36 checksum.');
    } else {
      score += 0.02;
      reasons.push(`Supplier GSTIN "${gstin}" failed checksum validation — likely misread.`);
    }
  } else {
    reasons.push('No supplier GSTIN on the document; input tax credit cannot be claimed.');
  }

  // 2. Known supplier.
  if (supplier.partyId && supplier.matchMethod === 'GSTIN') {
    score += 0.1;
    reasons.push(`Supplier matched to an existing ledger party: ${supplier.name}.`);
  } else if (supplier.partyId) {
    score += 0.05;
    reasons.push(`Supplier matched by name only (${supplier.matchScore}) — GSTIN differs from records.`);
  } else if (raw.supplier.name) {
    score += 0.02;
    reasons.push('New supplier; a ledger party will be created on posting.');
  }

  // 3. Document identifiers.
  if (raw.billNumber && raw.billDate && raw.billDate !== '') {
    score += 0.1;
  }

  // 4. Line completeness.
  const completeLines = lines.filter(
    (l) =>
      l.source.quantity > 0 &&
      l.source.unitPrice > 0 &&
      Boolean(l.source.hsnSacCode) &&
      isStatutoryRate(l.source.gstRate)
  ).length;
  const completeness = lines.length === 0 ? 0 : completeLines / lines.length;
  score += 0.22 * completeness;
  if (completeness < 1) {
    reasons.push(`${completeLines} of ${lines.length} line items are fully specified (quantity, rate, HSN, GST slab).`);
  }

  // 5. Reconciliation against printed totals — the strongest signal.
  if (reconciliation.comparedField === 'PRINTED') {
    if (reconciliation.ok) {
      score += 0.24;
      reasons.push('Taxable value and tax heads reconcile with the printed totals.');
    } else {
      const worst = reconciliation.deltas[0];
      reasons.push(
        `Printed ${worst.field} differs from the GST engine by ₹${Math.abs(worst.delta).toFixed(2)}.`
      );
    }
  } else {
    score += 0.08;
    reasons.push('Document shows no totals block, so totals could not be verified independently.');
  }

  // 6. Catalog coverage.
  const matched = lines.filter((l) => l.itemId).length;
  const coverage = lines.length === 0 ? 0 : matched / lines.length;
  score += 0.1 * coverage;
  if (lines.length > 0 && matched < lines.length) {
    reasons.push(`${lines.length - matched} line(s) will be created as new inventory items.`);
  }

  // 7. Document type.
  if (raw.documentKind === 'TAX_INVOICE' || raw.documentKind === 'BILL_OF_SUPPLY') {
    score += 0.08;
  } else if (raw.documentKind === 'UNKNOWN') {
    reasons.push('Document type could not be determined.');
  } else {
    reasons.push(`Document classified as ${raw.documentKind.replace(/_/g, ' ').toLowerCase()}.`);
  }

  // Penalties.
  const warnings = issues.filter((i) => i.severity === 'WARNING').length;
  const infos = issues.filter((i) => i.severity === 'INFO').length;
  score -= warnings * 0.03 + infos * 0.01;

  if (raw.isReverseCharge) {
    score -= 0.08;
    reasons.push('Reverse charge supply — tax is payable by you, not the supplier.');
  }
  if (raw.isImport) {
    score -= 0.08;
    reasons.push('Import transaction — ITC follows bill-of-entry rules, not a plain purchase invoice.');
  }
  if (input.duplicateFound) {
    score = Math.min(score, 0.2);
    reasons.push('A bill with the same supplier and document number already exists in the purchase register.');
  }

  score = Math.max(0, Math.min(1, Number(score.toFixed(2))));

  const operatorsBlock = issues.some((i) => i.severity === 'BLOCKER');
  const band: ConfidenceResult['band'] = operatorsBlock || score < 0.75 ? 'LOW' : score >= 0.92 ? 'HIGH' : 'MEDIUM';

  return { score, band, reasons };
}

export function canAutoPost(
  draft: { confidence: ConfidenceResult; issues: IntakeIssue[]; lines: ResolvedLine[] },
  options: { threshold: number; requireCatalogMatch: boolean }
): { ok: boolean; reason?: string } {
  if (draft.issues.some((i) => i.severity === 'BLOCKER')) {
    return { ok: false, reason: 'Document has blocking issues.' };
  }
  if (draft.confidence.score < options.threshold) {
    return { ok: false, reason: `Confidence ${draft.confidence.score.toFixed(2)} is below the ${options.threshold} auto-post threshold.` };
  }
  if (options.requireCatalogMatch && draft.lines.some((l) => !l.itemId)) {
    return { ok: false, reason: 'Some line items are not in the inventory catalog.' };
  }
  return { ok: true };
}
