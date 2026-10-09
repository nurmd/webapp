import type { Invoice, PaymentMode, PaymentSplit } from '../../models/invoice.ts';
import type { PurchaseBill } from '../../models/purchase.ts';

/**
 * Extracts and reconstructs structured payment splits from an Invoice.
 * Handles:
 * 1. Explicit `inv.paymentSplits` if stored.
 * 2. Parsing human-readable notes (e.g. from POS: "Split Payment — Cash ₹100, UPI ₹200...").
 * 3. Partial payments (paidAmount > 0 and balanceAmount > 0).
 * 4. Full credit/unpaid invoices.
 * 5. Full single-mode paid invoices.
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
    }));
  }

  // 2. Parse from notes (e.g. "Split Payment — Cash ₹500, UPI ₹500" or "Split: Cash ₹500, ...")
  if (inv.notes && (inv.notes.includes('Split Payment') || inv.notes.includes('Split:'))) {
    const parsed: PaymentSplit[] = [];
    const cashMatch = inv.notes.match(/Cash[:\s]*₹\s*([0-9.]+)/i);
    const upiMatch = inv.notes.match(/UPI[:\s]*₹\s*([0-9.]+)/i);
    const cardMatch = inv.notes.match(/Card[:\s]*₹\s*([0-9.]+)/i);
    const bankMatch = inv.notes.match(/(?:Bank|Net\s*Banking)[:\s]*₹\s*([0-9.]+)/i);
    const chequeMatch = inv.notes.match(/Cheque[:\s]*₹\s*([0-9.]+)/i);
    const creditMatch = inv.notes.match(/Credit[:\s]*₹\s*([0-9.]+)/i);

    if (cashMatch && Number(cashMatch[1]) > 0) {
      parsed.push({ id: `split-cash-${Date.now()}`, mode: 'CASH', amount: Number(cashMatch[1]) });
    }
    if (upiMatch && Number(upiMatch[1]) > 0) {
      parsed.push({ id: `split-upi-${Date.now()}`, mode: 'UPI', amount: Number(upiMatch[1]) });
    }
    if (cardMatch && Number(cardMatch[1]) > 0) {
      parsed.push({ id: `split-card-${Date.now()}`, mode: 'CARD', amount: Number(cardMatch[1]) });
    }
    if (bankMatch && Number(bankMatch[1]) > 0) {
      parsed.push({ id: `split-bank-${Date.now()}`, mode: 'NET_BANKING', amount: Number(bankMatch[1]) });
    }
    if (chequeMatch && Number(chequeMatch[1]) > 0) {
      parsed.push({ id: `split-cheque-${Date.now()}`, mode: 'CHEQUE', amount: Number(chequeMatch[1]) });
    }
    if (creditMatch && Number(creditMatch[1]) > 0) {
      parsed.push({ id: `split-credit-${Date.now()}`, mode: 'CREDIT', amount: Number(creditMatch[1]) });
    }

    if (parsed.length > 0) {
      return parsed;
    }
  }

  // 3. Partial invoice (with non-zero paid amount and non-zero balance)
  const paid = typeof inv.paidAmount === 'number' ? inv.paidAmount : 0;
  const balance = typeof inv.balanceAmount === 'number' ? inv.balanceAmount : Math.max(0, inv.grandTotal - paid);

  if (inv.paymentStatus === 'PARTIAL' || (paid > 0 && balance > 0)) {
    const paidMode: PaymentMode =
      inv.paymentMode === 'CREDIT' || inv.paymentMode === 'SPLIT' ? 'CASH' : inv.paymentMode || 'CASH';
    return [
      { id: '1', mode: paidMode, amount: paid },
      { id: '2', mode: 'CREDIT', amount: balance },
    ];
  }

  // 4. Unpaid / Credit
  if (inv.paymentStatus === 'UNPAID' || inv.paymentMode === 'CREDIT') {
    return [{ id: '1', mode: 'CREDIT', amount: 0 }];
  }

  // 5. Normal single mode
  const singleMode: PaymentMode = inv.paymentMode === 'SPLIT' ? 'CASH' : inv.paymentMode || 'CASH';
  return [{ id: '1', mode: singleMode, amount: paid > 0 ? paid : currentGrandTotal }];
}

/**
 * Extracts and reconstructs structured payment splits from a PurchaseBill.
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
    }));
  }

  // 2. Parse from notes
  if (bill.notes && (bill.notes.includes('Split Payment') || bill.notes.includes('Split:'))) {
    const parsed: PaymentSplit[] = [];
    const cashMatch = bill.notes.match(/Cash[:\s]*₹\s*([0-9.]+)/i);
    const upiMatch = bill.notes.match(/UPI[:\s]*₹\s*([0-9.]+)/i);
    const cardMatch = bill.notes.match(/Card[:\s]*₹\s*([0-9.]+)/i);
    const bankMatch = bill.notes.match(/(?:Bank|Net\s*Banking)[:\s]*₹\s*([0-9.]+)/i);
    const chequeMatch = bill.notes.match(/Cheque[:\s]*₹\s*([0-9.]+)/i);
    const creditMatch = bill.notes.match(/Credit[:\s]*₹\s*([0-9.]+)/i);

    if (cashMatch && Number(cashMatch[1]) > 0) {
      parsed.push({ id: `split-cash-${Date.now()}`, mode: 'CASH', amount: Number(cashMatch[1]) });
    }
    if (upiMatch && Number(upiMatch[1]) > 0) {
      parsed.push({ id: `split-upi-${Date.now()}`, mode: 'UPI', amount: Number(upiMatch[1]) });
    }
    if (cardMatch && Number(cardMatch[1]) > 0) {
      parsed.push({ id: `split-card-${Date.now()}`, mode: 'CARD', amount: Number(cardMatch[1]) });
    }
    if (bankMatch && Number(bankMatch[1]) > 0) {
      parsed.push({ id: `split-bank-${Date.now()}`, mode: 'NET_BANKING', amount: Number(bankMatch[1]) });
    }
    if (chequeMatch && Number(chequeMatch[1]) > 0) {
      parsed.push({ id: `split-cheque-${Date.now()}`, mode: 'CHEQUE', amount: Number(chequeMatch[1]) });
    }
    if (creditMatch && Number(creditMatch[1]) > 0) {
      parsed.push({ id: `split-credit-${Date.now()}`, mode: 'CREDIT', amount: Number(creditMatch[1]) });
    }

    if (parsed.length > 0) {
      return parsed;
    }
  }

  // 3. Partial bill
  const paid = typeof bill.paidAmount === 'number' ? bill.paidAmount : 0;
  const balance = typeof bill.balanceAmount === 'number' ? bill.balanceAmount : Math.max(0, bill.grandTotal - paid);

  if (bill.paymentStatus === 'PARTIAL' || (paid > 0 && balance > 0)) {
    const paidMode: PaymentMode =
      bill.paymentMode === 'CREDIT' || bill.paymentMode === 'SPLIT' ? 'NET_BANKING' : bill.paymentMode || 'NET_BANKING';
    return [
      { id: '1', mode: paidMode, amount: paid },
      { id: '2', mode: 'CREDIT', amount: balance },
    ];
  }

  // 4. Unpaid / Credit
  if (bill.paymentStatus === 'UNPAID' || bill.paymentMode === 'CREDIT') {
    return [{ id: '1', mode: 'CREDIT', amount: 0 }];
  }

  // 5. Normal single mode
  const singleMode: PaymentMode = bill.paymentMode === 'SPLIT' ? 'NET_BANKING' : bill.paymentMode || 'NET_BANKING';
  return [{ id: '1', mode: singleMode, amount: paid > 0 ? paid : currentGrandTotal }];
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
