/**
 * AI Bill Intake — shared contracts.
 *
 * Pipeline:  source document  ->  RawBillExtraction (LLM / GSTR-2B)
 *            ->  IntakeDraft (matched + reconciled + scored)
 *            ->  PurchaseBill (posted through db.savePurchase)
 *
 * Rule: the LLM is only ever trusted for *reading* the document.
 * Every rupee is recomputed locally by the GST engine in `src/core/gst/calculator.ts`.
 */
import type { CalculatedItem, InvoiceCalculationSummary } from '../../core/gst/calculator.ts';
import type { ItcEligibility, PurchaseBill } from '../../models/purchase.ts';

export type IntakeSource = 'SCAN' | 'GSTR2B';

export type DocumentKind =
  | 'TAX_INVOICE'
  | 'BILL_OF_SUPPLY'
  | 'CREDIT_NOTE'
  | 'DEBIT_NOTE'
  | 'PURCHASE_ORDER'
  | 'DELIVERY_CHALLAN'
  | 'UNKNOWN';

export type IntakeStatus =
  | 'QUEUED'        // accepted, processing
  | 'NEEDS_REVIEW'  // confidence too low / blockers present
  | 'APPROVED'      // reviewed by a human, ready to post
  | 'POSTED'        // written to the purchase register
  | 'DUPLICATE'     // matches a bill already in the register
  | 'REJECTED'
  | 'FAILED';

export type IssueSeverity = 'BLOCKER' | 'WARNING' | 'INFO';

export interface IntakeIssue {
  code: string;
  severity: IssueSeverity;
  message: string;
  field?: string;
}

export interface ExtractedLine {
  description: string;
  hsnSacCode?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  discountPercent?: number;
  discountAmount?: number;
  gstRate: number;
  cessRate?: number;
  /** Values as printed on the document (used only for reconciliation). */
  printedTaxableAmount?: number;
  printedTaxAmount?: number;
  printedLineTotal?: number;
  batchNumber?: string;
  expiryDate?: string;
}

export interface ExtractedTotals {
  taxableValue?: number;
  cgst?: number;
  sgst?: number;
  utgst?: number;
  igst?: number;
  cess?: number;
  roundOff?: number;
  grandTotal?: number;
}

export interface ExtractedSupplier {
  name: string;
  gstin?: string;
  address?: string;
  stateCode?: string;
  phone?: string;
  email?: string;
}

/**
 * The only shape the extraction model is allowed to return.
 * Everything is optional-ish and defensively coerced in `schema.ts` — models lie.
 */
export interface RawBillExtraction {
  documentKind: DocumentKind;
  supplier: ExtractedSupplier;
  buyer?: { name?: string; gstin?: string; stateCode?: string };
  billNumber: string;
  billDate: string; // ISO yyyy-mm-dd
  dueDate?: string;
  placeOfSupplyStateCode?: string;
  isReverseCharge?: boolean;
  isImport?: boolean;
  isService?: boolean;
  lines: ExtractedLine[];
  totals?: ExtractedTotals;
  transport?: {
    ewayBillNumber?: string;
    vehicleNumber?: string;
    transporterName?: string;
    lrNumber?: string;
    lrDate?: string;
  };
  irn?: string;
  ackNumber?: string;
  notes?: string;
  /** Advisory only. Never used for auto-posting decisions. */
  extractionConfidence?: number;
  rawText?: string;
}

export type MatchMethod = 'GSTIN' | 'NAME' | 'HSN' | 'SKU' | 'NONE';

export interface ResolvedSupplier {
  name: string;
  gstin?: string;
  address: string;
  stateCode: string;
  partyId?: string;
  matchMethod: MatchMethod;
  matchScore: number;
}

export interface ResolvedLine {
  source: ExtractedLine;
  itemId?: string;
  /** Description to show in the purchase row (catalog name when matched). */
  name: string;
  unit: string;
  matchMethod: MatchMethod;
  matchScore: number;
  computed: CalculatedItem;
}

export interface ReconciliationResult {
  ok: boolean;
  comparedField: 'PRINTED' | 'NONE';
  deltas: { field: string; printed: number; computed: number; delta: number; tolerance: number }[];
  summary: InvoiceCalculationSummary;
}

export interface ConfidenceResult {
  score: number; // 0..1
  band: 'HIGH' | 'MEDIUM' | 'LOW';
  reasons: string[];
}

export interface IntakeDraft {
  id: string;
  source: IntakeSource;
  status: IntakeStatus;
  createdAt: string;
  updatedAt: string;

  fileName?: string;
  raw: RawBillExtraction;

  supplier: ResolvedSupplier;
  lines: ResolvedLine[];

  reconciliation: ReconciliationResult;
  confidence: ConfidenceResult;
  issues: IntakeIssue[];

  duplicateOf?: { purchaseId: string; billNumber: string };

  itcEligibility: ItcEligibility;
  isRcm: boolean;
  purchaseType: 'BILL' | 'RETURN';

  /** Fully populated purchase entry, ready for db.savePurchase(). */
  bill: PurchaseBill;

  postedBillId?: string;
  rejectionReason?: string;
}

export interface BillIntakeSettings {
  enabled: boolean;
  proxyUrl: string;
  token: string;
  autoPost: boolean;
  autoPostThreshold: number;
  requireCatalogMatchForAutoPost: boolean;
  requireKnownSupplierForAutoPost: boolean;
  defaultItcEligibility: ItcEligibility;
}
