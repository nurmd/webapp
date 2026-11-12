import { Invoice, PaymentSplit, PaymentMode } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { Party } from '../../models/party.ts';
import { Voucher, PaymentAllocation, PaymentAllocationDocumentType } from './voucherTypes.ts';
import { toPaise, fromPaise, subPaise } from '../money.ts';
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
  let matchedParty: Party | undefined;
  if (params.parties) {
    if (partyId) {
      matchedParty = params.parties.find((x) => x.id === partyId);
    }
    if (!matchedParty && resolvedPartyName) {
      matchedParty = params.parties.find((x) => x.name.trim().toLowerCase() === resolvedPartyName);
    }
    if (matchedParty && !resolvedPartyName) {
      resolvedPartyName = matchedParty.name.trim().toLowerCase();
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

  const round2 = (num: number) => fromPaise(toPaise(num));

  let openingBalanceDoc: OutstandingDocument | undefined;
  if (matchedParty) {
    const isCustomer = matchedParty.type === 'CUSTOMER';
    const isSupplier = matchedParty.type === 'SUPPLIER';
    const rawOpBal = typeof matchedParty.openingBalance === 'number' ? matchedParty.openingBalance : 0;
    const absOpBal = fromPaise(Math.abs(toPaise(rawOpBal)));

    let inferredType = matchedParty.openingBalanceType;
    if (!inferredType && absOpBal > 0.01) {
      if (rawOpBal > 0) {
        inferredType = isCustomer ? 'TO_RECEIVE' : 'TO_PAY';
      } else {
        inferredType = isCustomer ? 'TO_PAY' : 'TO_RECEIVE';
      }
    }

    const resolvedPId = partyId || matchedParty.id;
    const today = new Date().toISOString().split('T')[0];

    if (documentType === 'INVOICE' && isCustomer && inferredType === 'TO_RECEIVE' && absOpBal > 0.01) {
      openingBalanceDoc = {
        id: `OPENING-BALANCE-${resolvedPId}`,
        documentNumber: 'Opening Balance',
        number: 'Opening Balance',
        date: matchedParty.openingBalanceDate || today,
        grandTotal: absOpBal,
        paidAmount: 0,
        balanceAmount: absOpBal,
        documentType: 'INVOICE',
        partyId: resolvedPId,
        partyName: matchedParty.name,
        rawInvoice: undefined,
        rawPurchase: undefined,
      };
    } else if (documentType === 'PURCHASE' && isSupplier && inferredType === 'TO_PAY' && absOpBal > 0.01) {
      openingBalanceDoc = {
        id: `OPENING-BALANCE-${resolvedPId}`,
        documentNumber: 'Opening Balance',
        number: 'Opening Balance',
        date: matchedParty.openingBalanceDate || today,
        grandTotal: absOpBal,
        paidAmount: 0,
        balanceAmount: absOpBal,
        documentType: 'PURCHASE',
        partyId: resolvedPId,
        partyName: matchedParty.name,
        rawInvoice: undefined,
        rawPurchase: undefined,
      };
    }
  }

  if (documentType === 'INVOICE' || documentType === 'CREDIT_NOTE') {
    const wantCredit = documentType === 'CREDIT_NOTE';
    const invoiceDocs = invoices
      .filter((inv) => {
        if (inv.isCancelled) return false;
        if (
          inv.invoiceType === 'ESTIMATE' ||
          inv.invoiceType === 'SALES_ORDER' ||
          inv.invoiceType === 'DELIVERY_CHALLAN'
        ) {
          return false;
        }
        if (wantCredit) {
          if (inv.invoiceType !== 'CREDIT_NOTE') return false;
        } else {
          if (inv.invoiceType === 'CREDIT_NOTE') return false;
        }
        if (!isPartyMatch(inv.partyId, inv.partyName)) return false;
        const bal = typeof inv.balanceAmount === 'number'
          ? fromPaise(toPaise(inv.balanceAmount))
          : fromPaise(subPaise(toPaise(inv.grandTotal), toPaise(inv.paidAmount || 0)));
        return bal > 0.01;
      })
      .map((inv) => {
        const balPaise = typeof inv.balanceAmount === 'number'
          ? toPaise(inv.balanceAmount)
          : subPaise(toPaise(inv.grandTotal), toPaise(inv.paidAmount || 0));
        const bal = fromPaise(balPaise);
        return {
          id: inv.id,
          documentNumber: inv.invoiceNumber,
          number: inv.invoiceNumber,
          date: inv.date,
          grandTotal: fromPaise(toPaise(inv.grandTotal)),
          paidAmount: fromPaise(toPaise(inv.paidAmount || 0)),
          balanceAmount: fromPaise(balPaise),
          documentType: (wantCredit ? 'CREDIT_NOTE' : 'INVOICE') as PaymentAllocationDocumentType,
          partyId: inv.partyId,
          partyName: inv.partyName,
          createdAt: inv.createdAt,
          rawInvoice: inv,
        };
      });

    return openingBalanceDoc ? [openingBalanceDoc, ...invoiceDocs] : invoiceDocs;
  }

  const wantDebit = documentType === 'DEBIT_NOTE';
  const purchaseDocs = purchases
    .filter((pur) => {
      if (pur.isCancelled) return false;
      const isReturn = pur.purchaseType === 'RETURN' || (pur.purchaseType as string) === 'PURCHASE_RETURN' || pur.noteType === 'D';
      if (wantDebit) {
        if (!isReturn) return false;
      } else {
        if (
          pur.purchaseType === 'PO' ||
          pur.purchaseType === 'CHALLAN' ||
          isReturn ||
          (pur.purchaseType as string) === 'PURCHASE_ORDER' ||
          (pur.purchaseType as string) === 'PURCHASE_CHALLAN'
        ) {
          return false;
        }
      }
      if (!isPartyMatch(pur.supplierId, pur.supplierName)) return false;
      const bal = typeof pur.balanceAmount === 'number'
        ? fromPaise(toPaise(pur.balanceAmount))
        : fromPaise(subPaise(toPaise(pur.grandTotal), toPaise(pur.paidAmount || 0)));
      return bal > 0.01;
    })
    .map((pur) => {
      const balPaise = typeof pur.balanceAmount === 'number'
        ? toPaise(pur.balanceAmount)
        : subPaise(toPaise(pur.grandTotal), toPaise(pur.paidAmount || 0));
      const bal = fromPaise(balPaise);
      return {
        id: pur.id,
        documentNumber: pur.billNumber,
        number: pur.billNumber,
        date: pur.date,
        grandTotal: fromPaise(toPaise(pur.grandTotal)),
        paidAmount: fromPaise(toPaise(pur.paidAmount || 0)),
        balanceAmount: fromPaise(balPaise),
        documentType: (wantDebit ? 'DEBIT_NOTE' : 'PURCHASE') as PaymentAllocationDocumentType,
        partyId: pur.supplierId,
        partyName: pur.supplierName,
        createdAt: pur.createdAt,
        rawPurchase: pur,
      };
    });

  return openingBalanceDoc ? [openingBalanceDoc, ...purchaseDocs] : purchaseDocs;
}

/**
 * Deterministic FIFO allocation by document date, then createdAt/id as tie-breaker.
 */
export function allocateOldestFirst(
  documents: OutstandingDocument[],
  amount: number
): PaymentAllocation[] {
  let remainingPaise = Math.max(0, toPaise(amount));
  if (remainingPaise <= 0) return [];

  // Deterministic sort: opening balance pseudo-documents first, then date ascending, then createdAt, then id
  const sorted = [...documents].sort((a, b) => {
    const aIsOp = a.id.startsWith('OPENING-BALANCE-');
    const bIsOp = b.id.startsWith('OPENING-BALANCE-');
    if (aIsOp && !bIsOp) return -1;
    if (!aIsOp && bIsOp) return 1;

    const dComp = (a.date || '').localeCompare(b.date || '');
    if (dComp !== 0) return dComp;
    const cComp = (a.createdAt || '').localeCompare(b.createdAt || '');
    if (cComp !== 0) return cComp;
    return a.id.localeCompare(b.id);
  });

  const allocations: PaymentAllocation[] = [];

  for (const doc of sorted) {
    if (remainingPaise <= 0) break;
    const docBalPaise = Math.max(0, toPaise(doc.balanceAmount));
    const allocAmtPaise = Math.min(remainingPaise, docBalPaise);
    if (allocAmtPaise > 0) {
      allocations.push({
        documentType: doc.documentType,
        documentId: doc.id,
        documentNumber: doc.documentNumber,
        amount: fromPaise(allocAmtPaise),
        date: doc.date,
      });
      remainingPaise -= allocAmtPaise;
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
  let sumAllocatedPaise = 0;
  const docMap = new Map<string, OutstandingDocument>();
  documents.forEach((d) => docMap.set(d.id, d));

  const normPartyName = partyName?.trim().toLowerCase();

  for (const alloc of allocations) {
    const docLabel = alloc.documentId?.startsWith('OPENING-BALANCE-')
      ? (alloc.documentNumber || 'Opening Balance')
      : `#${alloc.documentNumber || alloc.documentId}`;

    // 1. Reject duplicate document IDs
    if (seenIds.has(alloc.documentId)) {
      return {
        valid: false,
        error: `Duplicate document allocation detected for ${docLabel}.`,
      };
    }
    seenIds.add(alloc.documentId);

    // 2. Reject non-positive allocation amounts
    if (typeof alloc.amount !== 'number' || alloc.amount <= 0 || toPaise(alloc.amount) <= 0) {
      return {
        valid: false,
        error: `Allocation amount for ${docLabel} must be greater than zero.`,
      };
    }

    const allocAmtPaise = toPaise(alloc.amount);
    sumAllocatedPaise += allocAmtPaise;

    // 3. Match against outstanding documents
    const doc = docMap.get(alloc.documentId);
    if (!doc) {
      return {
        valid: false,
        error: `Document ${docLabel} is not in the list of outstanding documents.`,
      };
    }

    // 3b. Reject document type mismatch
    if (doc.documentType !== alloc.documentType) {
      return {
        valid: false,
        error: `Document type mismatch for ${docLabel}: expected ${doc.documentType}, got ${alloc.documentType}.`,
      };
    }

    // 4. Reject allocations for a different party
    if (partyId && doc.partyId && doc.partyId !== partyId) {
      return {
        valid: false,
        error: `Document ${docLabel} belongs to a different party.`,
      };
    }
    if (normPartyName && doc.partyName && doc.partyName.trim().toLowerCase() !== normPartyName) {
      return {
        valid: false,
        error: `Document ${docLabel} belongs to a different party (${doc.partyName}).`,
      };
    }

    // 5. Reject allocation above document's current balance (tolerance 0.01)
    const docBalPaise = toPaise(doc.balanceAmount);
    if (allocAmtPaise > docBalPaise + 1) {
      return {
        valid: false,
        error: `Allocation amount ₹${fromPaise(allocAmtPaise).toFixed(2)} exceeds balance ₹${fromPaise(docBalPaise).toFixed(2)} on ${docLabel}.`,
      };
    }
  }

  // 6. Reject allocated sum above totalSettled (tolerance 0.01)
  const totalSettledPaise = toPaise(totalSettled);
  if (sumAllocatedPaise > totalSettledPaise + 1) {
    return {
      valid: false,
      error: `Total allocated amount (₹${fromPaise(sumAllocatedPaise).toFixed(2)}) exceeds payment amount (₹${fromPaise(totalSettledPaise).toFixed(2)}).`,
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
    if (a.documentId?.startsWith('OPENING-BALANCE-')) {
      continue;
    }
    allocMap.set(a.documentId, (allocMap.get(a.documentId) || 0) + toPaise(a.amount));
  }

  if (allocMap.size === 0) {
    return documents;
  }

  const effectiveAllocMode: PaymentMode = (options?.paymentMode || 'CASH') as PaymentMode;

  return documents.map((doc) => {
    const allocAmtPaise = allocMap.get(doc.id);
    if (!allocAmtPaise || allocAmtPaise <= 0) {
      return doc;
    }

    const grandTotalPaise = toPaise(doc.grandTotal);
    const currentPaidPaise = typeof doc.paidAmount === 'number'
      ? toPaise(doc.paidAmount)
      : (doc.paymentStatus === 'PAID' ? grandTotalPaise : 0);
    const newPaidPaise = Math.min(grandTotalPaise, Math.max(0, currentPaidPaise + allocAmtPaise));
    const newBalPaise = Math.max(0, grandTotalPaise - newPaidPaise);
    const newStatus: 'PAID' | 'PARTIAL' | 'UNPAID' =
      newPaidPaise <= 0 ? 'UNPAID' : newBalPaise <= 1 ? 'PAID' : 'PARTIAL';

    const newPaid = fromPaise(newPaidPaise);
    const newBal = fromPaise(newBalPaise);

    // Maintain and synchronize splits to strictly match newPaid and newBal
    let updatedSplits: PaymentSplit[] | undefined = doc.paymentSplits ? [...doc.paymentSplits] : undefined;
    if (updatedSplits && updatedSplits.length > 0) {
      const nonCredit = updatedSplits.filter((s) => (s.mode || '').toUpperCase() !== 'CREDIT');
      const nonCreditTotalPaise = nonCredit.reduce((s, x) => s + toPaise(Number(x.amount) || 0), 0);
      const splitDiffPaise = newPaidPaise - nonCreditTotalPaise;
      if (splitDiffPaise > 0) {
        updatedSplits = nonCredit.map((s) => ({ ...s }));
        updatedSplits.push({
          id: `alloc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          mode: effectiveAllocMode,
          amount: fromPaise(splitDiffPaise),
        });
      } else if (splitDiffPaise < 0) {
        let remainingPaise = Math.abs(splitDiffPaise);
        const cnSplits = nonCredit.filter((s) => (s.mode || '').toUpperCase() === 'CREDIT_NOTE');
        const regularTenders = nonCredit.filter((s) => (s.mode || '').toUpperCase() !== 'CREDIT_NOTE');
        const adjustedRegular: PaymentSplit[] = [];
        for (let i = regularTenders.length - 1; i >= 0; i--) {
          const s = regularTenders[i];
          const sAmtPaise = toPaise(s.amount);
          if (remainingPaise <= 0) {
            adjustedRegular.unshift(s);
          } else if (sAmtPaise <= remainingPaise) {
            remainingPaise -= sAmtPaise;
          } else {
            adjustedRegular.unshift({ ...s, amount: fromPaise(sAmtPaise - remainingPaise) });
            remainingPaise = 0;
          }
        }
        const adjustedCn: PaymentSplit[] = [];
        for (let i = cnSplits.length - 1; i >= 0; i--) {
          const s = cnSplits[i];
          const sAmtPaise = toPaise(s.amount);
          if (remainingPaise <= 0) {
            adjustedCn.unshift(s);
          } else if (sAmtPaise <= remainingPaise) {
            remainingPaise -= sAmtPaise;
          } else {
            adjustedCn.unshift({ ...s, amount: fromPaise(sAmtPaise - remainingPaise) });
            remainingPaise = 0;
          }
        }
        updatedSplits = [...adjustedCn, ...adjustedRegular];
      } else {
        updatedSplits = nonCredit.map((s) => ({ ...s }));
      }
      if (newBalPaise > 0) {
        updatedSplits.push({
          id: `split-bal-${Date.now()}`,
          mode: 'CREDIT',
          amount: newBal,
        });
      }
    } else if (newPaidPaise > 0 && (doc.paymentSplits !== undefined || (doc.notes && (doc.notes.includes('Split Payment') || doc.notes.includes('Split:'))))) {
      // If splits or split notes were active, initialize explicit split breakdown
      updatedSplits = [
        {
          id: `alloc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          mode: doc.paymentMode && doc.paymentMode !== 'CREDIT' && doc.paymentMode !== 'SPLIT' ? doc.paymentMode : effectiveAllocMode,
          amount: newPaid,
        },
      ];
      if (newBalPaise > 0) {
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
        (s) => (s.mode || '').toUpperCase() !== 'CREDIT' && toPaise(Number(s.amount) || 0) > 0
      );
      if (newStatus === 'UNPAID' || activeNonCredit.length === 0) {
        newPaymentMode = 'CREDIT';
      } else if (activeNonCredit.length === 1 && newBalPaise <= 1) {
        newPaymentMode = activeNonCredit[0].mode as PaymentMode;
      } else {
        newPaymentMode = 'SPLIT';
      }
    } else {
      if (newStatus === 'UNPAID') {
        newPaymentMode = 'CREDIT';
      } else if (newBalPaise > 0) {
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
    if (a.documentId?.startsWith('OPENING-BALANCE-')) {
      continue;
    }
    allocMap.set(a.documentId, (allocMap.get(a.documentId) || 0) + toPaise(a.amount));
  }

  if (allocMap.size === 0) {
    return documents;
  }

  return documents.map((doc) => {
    const allocAmtPaise = allocMap.get(doc.id);
    if (!allocAmtPaise || allocAmtPaise <= 0) {
      return doc;
    }

    const grandTotalPaise = toPaise(doc.grandTotal);
    const currentPaidPaise = typeof doc.paidAmount === 'number'
      ? toPaise(doc.paidAmount)
      : (doc.paymentStatus === 'PAID' ? grandTotalPaise : 0);
    const newPaidPaise = Math.max(0, currentPaidPaise - allocAmtPaise);
    const newBalPaise = Math.max(0, grandTotalPaise - newPaidPaise);
    const newStatus: 'PAID' | 'PARTIAL' | 'UNPAID' =
      newPaidPaise <= 0 ? 'UNPAID' : newBalPaise <= 1 ? 'PAID' : 'PARTIAL';

    const newPaid = fromPaise(newPaidPaise);
    const newBal = fromPaise(newBalPaise);

    let updatedSplits = doc.paymentSplits ? [...doc.paymentSplits] : undefined;
    if (updatedSplits && updatedSplits.length > 0) {
      let remainingToReducePaise = allocAmtPaise;
      const nonCredit = updatedSplits.filter((s) => (s.mode || '').toUpperCase() !== 'CREDIT');
      const cnSplits = nonCredit.filter((s) => (s.mode || '').toUpperCase() === 'CREDIT_NOTE');
      const regularTenders = nonCredit.filter((s) => (s.mode || '').toUpperCase() !== 'CREDIT_NOTE');

      const newRegular: typeof regularTenders = [];
      for (let i = regularTenders.length - 1; i >= 0; i--) {
        const s = regularTenders[i];
        const sAmtPaise = toPaise(s.amount);
        if (remainingToReducePaise <= 0) {
          newRegular.unshift(s);
        } else if (sAmtPaise <= remainingToReducePaise) {
          remainingToReducePaise -= sAmtPaise;
        } else {
          newRegular.unshift({ ...s, amount: fromPaise(sAmtPaise - remainingToReducePaise) });
          remainingToReducePaise = 0;
        }
      }

      const newCn: typeof cnSplits = [];
      for (let i = cnSplits.length - 1; i >= 0; i--) {
        const s = cnSplits[i];
        const sAmtPaise = toPaise(s.amount);
        if (remainingToReducePaise <= 0) {
          newCn.unshift(s);
        } else if (sAmtPaise <= remainingToReducePaise) {
          remainingToReducePaise -= sAmtPaise;
        } else {
          newCn.unshift({ ...s, amount: fromPaise(sAmtPaise - remainingToReducePaise) });
          remainingToReducePaise = 0;
        }
      }

      const combined = [...newCn, ...newRegular];
      if (newBalPaise > 0) {
        combined.push({
          id: `split-bal-${Date.now()}`,
          mode: 'CREDIT',
          amount: newBal,
        });
      }
      updatedSplits = combined;
    }

    // Derive accurate paymentMode upon reversal
    let newPaymentMode: PaymentMode;
    if (updatedSplits && updatedSplits.length > 0) {
      const activeNonCredit = updatedSplits.filter(
        (s) => (s.mode || '').toUpperCase() !== 'CREDIT' && toPaise(Number(s.amount) || 0) > 0
      );
      if (newStatus === 'UNPAID' || activeNonCredit.length === 0) {
        newPaymentMode = 'CREDIT';
      } else if (activeNonCredit.length === 1 && newBalPaise <= 1) {
        newPaymentMode = activeNonCredit[0].mode as PaymentMode;
      } else {
        newPaymentMode = 'SPLIT';
      }
    } else {
      newPaymentMode = newStatus === 'UNPAID' ? 'CREDIT' : newBalPaise > 0 ? 'SPLIT' : (doc.paymentMode || 'CASH');
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
  existingRefundVoucher?: Voucher;
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
    (s) => (s.mode || '').toUpperCase() !== 'CREDIT' && toPaise(Number(s.amount) || 0) > 0
  );
  const nonCreditTotalPaise = nonCreditSplits.reduce(
    (sum, s) => sum + toPaise(Number(s.amount) || 0),
    0
  );
  const intendedAmountPaise = toPaise(intendedAmount);

  if (nonCreditSplits.length > 0 && Math.abs(nonCreditTotalPaise - intendedAmountPaise) <= 1) {
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

  const existingRefundVoucher = isSpecialDocument
    ? vouchers.find(
        (v) =>
          !v.isCancelled &&
          !v.isReversed &&
          v.voucherType === 'PAYMENT' &&
          v.allocationMode === 'SOURCE_DOCUMENT' &&
          v.sourceDocumentId === newInvoice.id
      )
    : undefined;

  const newInvoicePaidPaise = Math.max(0, toPaise(Number(newInvoice.paidAmount) || 0));
  const newInvoicePaid = fromPaise(newInvoicePaidPaise);
  const isOrderOrEstimate =
    newInvoice.invoiceType === 'ESTIMATE' ||
    newInvoice.invoiceType === 'SALES_ORDER' ||
    newInvoice.invoiceType === 'DELIVERY_CHALLAN';
  const isCredit = newInvoice.paymentMode === 'CREDIT';
  const isUnpaidOrCancelled =
    isSpecialDocument || isOrderOrEstimate || newInvoice.isCancelled || newInvoicePaidPaise <= 0 || isCredit;

  if (isNew) {
    return {
      valid: true,
      isNew: true,
      existingSourceVoucher: undefined,
      existingRefundVoucher: isSpecialDocument ? vouchers.find(
        (v) =>
          !v.isCancelled &&
          !v.isReversed &&
          v.voucherType === 'PAYMENT' &&
          v.allocationMode === 'SOURCE_DOCUMENT' &&
          v.sourceDocumentId === newInvoice.id
      ) : undefined,
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
      v.paymentAllocations?.some((a) => (a.documentType === 'INVOICE' || a.documentType === 'CREDIT_NOTE') && a.documentId === newInvoice.id)
  );

  // Check if grand total is less than total amount allocated to this invoice across all active linked vouchers
  const allActiveLinked = vouchers.filter(
    (v) =>
      !v.isCancelled &&
      !v.isReversed &&
      v.paymentAllocations?.some((a) => (a.documentType === 'INVOICE' || a.documentType === 'CREDIT_NOTE') && a.documentId === newInvoice.id)
  );
  const totalAllocatedToInvoicePaise = allActiveLinked.reduce((sum, v) => {
    const vAllocSumPaise = (v.paymentAllocations || [])
      .filter((x) => (x.documentType === 'INVOICE' || x.documentType === 'CREDIT_NOTE') && x.documentId === newInvoice.id)
      .reduce((aSum, a) => aSum + toPaise(Number(a.amount) || 0), 0);
    return sum + vAllocSumPaise;
  }, 0);
  const totalAllocatedToInvoice = fromPaise(totalAllocatedToInvoicePaise);
  const grandTotalPaise = toPaise(newInvoice.grandTotal);

  if (grandTotalPaise < totalAllocatedToInvoicePaise - 1) {
    return {
      valid: false,
      error: `Cannot reduce invoice grand total (₹${fromPaise(grandTotalPaise).toFixed(2)}) below total linked payment allocations (₹${totalAllocatedToInvoice.toFixed(2)}). Unlink or adjust payments first.`,
      isNew: false,
      existingSourceVoucher,
      existingRefundVoucher,
      otherActiveLinked,
      otherAllocatedTotal: totalAllocatedToInvoice,
      targetSourceAmount: 0,
    };
  }

  const otherAllocatedTotalPaise = otherActiveLinked.reduce((sum, v) => {
    const vAllocSumPaise = (v.paymentAllocations || [])
      .filter((x) => (x.documentType === 'INVOICE' || x.documentType === 'CREDIT_NOTE') && x.documentId === newInvoice.id)
      .reduce((aSum, a) => aSum + toPaise(Number(a.amount) || 0), 0);
    return sum + vAllocSumPaise;
  }, 0);
  const otherAllocatedTotal = fromPaise(otherAllocatedTotalPaise);

  if (newInvoicePaidPaise < otherAllocatedTotalPaise) {
    return {
      valid: false,
      error: `Cannot reduce paid amount below ₹${otherAllocatedTotal.toFixed(2)}: active party payment vouchers cover that amount. Reverse or edit those payments first.`,
      isNew: false,
      existingSourceVoucher,
      existingRefundVoucher,
      otherActiveLinked,
      otherAllocatedTotal,
      targetSourceAmount: 0,
    };
  }

  const targetSourceAmount = (isSpecialDocument || isUnpaidOrCancelled || newInvoicePaidPaise <= otherAllocatedTotalPaise)
    ? 0
    : fromPaise(newInvoicePaidPaise - otherAllocatedTotalPaise);

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
    existingRefundVoucher,
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

  const newBillPaidPaise = Math.max(0, toPaise(Number(newBill.paidAmount) || 0));
  const newBillPaid = fromPaise(newBillPaidPaise);
  const isPurchaseOrder = newBill.purchaseType === 'PO';
  const isPurchaseChallan = newBill.purchaseType === 'CHALLAN';
  const isPurCredit = newBill.paymentMode === 'CREDIT';
  const isPurUnpaidOrCancelled =
    isPurchaseReturn || isPurchaseOrder || isPurchaseChallan || newBill.isCancelled || newBillPaidPaise <= 0 || isPurCredit;

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

  const otherAllocatedTotalPaise = otherActiveLinked.reduce((sum, v) => {
    const vAllocSumPaise = (v.paymentAllocations || [])
      .filter((x) => x.documentType === 'PURCHASE' && x.documentId === newBill.id)
      .reduce((aSum, a) => aSum + toPaise(Number(a.amount) || 0), 0);
    return sum + vAllocSumPaise;
  }, 0);
  const otherAllocatedTotal = fromPaise(otherAllocatedTotalPaise);

  if (newBillPaidPaise < otherAllocatedTotalPaise) {
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

  const targetSourceAmount = (isPurchaseReturn || isPurUnpaidOrCancelled || newBillPaidPaise <= otherAllocatedTotalPaise)
    ? 0
    : fromPaise(newBillPaidPaise - otherAllocatedTotalPaise);

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
