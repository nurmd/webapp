import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Party } from '../../../models/party.ts';
import { Invoice } from '../../../models/invoice.ts';
import { PurchaseBill } from '../../../models/purchase.ts';
import { PassbookEntry } from '../usePartyPassbook.ts';
import { PaymentAllocation } from '../../../core/accounting/voucherTypes.ts';
import {
  getOutstandingDocuments,
  allocateOldestFirst,
  reverseAllocations,
  OutstandingDocument,
} from '../../../core/accounting/paymentAllocation.ts';
import {
  useParties,
  useInvoices,
  usePurchases,
} from '../../../core/store/useDataStore.ts';

export interface UseVoucherAllocationsOptions {
  editingLedgerEntry: PassbookEntry | null;
  party: Party;
  editType: 'IN' | 'OUT';
  totalSettled: number;
  invoices?: Invoice[];
  purchases?: PurchaseBill[];
  parties?: Party[];
}

export function useVoucherAllocations({
  editingLedgerEntry,
  party,
  editType,
  totalSettled,
  invoices,
  purchases,
  parties,
}: UseVoucherAllocationsOptions) {
  const storeParties = useParties();
  const storeInvoices = useInvoices();
  const storePurchases = usePurchases();

  const isPayment = Boolean(
    editingLedgerEntry &&
      !editingLedgerEntry.isOpening &&
      (editingLedgerEntry.type === 'PAYMENT_IN' ||
        editingLedgerEntry.type === 'PAYMENT_OUT' ||
        editingLedgerEntry.rawVoucher ||
        editingLedgerEntry.id.startsWith('pay-inv-') ||
        editingLedgerEntry.id.startsWith('pay-pur-') ||
        editingLedgerEntry.id.startsWith('pay-'))
  );

  const [allocationsMap, setAllocationsMap] = useState<Record<string, number>>({});
  const [allocationModeState, setAllocationModeState] = useState<'MANUAL' | 'AUTO_FIFO' | 'UNALLOCATED' | 'SOURCE_DOCUMENT'>('UNALLOCATED');
  const [isManualAllocation, setIsManualAllocation] = useState<boolean>(false);

  const resetAllocations = useCallback(() => {
    if (!editingLedgerEntry) {
      setAllocationsMap({});
      setAllocationModeState('UNALLOCATED');
      setIsManualAllocation(false);
      return;
    }
    if (editingLedgerEntry.rawVoucher) {
      const v = editingLedgerEntry.rawVoucher;
      const initialMap: Record<string, number> = {};
      if (v.paymentAllocations && v.paymentAllocations.length > 0) {
        for (const alloc of v.paymentAllocations) {
          if (typeof alloc.amount === 'number' && alloc.amount > 0) {
            initialMap[alloc.documentId] = alloc.amount;
          }
        }
      }
      setAllocationsMap(initialMap);
      setAllocationModeState(v.allocationMode || (v.paymentAllocations?.length ? 'MANUAL' : 'UNALLOCATED'));
      setIsManualAllocation(v.allocationMode === 'MANUAL');
    } else {
      setAllocationsMap({});
      setAllocationModeState('UNALLOCATED');
      setIsManualAllocation(false);
    }
  }, [editingLedgerEntry]);

  useEffect(() => {
    resetAllocations();
  }, [resetAllocations]);

  const prevEditTypeRef = useRef(editType);
  useEffect(() => {
    if (prevEditTypeRef.current !== editType) {
      prevEditTypeRef.current = editType;
      setAllocationsMap({});
      setAllocationModeState('UNALLOCATED');
      setIsManualAllocation(false);
    }
  }, [editType]);

  const resolvedParties = useMemo(() => {
    const list = parties && parties.length > 0 ? [...parties] : storeParties;
    if (party && !list.some((p) => p.id === party.id)) {
      list.push(party);
    }
    return list;
  }, [parties, party, storeParties]);

  const rawVoucherAllocations = useMemo(() => {
    return editingLedgerEntry?.rawVoucher?.paymentAllocations || [];
  }, [editingLedgerEntry?.rawVoucher?.paymentAllocations]);

  const effectiveInvoices = useMemo(() => {
    const allInvs = invoices && invoices.length > 0 ? invoices : storeInvoices;
    if (
      editingLedgerEntry?.rawVoucher &&
      !editingLedgerEntry.rawVoucher.isReversed &&
      !editingLedgerEntry.rawVoucher.isCancelled
    ) {
      const invAllocs = rawVoucherAllocations.filter((a) => a.documentType === 'INVOICE');
      if (invAllocs.length > 0) {
        return reverseAllocations(allInvs, invAllocs);
      }
    }
    return allInvs;
  }, [invoices, editingLedgerEntry?.rawVoucher, rawVoucherAllocations, storeInvoices]);

  const effectivePurchases = useMemo(() => {
    const allPurs = purchases && purchases.length > 0 ? purchases : storePurchases;
    if (
      editingLedgerEntry?.rawVoucher &&
      !editingLedgerEntry.rawVoucher.isReversed &&
      !editingLedgerEntry.rawVoucher.isCancelled
    ) {
      const purAllocs = rawVoucherAllocations.filter((a) => a.documentType === 'PURCHASE');
      if (purAllocs.length > 0) {
        return reverseAllocations(allPurs, purAllocs);
      }
    }
    return allPurs;
  }, [purchases, editingLedgerEntry?.rawVoucher, rawVoucherAllocations, storePurchases]);

  const outstandingDocs: OutstandingDocument[] = useMemo(() => {
    if (!isPayment || !party) return [];
    const targetDocType = editType === 'IN' ? 'INVOICE' : 'PURCHASE';
    const docs = getOutstandingDocuments({
      partyId: party.id,
      partyName: party.name,
      documentType: targetDocType,
      invoices: effectiveInvoices,
      purchases: effectivePurchases,
      parties: resolvedParties,
    });

    if (editingLedgerEntry?.rawVoucher?.paymentAllocations) {
      for (const alloc of editingLedgerEntry.rawVoucher.paymentAllocations) {
        if (alloc.documentType !== targetDocType) continue;
        if (!docs.some((d) => d.id === alloc.documentId)) {
          docs.push({
            id: alloc.documentId,
            documentNumber: alloc.documentNumber,
            number: alloc.documentNumber,
            date: alloc.date || editingLedgerEntry.rawVoucher.date,
            grandTotal: alloc.amount,
            paidAmount: 0,
            balanceAmount: alloc.amount,
            documentType: alloc.documentType,
            partyId: party.id,
            partyName: party.name,
          });
        }
      }
    }

    return docs;
  }, [
    isPayment,
    party,
    editType,
    effectiveInvoices,
    effectivePurchases,
    resolvedParties,
    editingLedgerEntry?.rawVoucher,
  ]);

  const totalAllocated = useMemo(() => {
    let sum = 0;
    for (const val of Object.values(allocationsMap)) {
      sum += Number(val) || 0;
    }
    return Number(sum.toFixed(2));
  }, [allocationsMap]);

  const unallocatedAmount = useMemo(() => {
    return Math.max(0, Number((totalSettled - totalAllocated).toFixed(2)));
  }, [totalSettled, totalAllocated]);

  const isOverAllocated = totalAllocated > totalSettled + 0.01;

  const isAnyDocOverAllocated = useMemo(() => {
    return outstandingDocs.some((doc) => {
      const val = allocationsMap[doc.id] || 0;
      return val > doc.balanceAmount + 0.01;
    });
  }, [outstandingDocs, allocationsMap]);

  const isSubmitDisabled = isOverAllocated || isAnyDocOverAllocated;

  const handleAutoAllocate = useCallback(() => {
    if (totalSettled <= 0) return;
    const auto = allocateOldestFirst(outstandingDocs, totalSettled);
    const map: Record<string, number> = {};
    for (const a of auto) {
      map[a.documentId] = a.amount;
    }
    setAllocationsMap(map);
    setIsManualAllocation(false);
    setAllocationModeState('AUTO_FIFO');
  }, [outstandingDocs, totalSettled]);

  const handleSelectAll = useCallback(() => {
    let remaining = totalSettled;
    const map: Record<string, number> = {};
    for (const doc of outstandingDocs) {
      if (remaining <= 0) break;
      const allocAmt = Math.min(doc.balanceAmount, remaining);
      map[doc.id] = Number(allocAmt.toFixed(2));
      remaining = Number((remaining - allocAmt).toFixed(2));
    }
    setAllocationsMap(map);
    setIsManualAllocation(true);
    setAllocationModeState('MANUAL');
  }, [outstandingDocs, totalSettled]);

  const handleClearAllocations = useCallback(() => {
    setAllocationsMap({});
    setIsManualAllocation(true);
    setAllocationModeState('UNALLOCATED');
  }, []);

  const handleToggleDoc = useCallback((doc: OutstandingDocument) => {
    const currentAlloc = allocationsMap[doc.id] || 0;
    if (currentAlloc > 0) {
      setAllocationsMap((prev) => {
        const next = { ...prev };
        delete next[doc.id];
        return next;
      });
      setIsManualAllocation(true);
      setAllocationModeState('MANUAL');
    } else {
      const alreadyAllocated = Object.entries(allocationsMap).reduce(
        (sum, [id, val]) => (id === doc.id ? sum : sum + (Number(val) || 0)),
        0
      );
      const remaining = Math.max(0, Number((totalSettled - alreadyAllocated).toFixed(2)));
      if (remaining <= 0) {
        alert('All payment funds have already been allocated. Increase payment amount or reduce other allocations first.');
        return;
      }
      const allocAmt = Math.min(doc.balanceAmount, remaining);
      setAllocationsMap((prev) => ({
        ...prev,
        [doc.id]: Number(allocAmt.toFixed(2)),
      }));
      setIsManualAllocation(true);
      setAllocationModeState('MANUAL');
    }
  }, [allocationsMap, totalSettled]);

  const handleAllocationValueChange = useCallback((docId: string, valStr: string) => {
    const rawVal = parseFloat(valStr);
    const targetDoc = outstandingDocs.find((d) => d.id === docId);
    const maxDocBal = targetDoc ? targetDoc.balanceAmount : undefined;

    let val = isNaN(rawVal) ? 0 : rawVal;
    if (maxDocBal !== undefined && val > maxDocBal) {
      val = maxDocBal;
    }

    setAllocationsMap((prev) => {
      const next = { ...prev };
      if (!valStr || val <= 0) {
        delete next[docId];
      } else {
        next[docId] = Number(val.toFixed(2));
      }
      return next;
    });
    setIsManualAllocation(true);
    setAllocationModeState('MANUAL');
  }, [outstandingDocs]);

  return {
    allocationsMap,
    setAllocationsMap,
    allocationModeState,
    setAllocationModeState,
    isManualAllocation,
    setIsManualAllocation,
    resolvedParties,
    rawVoucherAllocations,
    effectiveInvoices,
    effectivePurchases,
    outstandingDocs,
    totalAllocated,
    unallocatedAmount,
    isOverAllocated,
    isAnyDocOverAllocated,
    isSubmitDisabled,
    handleAutoAllocate,
    handleSelectAll,
    handleClearAllocations,
    handleToggleDoc,
    handleAllocationValueChange,
    resetAllocations,
  };
}
