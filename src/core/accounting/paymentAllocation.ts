import { Invoice, PaymentSplit, PaymentMode } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { Party } from '../../models/party.ts';
import { Voucher, PaymentAllocation, PaymentAllocationDocumentType } from './voucherTypes.ts';
import { formatSplitNotes } from './paymentSplitUtils.ts';

export function inferVoucherPaymentMode(voucher: Voucher): string {
  const hasUpi = voucher.entries.some((e) => (e.narration || '').toLowerCase().includes('upi'));
  if (hasUpi) return 'UPI';
  const hasBank = voucher.entries.some(
    (e) => (e.accountId || '').startsWith('ACC_BANK') || (e.accountName || '').toLowerCase().includes('bank')
  );
  if (hasBank) return 'BANK';
  return 'CASH';
}

export interface OutstandingDocument {
  id: string;
  documentNumber: string;
  number: string;
  date: string;
  grandTotal: number;
  paidAmount: number;
  balanceAmount: number;
  documentType: PaymentAllocationDocumentType;
  partyId?: string;
  partyName?: string;
  createdAt?: string;
  rawInvoice?: Invoice;
  rawPurchase?: PurchaseBill;
}

export interface GetOutstandingDocumentsParams {
  partyId?: string;
  partyName?: string;
  documentType: PaymentAllocationDocumentType;
  invoices?: Invoice[];
  purchases?: PurchaseBill[];
  parties?: Party[];
}

/**
 * Returns non-cancelled documents with balanceAmount > 0.01 matching the party.
 * Excludes estimates, sales orders, delivery challans, purchase orders, and purchase challans.
 */
export function getOutstandingDocuments(params: GetOutstandingDocumentsParams): OutstandingDocument[] {
  const { partyId, partyName, documentType, invoices = [], purchases = [] } = params;
  let resolvedPartyName = partyName?.trim().toLowerCase();
  if (!resolvedPartyName && partyId && params.parties) {
    const p = params.parties.find((x) => x.id === partyId);
    if (p) {
      resolvedPartyName = p.name.trim().toLowerCase();
    }
  }

  const isPartyMatch = (docPartyId?: string, docPartyName?: string): boolean => {
    if (partyId && docPartyId) {
      return docPartyId === partyId;
    }
    const docName = docPartyName?.trim().toLowerCase();
    if (resolvedPartyName && docName) {
      return docName === resolvedPartyName;
    }
    return false;
  };

  const round2 = (num: number) => Number(Math.round(num * 100) / 100);

  if (documentType === 'INVOICE') {
    return invoices
      .filter((inv) => {
        if (inv.isCancelled) return false;
        if (
          inv.invoiceType === 'ESTIMATE' ||
          inv.invoiceType === 'SALES_ORDER' ||
          inv.invoiceType === 'DELIVERY_CHALLAN' ||
          inv.invoiceType === 'CREDIT_NOTE'
        ) {
          return false;
        }
        if (!isPartyMatch(inv.partyId, inv.partyName)) return false;
        const bal = typeof inv.balanceAmount === 'number' ? inv.balanceAmount : inv.grandTotal - (inv.paidAmount || 0);
        return bal > 0.01;
      })
      .map((inv) => {
        const bal = typeof inv.balanceAmount === 'number' ? inv.balanceAmount : inv.grandTotal - (inv.paidAmount || 0);
        return {
          id: inv.id,
          documentNumber: inv.invoiceNumber,
          number: inv.invoiceNumber,
          date: inv.date,
          grandTotal: round2(inv.grandTotal),
          paidAmount: round2(inv.paidAmount || 0),
          balanceAmount: round2(bal),
          documentType: 'INVOICE' as const,
          partyId: inv.partyId,
          partyName: inv.partyName,
          createdAt: inv.createdAt,
          rawInvoice: inv,
        };
      });
  }

  return purchases
    .filter((pur) => {
      if (pur.isCancelled) return false;
      if (
        pur.purchaseType === 'PO' ||
        pur.purchaseType === 'CHALLAN' ||
        pur.purchaseType === 'RETURN' ||
        (pur as any).purchaseType === 'PURCHASE_ORDER' ||
        (pur as any).purchaseType === 'PURCHASE_CHALLAN' ||
        (pur as any).purchaseType === 'PURCHASE_RETURN'
      ) {
        return false;
      }
      if (!isPartyMatch(pur.supplierId, pur.supplierName)) return false;
      const bal = typeof pur.balanceAmount === 'number' ? pur.balanceAmount : pur.grandTotal - (pur.paidAmount || 0);
      return bal > 0.01;
    })
    .map((pur) => {
      const bal = typeof pur.balanceAmount === 'number' ? pur.balanceAmount : pur.grandTotal - (pur.paidAmount || 0);
      return {
        id: pur.id,
        documentNumber: pur.billNumber,
        number: pur.billNumber,
        date: pur.date,
        grandTotal: round2(pur.grandTotal),
        paidAmount: round2(pur.paidAmount || 0),
        balanceAmount: round2(bal),
        documentType: 'PURCHASE' as const,
        partyId: pur.supplierId,
        partyName: pur.supplierName,
        createdAt: pur.createdAt,
        rawPurchase: pur,
      };
    });
}

/**
 * Deterministic FIFO allocation by document date, then createdAt/id as tie-breaker.
 */
export function allocateOldestFirst(
  documents: OutstandingDocument[],
  amount: number
): PaymentAllocation[] {
  let remaining = Number(Math.max(0, amount).toFixed(2));
  if (remaining <= 0.005) return [];

  // Deterministic sort: date ascending, then createdAt, then id
  const sorted = [...documents].sort((a, b) => {
    const dComp = (a.date || '').localeCompare(b.date || '');
    if (dComp !== 0) return dComp;
    const cComp = (a.createdAt || '').localeCompare(b.createdAt || '');
    if (cComp !== 0) return cComp;
    return a.id.localeCompare(b.id);
  });

  const allocations: PaymentAllocation[] = [];

  for (const doc of sorted) {
    if (remaining <= 0.005) break;
    const allocAmt = Number(Math.min(remaining, doc.balanceAmount).toFixed(2));
    if (allocAmt > 0) {
      allocations.push({
        documentType: doc.documentType,
        documentId: doc.id,
        documentNumber: doc.documentNumber,
        amount: allocAmt,
        date: doc.date,
      });
      remaining = Number((remaining - allocAmt).toFixed(2));
    }
  }

  return allocations;
}

export interface ValidateAllocationsParams {
  allocations?: PaymentAllocation[];
  documents?: OutstandingDocument[];
  totalSettled: number;
  partyId?: string;
  partyName?: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates payment allocations against outstanding documents and total payment.
 */
export function validateAllocations(params: ValidateAllocationsParams): ValidationResult {
  const { allocations = [], documents = [], totalSettled, partyId, partyName } = params;

  if (allocations.length === 0) {
    return { valid: true };
  }

  const seenIds = new Set<string>();
  let sumAllocated = 0;
  const docMap = new Map<string, OutstandingDocument>();
  documents.forEach((d) => docMap.set(d.id, d));

  const normPartyName = partyName?.trim().toLowerCase();

  for (const alloc of allocations) {
    // 1. Reject duplicate document IDs
    if (seenIds.has(alloc.documentId)) {
      return {
        valid: false,
        error: `Duplicate document allocation detected for #${alloc.documentNumber || alloc.documentId}.`,
      };
    }
    seenIds.add(alloc.documentId);

    // 2. Reject non-positive allocation amounts
    if (typeof alloc.amount !== 'number' || alloc.amount <= 0) {
      return {
        valid: false,
        error: `Allocation amount for #${alloc.documentNumber || alloc.documentId} must be greater than zero.`,
      };
    }

    sumAllocated = Number((sumAllocated + alloc.amount).toFixed(2));

    // 3. Match against outstanding documents
    const doc = docMap.get(alloc.documentId);
    if (!doc) {
      return {
        valid: false,
        error: `Document #${alloc.documentNumber || alloc.documentId} is not in the list of outstanding documents.`,
      };
    }

    // 3b. Reject document type mismatch
    if (doc.documentType !== alloc.documentType) {
      return {
        valid: false,
        error: `Document type mismatch for #${alloc.documentNumber || alloc.documentId}: expected ${doc.documentType}, got ${alloc.documentType}.`,
      };
    }

    // 4. Reject allocations for a different party
    if (partyId && doc.partyId && doc.partyId !== partyId) {
      return {
        valid: false,
        error: `Document #${alloc.documentNumber} belongs to a different party.`,
      };
    }
    if (normPartyName && doc.partyName && doc.partyName.trim().toLowerCase() !== normPartyName) {
      return {
        valid: false,
        error: `Document #${alloc.documentNumber} belongs to a different party (${doc.partyName}).`,
      };
    }

    // 5. Reject allocation above document's current balance (tolerance 0.01)
    if (alloc.amount > doc.balanceAmount + 0.01) {
      return {
        valid: false,
        error: `Allocation amount ₹${alloc.amount.toFixed(2)} exceeds balance ₹${doc.balanceAmount.toFixed(2)} on #${alloc.documentNumber}.`,
      };
    }
  }

  // 6. Reject allocated sum above totalSettled (tolerance 0.01)
  const maxAllowed = Number((totalSettled + 0.01).toFixed(2));
  if (sumAllocated > maxAllowed) {
    return {
      valid: false,
      error: `Total allocated amount (₹${sumAllocated.toFixed(2)}) exceeds payment amount (₹${totalSettled.toFixed(2)}).`,
    };
  }

  return { valid: true };
}

export interface ApplyAllocationsOptions {
  paymentMode?: string;
  paymentSplits?: PaymentSplit[];
}

/**
 * Applies allocations to documents, updating paidAmount, balanceAmount, paymentMode, and paymentStatus.
 * Unrelated documents remain untouched.
 */
export function applyAllocations<T extends Invoice | PurchaseBill>(
  documents: T[],
  allocations: PaymentAllocation[],
  options?: ApplyAllocationsOptions
): T[] {
  if (!allocations || allocations.length === 0) {
    return documents;
  }

  const allocMap = new Map<string, number>();
  for (const a of allocations) {
    allocMap.set(a.documentId, Number(((allocMap.get(a.documentId) || 0) + a.amount).toFixed(2)));
  }

  const effectiveAllocMode: PaymentMode = (options?.paymentMode || 'CASH') as PaymentMode;

  return documents.map((doc) => {
    const allocAmt = allocMap.get(doc.id);
    if (!allocAmt || allocAmt <= 0) {
      return doc;
    }

    const currentPaid = typeof doc.paidAmount === 'number' ? doc.paidAmount : (doc.paymentStatus === 'PAID' ? doc.grandTotal : 0);
    const newPaid = Number(Math.min(doc.grandTotal, Math.max(0, currentPaid + allocAmt)).toFixed(2));
    const newBal = Number(Math.max(0, doc.grandTotal - newPaid).toFixed(2));
    const newStatus: 'PAID' | 'PARTIAL' | 'UNPAID' =
      newPaid <= 0.005 ? 'UNPAID' : newBal <= 0.01 ? 'PAID' : 'PARTIAL';

    // Maintain and synchronize splits to strictly match newPaid and newBal
    let updatedSplits: PaymentSplit[] | undefined = doc.paymentSplits ? [...doc.paymentSplits] : undefined;
    if (updatedSplits && updatedSplits.length > 0) {
      const nonCredit = updatedSplits.filter((s) => (s.mode || '').toUpperCase() !== 'CREDIT');
      const nonCreditTotal = nonCredit.reduce((s, x) => s + (Number(x.amount) || 0), 0);
      const splitDiff = Number((newPaid - nonCreditTotal).toFixed(2));
      if (splitDiff > 0) {
        updatedSplits = nonCredit.map((s) => ({ ...s }));
        updatedSplits.push({
          id: `alloc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          mode: effectiveAllocMode,
          amount: splitDiff,
        });
      } else if (splitDiff < 0) {
        let remaining = Math.abs(splitDiff);
        const adjusted: PaymentSplit[] = [];
        for (let i = nonCredit.length - 1; i >= 0; i--) {
          const s = nonCredit[i];
          if (remaining <= 0) {
            adjusted.unshift(s);
          } else if (s.amount <= remaining) {
            remaining = Number((remaining - s.amount).toFixed(2));
          } else {
            adjusted.unshift({ ...s, amount: Number((s.amount - remaining).toFixed(2)) });
            remaining = 0;
          }
        }
        updatedSplits = adjusted;
      } else {
        updatedSplits = nonCredit.map((s) => ({ ...s }));
      }
      if (newBal > 0) {
        updatedSplits.push({
          id: `split-bal-${Date.now()}`,
          mode: 'CREDIT',
          amount: newBal,
        });
      }
    } else if (newPaid > 0 && (doc.paymentSplits !== undefined || (doc.notes && (doc.notes.includes('Split Payment') || doc.notes.includes('Split:'))))) {
      // If splits or split notes were active, initialize explicit split breakdown
      updatedSplits = [
        {
          id: `alloc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          mode: doc.paymentMode && doc.paymentMode !== 'CREDIT' && doc.paymentMode !== 'SPLIT' ? doc.paymentMode : effectiveAllocMode,
          amount: newPaid,
        },
      ];
      if (newBal > 0) {
        updatedSplits.push({
          id: `split-bal-${Date.now()}`,
          mode: 'CREDIT',
          amount: newBal,
        });
      }
    }

    // Derive accurate paymentMode
    let newPaymentMode: PaymentMode;
    if (updatedSplits && updatedSplits.length > 0) {
      const activeNonCredit = updatedSplits.filter(
        (s) => (s.mode || '').toUpperCase() !== 'CREDIT' && (Number(s.amount) || 0) > 0
      );
      if (newStatus === 'UNPAID' || activeNonCredit.length === 0) {
        newPaymentMode = 'CREDIT';
      } else if (activeNonCredit.length === 1 && newBal <= 0.01) {
        newPaymentMode = activeNonCredit[0].mode as PaymentMode;
      } else {
        newPaymentMode = 'SPLIT';
      }
    } else {
      if (newStatus === 'UNPAID') {
        newPaymentMode = 'CREDIT';
      } else if (newBal > 0) {
        newPaymentMode = 'SPLIT';
      } else {
        newPaymentMode = effectiveAllocMode !== 'CREDIT' ? effectiveAllocMode : 'CASH';
      }
    }

    let updatedNotes = doc.notes;
    if (updatedSplits && updatedNotes && (updatedNotes.includes('Split Payment —') || updatedNotes.includes('Split:'))) {
      const nonSplitParts = updatedNotes.split('\n').filter((l) => !l.includes('Split Payment —') && !l.includes('Split:'));
      const newSplitNote = formatSplitNotes(updatedSplits, newBal);
      updatedNotes = [...nonSplitParts, newSplitNote].filter(Boolean).join('\n');
    }

    return {
      ...doc,
      paidAmount: newPaid,
      balanceAmount: newBal,
      paymentMode: newPaymentMode,
      paymentStatus: newStatus,
      paymentSplits: updatedSplits,
      notes: updatedNotes,
      updatedAt: new Date().toISOString(),
    };
  });
}

/**
 * Reverses allocations from documents, restoring paidAmount, balanceAmount, paymentMode, and paymentStatus.
 * Unrelated documents remain untouched.
 */
export function reverseAllocations<T extends Invoice | PurchaseBill>(
  documents: T[],
  allocations: PaymentAllocation[]
): T[] {
  if (!allocations || allocations.length === 0) {
    return documents;
  }

  const allocMap = new Map<string, number>();
  for (const a of allocations) {
    allocMap.set(a.documentId, Number(((allocMap.get(a.documentId) || 0) + a.amount).toFixed(2)));
  }

  return documents.map((doc) => {
    const allocAmt = allocMap.get(doc.id);
    if (!allocAmt || allocAmt <= 0) {
      return doc;
    }

    const currentPaid = typeof doc.paidAmount === 'number' ? doc.paidAmount : (doc.paymentStatus === 'PAID' ? doc.grandTotal : 0);
    const newPaid = Number(Math.max(0, currentPaid - allocAmt).toFixed(2));
    const newBal = Number(Math.max(0, doc.grandTotal - newPaid).toFixed(2));
    const newStatus: 'PAID' | 'PARTIAL' | 'UNPAID' =
      newPaid <= 0.005 ? 'UNPAID' : newBal <= 0.01 ? 'PAID' : 'PARTIAL';

    let updatedSplits = doc.paymentSplits ? [...doc.paymentSplits] : undefined;
    if (updatedSplits && updatedSplits.length > 0) {
      let remainingToReduce = allocAmt;
      const nonCredit = updatedSplits.filter((s) => (s.mode || '').toUpperCase() !== 'CREDIT');
      const newNonCredit: typeof nonCredit = [];
      for (let i = nonCredit.length - 1; i >= 0; i--) {
        const s = nonCredit[i];
        if (remainingToReduce <= 0) {
          newNonCredit.unshift(s);
        } else if (s.amount <= remainingToReduce) {
          remainingToReduce = Number((remainingToReduce - s.amount).toFixed(2));
        } else {
          newNonCredit.unshift({ ...s, amount: Number((s.amount - remainingToReduce).toFixed(2)) });
          remainingToReduce = 0;
        }
      }
      if (newBal > 0) {
        newNonCredit.push({
          id: `split-bal-${Date.now()}`,
          mode: 'CREDIT',
          amount: newBal,
        });
      }
      updatedSplits = newNonCredit;
    }

    // Derive accurate paymentMode upon reversal
    let newPaymentMode: PaymentMode;
    if (updatedSplits && updatedSplits.length > 0) {
      const activeNonCredit = updatedSplits.filter(
        (s) => (s.mode || '').toUpperCase() !== 'CREDIT' && (Number(s.amount) || 0) > 0
      );
      if (newStatus === 'UNPAID' || activeNonCredit.length === 0) {
        newPaymentMode = 'CREDIT';
      } else if (activeNonCredit.length === 1 && newBal <= 0.01) {
        newPaymentMode = activeNonCredit[0].mode as PaymentMode;
      } else {
        newPaymentMode = 'SPLIT';
      }
    } else {
      newPaymentMode = newStatus === 'UNPAID' ? 'CREDIT' : newBal > 0 ? 'SPLIT' : (doc.paymentMode || 'CASH');
    }

    let updatedNotes = doc.notes;
    if (updatedSplits && updatedNotes && (updatedNotes.includes('Split Payment —') || updatedNotes.includes('Split:'))) {
      const nonSplitParts = updatedNotes.split('\n').filter((l) => !l.includes('Split Payment —') && !l.includes('Split:'));
      const newSplitNote = formatSplitNotes(updatedSplits, newBal);
      updatedNotes = [...nonSplitParts, newSplitNote].filter(Boolean).join('\n');
    }

    return {
      ...doc,
      paidAmount: newPaid,
      balanceAmount: newBal,
      paymentMode: newPaymentMode,
      paymentStatus: newStatus,
      paymentSplits: updatedSplits,
      notes: updatedNotes,
      updatedAt: new Date().toISOString(),
    };
  });
}

export interface PreSaveValidationResult {
  valid: boolean;
  error?: string;
  isNew: boolean;
  existingSourceVoucher?: Voucher;
  otherActiveLinked: Voucher[];
  otherAllocatedTotal: number;
  targetSourceAmount: number;
}

export function resolveSourceVoucherSplits(
  intendedAmount: number,
  splits?: PaymentSplit[],
  mode?: string
): { paymentSplits?: PaymentSplit[]; paymentMode: string } {
  const nonCreditSplits = (splits || []).filter(
    (s) => (s.mode || '').toUpperCase() !== 'CREDIT' && Number(s.amount) > 0
  );
  const nonCreditTotal = Number(
    nonCreditSplits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0).toFixed(2)
  );

  if (nonCreditSplits.length > 0 && Math.abs(nonCreditTotal - intendedAmount) <= 0.01) {
    return {
      paymentSplits: splits,
      paymentMode: mode || (splits && splits.length > 1 ? 'SPLIT' : splits?.[0]?.mode || 'CASH'),
    };
  }

  let singleMode = mode && mode !== 'SPLIT' ? mode : undefined;
  if (!singleMode) {
    singleMode = nonCreditSplits[0]?.mode || 'CASH';
  }
  if (singleMode === 'SPLIT') {
    singleMode = 'CASH';
  }

  return {
    paymentSplits: undefined,
    paymentMode: singleMode,
  };
}

export function validateInvoicePreSave(params: {
  newInvoice: Invoice;
  existingInvoices?: Invoice[];
  vouchers?: Voucher[];
}): PreSaveValidationResult {
  const { newInvoice, existingInvoices = [], vouchers = [] } = params;
  const prevInvoice = existingInvoices.find((i) => i.id === newInvoice.id);
  const isNew = !prevInvoice;

  const isSpecialDocument =
    newInvoice.invoiceType === 'CREDIT_NOTE' ||
    newInvoice.invoiceType === 'DEBIT_NOTE';

  const existingSourceVoucher = isSpecialDocument
    ? undefined
    : vouchers.find(
        (v) =>
          !v.isCancelled &&
          !v.isReversed &&
          v.voucherType === 'RECEIPT' &&
          v.allocationMode === 'SOURCE_DOCUMENT' &&
          v.sourceDocumentId === newInvoice.id
      );

  const newInvoicePaid = Number(newInvoice.paidAmount) || 0;
  const isOrderOrEstimate =
    newInvoice.invoiceType === 'ESTIMATE' ||
    newInvoice.invoiceType === 'SALES_ORDER' ||
    newInvoice.invoiceType === 'DELIVERY_CHALLAN';
  const isCredit = newInvoice.paymentMode === 'CREDIT';
  const isUnpaidOrCancelled =
    isSpecialDocument || isOrderOrEstimate || newInvoice.isCancelled || newInvoicePaid <= 0 || isCredit;

  if (isNew) {
    return {
      valid: true,
      isNew: true,
      existingSourceVoucher: undefined,
      otherActiveLinked: [],
      otherAllocatedTotal: 0,
      targetSourceAmount: isUnpaidOrCancelled ? 0 : newInvoicePaid,
    };
  }

  const otherActiveLinked = vouchers.filter(
    (v) =>
      !v.isCancelled &&
      !v.isReversed &&
      (!existingSourceVoucher || v.id !== existingSourceVoucher.id) &&
      v.paymentAllocations?.some((a) => a.documentType === 'INVOICE' && a.documentId === newInvoice.id)
  );

  // Guard: Reject party change if any active linked payment voucher exists
  if (prevInvoice && newInvoice.partyId !== prevInvoice.partyId) {
    if (existingSourceVoucher || otherActiveLinked.length > 0) {
      return {
        valid: false,
        error: 'Cannot change party on an invoice with linked payment vouchers. Reverse or edit linked payment vouchers first.',
        isNew: false,
        existingSourceVoucher,
        otherActiveLinked,
        otherAllocatedTotal: 0,
        targetSourceAmount: 0,
      };
    }
  }

  const otherAllocatedTotal = Number(
    otherActiveLinked
      .reduce((sum, v) => {
        const a = v.paymentAllocations?.find((x) => x.documentType === 'INVOICE' && x.documentId === newInvoice.id);
        return sum + (a?.amount || 0);
      }, 0)
      .toFixed(2)
  );

  if (newInvoicePaid < otherAllocatedTotal) {
    return {
      valid: false,
      error: `Cannot reduce paid amount below ₹${otherAllocatedTotal.toFixed(2)}: active party payment vouchers cover that amount. Reverse or edit those payments first.`,
      isNew: false,
      existingSourceVoucher,
      otherActiveLinked,
      otherAllocatedTotal,
      targetSourceAmount: 0,
    };
  }

  const targetSourceAmount = (isSpecialDocument || isUnpaidOrCancelled || newInvoicePaid <= otherAllocatedTotal)
    ? 0
    : Number((newInvoicePaid - otherAllocatedTotal).toFixed(2));

  if (!isSpecialDocument && existingSourceVoucher && otherActiveLinked.length > 0) {
    if (targetSourceAmount !== existingSourceVoucher.totalAmount) {
      return {
        valid: false,
        error: 'Cannot change upfront payment while other payment vouchers are linked to this invoice. Please edit or reverse the source payment separately.',
        isNew: false,
        existingSourceVoucher,
        otherActiveLinked,
        otherAllocatedTotal,
        targetSourceAmount,
      };
    }
  }

  return {
    valid: true,
    isNew: false,
    existingSourceVoucher,
    otherActiveLinked,
    otherAllocatedTotal,
    targetSourceAmount,
  };
}

export function validatePurchasePreSave(params: {
  newBill: PurchaseBill;
  existingPurchases?: PurchaseBill[];
  vouchers?: Voucher[];
}): PreSaveValidationResult {
  const { newBill, existingPurchases = [], vouchers = [] } = params;
  const prevBill = existingPurchases.find((b) => b.id === newBill.id);
  const isNew = !prevBill;

  const isPurchaseReturn =
    newBill.purchaseType === 'RETURN' ||
    (newBill.purchaseType as string) === 'PURCHASE_RETURN';

  const existingSourcePaymentVoucher = isPurchaseReturn
    ? undefined
    : vouchers.find(
        (v) =>
          !v.isCancelled &&
          !v.isReversed &&
          v.voucherType === 'PAYMENT' &&
          v.allocationMode === 'SOURCE_DOCUMENT' &&
          v.sourceDocumentId === newBill.id
      );

  const newBillPaid = Number(newBill.paidAmount) || 0;
  const isPurchaseOrder = newBill.purchaseType === 'PO';
  const isPurchaseChallan = newBill.purchaseType === 'CHALLAN';
  const isPurCredit = newBill.paymentMode === 'CREDIT';
  const isPurUnpaidOrCancelled =
    isPurchaseReturn || isPurchaseOrder || isPurchaseChallan || newBill.isCancelled || newBillPaid <= 0 || isPurCredit;

  if (isNew) {
    return {
      valid: true,
      isNew: true,
      existingSourceVoucher: undefined,
      otherActiveLinked: [],
      otherAllocatedTotal: 0,
      targetSourceAmount: isPurUnpaidOrCancelled ? 0 : newBillPaid,
    };
  }

  const otherActiveLinked = vouchers.filter(
    (v) =>
      !v.isCancelled &&
      !v.isReversed &&
      (!existingSourcePaymentVoucher || v.id !== existingSourcePaymentVoucher.id) &&
      v.paymentAllocations?.some((a) => a.documentType === 'PURCHASE' && a.documentId === newBill.id)
  );

  // Guard: Reject supplier change if any active linked payment voucher exists
  if (prevBill && newBill.supplierId !== prevBill.supplierId) {
    if (existingSourcePaymentVoucher || otherActiveLinked.length > 0) {
      return {
        valid: false,
        error: 'Cannot change supplier on a purchase bill with linked payment vouchers. Reverse or edit linked payment vouchers first.',
        isNew: false,
        existingSourceVoucher: existingSourcePaymentVoucher,
        otherActiveLinked,
        otherAllocatedTotal: 0,
        targetSourceAmount: 0,
      };
    }
  }

  const otherAllocatedTotal = Number(
    otherActiveLinked
      .reduce((sum, v) => {
        const a = v.paymentAllocations?.find((x) => x.documentType === 'PURCHASE' && x.documentId === newBill.id);
        return sum + (a?.amount || 0);
      }, 0)
      .toFixed(2)
  );

  if (newBillPaid < otherAllocatedTotal) {
    return {
      valid: false,
      error: `Cannot reduce paid amount below ₹${otherAllocatedTotal.toFixed(2)}: active party payment vouchers cover that amount. Reverse or edit those payments first.`,
      isNew: false,
      existingSourceVoucher: existingSourcePaymentVoucher,
      otherActiveLinked,
      otherAllocatedTotal,
      targetSourceAmount: 0,
    };
  }

  const targetSourceAmount = (isPurchaseReturn || isPurUnpaidOrCancelled || newBillPaid <= otherAllocatedTotal)
    ? 0
    : Number((newBillPaid - otherAllocatedTotal).toFixed(2));

  if (!isPurchaseReturn && existingSourcePaymentVoucher && otherActiveLinked.length > 0) {
    if (targetSourceAmount !== existingSourcePaymentVoucher.totalAmount) {
      return {
        valid: false,
        error: 'Cannot change upfront payment while other payment vouchers are linked to this bill. Please edit or reverse the source payment separately.',
        isNew: false,
        existingSourceVoucher: existingSourcePaymentVoucher,
        otherActiveLinked,
        otherAllocatedTotal,
        targetSourceAmount,
      };
    }
  }

  return {
    valid: true,
    isNew: false,
    existingSourceVoucher: existingSourcePaymentVoucher,
    otherActiveLinked,
    otherAllocatedTotal,
    targetSourceAmount,
  };
}
