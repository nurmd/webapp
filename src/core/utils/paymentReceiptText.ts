import { readRupeeOr } from '../accounting/paisePersistence.ts';

export interface PaymentReceiptParams {
  companyName: string;
  heading: string; // 'Payment In Receipt' | 'Payment Out Voucher' | 'Cash / Bank Transfer'
  docNumber?: string;
  date?: string;
  partyName?: string;
  amount: number;
  paymentMode?: string;
  bankAccountName?: string;
  reference?: string;
  notes?: string;
  partyBalance?: number;
}

/**
 * Builds formatted monospace receipt text for 32 or 48 column thermal receipt printers
 * for Payment In, Payment Out, Cash/Bank Transfer, and Vouchers.
 */
export function buildPaymentReceiptText(
  params: PaymentReceiptParams,
  width: 32 | 48 = 32
): string {
  const padCenter = (str: string, len: number) => {
    if (str.length >= len) return str.substring(0, len);
    const left = Math.floor((len - str.length) / 2);
    const right = len - str.length - left;
    return ' '.repeat(left) + str + ' '.repeat(right);
  };

  const padRow = (left: string, right: string, len: number) => {
    const space = len - left.length - right.length;
    if (space <= 0) return left.substring(0, Math.max(0, len - right.length)) + right;
    return left + ' '.repeat(space) + right;
  };

  const line = '-'.repeat(width);
  const doubleLine = '='.repeat(width);

  const lines: string[] = [];

  // Header: Company Name & Centered Heading
  if (params.companyName) {
    lines.push(padCenter(params.companyName.toUpperCase(), width));
  }
  lines.push(padCenter((params.heading || 'PAYMENT RECEIPT').toUpperCase(), width));
  lines.push(doubleLine);

  // Meta: Doc No, Date
  if (params.docNumber && params.date) {
    lines.push(padRow(`Doc: ${params.docNumber}`, params.date, width));
  } else if (params.docNumber) {
    lines.push(`Doc No : ${params.docNumber}`);
  } else if (params.date) {
    lines.push(`Date   : ${params.date}`);
  }

  // Party Name
  if (params.partyName) {
    lines.push(`Party  : ${params.partyName}`);
  }

  lines.push(line);

  // Amount
  const amountStr = `₹${readRupeeOr(params, 'amount', Number(params.amount) || 0).toFixed(2)}`;
  lines.push(padRow('Amount:', amountStr, width));

  // Payment Mode
  if (params.paymentMode) {
    lines.push(padRow('Mode:', params.paymentMode, width));
  }

  // Bank Account Name
  if (params.bankAccountName) {
    lines.push(padRow('Account:', params.bankAccountName, width));
  }

  // Reference
  if (params.reference) {
    lines.push(`Ref    : ${params.reference}`);
  }

  // Party Balance
  if (typeof params.partyBalance === 'number' && Number.isFinite(params.partyBalance)) {
    lines.push(line);
    const balStr = `₹${readRupeeOr(params, 'partyBalance', params.partyBalance).toFixed(2)}`;
    lines.push(padRow('Balance Due:', balStr, width));
  }

  // Notes
  if (params.notes && params.notes.trim()) {
    lines.push(line);
    lines.push(`Note: ${params.notes.trim()}`);
  }

  // Footer
  lines.push(doubleLine);
  lines.push(padCenter('Thank you!', width));

  return lines.join('\n');
}
