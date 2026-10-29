/**
 * Bill Intake orchestrator — the only stateful entry point.
 *
 *   file / 2B JSON  ->  RawBillExtraction  ->  IntakeDraft  ->  PurchaseBill  ->  db.savePurchase
 *
 * Everything the model produces is treated as untrusted input; every amount is
 * recomputed by the GST engine and cross-checked against the printed totals.
 */
import { calculateInvoice } from '../../core/gst/calculator.ts';
import type { CompanyProfile } from '../../models/company.ts';
import type { InventoryItem } from '../../models/item.ts';
import type { Party } from '../../models/party.ts';
import type { PurchaseBill } from '../../models/purchase.ts';
import { db } from '../../services/db.ts';
import { canAutoPost, scoreDraft } from './confidence.ts';
import { formatReturnPeriod, parseGstr2b } from './gstr2b.ts';
import { findDuplicatePurchase, matchItem, matchSupplier } from './matcher.ts';
import { isStatutoryRate, reconcile, reconciliationIssues, toCalculationInputs } from './reconcile.ts';
import { normalizeExtraction } from './schema.ts';
import { getSettings } from './settings.ts';
import type {
  BillIntakeSettings,
  IntakeDraft,
  IntakeIssue,
  IntakeSource,
  RawBillExtraction,
  ResolvedLine,
} from './types.ts';
import { buildPurchaseBill, newBillId, newDraftId } from './toPurchaseBill.ts';
import { intakeQueue } from './queue.ts';
import { extractFromFile } from './visionClient.ts';

export interface IntakeContext {
  company: CompanyProfile;
  parties: Party[];
  items: InventoryItem[];
  purchases: PurchaseBill[];
}

export function loadContext(): IntakeContext {
  return {
    company: db.getCompany(),
    parties: db.getParties(),
    items: db.getItems(),
    purchases: db.getPurchases(),
  };
}

const DAY_MS = 86_400_000;

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / DAY_MS);
}

export function buildDraft(params: {
  raw: RawBillExtraction;
  source: IntakeSource;
  fileName?: string;
  baseIssues?: IntakeIssue[];
  ctx: IntakeContext;
  settings?: BillIntakeSettings;
}): IntakeDraft {
  const settings = params.settings || getSettings();
  const { raw, ctx } = params;
  const issues: IntakeIssue[] = [...(params.baseIssues || [])];

  const companyState = String(ctx.company.stateCode || '').padStart(2, '0') || '27';
  const placeOfSupply = raw.placeOfSupplyStateCode || companyState;

  const supplierState =
    raw.supplier.stateCode ||
    (raw.supplier.gstin ? raw.supplier.gstin.slice(0, 2) : '');

  if (!supplierState || supplierState.length !== 2) {
    issues.push({
      code: 'SUPPLIER_STATE_UNKNOWN',
      severity: 'WARNING',
      message: 'Supplier state could not be determined; CGST/SGST vs IGST split is assumed intra-state.',
      field: 'supplier.stateCode',
    });
  }
  const effectiveSupplierState = supplierState && supplierState.length === 2 ? supplierState : companyState;

  // --- Entity resolution -------------------------------------------------
  const supplierMatch = matchSupplier(ctx.parties, raw.supplier);
  const supplier = {
    name: raw.supplier.name || supplierMatch.party?.name || 'Unknown supplier',
    gstin: raw.supplier.gstin || supplierMatch.party?.gstin,
    address: raw.supplier.address || supplierMatch.party?.billingAddress || '',
    stateCode: effectiveSupplierState,
    partyId: supplierMatch.party?.id,
    matchMethod: supplierMatch.method,
    matchScore: supplierMatch.party ? supplierMatch.score : 0,
  };

  // A different recipient GSTIN means this document is not ours.
  const buyerGstin = (raw.buyer?.gstin || '').replace(/\s/g, '').toUpperCase();
  const companyGstin = (ctx.company.gstin || '').replace(/\s/g, '').toUpperCase();
  if (buyerGstin && companyGstin && buyerGstin !== companyGstin) {
    issues.push({
      code: 'WRONG_RECIPIENT',
      severity: 'BLOCKER',
      message: `Bill is addressed to GSTIN ${buyerGstin}, but this business is registered as ${companyGstin}.`,
      field: 'buyer.gstin',
    });
  }

  // --- Tax computation (authoritative) -----------------------------------
  const inputs = toCalculationInputs(raw.lines);
  const summary = calculateInvoice(effectiveSupplierState, placeOfSupply, inputs);

  const resolvedLines: ResolvedLine[] = raw.lines.map((source, idx) => {
    const match = matchItem(ctx.items, {
      description: source.description,
      hsnSacCode: source.hsnSacCode,
      quantity: source.quantity,
      unit: source.unit,
    });
    return {
      source,
      itemId: match.item?.id,
      name: match.item?.name || source.description,
      unit: match.item?.unit || source.unit || 'PCS',
      matchMethod: match.method,
      matchScore: match.score,
      computed: summary.items[idx],
    };
  });

  // --- Line-level validation ---------------------------------------------
  raw.lines.forEach((line, idx) => {
    if (line.quantity <= 0) {
      issues.push({ code: 'LINE_QTY_MISSING', severity: 'BLOCKER', message: `Line ${idx + 1} ("${line.description}") has no quantity.`, field: `lines[${idx}].quantity` });
    }
    if (!(line.unitPrice > 0)) {
      issues.push({ code: 'LINE_PRICE_MISSING', severity: 'BLOCKER', message: `Line ${idx + 1} ("${line.description}") has no readable rate.`, field: `lines[${idx}].unitPrice` });
    }
    if (!isStatutoryRate(line.gstRate)) {
      issues.push({
        code: 'NON_STATUTORY_RATE',
        severity: 'WARNING',
        message: `Line ${idx + 1} uses ${line.gstRate}% GST, which is not one of the statutory slabs.`,
        field: `lines[${idx}].gstRate`,
      });
    }
    if (!line.hsnSacCode) {
      issues.push({ code: 'HSN_MISSING', severity: 'WARNING', message: `Line ${idx + 1} has no HSN/SAC code.`, field: `lines[${idx}].hsnSacCode` });
    }
  });

  // --- Reconciliation against printed totals ------------------------------
  const reconciliation = reconcile(summary, raw.totals);
  issues.push(...reconciliationIssues(reconciliation));

  // --- Date sanity ---------------------------------------------------------
  const today = new Date().toISOString().split('T')[0];
  const age = daysBetween(today, raw.billDate);
  if (age < -1) {
    issues.push({ code: 'FUTURE_DATED', severity: 'WARNING', message: `Bill date ${raw.billDate} is in the future.`, field: 'billDate' });
  }
  if (age > 365) {
    issues.push({ code: 'STALE_BILL', severity: 'WARNING', message: `Bill date ${raw.billDate} is more than a year old — ITC may be time-barred.`, field: 'billDate' });
  }

  // --- Duplicates ----------------------------------------------------------
  const duplicate = findDuplicatePurchase(ctx.purchases, {
    supplierGstin: supplier.gstin,
    supplierName: supplier.name,
    billNumber: raw.billNumber,
  });
  if (duplicate) {
    issues.push({
      code: 'DUPLICATE_BILL',
      severity: 'BLOCKER',
      message: `Bill ${duplicate.billNumber} from this supplier already exists in the purchase register (${duplicate.purchaseId}).`,
      field: 'billNumber',
    });
  }

  // --- ITC eligibility -----------------------------------------------------
  let itcEligibility = settings.defaultItcEligibility;
  if (raw.isImport) itcEligibility = 'IMPORT_GOODS';
  if (supplierMatch.party?.isComposition) {
    itcEligibility = 'INELIGIBLE_OTHERS';
    issues.push({
      code: 'COMPOSITION_SUPPLIER',
      severity: 'WARNING',
      message: 'Supplier is marked as a composition dealer; ITC cannot be claimed on this bill.',
      field: 'itcEligibility',
    });
  }

  if (params.source === 'GSTR2B') {
    issues.push({
      code: 'QTY_NOT_REPORTED',
      severity: 'INFO',
      message: 'GSTR-2B reports value but not quantity or item names — fill quantities in the purchase entry before posting.',
      field: 'lines',
    });
  }

  const purchaseType: 'BILL' | 'RETURN' = raw.documentKind === 'CREDIT_NOTE' ? 'RETURN' : 'BILL';

  const confidence = scoreDraft({
    raw,
    supplier,
    lines: resolvedLines,
    reconciliation,
    issues,
    duplicateFound: Boolean(duplicate),
  });

  const bill = buildPurchaseBill({
    id: newBillId(),
    raw,
    supplier,
    lines: resolvedLines,
    itcEligibility,
    isRcm: Boolean(raw.isReverseCharge),
    purchaseType,
    companyStateCode: companyState,
    sourceLabel: params.source === 'GSTR2B' ? 'GSTR-2B' : 'scanned document',
    confidenceScore: confidence.score,
    sourceRef: params.fileName,
  });

  const status = duplicate ? 'DUPLICATE' : 'NEEDS_REVIEW';

  const draft: IntakeDraft = {
    id: newDraftId(),
    source: params.source,
    status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fileName: params.fileName,
    raw,
    supplier,
    lines: resolvedLines,
    reconciliation,
    confidence,
    issues,
    duplicateOf: duplicate,
    itcEligibility,
    isRcm: Boolean(raw.isReverseCharge),
    purchaseType,
    bill,
  };

  return draft;
}

export interface IngestResult {
  drafts: IntakeDraft[];
  errors: { fileName: string; message: string }[];
}

/** Scan one or more PDFs/images through the extraction service. */
export async function ingestFiles(
  files: File[],
  ctx: IntakeContext = loadContext(),
  settings: BillIntakeSettings = getSettings(),
  onProgress?: (done: number, total: number, fileName: string) => void
): Promise<IngestResult> {
  const drafts: IntakeDraft[] = [];
  const errors: { fileName: string; message: string }[] = [];

  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    onProgress?.(i, files.length, file.name);
    try {
      const result = await extractFromFile(file, settings);
      const normalized = normalizeExtraction(result.data);
      const draft = buildDraft({
        raw: normalized.raw,
        source: 'SCAN',
        fileName: file.name,
        baseIssues: normalized.issues,
        ctx,
        settings,
      });
      intakeQueue.put(draft);
      drafts.push(draft);
    } catch (error) {
      errors.push({ fileName: file.name, message: (error as Error)?.message || 'Extraction failed.' });
    }
  }

  onProgress?.(files.length, files.length, '');
  return { drafts, errors };
}

/** Import a GSTR-2B (or 2A) JSON export. Deterministic, no model involved. */
export function ingestGstr2bFile(
  json: unknown,
  ctx: IntakeContext = loadContext(),
  settings: BillIntakeSettings = getSettings(),
  fileName?: string
): { drafts: IntakeDraft[]; meta: ReturnType<typeof parseGstr2b>['meta'] } {
  const parsed = parseGstr2b(json);
  const drafts = parsed.drafts.map((raw) => {
    const draft = buildDraft({ raw, source: 'GSTR2B', ctx, settings, fileName });
    intakeQueue.put(draft);
    return draft;
  });

  return {
    drafts,
    meta: {
      ...parsed.meta,
      period: formatReturnPeriod(parsed.meta.period),
    },
  };
}

export interface PostResult {
  ok: boolean;
  bill?: PurchaseBill;
  reason?: string;
}

/**
 * Write a draft into the purchase register.
 * Creates the supplier master if the supplier is new. Stock, ledger vouchers and
 * the audit-trail record are produced by `db.savePurchase` as usual.
 */
export function postDraft(draftId: string, ctx: IntakeContext = loadContext()): PostResult {
  const draft = intakeQueue.get(draftId);
  if (!draft) return { ok: false, reason: 'Draft not found.' };
  if (draft.status === 'POSTED') return { ok: false, reason: 'This draft has already been posted.' };
  if (draft.status === 'DUPLICATE') return { ok: false, reason: 'This bill already exists in the purchase register.' };
  if (draft.issues.some((i) => i.severity === 'BLOCKER')) {
    return { ok: false, reason: 'Resolve the blocking issues before posting.' };
  }

  const bill: PurchaseBill = { ...draft.bill };

  if (!bill.supplierId) {
    const supplier = resolveOrCreateSupplier(draft.supplier, ctx);
    bill.supplierId = supplier.id;
    bill.supplierName = supplier.name;
    bill.supplierAddress = supplier.billingAddress;
  }

  try {
    db.savePurchase(bill);
  } catch (error) {
    return { ok: false, reason: (error as Error)?.message || 'Could not save the purchase bill.' };
  }

  intakeQueue.patch(draftId, { status: 'POSTED', postedBillId: bill.id, bill });
  return { ok: true, bill };
}

/** Post the version the user edited inside the purchase entry screen. */
export function postEditedBill(draftId: string, bill: PurchaseBill, ctx: IntakeContext = loadContext()): PostResult {
  const draft = intakeQueue.get(draftId);
  if (!draft) return { ok: false, reason: 'Draft not found.' };

  // The purchase-entry screen may have fallen back to its placeholder supplier
  // when the supplier was new; bind it to a real party before saving.
  const billToSave: PurchaseBill = { ...bill };
  if (!billToSave.supplierId || billToSave.supplierId === 'CUSTOM_SUPPLIER') {
    const supplier = resolveOrCreateSupplier(
      {
        name: billToSave.supplierName,
        gstin: draft.supplier.gstin,
        address: billToSave.supplierAddress,
        stateCode: billToSave.supplierStateCode,
      },
      ctx
    );
    billToSave.supplierId = supplier.id;
    billToSave.supplierName = supplier.name;
    billToSave.supplierAddress = supplier.billingAddress;
  }

  try {
    db.savePurchase(billToSave);
  } catch (error) {
    return { ok: false, reason: (error as Error)?.message || 'Could not save the purchase bill.' };
  }
  intakeQueue.patch(draftId, { status: 'POSTED', postedBillId: billToSave.id, bill: billToSave });
  return { ok: true, bill: billToSave };
}

export interface SupplierIdentity {
  name: string;
  gstin?: string;
  address?: string;
  stateCode?: string;
  partyId?: string;
}

export function resolveOrCreateSupplier(input: SupplierIdentity, ctx: IntakeContext = loadContext()): Party {
  const gstin = String(input.gstin || '').toUpperCase();
  const existing = ctx.parties.find(
    (p) => (gstin && p.gstin && p.gstin.toUpperCase() === gstin) || (input.partyId && p.id === input.partyId)
  );
  if (existing) return existing;

  const now = new Date().toISOString();
  const party: Party = {
    id: `PTY-AI-${Date.now().toString(36).toUpperCase()}`,
    name: input.name || 'Unknown supplier',
    type: 'SUPPLIER',
    phone: '',
    gstin: input.gstin,
    stateCode: input.stateCode || '',
    billingAddress: input.address || '',
    currentBalance: 0,
    createdAt: now,
    updatedAt: now,
  };
  db.saveParty(party);
  return party;
}

export function rejectDraft(draftId: string, reason?: string): void {
  intakeQueue.patch(draftId, { status: 'REJECTED', rejectionReason: reason });
}

export function approveDraft(draftId: string): void {
  intakeQueue.patch(draftId, { status: 'APPROVED' });
}

/**
 * Auto-post every queued draft that clears the confidence bar.
 * Call after ingestion, or from a background sweep.
 */
export function runAutoPost(
  ctx: IntakeContext = loadContext(),
  settings: BillIntakeSettings = getSettings()
): { posted: IntakeDraft[]; held: IntakeDraft[] } {
  if (!settings.autoPost) return { posted: [], held: [] };

  const posted: IntakeDraft[] = [];
  const held: IntakeDraft[] = [];

  for (const draft of intakeQueue.list().filter((d) => d.status === 'NEEDS_REVIEW')) {
    const gate = canAutoPost(draft, {
      threshold: settings.autoPostThreshold,
      requireCatalogMatch: settings.requireCatalogMatchForAutoPost,
    });
    if (!gate.ok) {
      held.push(draft);
      continue;
    }
    if (settings.requireKnownSupplierForAutoPost && !draft.supplier.partyId) {
      held.push(draft);
      continue;
    }
    const result = postDraft(draft.id, ctx);
    if (result.ok) posted.push({ ...draft, status: 'POSTED' });
    else held.push(draft);
  }

  return { posted, held };
}
