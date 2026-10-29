/**
 * GSTR-2B / 2A importer.
 *
 * No model, no OCR, no guessing: every number here is exactly what the GST portal
 * reported for your GSTIN. This is the highest-trust ingestion path, and the one
 * that should be used for ITC-critical bulk months.
 *
 * Limitation worth knowing: 2B carries HSN + rate + value, but NOT quantity or
 * item names. Lines are therefore grouped per (HSN, rate) and priced as a single
 * value line; the reviewer fills quantities, or the invoice PDF is scanned to
 * enrich it.
 */
import type { ExtractedLine, ExtractedTotals, RawBillExtraction } from './types.ts';

type Json = Record<string, unknown>;

const asObj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
};

/** DD-MM-YYYY (portal format) -> ISO. */
function portalDate(value: unknown): string {
  const raw = text(value);
  const dmy = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const ymd = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  return new Date().toISOString().split('T')[0];
}

export interface Gstr2bParseResult {
  drafts: RawBillExtraction[];
  meta: {
    gstin?: string;
    period?: string;
    version?: string;
    invoices: number;
    creditNotes: number;
    skipped: number;
    warnings: string[];
  };
}

interface AggregateLine {
  hsn: string;
  rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
}

function lineFromPortalItem(raw: unknown): { hsn: string; rate: number; taxable: number; cgst: number; sgst: number; igst: number; cess: number; desc: string } | null {
  const item = asObj(raw);
  const det = asObj(item.itm_det ?? item.itmDet ?? item);
  const rate = num(det.rt ?? det.rate) ?? 0;
  const taxable = num(det.txval ?? det.taxable_value ?? det.taxableValue) ?? 0;
  const cgst = num(det.camt ?? det.cgst ?? det.cgst_amount) ?? 0;
  const sgst = num(det.samt ?? det.sgst ?? det.sgst_amount) ?? 0;
  const igst = num(det.iamt ?? det.igst ?? det.igst_amount) ?? 0;
  const cess = num(det.csamt ?? det.cess ?? det.cess_amount) ?? 0;
  const hsn = text(det.hsn ?? det.hsn_sc ?? det.hsnSacCode);
  const desc = text(det.desc ?? det.description);
  if (taxable === 0 && cgst + sgst + igst + cess === 0) return null;
  return { hsn, rate, taxable, cgst, sgst, igst, cess, desc };
}

function aggregate(items: unknown[]): AggregateLine[] {
  const map = new Map<string, AggregateLine>();
  for (const raw of items) {
    const parsed = lineFromPortalItem(raw);
    if (!parsed) continue;
    const key = `${parsed.hsn}|${parsed.rate}|${parsed.desc}`;
    const existing = map.get(key);
    if (existing) {
      existing.taxable += parsed.taxable;
      existing.cgst += parsed.cgst;
      existing.sgst += parsed.sgst;
      existing.igst += parsed.igst;
      existing.cess += parsed.cess;
    } else {
      map.set(key, { hsn: parsed.hsn, rate: parsed.rate, taxable: parsed.taxable, cgst: parsed.cgst, sgst: parsed.sgst, igst: parsed.igst, cess: parsed.cess });
    }
  }
  return [...map.values()];
}

const round2 = (n: number) => Number(n.toFixed(2));

function buildInvoice(
  supplier: Json,
  doc: Json,
  kind: 'TAX_INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE'
): RawBillExtraction | null {
  const ctin = text(supplier.ctin).toUpperCase();
  const supplierName = text(supplier.trdnm ?? supplier.cname ?? supplier.lgnm) || ctin || 'Unknown supplier';

  const billNumber = text(doc.inum ?? doc.docnum ?? doc.nt_num ?? doc.number);
  if (!billNumber) return null;

  const billDate = portalDate(doc.idt ?? doc.docdate ?? doc.nt_dt);
  const lines = aggregate(asArr(doc.itms ?? doc.items));
  if (lines.length === 0) return null;

  const extracted: ExtractedLine[] = lines.map((l) => {
    const taxAmount = round2(l.cgst + l.sgst + l.igst + l.cess);
    return {
      description: l.hsn ? `HSN ${l.hsn} @ ${l.rate}%` : `Goods/Services @ ${l.rate}%`,
      hsnSacCode: l.hsn || undefined,
      quantity: 1,
      unit: 'NOS',
      unitPrice: round2(l.taxable),
      gstRate: l.rate,
      cessRate: l.cess > 0 && l.taxable > 0 ? round2((l.cess / l.taxable) * 100) : undefined,
      printedTaxableAmount: round2(l.taxable),
      printedTaxAmount: taxAmount,
      printedLineTotal: round2(l.taxable + taxAmount),
    };
  });

  const totals: ExtractedTotals = {
    taxableValue: round2(lines.reduce((s, l) => s + l.taxable, 0)),
    cgst: round2(lines.reduce((s, l) => s + l.cgst, 0)),
    sgst: round2(lines.reduce((s, l) => s + l.sgst, 0)),
    igst: round2(lines.reduce((s, l) => s + l.igst, 0)),
    cess: round2(lines.reduce((s, l) => s + l.cess, 0)),
    grandTotal: num(doc.val ?? doc.docval),
  };

  return {
    documentKind: kind,
    supplier: {
      name: supplierName,
      gstin: ctin || undefined,
      address: text(supplier.address ?? supplier.addr) || undefined,
      stateCode: ctin ? ctin.slice(0, 2) : undefined,
    },
    billNumber,
    billDate,
    placeOfSupplyStateCode: text(doc.pos) || undefined,
    isReverseCharge: text(doc.rchrg).toUpperCase() === 'Y',
    lines: extracted,
    totals,
    irn: text(doc.irn) || undefined,
    notes: `Imported from GSTR-2B (${text(doc.inv_typ ?? doc.typ) || 'R'}). Quantity is not reported in 2B.`,
    extractionConfidence: 0.99,
  };
}

export function parseGstr2b(input: unknown): Gstr2bParseResult {
  const root = asObj(input);
  const data = asObj(root.docdata ?? root.data ?? root);
  const warnings: string[] = [];
  const drafts: RawBillExtraction[] = [];
  let invoices = 0;
  let creditNotes = 0;
  let skipped = 0;

  const b2bGroups = asArr(data.b2b);
  if (b2bGroups.length === 0 && asArr(data.cdnr).length === 0) {
    warnings.push('No B2B invoices found. This does not look like a GSTR-2B JSON export.');
  }

  for (const groupRaw of b2bGroups) {
    const group = asObj(groupRaw);
    const docs = asArr(group.inv ?? group.doclist ?? group.docs);
    for (const docRaw of docs) {
      const doc = asObj(docRaw);
      const type = text(doc.inv_typ ?? doc.typ).toUpperCase();
      const kind = type === 'C' ? 'CREDIT_NOTE' : type === 'D' ? 'DEBIT_NOTE' : 'TAX_INVOICE';
      const draft = buildInvoice(group, doc, kind);
      if (draft) {
        drafts.push(draft);
        if (kind === 'TAX_INVOICE') invoices += 1;
        else creditNotes += 1;
      } else {
        skipped += 1;
      }
    }
  }

  for (const groupRaw of asArr(data.cdnr)) {
    const group = asObj(groupRaw);
    for (const docRaw of asArr(group.nt ?? group.doclist ?? group.docs)) {
      const doc = asObj(docRaw);
      const ntty = text(doc.ntty ?? doc.typ).toUpperCase();
      const kind = ntty === 'D' ? 'DEBIT_NOTE' : 'CREDIT_NOTE';
      const draft = buildInvoice(group, doc, kind);
      if (draft) {
        drafts.push(draft);
        creditNotes += 1;
      } else {
        skipped += 1;
      }
    }
  }

  const impg = asArr(data.impg);
  if (impg.length > 0) {
    warnings.push(`${impg.length} import (IMPG/IMPGSEZ) document(s) were skipped — imports are posted through the Bill of Entry flow, not as purchase invoices.`);
    skipped += impg.length;
  }

  const period = text(root.rtnprd ?? data.rtnprd ?? root.ret_period ?? data.ret_period);

  return {
    drafts,
    meta: {
      gstin: text(root.gstin ?? data.gstin) || undefined,
      period: period || undefined,
      version: text(root.version ?? data.version) || undefined,
      invoices,
      creditNotes,
      skipped,
      warnings,
    },
  };
}

/** "032025" -> "March 2025" for display. */
export function formatReturnPeriod(period?: string): string {
  if (!period || period.length !== 6) return period || '';
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const month = Number(period.slice(0, 2));
  if (!month || month > 12) return period;
  return `${months[month - 1]} ${period.slice(2)}`;
}
