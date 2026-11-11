import { Invoice } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';
import { Party } from '../../models/party.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { formatINR, formatDate } from './formatters.ts';
import { getPartyTotalBalanceDue } from './upiAndShare.ts';
import { formatWhatsAppMessage } from '../../services/whatsappService.ts';

export interface PaymentVoucherShareOptions {
  heading?: string;
  docNumber?: string;
  date?: string;
  amount?: number;
  type?: string;
  flow?: 'IN' | 'OUT';
  paymentMode?: string;
  bankAccountName?: string;
  discount?: number;
  splits?: { cash?: number; upi?: number; bank?: number };
  reference?: string;
  counterpartyOrTitle?: string;
  accountName?: string;
  fromAccountName?: string;
  toAccountName?: string;
  narration?: string;
  notes?: string;
  isContra?: boolean;
}

/**
 * Builds rich, formatted WhatsApp message for Sales Invoices / Quotations / Deliveries.
 * Incorporates Total Balance Due with duplicate guard.
 */
export function buildInvoiceWhatsAppMessage(
  invoice: Invoice,
  company: CompanyProfile,
  party?: Party | null,
  totalBalanceDue?: number | null
): string {
  const resolvedTotalDue =
    typeof totalBalanceDue === 'number' && Number.isFinite(totalBalanceDue)
      ? Math.max(0, totalBalanceDue)
      : (() => {
          const pDue = getPartyTotalBalanceDue(party);
          if (pDue !== null) return pDue;
          if (typeof invoice.balanceAmount === 'number' && Number.isFinite(invoice.balanceAmount)) {
            return Math.max(0, invoice.balanceAmount);
          }
          return undefined;
        })();

  return formatWhatsAppMessage(company, invoice, {
    totalBalanceDue: resolvedTotalDue,
  });
}

/**
 * Builds formatted WhatsApp message for Purchase Bills.
 */
export function buildPurchaseWhatsAppMessage(
  bill: PurchaseBill,
  company: CompanyProfile,
  party?: Party | null,
  totalBalanceDue?: number | null
): string {
  const companyName = company.tradeName?.trim() || company.businessName?.trim() || 'Our Business';
  const resolvedDue =
    typeof totalBalanceDue === 'number' && Number.isFinite(totalBalanceDue)
      ? totalBalanceDue
      : totalBalanceDue === null
      ? null
      : (party ? getPartyTotalBalanceDue(party) : null) ?? bill.balanceAmount;

  let text =
    `*Purchase Bill Summary - ${companyName}*\n` +
    `--------------------------------\n` +
    `*Bill No:* ${bill.billNumber}\n` +
    `*Supplier:* ${bill.supplierName}\n` +
    `*Date:* ${bill.date}\n` +
    `*Amount:* ${formatINR(bill.grandTotal)}\n` +
    `*Balance Due:* ${formatINR(bill.balanceAmount)}\n`;

  if (resolvedDue !== null && resolvedDue !== undefined && !text.includes('Total Balance Due')) {
    text += `*Total Balance Due:* ${formatINR(resolvedDue)}\n`;
  }

  text += `*Status:* ${bill.paymentStatus}`;
  return text;
}

/**
 * Builds formatted WhatsApp message for Payment In, Payment Out, Cash/Bank transactions, and Vouchers.
 * Ensures Contra transfers omit Total Balance Due, while party payments include it.
 */
export function buildPaymentVoucherWhatsAppMessage(
  entry: unknown,
  party?: Party | null,
  company?: CompanyProfile | null,
  totalBalanceDue?: number | null,
  options: PaymentVoucherShareOptions = {}
): string {
  const companyName =
    company?.tradeName?.trim() || company?.businessName?.trim() || 'GST Billing App';

  // Detect Contra / Transfer
  const isContra =
    options.isContra ??
    ((entry as Record<string, unknown>)?.mode === 'CONTRA' ||
      (entry as Record<string, unknown>)?.type === 'CONTRA' ||
      (entry as Record<string, unknown>)?.category === 'CONTRA' ||
      Boolean(options.fromAccountName && options.toAccountName) ||
      Boolean((entry as Record<string, unknown>)?.fromAccountId && (entry as Record<string, unknown>)?.toAccountId));

  const isVoucher = Boolean((entry as Record<string, unknown>)?.voucherNumber && ((entry as Record<string, unknown>)?.voucherType || options.type));
  const flow = options.flow || ((entry as Record<string, unknown>)?.flow as 'IN' | 'OUT') || ((entry as Record<string, unknown>)?.type === 'RECEIPT' || (entry as Record<string, unknown>)?.type === 'PAYMENT_IN' ? 'IN' : 'OUT');
  const isReceipt = flow === 'IN';

  // Determine title/heading
  let heading = options.heading;
  if (!heading) {
    if (isContra) {
      heading = 'Cash / Bank Transfer';
    } else if (isVoucher) {
      heading = 'Voucher Receipt';
    } else if ((entry as Record<string, unknown>)?.docNumber && ((entry as Record<string, unknown>)?.type === 'PAYMENT_IN' || (entry as Record<string, unknown>)?.type === 'PAYMENT_OUT')) {
      heading = isReceipt ? 'Payment In Receipt' : 'Payment Out Voucher';
    } else {
      heading = isReceipt ? 'Payment Received' : 'Payment Made';
    }
  }

  const lines: string[] = [
    `*${heading} - ${companyName}*`,
    '--------------------------------',
  ];

  // Document / Txn number
  const docNo =
    options.docNumber ||
    (entry as Record<string, unknown>)?.voucherNumber ||
    (entry as Record<string, unknown>)?.txnNumber ||
    (entry as Record<string, unknown>)?.docNumber;
  if (docNo) {
    if ((entry as Record<string, unknown>)?.voucherNumber) {
      lines.push(`*Voucher No:* ${docNo}`);
    } else if ((entry as Record<string, unknown>)?.txnNumber) {
      lines.push(`*Txn No:* ${docNo}`);
    } else {
      lines.push(`*Receipt No:* ${docNo}`);
    }
  }

  // Type
  const typeLabel = options.type || (entry as Record<string, unknown>)?.voucherType || (entry as Record<string, unknown>)?.type;
  if (typeLabel && !(entry as Record<string, unknown>)?.docNumber) {
    lines.push(`*Type:* ${typeLabel}`);
  } else if ((entry as Record<string, unknown>)?.docNumber) {
    lines.push(`*Type:* ${isReceipt ? 'Payment In' : 'Payment Out'}`);
  }

  // Date
  const rawDate = options.date || (entry as Record<string, unknown>)?.date;
  if (rawDate) {
    lines.push(`*Date:* ${rawDate}`);
  }

  // Party name (if present)
  const partyName = party?.name || (entry as Record<string, unknown>)?.partyName;
  if (partyName && !isContra && (options.bankAccountName || options.splits || (entry as Record<string, unknown>)?.docNumber)) {
    lines.push(`*Party:* ${partyName}`);
  }

  // Amount
  const e = entry as Record<string, unknown>;
  const amt =
    options.amount ??
    (typeof e.totalAmount === 'number' ? e.totalAmount : undefined) ??
    (typeof e.amount === 'number' ? e.amount : undefined) ??
    (typeof e.credit === 'number' && (e.credit as number) > 0 ? (e.credit as number) : (typeof e.debit === 'number' ? e.debit : undefined)) ??
    0;
  lines.push(`*Amount:* ${formatINR(amt)}`);

  // Discount (if any)
  const disc = options.discount ?? (typeof e.discount === 'number' ? e.discount : 0) ?? 0;
  if (disc > 0) {
    lines.push(`*Discount:* ${formatINR(disc)}`);
    lines.push(`*Total Settled:* ${formatINR(amt + disc)}`);
  }

  // Payment Mode / Split
  const mode = options.paymentMode || (entry as Record<string, unknown>)?.paymentMode || (entry as Record<string, unknown>)?.mode;
  if (mode) {
    if (mode === 'BANK' && options.bankAccountName) {
      lines.push(`*Payment Mode:* Bank (${options.bankAccountName})`);
    } else if (mode === 'SPLIT' && options.splits) {
      const parts: string[] = [];
      if (options.splits.cash && options.splits.cash > 0) parts.push(`Cash: ${formatINR(options.splits.cash)}`);
      if (options.splits.upi && options.splits.upi > 0) parts.push(`UPI: ${formatINR(options.splits.upi)}`);
      if (options.splits.bank && options.splits.bank > 0) parts.push(`Bank: ${formatINR(options.splits.bank)}`);
      lines.push(`*Payment Mode:* Split (${parts.join(', ')})`);
    } else {
      lines.push(`*Payment Mode:* ${mode}`);
    }
  }

  // Total Balance Due: ONLY when NOT contra, and party has due
  if (!isContra) {
    const resolvedDue =
      typeof totalBalanceDue === 'number' && Number.isFinite(totalBalanceDue)
        ? totalBalanceDue
        : totalBalanceDue === null
        ? null
        : party
        ? getPartyTotalBalanceDue(party)
        : null;

    if (resolvedDue !== null && resolvedDue !== undefined && !isNaN(resolvedDue)) {
      lines.push(`*Total Balance Due:* ${formatINR(resolvedDue)}`);
    }
  }

  // From / To for Transfers
  if (isContra) {
    if (options.fromAccountName) lines.push(`*From:* ${options.fromAccountName}`);
    if (options.toAccountName) lines.push(`*To:* ${options.toAccountName}`);
  } else {
    const accName = options.accountName || (entry as Record<string, unknown>)?.accountName;
    if (accName) {
      lines.push(`*Account:* ${accName}`);
    }
  }

  // Reference
  const ref = options.reference || (entry as Record<string, unknown>)?.referenceNo || (entry as Record<string, unknown>)?.refNumber;
  if (ref) {
    lines.push(`*Reference:* ${ref}`);
  }

  // Counterparty or Title
  const counterparty = options.counterpartyOrTitle || (entry as Record<string, unknown>)?.counterpartyOrTitle;
  if (counterparty) {
    lines.push(`*Party / Purpose:* ${counterparty}`);
  }

  // Narration / Notes
  const narration = options.notes || options.narration || (entry as Record<string, unknown>)?.narration || (entry as Record<string, unknown>)?.notes || (entry as Record<string, unknown>)?.description;
  if (narration) {
    if (isVoucher && !options.notes) {
      lines.push(`*Narration:* ${narration}`);
    } else {
      lines.push(`*Notes:* ${narration}`);
    }
  }

  lines.push('--------------------------------');
  lines.push('Recorded in GST Billing App');

  return lines.join('\n');
}
