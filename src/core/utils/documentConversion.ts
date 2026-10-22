import { Invoice, InvoiceType } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { CompanyProfile } from '../../models/company.ts';
import { db } from '../../services/db.ts';
import { generateNextDocumentNumber } from './invoiceNumber.ts';

export interface ConvertOptions {
  customInvoiceNumber?: string;
  decrementStock?: boolean;
}

export interface ConvertPurchaseOrderOptions {
  customBillNumber?: string;
}

/**
 * Checks if a given sales document is eligible for 1-tap conversion to a Tax Invoice.
 * Non-tax Quotations/Estimates, Delivery Challans, and Sales Orders are eligible if not already cancelled or converted.
 */
export function canConvertToInvoice(doc: Invoice): boolean {
  if (!doc) return false;
  if (
    doc.isCancelled ||
    doc.isConverted ||
    doc.orderStatus === 'CANCELLED' ||
    doc.orderStatus === 'FULFILLED' ||
    doc.challanStatus === 'CANCELLED'
  ) {
    return false;
  }
  return (
    doc.invoiceType === 'ESTIMATE' ||
    doc.invoiceType === 'DELIVERY_CHALLAN' ||
    doc.invoiceType === 'SALES_ORDER'
  );
}

/**
 * Converts a Quotation/Estimate, Delivery Challan, or Sales Order into a full statutory Tax Invoice.
 * - Generates next sequential Tax Invoice number (e.g. INV-001) or uses custom series.
 * - Sets invoiceType to B2B (if customer has GSTIN) or B2CS (if retail consumer).
 * - Decrements inventory stock (via db.saveInvoice).
 * - Marks source document as converted with bidirectional references.
 */
export async function convertDocumentToTaxInvoice(
  sourceDoc: Invoice,
  company: CompanyProfile,
  options: ConvertOptions = {}
): Promise<Invoice> {
  if (!canConvertToInvoice(sourceDoc)) {
    throw new Error(`Document ${sourceDoc.invoiceNumber} cannot be converted (already converted or cancelled).`);
  }

  const existingInvoices = db.getInvoices();
  const nextNumber =
    options.customInvoiceNumber ||
    generateNextDocumentNumber('SALES_INVOICE', company, existingInvoices);

  const now = new Date().toISOString();
  const todayDateStr = now.split('T')[0];

  // If party has a valid GSTIN, default to B2B, else B2CS (Retail Consumer)
  const isRegisteredParty = Boolean(sourceDoc.partyGstin && sourceDoc.partyGstin.trim().length === 15);
  const targetInvoiceType: InvoiceType = isRegisteredParty ? 'B2B' : 'B2CS';

  const newInvoiceId = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Clone items with fresh ids
  const clonedItems = sourceDoc.items.map((item, idx) => ({
    ...item,
    id: `item_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 5)}`,
  }));

  const docTypeName =
    sourceDoc.invoiceType === 'ESTIMATE'
      ? 'Quotation'
      : sourceDoc.invoiceType === 'SALES_ORDER'
      ? 'Sales Order'
      : 'Challan';

  const newInvoice: Invoice = {
    ...sourceDoc,
    id: newInvoiceId,
    invoiceNumber: nextNumber,
    invoiceType: targetInvoiceType,
    date: todayDateStr,
    dueDate: sourceDoc.dueDate || todayDateStr,
    items: clonedItems,
    notes: sourceDoc.notes
      ? `${sourceDoc.notes}\n(Converted from ${docTypeName} #${sourceDoc.invoiceNumber})`
      : `Converted from ${docTypeName} #${sourceDoc.invoiceNumber}`,
    createdAt: now,
    updatedAt: now,
    isConverted: false,
    convertedFromDocType: sourceDoc.invoiceType as any,
    convertedFromDocId: sourceDoc.id,
    convertedFromDocNumber: sourceDoc.invoiceNumber,
  };

  // 1. Save new Tax Invoice (db.saveInvoice automatically decrements stock and updates ledger)
  await db.saveInvoice(newInvoice);

  // 2. Update source document as converted
  const updatedSourceDoc: Invoice = {
    ...sourceDoc,
    isConverted: true,
    orderStatus: sourceDoc.invoiceType === 'SALES_ORDER' ? 'FULFILLED' : sourceDoc.orderStatus,
    challanStatus: sourceDoc.invoiceType === 'DELIVERY_CHALLAN' ? 'DELIVERED' : sourceDoc.challanStatus,
    convertedToInvoiceId: newInvoice.id,
    convertedToInvoiceNumber: newInvoice.invoiceNumber,
    updatedAt: now,
  };
  await db.saveInvoice(updatedSourceDoc);

  return newInvoice;
}

/**
 * Checks if a given Purchase Order is eligible for 1-tap conversion to an inward Purchase Bill.
 */
export function canConvertPurchaseOrder(po: PurchaseBill): boolean {
  if (!po) return false;
  if (po.isCancelled || po.isConverted || po.orderStatus === 'CANCELLED' || po.orderStatus === 'FULFILLED') return false;
  return po.purchaseType === 'PO';
}

/**
 * Converts a Purchase Order (PO) into an official inward Purchase Bill.
 * - Generates next sequential Purchase Bill number (e.g. PUR-001).
 * - Changes purchaseType to 'BILL' (which triggers stock increment and vendor ledger posting).
 * - Marks source PO as converted/fulfilled with bidirectional references.
 */
export async function convertPurchaseOrderToBill(
  sourcePo: PurchaseBill,
  company: CompanyProfile,
  options: ConvertPurchaseOrderOptions = {}
): Promise<PurchaseBill> {
  if (!canConvertPurchaseOrder(sourcePo)) {
    throw new Error(`Purchase Order ${sourcePo.billNumber} cannot be converted (already converted or cancelled).`);
  }

  const existingPurchases = db.getPurchases().map((p) => ({ id: p.id, invoiceNumber: p.billNumber }));
  const nextNumber =
    options.customBillNumber ||
    generateNextDocumentNumber('PURCHASE_BILL', company, existingPurchases);

  const now = new Date().toISOString();
  const todayDateStr = now.split('T')[0];

  const newBillId = `pur_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Clone items with fresh ids
  const clonedItems = sourcePo.items.map((item, idx) => ({
    ...item,
    id: `item_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 5)}`,
  }));

  const newBill: PurchaseBill = {
    ...sourcePo,
    id: newBillId,
    billNumber: nextNumber,
    purchaseType: 'BILL',
    date: todayDateStr,
    dueDate: sourcePo.dueDate || todayDateStr,
    items: clonedItems,
    notes: sourcePo.notes
      ? `${sourcePo.notes}\n(Inwarded from PO #${sourcePo.billNumber})`
      : `Inwarded from Purchase Order #${sourcePo.billNumber}`,
    createdAt: now,
    updatedAt: now,
    isConverted: false,
    convertedFromPoId: sourcePo.id,
    convertedFromPoNumber: sourcePo.billNumber,
  };

  // 1. Save inward Purchase Bill (db.savePurchase automatically increments stock and updates vendor balance)
  await db.savePurchase(newBill);

  // 2. Mark source PO as fulfilled and converted
  const updatedSourcePo: PurchaseBill = {
    ...sourcePo,
    isConverted: true,
    orderStatus: 'FULFILLED',
    convertedToBillId: newBill.id,
    convertedToBillNumber: newBill.billNumber,
    updatedAt: now,
  };
  await db.savePurchase(updatedSourcePo);

  return newBill;
}
