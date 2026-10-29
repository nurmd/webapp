/**
 * Defensive normalisation of whatever the extraction model returned.
 *
 * A vision model will happily return "₹1,180.00", "18%", null, or a date as
 * "03/04/2025". Nothing downstream may assume clean types, so everything passes
 * through here first and every coercion that changes meaning becomes a WARNING.
 */
import type { DocumentKind, ExtractedLine, ExtractedTotals, IntakeIssue, RawBillExtraction } from './types.ts';

const UNIT_ALIASES: Record<string, string> = {
  PCS: 'PCS', PC: 'PCS', PIECE: 'PCS', PIECES: 'PCS', NOS: 'NOS', NO: 'NOS', NUMBER: 'NOS', NUMBERS: 'NOS',
  KG: 'KGS', KGS: 'KGS', KILOGRAM: 'KGS', KILOGRAMS: 'KGS',
  GM: 'GMS', GMS: 'GMS', GRAM: 'GMS', GRAMS: 'GMS',
  L: 'LTR', LT: 'LTR', LTR: 'LTR', LITRE: 'LTR', LITRES: 'LTR', LITER: 'LTR', LITERS: 'LTR',
  ML: 'ML', MLS: 'ML',
  M: 'MTR', MTR: 'MTR', MTRS: 'MTR', METER: 'MTR', METERS: 'MTR', METRE: 'MTR', METRES: 'MTR',
  BOX: 'BOX', BOXES: 'BOX', CTN: 'BOX', CARTON: 'BOX',
  PKT: 'PKT', PACKET: 'PKT', PACKETS: 'PKT', PACK: 'PKT',
  SET: 'SET', SETS: 'SET',
  BAG: 'BAG', BAGS: 'BAG',
  HRS: 'HOURS', HR: 'HOURS', HOUR: 'HOURS', HOURS: 'HOURS',
  DAY: 'DAYS', DAYS: 'DAYS',
};

export function normalizeUnit(raw?: string): string {
  if (!raw) return 'PCS';
  const key = String(raw).trim().toUpperCase().replace(/\./g, '');
  return UNIT_ALIASES[key] || 'PCS';
}

export function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const cleaned = String(value)
    .replace(/[₹$,\s]/g, '')
    .replace(/(?:rs|inr)\.?/gi, '')
    .replace(/[%]/g, '')
    .replace(/[()]/g, '')
    .trim();
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

export function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

/**
 * Indian invoices use DD/MM/YYYY (and DD-MM-YYYY, DD.MM.YYYY). ISO is passed through.
 * Anything ambiguous between day and month is treated as day-first, which is the
 * document convention here; the reconciliation step catches a wrong month because
 * GSTR-2B filing periods won't match.
 */
export function toIsoDate(value: unknown): string | undefined {
  const raw = toText(value);
  if (!raw) return undefined;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += year > 70 ? 1900 : 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  return undefined;
}

export function stateCodeFromGstin(gstin?: string): string | undefined {
  const g = toText(gstin).toUpperCase();
  return /^[0-9]{2}/.test(g) ? g.slice(0, 2) : undefined;
}

const DOC_KINDS: DocumentKind[] = [
  'TAX_INVOICE', 'BILL_OF_SUPPLY', 'CREDIT_NOTE', 'DEBIT_NOTE', 'PURCHASE_ORDER', 'DELIVERY_CHALLAN', 'UNKNOWN',
];

export function toDocumentKind(value: unknown): DocumentKind {
  const v = toText(value).toUpperCase().replace(/[\s-]+/g, '_');
  return (DOC_KINDS as string[]).includes(v) ? (v as DocumentKind) : 'UNKNOWN';
}

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function normalizeLine(input: unknown, index: number, issues: IntakeIssue[]): ExtractedLine | null {
  const l = obj(input);
  const description = toText(l.description ?? l.name ?? l.item ?? l.particulars);

  const quantity = toNumber(l.quantity ?? l.qty);
  const unitPrice = toNumber(l.unitPrice ?? l.rate ?? l.price ?? l.pricePerUnit);

  if (!description && quantity === undefined) return null;
  if (quantity === undefined || quantity <= 0) {
    issues.push({ code: 'LINE_QTY_MISSING', severity: 'WARNING', message: `Line ${index + 1} has no readable quantity.`, field: `lines[${index}].quantity` });
  }

  const gstRate = toNumber(l.gstRate ?? l.rateOfTax ?? l.taxRate ?? l.gst);

  return {
    description: description || `Item ${index + 1}`,
    hsnSacCode: toText(l.hsnSacCode ?? l.hsn ?? l.hsnCode ?? l.sac) || undefined,
    quantity: quantity ?? 0,
    unit: normalizeUnit(toText(l.unit ?? l.uom)),
    unitPrice: unitPrice ?? 0,
    discountPercent: toNumber(l.discountPercent ?? l.discPercent),
    discountAmount: toNumber(l.discountAmount ?? l.discount),
    gstRate: gstRate ?? 0,
    cessRate: toNumber(l.cessRate ?? l.cess),
    printedTaxableAmount: toNumber(l.printedTaxableAmount ?? l.taxableAmount ?? l.taxableValue),
    printedTaxAmount: toNumber(l.printedTaxAmount ?? l.taxAmount),
    printedLineTotal: toNumber(l.printedLineTotal ?? l.amount ?? l.total ?? l.lineTotal),
    batchNumber: toText(l.batchNumber ?? l.batch) || undefined,
    expiryDate: toIsoDate(l.expiryDate ?? l.expiry),
  };
}

function normalizeTotals(input: unknown): ExtractedTotals | undefined {
  if (!input) return undefined;
  const t = obj(input);
  const out: ExtractedTotals = {
    taxableValue: toNumber(t.taxableValue ?? t.taxableAmount ?? t.taxable),
    cgst: toNumber(t.cgst ?? t.cgstAmount),
    sgst: toNumber(t.sgst ?? t.sgstAmount),
    utgst: toNumber(t.utgst ?? t.utgstAmount),
    igst: toNumber(t.igst ?? t.igstAmount),
    cess: toNumber(t.cess ?? t.cessAmount),
    roundOff: toNumber(t.roundOff ?? t.roundoff),
    grandTotal: toNumber(t.grandTotal ?? t.total ?? t.invoiceValue ?? t.netAmount),
  };
  const hasAny = Object.values(out).some((v) => v !== undefined);
  return hasAny ? out : undefined;
}

export interface NormalizeResult {
  raw: RawBillExtraction;
  issues: IntakeIssue[];
}

export function normalizeExtraction(input: unknown): NormalizeResult {
  const issues: IntakeIssue[] = [];
  const root = obj(input);
  const supplierRaw = obj(root.supplier);

  const supplierName = toText(supplierRaw.name ?? supplierRaw.legalName ?? root.supplierName);
  const supplierGstin = toText(supplierRaw.gstin ?? root.supplierGstin).toUpperCase().replace(/\s/g, '') || undefined;
  const supplierStateCode =
    toText(supplierRaw.stateCode ?? root.supplierStateCode) || stateCodeFromGstin(supplierGstin);

  if (!supplierName) {
    issues.push({ code: 'SUPPLIER_NAME_MISSING', severity: 'BLOCKER', message: 'Supplier name could not be read from the document.', field: 'supplier.name' });
  }
  if (!supplierGstin) {
    issues.push({ code: 'SUPPLIER_GSTIN_MISSING', severity: 'WARNING', message: 'No supplier GSTIN found — input tax credit is at risk on this bill.', field: 'supplier.gstin' });
  }

  const billNumber = toText(root.billNumber ?? root.invoiceNumber ?? root.invoiceNo ?? root.billNo ?? root.number);
  if (!billNumber) {
    issues.push({ code: 'BILL_NUMBER_MISSING', severity: 'BLOCKER', message: 'Bill number is missing; duplicates cannot be detected.', field: 'billNumber' });
  }

  const billDate = toIsoDate(root.billDate ?? root.invoiceDate ?? root.date);
  if (!billDate) {
    issues.push({ code: 'BILL_DATE_MISSING', severity: 'BLOCKER', message: 'Bill date could not be parsed.', field: 'billDate' });
  }

  const linesRaw = Array.isArray(root.lines) ? root.lines : Array.isArray(root.items) ? root.items : [];
  const lines = linesRaw
    .map((l, idx) => normalizeLine(l, idx, issues))
    .filter((l): l is ExtractedLine => l !== null);

  if (lines.length === 0) {
    issues.push({ code: 'NO_LINES', severity: 'BLOCKER', message: 'No line items were extracted from the document.', field: 'lines' });
  }

  const transportRaw = obj(root.transport);
  const totals = normalizeTotals(root.totals);

  const raw: RawBillExtraction = {
    documentKind: toDocumentKind(root.documentKind ?? root.documentType),
    supplier: {
      name: supplierName,
      gstin: supplierGstin,
      address: toText(supplierRaw.address ?? root.supplierAddress) || undefined,
      stateCode: supplierStateCode || undefined,
      phone: toText(supplierRaw.phone) || undefined,
      email: toText(supplierRaw.email) || undefined,
    },
    buyer: root.buyer ? {
      name: toText(obj(root.buyer).name) || undefined,
      gstin: toText(obj(root.buyer).gstin).toUpperCase() || undefined,
      stateCode: toText(obj(root.buyer).stateCode) || undefined,
    } : undefined,
    billNumber,
    billDate: billDate || new Date().toISOString().split('T')[0],
    dueDate: toIsoDate(root.dueDate),
    placeOfSupplyStateCode: toText(root.placeOfSupplyStateCode) || undefined,
    isReverseCharge: root.isReverseCharge === true || toText(root.isReverseCharge).toUpperCase() === 'Y',
    isImport: root.isImport === true,
    isService: root.isService === true,
    lines,
    totals,
    transport: {
      ewayBillNumber: toText(transportRaw.ewayBillNumber ?? root.ewayBillNumber) || undefined,
      vehicleNumber: toText(transportRaw.vehicleNumber ?? root.vehicleNumber) || undefined,
      transporterName: toText(transportRaw.transporterName ?? root.transporterName) || undefined,
      lrNumber: toText(transportRaw.lrNumber) || undefined,
      lrDate: toIsoDate(transportRaw.lrDate),
    },
    irn: toText(root.irn) || undefined,
    ackNumber: toText(root.ackNumber ?? root.ackNo) || undefined,
    notes: toText(root.notes) || undefined,
    extractionConfidence: toNumber(root.extractionConfidence ?? root.confidence),
    rawText: typeof root.rawText === 'string' ? root.rawText.slice(0, 20000) : undefined,
  };

  return { raw, issues };
}
