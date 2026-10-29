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
  entry: any,
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
    (entry?.mode === 'CONTRA' ||
      entry?.type === 'CONTRA' ||
      entry?.category === 'CONTRA' ||
      Boolean(options.fromAccountName && options.toAccountName) ||
      Boolean(entry?.fromAccountId && entry?.toAccountId));

  const isVoucher = Boolean(entry?.voucherNumber && (entry?.voucherType || options.type));
  const flow = options.flow || (entry?.flow as 'IN' | 'OUT') || (entry?.type === 'RECEIPT' || entry?.type === 'PAYMENT_IN' ? 'IN' : 'OUT');
  const isReceipt = flow === 'IN';

  // Determine title/heading
  let heading = options.heading;
  if (!heading) {
    if (isContra) {
      heading = 'Cash / Bank Transfer';
    } else if (isVoucher) {
      heading = 'Voucher Receipt';
    } else if (entry?.docNumber && (entry?.type === 'PAYMENT_IN' || entry?.type === 'PAYMENT_OUT')) {
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
    entry?.voucherNumber ||
    entry?.txnNumber ||
    entry?.docNumber;
  if (docNo) {
    if (entry?.voucherNumber) {
      lines.push(`*Voucher No:* ${docNo}`);
    } else if (entry?.txnNumber) {
      lines.push(`*Txn No:* ${docNo}`);
    } else {
      lines.push(`*Receipt No:* ${docNo}`);
    }
  }

  // Type
  const typeLabel = options.type || entry?.voucherType || entry?.type;
  if (typeLabel && !entry?.docNumber) {
    lines.push(`*Type:* ${typeLabel}`);
  } else if (entry?.docNumber) {
    lines.push(`*Type:* ${isReceipt ? 'Payment In' : 'Payment Out'}`);
  }

  // Date
  const rawDate = options.date || entry?.date;
  if (rawDate) {
    lines.push(`*Date:* ${rawDate}`);
  }

  // Party name (if present)
  const partyName = party?.name || entry?.partyName;
  if (partyName && !isContra && (options.bankAccountName || options.splits || entry?.docNumber)) {
    lines.push(`*Party:* ${partyName}`);
  }

  // Amount
  const amt =
    options.amount ??
    entry?.totalAmount ??
    entry?.amount ??
    (entry?.credit && entry.credit > 0 ? entry.credit : entry?.debit) ??
    0;
  lines.push(`*Amount:* ${formatINR(amt)}`);

  // Discount (if any)
  const disc = options.discount ?? entry?.discount ?? 0;
  if (disc > 0) {
    lines.push(`*Discount:* ${formatINR(disc)}`);
    lines.push(`*Total Settled:* ${formatINR(amt + disc)}`);
  }

  // Payment Mode / Split
  const mode = options.paymentMode || entry?.paymentMode || entry?.mode;
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
    const accName = options.accountName || entry?.accountName;
    if (accName) {
      lines.push(`*Account:* ${accName}`);
    }
  }

  // Reference
  const ref = options.reference || entry?.referenceNo || entry?.refNumber;
  if (ref) {
    lines.push(`*Reference:* ${ref}`);
  }

  // Counterparty or Title
  const counterparty = options.counterpartyOrTitle || entry?.counterpartyOrTitle;
  if (counterparty) {
    lines.push(`*Party / Purpose:* ${counterparty}`);
  }

  // Narration / Notes
  const narration = options.notes || options.narration || entry?.narration || entry?.notes || entry?.description;
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
