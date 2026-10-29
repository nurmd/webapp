/**
 * Assembles the final `PurchaseBill` — the exact shape `TableGridPurchaseModal`
 * would have produced, so the record is indistinguishable from a hand-keyed bill.
 *
 * Nothing here is invented: every amount comes from `calculateInvoice`, every
 * identity from the resolved supplier/items, and provenance is recorded in notes.
 */
import type { UnitOfMeasurement } from '../../models/item.ts';
import type { ItcEligibility, PurchaseBill, PurchaseItemEntry } from '../../models/purchase.ts';
import type { IntakeDraft, RawBillExtraction, ResolvedLine, ResolvedSupplier } from './types.ts';

const UOM: UnitOfMeasurement[] = ['PCS', 'NOS', 'KGS', 'GMS', 'LTR', 'ML', 'MTR', 'BOX', 'PKT', 'SET', 'BAG', 'HOURS', 'DAYS'];

function toUom(unit?: string): UnitOfMeasurement {
  const u = String(unit || '').toUpperCase() as UnitOfMeasurement;
  return UOM.includes(u) ? u : 'PCS';
}

export interface BuildBillInput {
  id: string;
  raw: RawBillExtraction;
  supplier: ResolvedSupplier;
  lines: ResolvedLine[];
  itcEligibility: ItcEligibility;
  isRcm: boolean;
  purchaseType: 'BILL' | 'RETURN';
  companyStateCode: string;
  sourceLabel: string;
  confidenceScore: number;
  sourceRef?: string;
}

export function buildPurchaseBill(input: BuildBillInput): PurchaseBill {
  const { raw, supplier, lines } = input;
  const now = new Date().toISOString();

  const items: PurchaseItemEntry[] = lines.map((line, idx) => ({
    itemId: line.itemId || `CUSTOM-${Date.now()}-${idx}`,
    name: line.name || line.source.description || 'Purchased Item',
    description: line.source.description !== line.name ? line.source.description : undefined,
    hsnSacCode: line.source.hsnSacCode || '',
    unit: toUom(line.unit),
    quantity: line.source.quantity,
    unitPrice: line.source.unitPrice,
    discountPercent: line.source.discountPercent,
    discountAmount: line.computed.discountAmount,
    taxableAmount: line.computed.taxableAmount,
    gstRate: line.source.gstRate,
    cgstAmount: line.computed.cgstAmount,
    sgstAmount: line.computed.sgstAmount,
    utgstAmount: line.computed.utgstAmount,
    igstAmount: line.computed.igstAmount,
    cessRate: line.source.cessRate,
    cessAmount: line.computed.cessAmount,
    totalAmount: line.computed.totalAmount,
  }));

  const summary = input.lines.length > 0
    ? // recompute here so totals can never drift from the line rows
      sumLines(lines)
    : { taxable: 0, cgst: 0, sgst: 0, utgst: 0, igst: 0, cess: 0, gross: 0, discount: 0, total: 0 };

  const netAmount = Number((summary.taxable + summary.cgst + summary.sgst + summary.utgst + summary.igst + summary.cess).toFixed(2));
  const grandTotal = Math.round(netAmount);
  const roundOff = Number((grandTotal - netAmount).toFixed(2));

  const provenance = [
    `Imported by AI Bill Intake (${input.sourceLabel})`,
    `confidence ${(input.confidenceScore * 100).toFixed(0)}%`,
    input.sourceRef ? `source: ${input.sourceRef}` : '',
  ].filter(Boolean).join(' · ');

  return {
    id: input.id,
    billNumber: raw.billNumber,
    purchaseType: input.purchaseType,
    date: raw.billDate,
    dueDate: raw.dueDate,
    supplierId: supplier.partyId || '',
    supplierName: supplier.name,
    supplierGstin: supplier.gstin,
    supplierAddress: supplier.address,
    supplierStateCode: supplier.stateCode,
    placeOfSupplyStateCode: raw.placeOfSupplyStateCode || input.companyStateCode,
    isIntraState: supplier.stateCode === (raw.placeOfSupplyStateCode || input.companyStateCode),

    items,

    itcEligibility: input.itcEligibility,
    isRcm: input.isRcm,

    totalGrossAmount: summary.gross,
    totalDiscount: summary.discount,
    totalTaxableAmount: summary.taxable,
    totalCgst: summary.cgst,
    totalSgst: summary.sgst,
    totalUtgst: summary.utgst,
    isUtgst: summary.utgst > 0,
    totalIgst: summary.igst,
    totalCess: summary.cess,
    totalTax: Number((summary.cgst + summary.sgst + summary.utgst + summary.igst + summary.cess).toFixed(2)),
    roundOff,
    grandTotal,

    paymentMode: 'CREDIT',
    paymentStatus: 'UNPAID',
    paidAmount: 0,
    balanceAmount: grandTotal,
    paymentSplits: [],

    notes: provenance,
    createdAt: now,
    updatedAt: now,

    noteType: input.purchaseType === 'RETURN' ? 'D' : undefined,
    originalBillNumber: input.purchaseType === 'RETURN' ? raw.billNumber : undefined,
    originalBillDate: input.purchaseType === 'RETURN' ? raw.billDate : undefined,
    returnReason: input.purchaseType === 'RETURN' ? 'Supplier credit note imported by AI Bill Intake' : undefined,

    ewayBillNumber: raw.transport?.ewayBillNumber,
    vehicleNumber: raw.transport?.vehicleNumber,
    transporterName: raw.transport?.transporterName,
    lrNumber: raw.transport?.lrNumber,
    lrDate: raw.transport?.lrDate,
  };
}

function sumLines(lines: ResolvedLine[]) {
  let gross = 0, discount = 0, taxable = 0, cgst = 0, sgst = 0, utgst = 0, igst = 0, cess = 0;
  for (const l of lines) {
    gross += l.computed.grossAmount;
    discount += l.computed.discountAmount;
    taxable += l.computed.taxableAmount;
    cgst += l.computed.cgstAmount;
    sgst += l.computed.sgstAmount;
    utgst += l.computed.utgstAmount || 0;
    igst += l.computed.igstAmount;
    cess += l.computed.cessAmount;
  }
  const r = (n: number) => Number(n.toFixed(2));
  return { gross: r(gross), discount: r(discount), taxable: r(taxable), cgst: r(cgst), sgst: r(sgst), utgst: r(utgst), igst: r(igst), cess: r(cess) };
}

export function newDraftId(): string {
  return `intake_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function newBillId(): string {
  return `PUR-AI-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function describeDraft(draft: IntakeDraft): string {
  return `${draft.supplier.name} · ${draft.raw.billNumber || 'no number'} · ₹${draft.bill.grandTotal.toFixed(2)}`;
}
