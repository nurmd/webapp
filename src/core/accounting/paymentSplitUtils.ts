import type { Invoice, PaymentMode, PaymentStatus, PaymentSplit } from '../../models/invoice.ts';
import type { PurchaseBill } from '../../models/purchase.ts';
import { toPaise, fromPaise, addPaise, subPaise, clampPaise } from '../money.ts';

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
  const creditMatch = notes.match(/(?:^|[^\w])Credit[:\s]*₹\s*([0-9.]+)/i);
  const cnMatch = notes.match(/(?:Sales\s*Return|Credit\s*Note)[:\s]*₹\s*([0-9.]+)/i);

  if (cashMatch) {
    const cashPaise = toPaise(Number(cashMatch[1]));
    if (cashPaise > 0) {
      parsed.push({
        id: `split-cash-${Date.now()}`,
        mode: 'CASH',
        amount: fromPaise(cashPaise),
        ...(options?.cashAccountId ? { accountId: options.cashAccountId } : {}),
        ...(options?.cashAccountName ? { accountName: options.cashAccountName } : {}),
      });
    }
  }
  if (upiMatch) {
    const upiPaise = toPaise(Number(upiMatch[1]));
    if (upiPaise > 0) {
      parsed.push({
        id: `split-upi-${Date.now()}`,
        mode: 'UPI',
        amount: fromPaise(upiPaise),
        ...(options?.bankAccountId ? { accountId: options.bankAccountId } : {}),
        ...(options?.bankAccountName ? { accountName: options.bankAccountName } : {}),
      });
    }
  }
  if (cardMatch) {
    const cardPaise = toPaise(Number(cardMatch[1]));
    if (cardPaise > 0) {
      parsed.push({
        id: `split-card-${Date.now()}`,
        mode: 'CARD',
        amount: fromPaise(cardPaise),
        ...(options?.bankAccountId ? { accountId: options.bankAccountId } : {}),
        ...(options?.bankAccountName ? { accountName: options.bankAccountName } : {}),
      });
    }
  }
  if (bankMatch) {
    const bankPaise = toPaise(Number(bankMatch[1]));
    if (bankPaise > 0) {
      parsed.push({
        id: `split-bank-${Date.now()}`,
        mode: 'NET_BANKING',
        amount: fromPaise(bankPaise),
        ...(options?.bankAccountId ? { accountId: options.bankAccountId } : {}),
        ...(options?.bankAccountName ? { accountName: options.bankAccountName } : {}),
      });
    }
  }
  if (chequeMatch) {
    const chequePaise = toPaise(Number(chequeMatch[1]));
    if (chequePaise > 0) {
      parsed.push({
        id: `split-cheque-${Date.now()}`,
        mode: 'CHEQUE',
        amount: fromPaise(chequePaise),
        ...(options?.bankAccountId ? { accountId: options.bankAccountId } : {}),
        ...(options?.bankAccountName ? { accountName: options.bankAccountName } : {}),
      });
    }
  }
  if (creditMatch) {
    const creditPaise = toPaise(Number(creditMatch[1]));
    if (creditPaise > 0) {
      parsed.push({ id: `split-credit-${Date.now()}`, mode: 'CREDIT', amount: fromPaise(creditPaise) });
    }
  }
  if (cnMatch) {
    const cnPaise = toPaise(Number(cnMatch[1]));
    if (cnPaise > 0) {
      parsed.push({ id: `split-cn-${Date.now()}`, mode: 'CREDIT_NOTE', amount: fromPaise(cnPaise) });
    }
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
  const currentGrandTotalPaise = toPaise(currentGrandTotal);
  if (!inv) {
    return [{ id: '1', mode: 'CASH', amount: fromPaise(currentGrandTotalPaise) }];
  }

  // 1. Explicit array
  if (inv.paymentSplits && inv.paymentSplits.length > 0) {
    return inv.paymentSplits.map((s, idx) => ({
      id: s.id || `split-${idx}-${Date.now()}`,
      mode: s.mode,
      amount: fromPaise(toPaise(Number(s.amount) || 0)),
      accountId: s.accountId,
      accountName: s.accountName,
      reference: s.reference,
      referenceNo: s.referenceNo,
    }));
  }

  // 2. Parse from notes (e.g. "Split Payment — Cash ₹500, UPI ₹500" or "Split: Cash ₹500, ...")
  if (inv.notes) {
    const fromNotes = parseSplitsFromNotes(inv.notes, {
      cashAccountId: inv.cashAccountId,
      cashAccountName: inv.cashAccountName,
      bankAccountId: inv.bankAccountId,
      bankAccountName: inv.bankAccountName,
    });
    if (fromNotes.length > 0) {
      return fromNotes;
    }
  }

  // 3. Partial invoice (with non-zero paid amount and non-zero balance)
  const paidPaise = typeof inv.paidAmount === 'number' ? toPaise(inv.paidAmount) : 0;
  const balancePaise =
    typeof inv.balanceAmount === 'number'
      ? toPaise(inv.balanceAmount)
      : Math.max(0, toPaise(inv.grandTotal) - paidPaise);

  if (inv.paymentStatus === 'PARTIAL' || (paidPaise > 0 && balancePaise > 0)) {
    const paidMode: PaymentMode =
      inv.paymentMode === 'CREDIT' || inv.paymentMode === 'SPLIT' ? 'CASH' : inv.paymentMode || 'CASH';
    const isCash = paidMode === 'CASH';
    const targetAccountId = isCash ? inv.cashAccountId : inv.bankAccountId;
    const targetAccountName = isCash ? inv.cashAccountName : inv.bankAccountName;
    return [
      {
        id: '1',
        mode: paidMode,
        amount: fromPaise(paidPaise),
        ...(targetAccountId ? { accountId: targetAccountId } : {}),
        ...(targetAccountName ? { accountName: targetAccountName } : {}),
      },
      { id: '2', mode: 'CREDIT', amount: fromPaise(balancePaise) },
    ];
  }

  // 4. Unpaid / Credit
  if (inv.paymentStatus === 'UNPAID' || inv.paymentMode === 'CREDIT') {
    return [{ id: '1', mode: 'CREDIT', amount: 0 }];
  }

  // 5. Normal single mode
  const singleMode: PaymentMode = inv.paymentMode === 'SPLIT' ? 'CASH' : inv.paymentMode || 'CASH';
  const isCash = singleMode === 'CASH';
  const targetAccountId = isCash ? inv.cashAccountId : inv.bankAccountId;
  const targetAccountName = isCash ? inv.cashAccountName : inv.bankAccountName;
  return [
    {
      id: '1',
      mode: singleMode,
      amount: fromPaise(paidPaise > 0 ? paidPaise : currentGrandTotalPaise),
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
  const currentGrandTotalPaise = toPaise(currentGrandTotal);
  if (!bill) {
    return [{ id: '1', mode: 'NET_BANKING', amount: fromPaise(currentGrandTotalPaise) }];
  }

  // 1. Explicit array
  if (bill.paymentSplits && bill.paymentSplits.length > 0) {
    return bill.paymentSplits.map((s, idx) => ({
      id: s.id || `split-${idx}-${Date.now()}`,
      mode: s.mode,
      amount: fromPaise(toPaise(Number(s.amount) || 0)),
      accountId: s.accountId,
      accountName: s.accountName,
      reference: s.reference,
      referenceNo: s.referenceNo,
    }));
  }

  // 2. Parse from notes
  if (bill.notes) {
    const fromNotes = parseSplitsFromNotes(bill.notes, {
      cashAccountId: bill.cashAccountId,
      cashAccountName: bill.cashAccountName,
      bankAccountId: bill.bankAccountId,
      bankAccountName: bill.bankAccountName,
    });
    if (fromNotes.length > 0) {
      return fromNotes;
    }
  }

  // 3. Partial bill
  const paidPaise = typeof bill.paidAmount === 'number' ? toPaise(bill.paidAmount) : 0;
  const balancePaise =
    typeof bill.balanceAmount === 'number'
      ? toPaise(bill.balanceAmount)
      : Math.max(0, toPaise(bill.grandTotal) - paidPaise);

  if (bill.paymentStatus === 'PARTIAL' || (paidPaise > 0 && balancePaise > 0)) {
    const paidMode: PaymentMode =
      bill.paymentMode === 'CREDIT' || bill.paymentMode === 'SPLIT' ? 'NET_BANKING' : bill.paymentMode || 'NET_BANKING';
    const isCash = paidMode === 'CASH';
    const targetAccountId = isCash ? bill.cashAccountId : bill.bankAccountId;
    const targetAccountName = isCash ? bill.cashAccountName : bill.bankAccountName;
    return [
      {
        id: '1',
        mode: paidMode,
        amount: fromPaise(paidPaise),
        ...(targetAccountId ? { accountId: targetAccountId } : {}),
        ...(targetAccountName ? { accountName: targetAccountName } : {}),
      },
      { id: '2', mode: 'CREDIT', amount: fromPaise(balancePaise) },
    ];
  }

  // 4. Unpaid / Credit
  if (bill.paymentStatus === 'UNPAID' || bill.paymentMode === 'CREDIT') {
    return [{ id: '1', mode: 'CREDIT', amount: 0 }];
  }

  // 5. Normal single mode
  const singleMode: PaymentMode = bill.paymentMode === 'SPLIT' ? 'NET_BANKING' : bill.paymentMode || 'NET_BANKING';
  const isCash = singleMode === 'CASH';
  const targetAccountId = isCash ? bill.cashAccountId : bill.bankAccountId;
  const targetAccountName = isCash ? bill.cashAccountName : bill.bankAccountName;
  return [
    {
      id: '1',
      mode: singleMode,
      amount: fromPaise(paidPaise > 0 ? paidPaise : currentGrandTotalPaise),
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
    if (s.mode !== 'CREDIT' && toPaise(Number(s.amount) || 0) > 0) {
      const label =
        s.mode === 'CREDIT_NOTE'
          ? 'Sales Return'
          : s.mode === 'NET_BANKING'
          ? 'Bank'
          : s.mode.charAt(0) + s.mode.slice(1).toLowerCase();
      parts.push(`${label} ₹${s.amount}`);
    }
  });
  if (toPaise(balanceDue) > 0) {
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
  const grandTotalPaise = toPaise(Math.max(0, doc.grandTotal || 0));

  // 1. Calculate raw total paid from explicit payment splits if present
  let rawPaidPaise: number;
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
    rawPaidPaise = nonCreditSplits.reduce(
      (sum, s) => addPaise(sum, toPaise(Number(s.amount) || 0)),
      0
    );
  } else {
    const modeUpper = (doc.paymentMode || '').toUpperCase();
    if (typeof doc.paidAmount === 'number' && toPaise(doc.paidAmount) > 0) {
      rawPaidPaise = toPaise(doc.paidAmount);
    } else if (doc.paymentStatus === 'UNPAID' || (modeUpper === 'CREDIT' && doc.paymentStatus !== 'PARTIAL')) {
      rawPaidPaise = 0;
    } else if (typeof doc.paidAmount === 'number') {
      rawPaidPaise = toPaise(doc.paidAmount);
    } else if (doc.paymentStatus === 'PAID') {
      rawPaidPaise = grandTotalPaise;
    } else if (typeof doc.balanceAmount === 'number') {
      rawPaidPaise = Math.max(0, grandTotalPaise - toPaise(doc.balanceAmount));
    } else {
      rawPaidPaise = grandTotalPaise;
    }
  }

  // 2. Strict mathematical invariants:
  // Clamp overpayment: paid cannot exceed grandTotal; balance is grandTotal - paid
  const paidPaise = clampPaise(rawPaidPaise, 0, grandTotalPaise);
  const balancePaise = subPaise(grandTotalPaise, paidPaise);

  // 3. Centralized Payment Status:
  // - PAID when totalPaid >= grandTotal
  // - PARTIAL when 0 < totalPaid < grandTotal
  // - UNPAID when totalPaid <= 0, including CREDIT-only
  let paymentStatus: PaymentStatus;
  if (grandTotalPaise <= 0) {
    paymentStatus = 'PAID';
  } else if (paidPaise >= grandTotalPaise) {
    paymentStatus = 'PAID';
  } else if (paidPaise > 0) {
    paymentStatus = 'PARTIAL';
  } else {
    paymentStatus = 'UNPAID';
  }

  // 4. Centralized Payment Mode:
  let paymentMode: PaymentMode;
  if (splits && splits.length > 0) {
    const activeNonCredit = splits.filter(
      (s) => (s.mode || '').toUpperCase() !== 'CREDIT' && toPaise(Number(s.amount) || 0) > 0
    );
    if (paymentStatus === 'UNPAID' || activeNonCredit.length === 0) {
      paymentMode = 'CREDIT';
    } else if (activeNonCredit.length === 1 && balancePaise <= 1) {
      paymentMode = activeNonCredit[0].mode;
    } else {
      paymentMode = 'SPLIT';
    }

    // Normalize splits amounts to match clamped paidAmount and balanceAmount
    let remainingPaidToAllocatePaise = paidPaise;
    splits = splits.map((s) => {
      if ((s.mode || '').toUpperCase() === 'CREDIT') {
        return { ...s, amount: fromPaise(balancePaise) };
      }
      const sAmt = Number(s.amount) || 0;
      const allocatedPaise = Math.min(toPaise(sAmt), remainingPaidToAllocatePaise);
      remainingPaidToAllocatePaise = subPaise(remainingPaidToAllocatePaise, allocatedPaise);
      return {
        ...s,
        amount: fromPaise(allocatedPaise),
      };
    });

    // Ensure credit split is present if balanceAmount > 0
    if (balancePaise > 0 && !splits.some((s) => (s.mode || '').toUpperCase() === 'CREDIT')) {
      splits.push({
        id: `split-bal-${Date.now()}`,
        mode: 'CREDIT',
        amount: fromPaise(balancePaise),
      });
    }
  } else {
    if (paymentStatus === 'UNPAID') {
      paymentMode = 'CREDIT';
    } else if (balancePaise > 0 && paidPaise > 0) {
      paymentMode = doc.paymentMode === 'CREDIT' ? 'SPLIT' : doc.paymentMode || 'SPLIT';
    } else {
      paymentMode = doc.paymentMode && doc.paymentMode !== 'CREDIT' ? doc.paymentMode : 'CASH';
    }

    if (paidPaise > 0) {
      const isCash = paymentMode === 'CASH';
      const mainSplit: PaymentSplit = {
        id: 'split-1',
        mode: paymentMode === 'SPLIT' ? 'CASH' : paymentMode,
        amount: fromPaise(paidPaise),
        accountId: isCash ? 'ACC_CASH' : doc.bankAccountId,
        accountName: isCash ? 'Cash-in-hand' : doc.bankAccountName,
      };
      splits = [mainSplit];
      if (balancePaise > 0) {
        splits.push({
          id: `split-bal-${Date.now()}`,
          mode: 'CREDIT',
          amount: fromPaise(balancePaise),
        });
      }
    }
  }

  // 5. Notes formatting for audit trail
  let notes = doc.notes;
  if (splits && splits.length > 0 && (doc.paymentSplits || splits.length > 1 || notes?.includes('Split Payment'))) {
    const splitNote = formatSplitNotes(splits, fromPaise(balancePaise));
    if (splitNote && (!notes || !notes.includes('Split Payment'))) {
      notes = notes ? `${notes} | ${splitNote}` : splitNote;
    }
  }

  return {
    paidAmount: fromPaise(paidPaise),
    balanceAmount: fromPaise(balancePaise),
    paymentStatus,
    paymentMode,
    paymentSplits: splits,
    notes,
  };
}
