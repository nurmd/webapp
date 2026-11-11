import { Party } from '../../models/party.ts';
import { CompanyProfile } from '../../models/company.ts';
import { amountInWords } from '../utils/currencyWords.ts';
import { escapeHtml } from '../utils/printBridge.ts';
import { formatINR } from '../utils/formatters.ts';

export interface PaymentSlipAllocation {
  documentNumber: string;
  amount: number;
}

export interface PaymentSlipSource {
  type: 'PAYMENT_IN' | 'PAYMENT_OUT';
  docNumber: string;
  date: string;
  amount: number;
  paymentMode?: string;
  notes?: string;
  allocations?: PaymentSlipAllocation[];
}

export interface PaymentSlipData {
  slipTitle: string;
  slipNumber: string;
  date: string;
  partyName: string;
  partyPhone?: string;
  amount: number;
  amountInWords: string;
  paymentMode?: string;
  notes?: string;
  allocations: PaymentSlipAllocation[];
  balanceAfter?: number;
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  gstin?: string;
}

export function buildPaymentSlipData(
  source: PaymentSlipSource,
  party: Party,
  company: CompanyProfile,
  options?: { balanceAfter?: number }
): PaymentSlipData {
  const slipTitle = source.type === 'PAYMENT_IN' ? 'PAYMENT RECEIPT' : 'PAYMENT VOUCHER';
  const companyName = company.tradeName || company.businessName || '';
  const gstin = company.gstin?.trim() ? company.gstin.trim() : undefined;
  const companyAddress = company.address?.trim() || undefined;
  const companyPhone = company.phone?.trim() || undefined;
  const partyPhone = party.phone?.trim() || undefined;
  const words = amountInWords(source.amount);

  return {
    slipTitle,
    slipNumber: source.docNumber,
    date: source.date,
    partyName: party.name,
    partyPhone,
    amount: source.amount,
    amountInWords: words,
    paymentMode: source.paymentMode,
    notes: source.notes,
    allocations: source.allocations ? [...source.allocations] : [],
    balanceAfter: options?.balanceAfter,
    companyName,
    companyAddress,
    companyPhone,
    gstin,
  };
}

function padCenter(str: string, len: number): string {
  const s = str.trim();
  if (s.length >= len) return s.substring(0, len);
  const left = Math.floor((len - s.length) / 2);
  const right = len - s.length - left;
  return ' '.repeat(left) + s + ' '.repeat(right);
}

function padRow(left: string, right: string, len: number): string {
  const l = left.trim();
  const r = right.trim();
  const space = len - l.length - r.length;
  if (space <= 0) {
    const maxLeftLen = Math.max(0, len - r.length - 1);
    const truncatedLeft = l.substring(0, maxLeftLen);
    const remainingSpace = Math.max(0, len - truncatedLeft.length - r.length);
    return truncatedLeft + ' '.repeat(remainingSpace) + r;
  }
  return l + ' '.repeat(space) + r;
}

function wrapText(text: string, maxWidth: number): string[] {
  if (!text) return [];
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const safeWord = word.length > maxWidth ? word.substring(0, maxWidth) : word;
    if (!current) {
      current = safeWord;
    } else if (current.length + 1 + safeWord.length <= maxWidth) {
      current += ' ' + safeWord;
    } else {
      lines.push(current);
      current = safeWord;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

export function formatPaymentSlipText(data: PaymentSlipData, width: 32 | 48): string {
  const lines: string[] = [];
  const dashedLine = '-'.repeat(width);

  // Store name centered
  if (data.companyName) {
    const storeLines = wrapText(data.companyName.toUpperCase(), width);
    for (const sl of storeLines) {
      lines.push(padCenter(sl, width));
    }
  }

  // Address, phone, gstin lines
  if (data.companyAddress) {
    const addrLines = wrapText(data.companyAddress, width);
    for (const al of addrLines) {
      lines.push(padCenter(al, width));
    }
  }
  if (data.companyPhone) {
    lines.push(padCenter(`Ph: ${data.companyPhone}`, width));
  }
  if (data.gstin) {
    lines.push(padCenter(`GSTIN: ${data.gstin}`, width));
  }

  // Separator & Title
  lines.push(dashedLine);
  lines.push(padCenter(data.slipTitle, width));
  lines.push(dashedLine);

  // Slip number and date
  const slipNoLabel = `Slip No: ${data.slipNumber}`;
  const dateLabel = `Date: ${data.date}`;
  if (slipNoLabel.length + dateLabel.length + 1 <= width) {
    lines.push(padRow(slipNoLabel, dateLabel, width));
  } else {
    lines.push(...wrapText(slipNoLabel, width));
    lines.push(...wrapText(dateLabel, width));
  }

  // Party info
  const isVoucher = data.slipTitle === 'PAYMENT VOUCHER';
  const partyPrefix = isVoucher ? 'Paid to: ' : 'Received from: ';
  const partyLines = wrapText(`${partyPrefix}${data.partyName}`, width);
  for (const pl of partyLines) {
    lines.push(pl);
  }
  if (data.partyPhone) {
    lines.push(...wrapText(`Phone: ${data.partyPhone}`, width));
  }

  // Amount line & words
  lines.push(dashedLine);
  lines.push(padRow('Amount:', formatINR(data.amount), width));
  if (data.amountInWords) {
    const wordLines = wrapText(data.amountInWords, width);
    for (const wl of wordLines) {
      lines.push(wl);
    }
  }

  // Payment mode
  if (data.paymentMode) {
    const modeLabel = `Payment Mode: ${data.paymentMode}`;
    if (modeLabel.length <= width) {
      lines.push(padRow('Payment Mode:', data.paymentMode, width));
    } else {
      lines.push(...wrapText(modeLabel, width));
    }
  }

  // Notes
  if (data.notes && data.notes.trim()) {
    const noteLines = wrapText(`Notes: ${data.notes.trim()}`, width);
    for (const nl of noteLines) {
      lines.push(nl);
    }
  }

  // Allocations: one line per allocation ('Against #INV-1  1,000.00')
  if (data.allocations && data.allocations.length > 0) {
    lines.push(dashedLine);
    for (const alloc of data.allocations) {
      const docNum = alloc.documentNumber || '';
      const docRef = docNum.startsWith('#') || docNum.toLowerCase().startsWith('opening')
        ? docNum
        : `#${docNum}`;
      const amtStr = formatINR(alloc.amount, false);
      lines.push(padRow(`Against ${docRef}`, amtStr, width));
    }
  }

  // Balance after
  if (data.balanceAfter !== undefined) {
    lines.push(dashedLine);
    const balSign = data.balanceAfter > 0 ? 'Dr' : data.balanceAfter < 0 ? 'Cr' : '';
    const balStr = `${formatINR(Math.abs(data.balanceAfter))}${balSign ? ' ' + balSign : ''}`;
    lines.push(padRow('Balance After:', balStr, width));
  }

  // Signature footer
  lines.push(dashedLine);
  lines.push('');
  lines.push('');
  if (width === 32) {
    lines.push(padRow(isVoucher ? 'Receiver Sign' : 'Customer Sign', 'Auth Signatory', width));
  } else {
    lines.push(padRow(isVoucher ? 'Receiver Signature' : 'Customer Signature', 'Authorized Signatory', width));
  }

  return lines
    .map((line) => (line.length > width ? line.substring(0, width) : line))
    .join('\n');
}

export function buildPaymentSlipHtml(data: PaymentSlipData, width: 32 | 48): string {
  const pageSize = width === 32 ? '58mm auto' : '80mm auto';
  const rawText = formatPaymentSlipText(data, width);
  const escapedText = escapeHtml(rawText);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(data.slipTitle)} #${escapeHtml(data.slipNumber)}</title>
  <style>
    @page {
      size: ${pageSize};
      margin: 0;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      background: #ffffff;
      color: #000000;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }
    @media print {
      body {
        margin: 2mm;
      }
    }
    pre {
      margin: 0;
      padding: 4px;
      font-family: inherit;
      white-space: pre;
      line-height: 1.25;
      font-size: ${width === 32 ? '11px' : '10px'};
    }
  </style>
</head>
<body>
  <pre>${escapedText}</pre>
</body>
</html>`;
}
