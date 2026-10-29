import { describe, it, expect } from 'vitest';
import { parseGstr2b, formatReturnPeriod } from '../agent/billIntake/gstr2b.ts';
import { normalizeExtraction, toIsoDate, toNumber, normalizeUnit } from '../agent/billIntake/schema.ts';
import { reconcile } from '../agent/billIntake/reconcile.ts';
import { calculateInvoice } from '../core/gst/calculator.ts';
import { matchSupplier, matchItem, findDuplicatePurchase, tokenScore } from '../agent/billIntake/matcher.ts';
import { scoreDraft, canAutoPost } from '../agent/billIntake/confidence.ts';
import { buildPurchaseBill } from '../agent/billIntake/toPurchaseBill.ts';
import type { InventoryItem } from '../models/item.ts';
import type { Party } from '../models/party.ts';
import type { PurchaseBill } from '../models/purchase.ts';
import type { RawBillExtraction, ResolvedLine, ResolvedSupplier } from '../agent/billIntake/types.ts';

/* ------------------------------------------------------------------ fixtures */

const party = (over: Partial<Party>): Party => ({
  id: 'p1',
  name: 'Sharma Traders',
  type: 'SUPPLIER',
  phone: '',
  gstin: '27AAPFU0939F1ZV',
  stateCode: '27',
  billingAddress: 'Pune',
  currentBalance: 0,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  ...over,
});

const item = (over: Partial<InventoryItem>): InventoryItem => ({
  id: 'i1',
  name: 'Fortune Mustard Oil 1L Pouch',
  sku: 'FMO-1L',
  hsnSacCode: '1512',
  category: 'Grocery',
  unit: 'PCS',
  salePrice: 180,
  purchasePrice: 150,
  gstRate: 5,
  currentStock: 10,
  minStockAlert: 2,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  ...over,
});

function rawBill(over: Partial<RawBillExtraction> = {}): RawBillExtraction {
  return {
    documentKind: 'TAX_INVOICE',
    supplier: { name: 'Sharma Traders', gstin: '27AAPFU0939F1ZV', address: 'Pune', stateCode: '27' },
    billNumber: 'INV-042',
    billDate: '2025-04-03',
    lines: [
      { description: 'Fortune Mustard Oil 1L Pouch', hsnSacCode: '1512', quantity: 10, unit: 'PCS', unitPrice: 150, gstRate: 5 },
    ],
    totals: { taxableValue: 1500, cgst: 37.5, sgst: 37.5, igst: 0, grandTotal: 1575 },
    ...over,
  };
}

/* ------------------------------------------------------------------ schema */

describe('normalisation of messy model output', () => {
  it('parses Indian currency strings and DD/MM/YYYY dates', () => {
    expect(toNumber('₹1,180.00')).toBe(1180);
    expect(toNumber('Rs. 1 180')).toBe(1180);
    expect(toIsoDate('03/04/2025')).toBe('2025-04-03');
    expect(toIsoDate('3-4-25')).toBe('2025-04-03');
    expect(toIsoDate('2025-04-03')).toBe('2025-04-03');
  });

  it('maps unit aliases and defaults unknown units to PCS', () => {
    expect(normalizeUnit('Kgs')).toBe('KGS');
    expect(normalizeUnit('litres')).toBe('LTR');
    expect(normalizeUnit('dozen')).toBe('PCS');
  });

  it('coerces a plausible model payload into a usable extraction', () => {
    const result = normalizeExtraction({
      documentKind: 'tax invoice',
      supplier: { name: 'Sharma Traders', gstin: '27aapfu0939f1zv' },
      billNumber: 'INV-042',
      billDate: '03/04/2025',
      lines: [{ description: 'Oil', quantity: '10', unitPrice: '₹150.00', gstRate: '5%', hsn: '1512' }],
      totals: { taxableValue: '1,500.00', grandTotal: '1,575.00' },
    });

    expect(result.issues.filter((i) => i.severity === 'BLOCKER')).toHaveLength(0);
    expect(result.raw.supplier.gstin).toBe('27AAPFU0939F1ZV');
    expect(result.raw.billDate).toBe('2025-04-03');
    expect(result.raw.lines[0].quantity).toBe(10);
    expect(result.raw.lines[0].unitPrice).toBe(150);
    expect(result.raw.lines[0].gstRate).toBe(5);
  });

  it('flags a missing bill number as a blocker', () => {
    const result = normalizeExtraction({
      supplier: { name: 'X' },
      billDate: '03/04/2025',
      lines: [{ description: 'A', quantity: 1, unitPrice: 10, gstRate: 18 }],
    });
    expect(result.issues.some((i) => i.code === 'BILL_NUMBER_MISSING' && i.severity === 'BLOCKER')).toBe(true);
  });
});

/* ------------------------------------------------------------------ GSTR-2B */

const gstr2b = {
  gstin: '27AAPFU0939F1ZV',
  rtnprd: '032025',
  version: '1.2',
  docdata: {
    b2b: [
      {
        ctin: '27AAPFU0939F1ZV',
        trdnm: 'SHARMA TRADERS',
        inv: [
          {
            inum: 'INV-042',
            idt: '03-04-2025',
            val: 1575,
            pos: '27',
            rchrg: 'N',
            inv_typ: 'R',
            itms: [
              { num: 1, itm_det: { rt: 5, txval: 900, camt: 22.5, samt: 22.5, iamt: 0, csamt: 0, hsn: '1512' } },
              { num: 2, itm_det: { rt: 5, txval: 600, camt: 15, samt: 15, iamt: 0, csamt: 0, hsn: '1512' } },
            ],
          },
        ],
      },
    ],
    cdnr: [
      {
        ctin: '27AAPFU0939F1ZV',
        trdnm: 'SHARMA TRADERS',
        nt: [
          {
            ntty: 'C',
            nt_num: 'CN-07',
            nt_dt: '10-04-2025',
            val: 525,
            pos: '27',
            rchrg: 'N',
            itms: [{ num: 1, itm_det: { rt: 5, txval: 500, camt: 12.5, samt: 12.5, iamt: 0, csamt: 0, hsn: '1512' } }],
          },
        ],
      },
    ],
  },
};

describe('GSTR-2B parser', () => {
  it('parses B2B invoices and aggregates same-HSN lines', () => {
    const result = parseGstr2b(gstr2b);
    expect(result.meta.invoices).toBe(1);
    expect(result.meta.creditNotes).toBe(1);

    const invoice = result.drafts[0];
    expect(invoice.billNumber).toBe('INV-042');
    expect(invoice.billDate).toBe('2025-04-03');
    expect(invoice.lines).toHaveLength(1); // both 5% / HSN 1512 lines collapse
    expect(invoice.lines[0].printedTaxableAmount).toBe(1500);
    expect(invoice.totals?.cgst).toBe(37.5);
    expect(invoice.totals?.grandTotal).toBe(1575);
  });

  it('maps supplier credit notes to credit-note documents', () => {
    const result = parseGstr2b(gstr2b);
    const credit = result.drafts.find((d) => d.documentKind === 'CREDIT_NOTE');
    expect(credit?.billNumber).toBe('CN-07');
  });

  it('rejects a file that is not a 2B export', () => {
    const result = parseGstr2b({ hello: 'world' });
    expect(result.drafts).toHaveLength(0);
    expect(result.meta.warnings[0]).toMatch(/does not look like/i);
  });

  it('formats the return period', () => {
    expect(formatReturnPeriod('032025')).toBe('March 2025');
  });
});

/* ------------------------------------------------------------------ reconcile */

describe('reconciliation', () => {
  const summary = calculateInvoice('27', '27', [{ quantity: 10, unitPrice: 150, gstRate: 5 }]);

  it('accepts printed totals within tolerance', () => {
    const result = reconcile(summary, { taxableValue: 1500, cgst: 37.5, sgst: 37.5, grandTotal: 1575 });
    expect(result.ok).toBe(true);
    expect(result.deltas).toHaveLength(0);
  });

  it('blocks a misread digit', () => {
    const result = reconcile(summary, { taxableValue: 1500, cgst: 375, sgst: 37.5, grandTotal: 1912 });
    expect(result.ok).toBe(false);
    expect(result.deltas.map((d) => d.field)).toContain('cgst');
    expect(result.deltas.map((d) => d.field)).toContain('grandTotal');
  });

  it('treats a missing totals block as unverified, not failed', () => {
    const result = reconcile(summary, undefined);
    expect(result.ok).toBe(true);
    expect(result.comparedField).toBe('NONE');
  });
});

/* ------------------------------------------------------------------ matcher */

describe('entity resolution', () => {
  const parties = [party({ id: 'p1', name: 'Sharma Traders', gstin: '27AAPFU0939F1ZV' })];

  it('matches supplier by GSTIN before name', () => {
    const match = matchSupplier(parties, { name: 'Sharma Traders Pvt Ltd', gstin: '27aapfu0939f1zv' });
    expect(match.method).toBe('GSTIN');
    expect(match.party?.id).toBe('p1');
  });

  it('matches supplier by word-level name overlap', () => {
    const match = matchSupplier(parties, { name: 'Sharma Traders' });
    expect(['NAME', 'GSTIN']).toContain(match.method);
    expect(match.party?.id).toBe('p1');
  });

  it('does not match an unrelated supplier', () => {
    const match = matchSupplier(parties, { name: 'Krishna Electricals' });
    expect(match.party).toBeUndefined();
  });

  it('matches items regardless of token order', () => {
    const match = matchItem([item({})], { description: 'mustard oil fortune 1 ltr', hsnSacCode: '1512' });
    expect(match.item?.id).toBe('i1');
  });

  it('matches items by SKU embedded in the description', () => {
    const match = matchItem([item({})], { description: 'Fortune Oil SKU FMO-1L 1L' });
    expect(match.item?.id).toBe('i1');
  });

  it('scores token overlap sensibly', () => {
    expect(tokenScore('Fortune Mustard Oil 1L Pouch', 'Fortune Mustard Oil')).toBeGreaterThan(0.9);
    expect(tokenScore('Fortune Mustard Oil', 'Tata Salt')).toBe(0);
  });
});

/* ------------------------------------------------------------------ bill shape */

describe('purchase bill assembly', () => {
  it('produces a save-ready bill whose rows sum to its totals', () => {
    const summary = calculateInvoice('27', '27', [{ quantity: 10, unitPrice: 150, gstRate: 5 }]);
    const lines: ResolvedLine[] = [{
      source: rawBill().lines[0],
      itemId: 'i1',
      name: 'Fortune Mustard Oil 1L Pouch',
      unit: 'PCS',
      matchMethod: 'NAME',
      matchScore: 0.95,
      computed: summary.items[0],
    }];

    const bill = buildPurchaseBill({
      id: 'PUR-TEST',
      raw: rawBill(),
      supplier: {
        name: 'Sharma Traders',
        gstin: '27AAPFU0939F1ZV',
        address: 'Pune',
        stateCode: '27',
        partyId: 'p1',
        matchMethod: 'GSTIN',
        matchScore: 1,
      },
      lines,
      itcEligibility: 'ELIGIBLE_INPUTS',
      isRcm: false,
      purchaseType: 'BILL',
      companyStateCode: '27',
      sourceLabel: 'scanned document',
      confidenceScore: 0.97,
      sourceRef: 'inv-042.pdf',
    });

    expect(bill.items).toHaveLength(1);
    expect(bill.items[0].taxableAmount).toBe(1500);
    expect(bill.items[0].cgstAmount).toBe(37.5);
    expect(bill.items[0].totalAmount).toBe(1575);
    expect(bill.totalTaxableAmount).toBe(1500);
    expect(bill.totalCgst + bill.totalSgst).toBe(75);
    expect(bill.grandTotal).toBe(1575);
    expect(bill.paymentStatus).toBe('UNPAID');
    expect(bill.balanceAmount).toBe(bill.grandTotal);
    expect(bill.notes).toContain('97%');
    expect(bill.supplierId).toBe('p1');
  });

  it('marks a supplier credit note as a purchase return', () => {
    const summary = calculateInvoice('27', '27', [{ quantity: 1, unitPrice: 500, gstRate: 5 }]);
    const bill = buildPurchaseBill({
      id: 'PUR-TEST-2',
      raw: rawBill({ documentKind: 'CREDIT_NOTE', billNumber: 'CN-07', lines: [{ description: 'Return', quantity: 1, unitPrice: 500, gstRate: 5 }] }),
      supplier: { name: 'Sharma Traders', address: 'Pune', stateCode: '27', matchMethod: 'NAME', matchScore: 0.9 },
      lines: [{ source: rawBill().lines[0], name: 'Return', unit: 'PCS', matchMethod: 'NONE', matchScore: 0, computed: summary.items[0] }],
      itcEligibility: 'ELIGIBLE_INPUTS',
      isRcm: false,
      purchaseType: 'RETURN',
      companyStateCode: '27',
      sourceLabel: 'GSTR-2B',
      confidenceScore: 0.95,
    });
    expect(bill.purchaseType).toBe('RETURN');
    expect(bill.noteType).toBe('D');
    expect(bill.originalBillNumber).toBe('CN-07');
  });
});

/* ------------------------------------------------------------------ duplicates */

describe('duplicate detection', () => {
  const existing = [{
    id: 'PUR-1',
    billNumber: 'INV/042',
    supplierGstin: '27AAPFU0939F1ZV',
    supplierName: 'Sharma Traders',
    isCancelled: false,
  } as unknown as PurchaseBill];

  it('matches the same document number for the same GSTIN', () => {
    const dup = findDuplicatePurchase(existing, { supplierGstin: '27aapfu0939f1zv', billNumber: 'inv-042' });
    expect(dup?.purchaseId).toBe('PUR-1');
  });

  it('ignores a cancelled bill', () => {
    const dup = findDuplicatePurchase(
      [{ ...existing[0], isCancelled: true } as PurchaseBill],
      { supplierGstin: '27AAPFU0939F1ZV', billNumber: 'INV-042' }
    );
    expect(dup).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ confidence */

describe('confidence and auto-post gate', () => {
  const supplier: ResolvedSupplier = {
    name: 'Sharma Traders',
    gstin: '27AAPFU0939F1ZV',
    address: 'Pune',
    stateCode: '27',
    partyId: 'p1',
    matchMethod: 'GSTIN',
    matchScore: 1,
  };

  const summary = calculateInvoice('27', '27', [{ quantity: 10, unitPrice: 150, gstRate: 5 }]);
  const lines: ResolvedLine[] = [{
    source: rawBill().lines[0],
    itemId: 'i1',
    name: 'Fortune Mustard Oil 1L Pouch',
    unit: 'PCS',
    matchMethod: 'NAME',
    matchScore: 0.95,
    computed: summary.items[0],
  }];

  it('scores a clean, fully matched bill as high confidence', () => {
    const confidence = scoreDraft({
      raw: rawBill(),
      supplier,
      lines,
      reconciliation: reconcile(summary, rawBill().totals),
      issues: [],
      duplicateFound: false,
    });
    expect(confidence.score).toBeGreaterThanOrEqual(0.92);
    expect(confidence.band).toBe('HIGH');
    expect(canAutoPost({ confidence, issues: [], lines }, { threshold: 0.92, requireCatalogMatch: true }).ok).toBe(true);
  });

  it('refuses to auto-post when a blocker exists', () => {
    const confidence = scoreDraft({ raw: rawBill(), supplier, lines, reconciliation: reconcile(summary, rawBill().totals), issues: [], duplicateFound: false });
    const gate = canAutoPost(
      { confidence, issues: [{ code: 'TOTAL_MISMATCH', severity: 'BLOCKER', message: 'x' }], lines },
      { threshold: 0.92, requireCatalogMatch: true }
    );
    expect(gate.ok).toBe(false);
  });

  it('refuses to auto-post when items are unknown to the catalog', () => {
    const confidence = scoreDraft({ raw: rawBill(), supplier, lines, reconciliation: reconcile(summary, rawBill().totals), issues: [], duplicateFound: false });
    const unmatched: ResolvedLine[] = [{ ...lines[0], itemId: undefined, matchMethod: 'NONE', matchScore: 0 }];
    const gate = canAutoPost({ confidence, issues: [], lines: unmatched }, { threshold: 0.92, requireCatalogMatch: true });
    expect(gate.ok).toBe(false);
  });

  it('caps the score when the bill is a duplicate', () => {
    const confidence = scoreDraft({ raw: rawBill(), supplier, lines, reconciliation: reconcile(summary, rawBill().totals), issues: [], duplicateFound: true });
    expect(confidence.score).toBeLessThanOrEqual(0.2);
    expect(confidence.band).toBe('LOW');
  });

  it('drops the score when the GSTIN checksum fails', () => {
    const bad = rawBill({ supplier: { name: 'Sharma Traders', gstin: '27AAPFU0939F1ZX', stateCode: '27' } });
    const confidence = scoreDraft({
      raw: bad,
      supplier: { ...supplier, gstin: '27AAPFU0939F1ZX', partyId: undefined, matchMethod: 'NONE', matchScore: 0 },
      lines,
      reconciliation: reconcile(summary, bad.totals),
      issues: [],
      duplicateFound: false,
    });
    expect(confidence.reasons.join(' ')).toMatch(/checksum/i);
  });
});
