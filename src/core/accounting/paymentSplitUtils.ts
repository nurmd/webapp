import type { Invoice, PaymentMode, PaymentStatus, PaymentSplit } from '../../models/invoice.ts';
import type { PurchaseBill } from '../../models/purchase.ts';

export interface SplitNotesAccountOptions {
  cashAccountId?: string;
  cashAccountName?: string;
  bankAccountId?: string;
  bankAccountName?: string;
}

/**
 * Extracts and reconstructs structured payment splits from human-readable notes.
 * Supports patterns like "Split Payment — Cash ₹500, UPI ₹500" or "Split: Cash ₹500, ...".
 */
export function parseSplitsFromNotes(
  notes: string | undefined | null,
  options?: SplitNotesAccountOptions
): PaymentSplit[] {
  if (!notes || (!notes.includes('Split Payment') && !notes.includes('Split:'))) {
    return [];
  }

  const parsed: PaymentSplit[] = [];
  const cashMatch = notes.match(/Cash[:\s]*₹\s*([0-9.]+)/i);
  const upiMatch = notes.match(/UPI[:\s]*₹\s*([0-9.]+)/i);
  const cardMatch = notes.match(/Card[:\s]*₹\s*([0-9.]+)/i);
  const bankMatch = notes.match(/(?:Bank|Net\s*Banking)[:\s]*₹\s*([0-9.]+)/i);
  const chequeMatch = notes.match(/Cheque[:\s]*₹\s*([0-9.]+)/i);
  const creditMatch = notes.match(/Credit[:\s]*₹\s*([0-9.]+)/i);

  if (cashMatch && Number(cashMatch[1]) > 0) {
    parsed.push({
      id: `split-cash-${Date.now()}`,
      mode: 'CASH',
      amount: Number(cashMatch[1]),
      ...(options?.cashAccountId ? { accountId: options.cashAccountId } : {}),
      ...(options?.cashAccountName ? { accountName: options.cashAccountName } : {}),
    });
  }
  if (upiMatch && Number(upiMatch[1]) > 0) {
    parsed.push({
      id: `split-upi-${Date.now()}`,
      mode: 'UPI',
      amount: Number(upiMatch[1]),
      ...(options?.bankAccountId ? { accountId: options.bankAccountId } : {}),
      ...(options?.bankAccountName ? { accountName: options.bankAccountName } : {}),
    });
  }
  if (cardMatch && Number(cardMatch[1]) > 0) {
    parsed.push({
      id: `split-card-${Date.now()}`,
      mode: 'CARD',
      amount: Number(cardMatch[1]),
      ...(options?.bankAccountId ? { accountId: options.bankAccountId } : {}),
      ...(options?.bankAccountName ? { accountName: options.bankAccountName } : {}),
    });
  }
  if (bankMatch && Number(bankMatch[1]) > 0) {
    parsed.push({
      id: `split-bank-${Date.now()}`,
      mode: 'NET_BANKING',
      amount: Number(bankMatch[1]),
      ...(options?.bankAccountId ? { accountId: options.bankAccountId } : {}),
      ...(options?.bankAccountName ? { accountName: options.bankAccountName } : {}),
    });
  }
  if (chequeMatch && Number(chequeMatch[1]) > 0) {
    parsed.push({
      id: `split-cheque-${Date.now()}`,
      mode: 'CHEQUE',
      amount: Number(chequeMatch[1]),
      ...(options?.bankAccountId ? { accountId: options.bankAccountId } : {}),
      ...(options?.bankAccountName ? { accountName: options.bankAccountName } : {}),
    });
  }
  if (creditMatch && Number(creditMatch[1]) > 0) {
    parsed.push({ id: `split-credit-${Date.now()}`, mode: 'CREDIT', amount: Number(creditMatch[1]) });
  }

  return parsed;
}

/**
 * Extracts and reconstructs structured payment splits from an Invoice.
 * Preserves accountId, accountName, reference, and referenceNo.
 */
export function parseSplitsFromInvoice(
  inv: Invoice | null | undefined,
  currentGrandTotal: number
): PaymentSplit[] {
  if (!inv) {
    return [{ id: '1', mode: 'CASH', amount: currentGrandTotal }];
  }

  // 1. Explicit array
  if (inv.paymentSplits && inv.paymentSplits.length > 0) {
    return inv.paymentSplits.map((s, idx) => ({
      id: s.id || `split-${idx}-${Date.now()}`,
      mode: s.mode,
      amount: Number(s.amount) || 0,
      accountId: s.accountId,
      accountName: s.accountName,
      reference: s.reference,
      referenceNo: s.referenceNo,
    }));
  }

  // 2. Parse from notes (e.g. "Split Payment — Cash ₹500, UPI ₹500" or "Split: Cash ₹500, ...")
  if (inv.notes) {
    const fromNotes = parseSplitsFromNotes(inv.notes, {
      cashAccountId: (inv as any).cashAccountId,
      cashAccountName: (inv as any).cashAccountName,
      bankAccountId: (inv as any).bankAccountId,
      bankAccountName: (inv as any).bankAccountName,
    });
    if (fromNotes.length > 0) {
      return fromNotes;
    }
  }

  // 3. Partial invoice (with non-zero paid amount and non-zero balance)
  const paid = typeof inv.paidAmount === 'number' ? inv.paidAmount : 0;
  const balance = typeof inv.balanceAmount === 'number' ? inv.balanceAmount : Math.max(0, inv.grandTotal - paid);

  if (inv.paymentStatus === 'PARTIAL' || (paid > 0 && balance > 0)) {
    const paidMode: PaymentMode =
      inv.paymentMode === 'CREDIT' || inv.paymentMode === 'SPLIT' ? 'CASH' : inv.paymentMode || 'CASH';
    const isCash = paidMode === 'CASH';
    const targetAccountId = isCash ? (inv as any).cashAccountId : (inv as any).bankAccountId;
    const targetAccountName = isCash ? (inv as any).cashAccountName : (inv as any).bankAccountName;
    return [
      {
        id: '1',
        mode: paidMode,
        amount: paid,
        ...(targetAccountId ? { accountId: targetAccountId } : {}),
        ...(targetAccountName ? { accountName: targetAccountName } : {}),
      },
      { id: '2', mode: 'CREDIT', amount: balance },
    ];
  }

  // 4. Unpaid / Credit
  if (inv.paymentStatus === 'UNPAID' || inv.paymentMode === 'CREDIT') {
    return [{ id: '1', mode: 'CREDIT', amount: 0 }];
  }

  // 5. Normal single mode
  const singleMode: PaymentMode = inv.paymentMode === 'SPLIT' ? 'CASH' : inv.paymentMode || 'CASH';
  const isCash = singleMode === 'CASH';
  const targetAccountId = isCash ? (inv as any).cashAccountId : (inv as any).bankAccountId;
  const targetAccountName = isCash ? (inv as any).cashAccountName : (inv as any).bankAccountName;
  return [
    {
      id: '1',
      mode: singleMode,
      amount: paid > 0 ? paid : currentGrandTotal,
      ...(targetAccountId ? { accountId: targetAccountId } : {}),
      ...(targetAccountName ? { accountName: targetAccountName } : {}),
    },
  ];
}

/**
 * Extracts and reconstructs structured payment splits from a PurchaseBill.
 * Preserves accountId, accountName, reference, and referenceNo.
 */
export function parseSplitsFromPurchase(
  bill: PurchaseBill | null | undefined,
  currentGrandTotal: number
): PaymentSplit[] {
  if (!bill) {
    return [{ id: '1', mode: 'NET_BANKING', amount: currentGrandTotal }];
  }

  // 1. Explicit array
  if (bill.paymentSplits && bill.paymentSplits.length > 0) {
    return bill.paymentSplits.map((s, idx) => ({
      id: s.id || `split-${idx}-${Date.now()}`,
      mode: s.mode,
      amount: Number(s.amount) || 0,
      accountId: s.accountId,
      accountName: s.accountName,
      reference: s.reference,
      referenceNo: s.referenceNo,
    }));
  }

  // 2. Parse from notes
  if (bill.notes) {
    const fromNotes = parseSplitsFromNotes(bill.notes, {
      cashAccountId: (bill as any).cashAccountId,
      cashAccountName: (bill as any).cashAccountName,
      bankAccountId: (bill as any).bankAccountId,
      bankAccountName: (bill as any).bankAccountName,
    });
    if (fromNotes.length > 0) {
      return fromNotes;
    }
  }

  // 3. Partial bill
  const paid = typeof bill.paidAmount === 'number' ? bill.paidAmount : 0;
  const balance = typeof bill.balanceAmount === 'number' ? bill.balanceAmount : Math.max(0, bill.grandTotal - paid);

  if (bill.paymentStatus === 'PARTIAL' || (paid > 0 && balance > 0)) {
    const paidMode: PaymentMode =
      bill.paymentMode === 'CREDIT' || bill.paymentMode === 'SPLIT' ? 'NET_BANKING' : bill.paymentMode || 'NET_BANKING';
    const isCash = paidMode === 'CASH';
    const targetAccountId = isCash ? (bill as any).cashAccountId : (bill as any).bankAccountId;
    const targetAccountName = isCash ? (bill as any).cashAccountName : (bill as any).bankAccountName;
    return [
      {
        id: '1',
        mode: paidMode,
        amount: paid,
        ...(targetAccountId ? { accountId: targetAccountId } : {}),
        ...(targetAccountName ? { accountName: targetAccountName } : {}),
      },
      { id: '2', mode: 'CREDIT', amount: balance },
    ];
  }

  // 4. Unpaid / Credit
  if (bill.paymentStatus === 'UNPAID' || bill.paymentMode === 'CREDIT') {
    return [{ id: '1', mode: 'CREDIT', amount: 0 }];
  }

  // 5. Normal single mode
  const singleMode: PaymentMode = bill.paymentMode === 'SPLIT' ? 'NET_BANKING' : bill.paymentMode || 'NET_BANKING';
  const isCash = singleMode === 'CASH';
  const targetAccountId = isCash ? (bill as any).cashAccountId : (bill as any).bankAccountId;
  const targetAccountName = isCash ? (bill as any).cashAccountName : (bill as any).bankAccountName;
  return [
    {
      id: '1',
      mode: singleMode,
      amount: paid > 0 ? paid : currentGrandTotal,
      ...(targetAccountId ? { accountId: targetAccountId } : {}),
      ...(targetAccountName ? { accountName: targetAccountName } : {}),
    },
  ];
}

/**
 * Creates human-readable notes detailing the split breakdown.
 */
export function formatSplitNotes(splits: PaymentSplit[], balanceDue: number): string {
  const parts: string[] = [];
  splits.forEach((s) => {
    if (s.mode !== 'CREDIT' && (Number(s.amount) || 0) > 0) {
      const label = s.mode === 'NET_BANKING' ? 'Bank' : s.mode.charAt(0) + s.mode.slice(1).toLowerCase();
      parts.push(`${label} ₹${s.amount}`);
    }
  });
  if (balanceDue > 0) {
    parts.push(`Credit ₹${balanceDue.toFixed(2)}`);
  }
  return parts.length > 0 ? `Split Payment — ${parts.join(', ')}` : '';
}

export interface DerivedPaymentSettlement {
  paidAmount: number;
  balanceAmount: number;
  paymentStatus: PaymentStatus;
  paymentMode: PaymentMode;
  paymentSplits?: PaymentSplit[];
  notes?: string;
}

/**
 * Centralized payment status derivation for Invoices and Purchase Bills.
 * Invariants:
 * - PAID when totalPaid >= grandTotal
 * - PARTIAL when 0 < totalPaid < grandTotal
 * - UNPAID when totalPaid <= 0, including CREDIT-only
 * - Clamps overpayment so paidAmount never exceeds grandTotal
 * - BalanceAmount is strictly grandTotal - paidAmount
 * - Never trusts a caller-supplied CASH status on an unpaid/partial document
 * - Preserves split breakdown in paymentSplits and notes for audit
 */
export function derivePaymentSettlement(doc: {
  grandTotal: number;
  paymentMode?: PaymentMode;
  paymentStatus?: PaymentStatus;
  paidAmount?: number;
  balanceAmount?: number;
  paymentSplits?: PaymentSplit[];
  notes?: string;
  bankAccountId?: string;
  bankAccountName?: string;
}): DerivedPaymentSettlement {
  const grandTotal = Number(Math.max(0, doc.grandTotal || 0).toFixed(2));

  // 1. Calculate raw total paid from explicit payment splits if present
  let rawPaid: number;
  let splits = doc.paymentSplits && doc.paymentSplits.length > 0
    ? doc.paymentSplits.map((s) => ({ ...s }))
    : undefined;

  // If no structured splits, but notes contain split breakdown, parse them
  if ((!splits || splits.length === 0) && doc.notes) {
    const fromNotes = parseSplitsFromNotes(doc.notes, {
      bankAccountId: doc.bankAccountId,
      bankAccountName: doc.bankAccountName,
    });
    if (fromNotes.length > 0) {
      splits = fromNotes;
    }
  }

  if (splits && splits.length > 0) {
    const nonCreditSplits = splits.filter((s) => (s.mode || '').toUpperCase() !== 'CREDIT');
    rawPaid = nonCreditSplits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  } else {
    const modeUpper = (doc.paymentMode || '').toUpperCase();
    if (typeof doc.paidAmount === 'number' && doc.paidAmount > 0) {
      rawPaid = doc.paidAmount;
    } else if (doc.paymentStatus === 'UNPAID' || (modeUpper === 'CREDIT' && doc.paymentStatus !== 'PARTIAL')) {
      rawPaid = 0;
    } else if (typeof doc.paidAmount === 'number') {
      rawPaid = doc.paidAmount;
    } else if (doc.paymentStatus === 'PAID') {
      rawPaid = grandTotal;
    } else if (typeof doc.balanceAmount === 'number') {
      rawPaid = Math.max(0, grandTotal - doc.balanceAmount);
    } else {
      rawPaid = grandTotal;
    }
  }

  // 2. Strict mathematical invariants:
  // Clamp overpayment: paid cannot exceed grandTotal; balance is grandTotal - paid
  const paidAmount = Number(Math.min(grandTotal, Math.max(0, rawPaid)).toFixed(2));
  const balanceAmount = Number(Math.max(0, grandTotal - paidAmount).toFixed(2));

  // 3. Centralized Payment Status:
  // - PAID when totalPaid >= grandTotal
  // - PARTIAL when 0 < totalPaid < grandTotal
  // - UNPAID when totalPaid <= 0, including CREDIT-only
  let paymentStatus: PaymentStatus;
  if (grandTotal <= 0) {
    paymentStatus = 'PAID';
  } else if (paidAmount >= grandTotal) {
    paymentStatus = 'PAID';
  } else if (paidAmount > 0) {
    paymentStatus = 'PARTIAL';
  } else {
    paymentStatus = 'UNPAID';
  }

  // 4. Centralized Payment Mode:
  let paymentMode: PaymentMode;
  if (splits && splits.length > 0) {
    const activeNonCredit = splits.filter(
      (s) => (s.mode || '').toUpperCase() !== 'CREDIT' && (Number(s.amount) || 0) > 0
    );
    if (paymentStatus === 'UNPAID' || activeNonCredit.length === 0) {
      paymentMode = 'CREDIT';
    } else if (activeNonCredit.length === 1 && balanceAmount <= 0.01) {
      paymentMode = activeNonCredit[0].mode;
    } else {
      paymentMode = 'SPLIT';
    }

    // Normalize splits amounts to match clamped paidAmount and balanceAmount
    let remainingPaidToAllocate = paidAmount;
    splits = splits.map((s) => {
      if ((s.mode || '').toUpperCase() === 'CREDIT') {
        return { ...s, amount: balanceAmount };
      }
      const sAmt = Number(s.amount) || 0;
      const allocated = Math.min(sAmt, remainingPaidToAllocate);
      remainingPaidToAllocate = Number((remainingPaidToAllocate - allocated).toFixed(2));
      return {
        ...s,
        amount: Number(allocated.toFixed(2)),
      };
    });

    // Ensure credit split is present if balanceAmount > 0
    if (balanceAmount > 0 && !splits.some((s) => (s.mode || '').toUpperCase() === 'CREDIT')) {
      splits.push({
        id: `split-bal-${Date.now()}`,
        mode: 'CREDIT',
        amount: balanceAmount,
      });
    }
  } else {
    if (paymentStatus === 'UNPAID') {
      paymentMode = 'CREDIT';
    } else if (balanceAmount > 0 && paidAmount > 0) {
      paymentMode = doc.paymentMode === 'CREDIT' ? 'SPLIT' : doc.paymentMode || 'SPLIT';
    } else {
      paymentMode = doc.paymentMode && doc.paymentMode !== 'CREDIT' ? doc.paymentMode : 'CASH';
    }

    if (paidAmount > 0) {
      const isCash = paymentMode === 'CASH';
      const mainSplit: PaymentSplit = {
        id: 'split-1',
        mode: paymentMode === 'SPLIT' ? 'CASH' : paymentMode,
        amount: paidAmount,
        accountId: isCash ? 'ACC_CASH' : doc.bankAccountId,
        accountName: isCash ? 'Cash-in-hand' : doc.bankAccountName,
      };
      splits = [mainSplit];
      if (balanceAmount > 0) {
        splits.push({
          id: `split-bal-${Date.now()}`,
          mode: 'CREDIT',
          amount: balanceAmount,
        });
      }
    }
  }

  // 5. Notes formatting for audit trail
  let notes = doc.notes;
  if (splits && splits.length > 0 && (doc.paymentSplits || splits.length > 1 || notes?.includes('Split Payment'))) {
    const splitNote = formatSplitNotes(splits, balanceAmount);
    if (splitNote && (!notes || !notes.includes('Split Payment'))) {
      notes = notes ? `${notes} | ${splitNote}` : splitNote;
    }
  }

  return {
    paidAmount,
    balanceAmount,
    paymentStatus,
    paymentMode,
    paymentSplits: splits,
    notes,
  };
}
