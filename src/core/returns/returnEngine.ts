import { Invoice, InvoiceItemEntry, PaymentStatus } from '../../models/invoice.ts';
import { PurchaseBill, PurchaseItemEntry } from '../../models/purchase.ts';
import { CompanyProfile } from '../../models/company.ts';
import { generateNextDocumentNumber, InvoiceLike } from '../utils/invoiceNumber.ts';
import { amountInWords } from '../utils/currencyWords.ts';
import { db } from '../../services/db.ts';
import { auditTrail } from '../../services/auditTrail.ts';
import { rbac, UserRole } from '../../services/rbac.ts';
import { showAppToast } from '../../services/toast.ts';

export interface ItemReturnStatus {
  itemId: string;
  name: string;
  hsnSacCode?: string;
  unit?: string;
  unitPrice: number;
  gstRate: number;
  originalQuantity: number;
  returnedQuantity: number;
  availableQuantity: number;
  originalItem: InvoiceItemEntry | PurchaseItemEntry;
}

export interface DocumentReturnSummary {
  documentId: string;
  documentNumber: string;
  documentDate: string;
  partyName: string;
  totalOriginalAmount: number;
  totalReturnedAmount: number;
  remainingAmount: number;
  isFullyReturned: boolean;
  isPartiallyReturned: boolean;
  items: ItemReturnStatus[];
}

/**
 * Normalizes item identifiers for matching across documents.
 */
function isMatchingItem(
  itemA: { itemId?: string; name: string },
  itemB: { itemId?: string; name: string }
): boolean {
  if (itemA.itemId && itemB.itemId && itemA.itemId === itemB.itemId) {
    return true;
  }
  return itemA.name.trim().toLowerCase() === itemB.name.trim().toLowerCase();
}

/**
 * Calculates item return status and available returnable quantities for a Sales Invoice.
 * Supports partial and multiple returns against the same source invoice.
 */
export function getInvoiceReturnSummary(
  invoice: Invoice,
  allInvoices: Invoice[]
): DocumentReturnSummary {
  // Find all non-cancelled Credit Notes issued against this source invoice
  const existingCreditNotes = allInvoices.filter(
    (inv) =>
      inv.invoiceType === 'CREDIT_NOTE' &&
      !inv.isCancelled &&
      (inv.originalInvoiceId === invoice.id ||
        (inv.originalInvoiceNumber &&
          inv.originalInvoiceNumber.trim().toUpperCase() === invoice.invoiceNumber.trim().toUpperCase()))
  );

  const totalReturnedAmount = existingCreditNotes.reduce((sum, cn) => sum + (cn.grandTotal || 0), 0);

  const items: ItemReturnStatus[] = (invoice.items || []).map((line) => {
    const origQty = line.quantity || 0;
    // Calculate total already returned for this item across all existing credit notes
    let alreadyReturned = 0;
    for (const cn of existingCreditNotes) {
      for (const cnLine of cn.items || []) {
        if (isMatchingItem(cnLine, line)) {
          alreadyReturned += cnLine.quantity || 0;
        }
      }
    }

    const availableQty = Math.max(0, origQty - alreadyReturned);

    return {
      itemId: line.itemId || '',
      name: line.name || '',
      hsnSacCode: line.hsnSacCode,
      unit: line.unit,
      unitPrice: line.unitPrice || 0,
      gstRate: line.gstRate || 0,
      originalQuantity: origQty,
      returnedQuantity: alreadyReturned,
      availableQuantity: availableQty,
      originalItem: line,
    };
  });

  const totalOriginalQty = items.reduce((s, itm) => s + itm.originalQuantity, 0);
  const totalAvailQty = items.reduce((s, itm) => s + itm.availableQuantity, 0);
  const isFullyReturned = totalOriginalQty > 0 && totalAvailQty <= 0;
  const isPartiallyReturned = totalAvailQty > 0 && totalAvailQty < totalOriginalQty;

  return {
    documentId: invoice.id,
    documentNumber: invoice.invoiceNumber,
    documentDate: invoice.date,
    partyName: invoice.partyName,
    totalOriginalAmount: invoice.grandTotal,
    totalReturnedAmount,
    remainingAmount: Math.max(0, invoice.grandTotal - totalReturnedAmount),
    isFullyReturned,
    isPartiallyReturned,
    items,
  };
}

/**
 * Calculates item return status and available returnable quantities for a Purchase Bill.
 * Supports partial and multiple returns against the same source bill.
 */
export function getPurchaseReturnSummary(
  bill: PurchaseBill,
  allPurchases: PurchaseBill[]
): DocumentReturnSummary {
  // Find all non-cancelled Debit Notes issued against this source bill
  const existingDebitNotes = allPurchases.filter(
    (p) =>
      (p.purchaseType === 'RETURN' || p.noteType === 'D') &&
      !p.isCancelled &&
      (p.originalBillId === bill.id ||
        (p.originalBillNumber &&
          p.originalBillNumber.trim().toUpperCase() === bill.billNumber.trim().toUpperCase()))
  );

  const totalReturnedAmount = existingDebitNotes.reduce((sum, dn) => sum + (dn.grandTotal || 0), 0);

  const items: ItemReturnStatus[] = (bill.items || []).map((line) => {
    const origQty = line.quantity || 0;
    let alreadyReturned = 0;
    for (const dn of existingDebitNotes) {
      for (const dnLine of dn.items || []) {
        if (isMatchingItem(dnLine, line)) {
          alreadyReturned += dnLine.quantity || 0;
        }
      }
    }

    const availableQty = Math.max(0, origQty - alreadyReturned);

    return {
      itemId: line.itemId || '',
      name: line.name || '',
      hsnSacCode: line.hsnSacCode,
      unit: line.unit,
      unitPrice: typeof line.unitPrice === 'number' ? line.unitPrice : 0,
      gstRate: line.gstRate || 0,
      originalQuantity: origQty,
      returnedQuantity: alreadyReturned,
      availableQuantity: availableQty,
      originalItem: line,
    };
  });

  const totalOriginalQty = items.reduce((s, itm) => s + itm.originalQuantity, 0);
  const totalAvailQty = items.reduce((s, itm) => s + itm.availableQuantity, 0);
  const isFullyReturned = totalOriginalQty > 0 && totalAvailQty <= 0;
  const isPartiallyReturned = totalAvailQty > 0 && totalAvailQty < totalOriginalQty;

  return {
    documentId: bill.id,
    documentNumber: bill.billNumber,
    documentDate: bill.date,
    partyName: bill.supplierName,
    totalOriginalAmount: bill.grandTotal,
    totalReturnedAmount,
    remainingAmount: Math.max(0, bill.grandTotal - totalReturnedAmount),
    isFullyReturned,
    isPartiallyReturned,
    items,
  };
}

/**
 * Calculates return line items proportionally based on returned quantities.
 */
export function calculateReturnLineEntries(
  selections: Array<{
    item: InvoiceItemEntry | PurchaseItemEntry;
    returnQuantity: number;
  }>
) {
  let subtotal = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalCess = 0;

  const returnLines = selections
    .filter((sel) => sel.returnQuantity > 0)
    .map((sel) => {
      const orig = sel.item;
      const origQty = Math.max(1, orig.quantity || 1);
      const ratio = sel.returnQuantity / origQty;

      const taxable = Math.round((orig.taxableAmount || 0) * ratio * 100) / 100;
      const cgst = Math.round(((orig as any).cgstAmount || (orig as any).cgst || 0) * ratio * 100) / 100;
      const sgst = Math.round(((orig as any).sgstAmount || (orig as any).sgst || 0) * ratio * 100) / 100;
      const igst = Math.round(((orig as any).igstAmount || (orig as any).igst || 0) * ratio * 100) / 100;
      const cess = Math.round(((orig as any).cessAmount || (orig as any).cess || 0) * ratio * 100) / 100;
      const lineTotal = Math.round((taxable + cgst + sgst + igst + cess) * 100) / 100;

      subtotal += taxable;
      totalCgst += cgst;
      totalSgst += sgst;
      totalIgst += igst;
      totalCess += cess;

      return {
        itemId: orig.itemId || '',
        name: orig.name,
        description: orig.description,
        hsnSacCode: orig.hsnSacCode || (orig as any).hsnCode || '',
        quantity: sel.returnQuantity,
        unit: orig.unit || 'PCS',
        unitPrice: orig.unitPrice || 0,
        discountPercent: orig.discountPercent,
        discountAmount: Math.round(((orig.discountAmount || 0) * ratio) * 100) / 100,
        taxableAmount: taxable,
        gstRate: orig.gstRate || 0,
        cgstAmount: cgst,
        sgstAmount: sgst,
        igstAmount: igst,
        cessRate: orig.cessRate,
        cessAmount: cess,
        totalAmount: lineTotal,
      };
    });

  const grandTotal = Math.round((subtotal + totalCgst + totalSgst + totalIgst + totalCess) * 100) / 100;

  return {
    lines: returnLines,
    taxableAmount: Math.round(subtotal * 100) / 100,
    cgst: Math.round(totalCgst * 100) / 100,
    sgst: Math.round(totalSgst * 100) / 100,
    igst: Math.round(totalIgst * 100) / 100,
    cess: Math.round(totalCess * 100) / 100,
    totalTax: Math.round((totalCgst + totalSgst + totalIgst + totalCess) * 100) / 100,
    grandTotal,
  };
}

/**
 * Updates a source Sales Invoice's balance and paid amounts to reflect the return (reversing returned values).
 * 1. Reduces unpaid balanceAmount first.
 * 2. If the return exceeds unpaid balance (or invoice was paid), reverses paidAmount.
 * 3. Derives the resulting payment status (PAID if balance is 0, PARTIAL if paid > 0, UNPAID if paid is 0).
 */
export function applyReturnToInvoice(invoice: Invoice, returnTotal: number): Invoice {
  let remainingReturn = Math.max(0, returnTotal);
  let newBalance = Math.max(0, invoice.balanceAmount || 0);
  let newPaid = Math.max(0, invoice.paidAmount || 0);

  // 1. Deduct from unpaid balance first
  if (newBalance > 0) {
    const balanceDeduction = Math.min(newBalance, remainingReturn);
    newBalance -= balanceDeduction;
    remainingReturn -= balanceDeduction;
  }

  // 2. Any excess return reverses the paidAmount
  if (remainingReturn > 0 && newPaid > 0) {
    const paidDeduction = Math.min(newPaid, remainingReturn);
    newPaid -= paidDeduction;
    remainingReturn -= paidDeduction;
  }

  newBalance = Math.round(newBalance * 100) / 100;
  newPaid = Math.round(newPaid * 100) / 100;

  let newStatus: PaymentStatus = invoice.paymentStatus;
  if (newBalance <= 0) {
    newStatus = 'PAID';
  } else if (newPaid > 0) {
    newStatus = 'PARTIAL';
  } else {
    newStatus = 'UNPAID';
  }

  return {
    ...invoice,
    balanceAmount: newBalance,
    paidAmount: newPaid,
    paymentStatus: newStatus,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Inverts applyReturnToInvoice: restores balance and/or paid amount on a source Sales Invoice
 * when a return is unlinked, deleted, or reduced.
 * 1. remaining = max(0, returnTotal)
 * 2. If the invoice is fully settled (balanceAmount <= 0.005) and paidAmount > 0: restore paid first, min(remaining, grandTotal - paidAmount)
 * 3. Then restore open balance: min(remaining, grandTotal - paidAmount - balanceAmount)
 * 4. Round to 2 decimals, recompute paymentStatus, set updatedAt.
 */
export function revertReturnFromInvoice(invoice: Invoice, returnTotal: number): Invoice {
  let remaining = Math.max(0, returnTotal);
  const grandTotal = Math.max(0, invoice.grandTotal || 0);
  let newBalance = Math.max(0, invoice.balanceAmount || 0);
  let newPaid = Math.max(0, invoice.paidAmount || 0);

  // 2. If the invoice is fully settled (balanceAmount <= 0.005) and paidAmount > 0: restore paid first
  if (newBalance <= 0.005 && newPaid > 0) {
    const paidRestoration = Math.min(remaining, Math.max(0, grandTotal - newPaid));
    newPaid += paidRestoration;
    remaining -= paidRestoration;
  }

  // 3. Then restore open balance
  if (remaining > 0) {
    const balanceRestoration = Math.min(remaining, Math.max(0, grandTotal - newPaid - newBalance));
    newBalance += balanceRestoration;
    remaining -= balanceRestoration;
  }

  newBalance = Math.round(newBalance * 100) / 100;
  newPaid = Math.round(newPaid * 100) / 100;

  let newStatus: PaymentStatus = invoice.paymentStatus;
  if (newBalance <= 0) {
    newStatus = 'PAID';
  } else if (newPaid > 0) {
    newStatus = 'PARTIAL';
  } else {
    newStatus = 'UNPAID';
  }

  return {
    ...invoice,
    balanceAmount: newBalance,
    paidAmount: newPaid,
    paymentStatus: newStatus,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Updates a source Purchase Bill's balance and paid amounts to reflect the return (reversing returned values).
 */
export function applyReturnToPurchaseBill(bill: PurchaseBill, returnTotal: number): PurchaseBill {
  let remainingReturn = Math.max(0, returnTotal);
  let newBalance = Math.max(0, bill.balanceAmount || 0);
  let newPaid = Math.max(0, bill.paidAmount || 0);

  // 1. Deduct from unpaid balance first
  if (newBalance > 0) {
    const balanceDeduction = Math.min(newBalance, remainingReturn);
    newBalance -= balanceDeduction;
    remainingReturn -= balanceDeduction;
  }

  // 2. Excess return reverses paidAmount
  if (remainingReturn > 0 && newPaid > 0) {
    const paidDeduction = Math.min(newPaid, remainingReturn);
    newPaid -= paidDeduction;
    remainingReturn -= paidDeduction;
  }

  newBalance = Math.round(newBalance * 100) / 100;
  newPaid = Math.round(newPaid * 100) / 100;

  let newStatus: PaymentStatus = bill.paymentStatus;
  if (newBalance <= 0) {
    newStatus = 'PAID';
  } else if (newPaid > 0) {
    newStatus = 'PARTIAL';
  } else {
    newStatus = 'UNPAID';
  }

  return {
    ...bill,
    balanceAmount: newBalance,
    paidAmount: newPaid,
    paymentStatus: newStatus,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Creates and saves a linked Sales Return Credit Note and updates the source invoice.
 */
export function executeSalesReturn(params: {
  sourceInvoice: Invoice;
  returnedItems: Array<{ item: InvoiceItemEntry; returnQuantity: number }>;
  company: CompanyProfile;
  returnReason?: string;
  returnDate?: string;
  creditNoteNumber?: string;
  existingInvoices?: Invoice[];
}): { creditNote: Invoice; updatedSourceInvoice: Invoice } {
  const {
    sourceInvoice,
    returnedItems,
    company,
    returnReason = '01-Sales Return',
    returnDate = new Date().toISOString().split('T')[0],
    existingInvoices = db.getInvoices(),
  } = params;

  const summary = calculateReturnLineEntries(returnedItems);
  const cnNumber =
    params.creditNoteNumber ||
    generateNextDocumentNumber('CREDIT_NOTE', company, existingInvoices);

  const now = new Date().toISOString();
  const creditNote: Invoice = {
    id: `CN-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    invoiceNumber: cnNumber,
    date: returnDate,
    dueDate: returnDate,
    partyId: sourceInvoice.partyId,
    partyName: sourceInvoice.partyName,
    partyPhone: sourceInvoice.partyPhone,
    partyGstin: sourceInvoice.partyGstin,
    partyAddress: sourceInvoice.partyAddress || '',
    partyStateCode: sourceInvoice.partyStateCode || '27',
    placeOfSupplyStateCode: sourceInvoice.placeOfSupplyStateCode || sourceInvoice.partyStateCode || '27',
    isIntraState: sourceInvoice.isIntraState ?? true,
    invoiceType: 'CREDIT_NOTE',
    noteType: 'C',
    originalInvoiceId: sourceInvoice.id,
    originalInvoiceNumber: sourceInvoice.invoiceNumber,
    originalInvoiceDate: sourceInvoice.date,
    returnReason,
    items: summary.lines as InvoiceItemEntry[],
    totalGrossAmount: summary.taxableAmount,
    totalDiscount: 0,
    totalTaxableAmount: summary.taxableAmount,
    totalCgst: summary.cgst,
    totalSgst: summary.sgst,
    totalIgst: summary.igst,
    totalCess: summary.cess,
    totalTax: summary.totalTax,
    roundOff: 0,
    grandTotal: summary.grandTotal,
    amountInWords: amountInWords(summary.grandTotal),
    paidAmount: summary.grandTotal,
    balanceAmount: 0,
    paymentMode: 'CASH',
    paymentStatus: 'PAID',
    createdAt: now,
    updatedAt: now,
  };

  // 1. Save Credit Note once (restores item stock in stockEngine and reconciles parent invoice balance)
  db.saveInvoice(creditNote);

  // 2. Read updated source invoice back from DB
  const updatedSourceInvoice = db.getInvoices().find((i) => i.id === sourceInvoice.id) || sourceInvoice;

  // 3. Recalculate party balance
  if (sourceInvoice.partyId) {
    db.recalculatePartyBalance(sourceInvoice.partyId);
  }

  return { creditNote, updatedSourceInvoice };
}

/**
 * Creates and saves a linked Purchase Return Debit Note and updates the source bill.
 */
export function executePurchaseReturn(params: {
  sourceBill: PurchaseBill;
  returnedItems: Array<{ item: PurchaseItemEntry; returnQuantity: number }>;
  company: CompanyProfile;
  returnReason?: string;
  returnDate?: string;
  debitNoteNumber?: string;
  existingPurchases?: PurchaseBill[];
}): { debitNote: PurchaseBill; updatedSourceBill: PurchaseBill } {
  const {
    sourceBill,
    returnedItems,
    company,
    returnReason = '01-Defective Goods',
    returnDate = new Date().toISOString().split('T')[0],
    existingPurchases = db.getPurchases(),
  } = params;

  const summary = calculateReturnLineEntries(returnedItems);

  const purchaseInvoices: InvoiceLike[] = existingPurchases.map((p) => ({
    id: p.id,
    invoiceNumber: p.billNumber,
  }));
  const dnNumber =
    params.debitNoteNumber ||
    generateNextDocumentNumber('DEBIT_NOTE', company, purchaseInvoices);

  const now = new Date().toISOString();
  const debitNote: PurchaseBill = {
    id: `DN-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    billNumber: dnNumber,
    date: returnDate,
    dueDate: returnDate,
    supplierId: sourceBill.supplierId,
    supplierName: sourceBill.supplierName,
    supplierGstin: sourceBill.supplierGstin,
    supplierAddress: sourceBill.supplierAddress || '',
    supplierStateCode: sourceBill.supplierStateCode || '27',
    placeOfSupplyStateCode: sourceBill.placeOfSupplyStateCode || sourceBill.supplierStateCode || '27',
    isIntraState: sourceBill.isIntraState ?? true,
    purchaseType: 'RETURN',
    noteType: 'D',
    originalBillId: sourceBill.id,
    originalBillNumber: sourceBill.billNumber,
    originalBillDate: sourceBill.date,
    returnReason,
    items: summary.lines as PurchaseItemEntry[],
    itcEligibility: sourceBill.itcEligibility || 'ELIGIBLE_INPUTS',
    isRcm: Boolean(sourceBill.isRcm),
    totalGrossAmount: summary.taxableAmount,
    totalDiscount: 0,
    totalTaxableAmount: summary.taxableAmount,
    totalCgst: summary.cgst,
    totalSgst: summary.sgst,
    totalIgst: summary.igst,
    totalCess: summary.cess,
    totalTax: summary.totalTax,
    roundOff: 0,
    grandTotal: summary.grandTotal,
    paidAmount: summary.grandTotal,
    balanceAmount: 0,
    paymentMode: 'CASH',
    paymentStatus: 'PAID',
    createdAt: now,
    updatedAt: now,
  };

  const updatedSourceBill = applyReturnToPurchaseBill(sourceBill, summary.grandTotal);

  // 1. Save Debit Note (decrements item stock in stockEngine!)
  db.savePurchase(debitNote);

  // 2. Save Updated Source Bill with skipSettlementDerivation so reversed balance is preserved
  db.savePurchase(updatedSourceBill, { skipSettlementDerivation: true });

  // 3. Recalculate supplier balance
  if (sourceBill.supplierId) {
    db.recalculatePartyBalance(sourceBill.supplierId);
  }

  return { debitNote, updatedSourceBill };
}

function getAuditUser(): { userId: string; userName: string; userRole: UserRole } {
  try {
    const u = rbac.getActiveUser();
    return {
      userId: u.id || 'usr_sys',
      userName: u.name || 'System',
      userRole: (u.role || 'OWNER') as UserRole,
    };
  } catch {
    return {
      userId: 'usr_sys',
      userName: 'System',
      userRole: 'OWNER' as UserRole,
    };
  }
}

export interface LinkSalesReturnResult {
  success: boolean;
  error?: string;
  updatedInvoice?: Invoice;
  updatedCreditNote?: Invoice;
}

/**
 * Links an unlinked Sales Return (Credit Note) to a source Sales Invoice.
 * 1. Guards party match (partyId or partyName).
 * 2. Reduces source invoice's balance/paid via applyReturnToInvoice.
 * 3. Updates credit note with source invoice references and customer info.
 * 4. Saves updated invoice and credit note to the database.
 * 5. Emits RETURN_LINK audit trail record and shows toast.
 */
export function linkCreditNoteToInvoice(
  creditNote: Invoice,
  invoice: Invoice
): LinkSalesReturnResult {
  // 1. Guard: invoice.partyId === cn.partyId (or partyName match); otherwise toast + abort
  const partyMatch =
    (creditNote.partyId && invoice.partyId && creditNote.partyId === invoice.partyId) ||
    (creditNote.partyName &&
      invoice.partyName &&
      creditNote.partyName.trim().toLowerCase() === invoice.partyName.trim().toLowerCase());

  if (!partyMatch) {
    const errorMsg = 'Party mismatch: Cannot link to an invoice of a different customer.';
    showAppToast(errorMsg);
    return { success: false, error: errorMsg };
  }

  // 2. updatedInvoice = applyReturnToInvoice(invoice, cn.grandTotal) (from returnEngine)
  const updatedInvoice = applyReturnToInvoice(invoice, creditNote.grandTotal);

  // 3. updatedCn = { ...cn, originalInvoiceId: invoice.id, originalInvoiceNumber: invoice.invoiceNumber, originalInvoiceDate: invoice.date, partyId: invoice.partyId || creditNote.partyId, partyName: invoice.partyName || creditNote.partyName }
  const updatedCn: Invoice = {
    ...creditNote,
    originalInvoiceId: invoice.id,
    originalInvoiceNumber: invoice.invoiceNumber,
    originalInvoiceDate: invoice.date,
    partyId: invoice.partyId || creditNote.partyId,
    partyName: invoice.partyName || creditNote.partyName,
  };

  // 4. db.saveInvoice(updatedInvoice) then db.saveInvoice(updatedCn)
  db.saveInvoice(updatedInvoice, { skipSettlementDerivation: true });
  db.saveInvoice(updatedCn, { skipParentReconciliation: true });

  // 5. Audit Trail Hook
  const auditUser = getAuditUser();
  auditTrail
    .logEvent({
      userId: auditUser.userId,
      userName: auditUser.userName,
      userRole: auditUser.userRole,
      actionType: 'RETURN_LINK',
      documentId: updatedCn.id,
      documentType: 'INVOICE',
      previousSnapshot: JSON.parse(JSON.stringify(creditNote)),
      newSnapshot: JSON.parse(JSON.stringify(updatedCn)),
      summary: `Linked Credit Note #${updatedCn.invoiceNumber} to Invoice #${invoice.invoiceNumber}`,
    })
    .catch((err) => console.error('Audit log failed for RETURN_LINK:', err));

  showAppToast(`Linked to invoice #${invoice.invoiceNumber}`);

  return {
    success: true,
    updatedInvoice,
    updatedCreditNote: updatedCn,
  };
}

export interface UnlinkSalesReturnResult {
  success: boolean;
  error?: string;
  revertedInvoice?: Invoice;
  updatedCreditNote?: Invoice;
}

/**
 * Unlinks a linked Sales Return (Credit Note) from its source Sales Invoice.
 * 1. Finds the source invoice by originalInvoiceId / originalInvoiceNumber.
 * 2. Restores source invoice's balance/paid via revertReturnFromInvoice.
 * 3. Clears original invoice reference fields on the credit note.
 * 4. Saves reverted invoice and updated credit note to the database.
 * 5. Emits RETURN_UNLINK audit trail record and shows toast.
 */
export function unlinkCreditNoteFromInvoice(
  creditNote: Invoice,
  existingInvoices?: Invoice[]
): UnlinkSalesReturnResult {
  // 1. Find the source invoice by originalInvoiceId/originalInvoiceNumber
  const allInvoices = existingInvoices || db.getInvoices();
  const sourceInvoice = allInvoices.find(
    (i) =>
      (creditNote.originalInvoiceId && i.id === creditNote.originalInvoiceId) ||
      (creditNote.originalInvoiceNumber &&
        i.invoiceNumber.trim().toUpperCase() === creditNote.originalInvoiceNumber.trim().toUpperCase())
  );

  if (!sourceInvoice) {
    const errorMsg = `Source invoice #${creditNote.originalInvoiceNumber || ''} not found.`;
    showAppToast(errorMsg);
    return { success: false, error: errorMsg };
  }

  // 2. revertedInvoice = revertReturnFromInvoice(sourceInvoice, cn.grandTotal)
  const revertedInvoice = revertReturnFromInvoice(sourceInvoice, creditNote.grandTotal);

  // 3. updatedCn = { ...cn, originalInvoiceId: undefined, originalInvoiceNumber: undefined, originalInvoiceDate: undefined }
  const updatedCn: Invoice = {
    ...creditNote,
    originalInvoiceId: undefined,
    originalInvoiceNumber: undefined,
    originalInvoiceDate: undefined,
  };

  // 4. db.saveInvoice(revertedInvoice) then db.saveInvoice(updatedCn)
  db.saveInvoice(revertedInvoice, { skipSettlementDerivation: true });
  db.saveInvoice(updatedCn, { skipParentReconciliation: true });

  // 5. Audit Trail Hook
  const auditUser = getAuditUser();
  auditTrail
    .logEvent({
      userId: auditUser.userId,
      userName: auditUser.userName,
      userRole: auditUser.userRole,
      actionType: 'RETURN_UNLINK',
      documentId: updatedCn.id,
      documentType: 'INVOICE',
      previousSnapshot: JSON.parse(JSON.stringify(creditNote)),
      newSnapshot: JSON.parse(JSON.stringify(updatedCn)),
      summary: `Unlinked Credit Note #${updatedCn.invoiceNumber} from Invoice #${sourceInvoice.invoiceNumber}`,
    })
    .catch((err) => console.error('Audit log failed for RETURN_UNLINK:', err));

  showAppToast(`Unlinked Credit Note #${updatedCn.invoiceNumber}`);

  return {
    success: true,
    revertedInvoice,
    updatedCreditNote: updatedCn,
  };
}
