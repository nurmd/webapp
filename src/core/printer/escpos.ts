export interface ThermalReceiptData {
  companyName: string;
  companyAddress: string;
  gstin: string;
  phone: string;
  invoiceNo: string;
  date: string;
  customerName?: string;
  items: Array<{
    name: string;
    qty: number;
    rate: number;
    amount: number;
  }>;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  grandTotal: number;
  upiId?: string;
  terms?: string;
}

/**
 * Generates formatted text layout for 58mm (32 chars) or 80mm (48 chars) thermal printers.
 */
export function formatThermalReceiptText(data: ThermalReceiptData, width: 32 | 48 = 32): string {
  const padCenter = (str: string, len: number) => {
    if (str.length >= len) return str.substring(0, len);
    const left = Math.floor((len - str.length) / 2);
    const right = len - str.length - left;
    return ' '.repeat(left) + str + ' '.repeat(right);
  };

  const padRow = (left: string, right: string, len: number) => {
    const space = len - left.length - right.length;
    if (space <= 0) return left.substring(0, len - right.length) + right;
    return left + ' '.repeat(space) + right;
  };

  const line = '-'.repeat(width);
  const doubleLine = '='.repeat(width);

  const lines: string[] = [];

  // Header
  lines.push(padCenter(data.companyName.toUpperCase(), width));
  if (data.companyAddress) lines.push(padCenter(data.companyAddress, width));
  if (data.gstin) lines.push(padCenter(`GSTIN: ${data.gstin}`, width));
  if (data.phone) lines.push(padCenter(`Ph: ${data.phone}`, width));
  lines.push(padCenter('TAX INVOICE', width));
  lines.push(doubleLine);

  // Meta
  lines.push(padRow(`Bill No: ${data.invoiceNo}`, `Date: ${data.date}`, width));
  if (data.customerName) {
    lines.push(`Customer: ${data.customerName}`);
  }
  lines.push(line);

  // Item headers
  if (width === 32) {
    lines.push('ITEM            QTY  RATE  TOTAL');
  } else {
    lines.push('ITEM DESCRIPTION        QTY     RATE      TOTAL');
  }
  lines.push(line);

  // Items
  for (const item of data.items) {
    const name = item.name.length > 14 ? item.name.substring(0, 14) : item.name;
    const qtyRate = `${item.qty}x${item.rate.toFixed(0)}`;
    const amt = item.amount.toFixed(2);
    lines.push(padRow(`${name.padEnd(14)} ${qtyRate}`, amt, width));
  }
  lines.push(line);

  // Totals
  lines.push(padRow('Subtotal (Taxable):', `Rs. ${data.taxableAmount.toFixed(2)}`, width));
  if (data.cgstAmount > 0) lines.push(padRow('CGST:', `Rs. ${data.cgstAmount.toFixed(2)}`, width));
  if (data.sgstAmount > 0) lines.push(padRow('SGST:', `Rs. ${data.sgstAmount.toFixed(2)}`, width));
  if (data.igstAmount > 0) lines.push(padRow('IGST:', `Rs. ${data.igstAmount.toFixed(2)}`, width));
  lines.push(doubleLine);
  lines.push(padRow('GRAND TOTAL:', `Rs. ${data.grandTotal.toFixed(2)}`, width));
  lines.push(doubleLine);

  if (data.upiId) {
    lines.push(padCenter(`Pay via UPI: ${data.upiId}`, width));
  }
  lines.push(padCenter(data.terms || 'Thank you! Visit again.', width));
  lines.push('\n\n');

  return lines.join('\n');
}

/**
 * Converts text into ESC/POS binary command buffer.
 */
export function buildEscPosBuffer(textContent: string): Uint8Array {
  const encoder = new TextEncoder();
  const textBytes = encoder.encode(textContent);

  // ESC @ (Initialize), text, GS V 0 (Cut paper)
  const init = [0x1b, 0x40];
  const cut = [0x1d, 0x56, 0x00];

  const full = new Uint8Array(init.length + textBytes.length + cut.length);
  full.set(init, 0);
  full.set(textBytes, init.length);
  full.set(cut, init.length + textBytes.length);

  return full;
}
