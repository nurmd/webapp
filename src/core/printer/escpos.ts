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
  totalDiscount?: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  shippingAmount?: number;
  roundOff?: number;
  grandTotal: number;
  paidAmount?: number;
  balanceAmount?: number;
  partyBalance?: number;
  paymentSplits?: Array<{ mode: string; amount: number }>;
  upiId?: string;
  terms?: string;
  stateName?: string;
}

/**
 * Generates formatted text layout for 58mm (32 chars) or 80mm (48 chars) thermal printers.
 */
export function formatThermalReceiptText(
  data: ThermalReceiptData,
  width: 32 | 48 = 32,
  options: { showPartyBalance?: boolean } = {}
): string {
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
  lines.push(padCenter(data.gstin ? 'TAX INVOICE' : 'RETAIL INVOICE', width));
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
  lines.push(padRow(data.gstin ? 'Subtotal (Taxable):' : 'Subtotal:', `Rs. ${data.taxableAmount.toFixed(2)}`, width));
  if (data.totalDiscount && data.totalDiscount > 0) {
    lines.push(padRow('Discount:', `-Rs. ${data.totalDiscount.toFixed(2)}`, width));
  }
  if (data.cgstAmount > 0) lines.push(padRow('CGST:', `Rs. ${data.cgstAmount.toFixed(2)}`, width));
  if (data.sgstAmount > 0) lines.push(padRow('SGST:', `Rs. ${data.sgstAmount.toFixed(2)}`, width));
  if (data.igstAmount > 0) lines.push(padRow('IGST:', `Rs. ${data.igstAmount.toFixed(2)}`, width));
  if (data.shippingAmount && data.shippingAmount > 0) {
    lines.push(padRow('Shipping:', `+Rs. ${data.shippingAmount.toFixed(2)}`, width));
  }
  if (data.roundOff && data.roundOff !== 0) {
    const sign = data.roundOff > 0 ? '+' : '';
    lines.push(padRow('Round Off:', `${sign}Rs. ${data.roundOff.toFixed(2)}`, width));
  }
  lines.push(doubleLine);
  lines.push(padRow('GRAND TOTAL:', `Rs. ${data.grandTotal.toFixed(2)}`, width));
  lines.push(doubleLine);

  if (data.paymentSplits && data.paymentSplits.length > 1) {
    data.paymentSplits.forEach((s) => {
      if (s.mode !== 'CREDIT' && s.amount > 0) {
        lines.push(padRow(`Paid (${s.mode}):`, `Rs. ${s.amount.toFixed(2)}`, width));
      }
    });
  } else if (typeof data.paidAmount === 'number' && data.paidAmount > 0) {
    lines.push(padRow('Paid Amount:', `Rs. ${data.paidAmount.toFixed(2)}`, width));
  }
  if (typeof data.balanceAmount === 'number' && data.balanceAmount > 0) {
    lines.push(padRow('Bill Balance Due:', `Rs. ${data.balanceAmount.toFixed(2)}`, width));
  }
  if (options.showPartyBalance !== false && typeof data.partyBalance === 'number') {
    const balText = data.partyBalance > 0
      ? `Rs. ${data.partyBalance.toFixed(2)} Dr`
      : data.partyBalance < 0
      ? `Rs. ${Math.abs(data.partyBalance).toFixed(2)} Cr`
      : 'Rs. 0.00';
    lines.push(padRow('Total Party Bal:', balText, width));
    lines.push(line);
  }

  if (data.upiId) {
    lines.push(padCenter(`Pay via UPI: ${data.upiId}`, width));
  }
  lines.push(padCenter(data.terms || 'Thank you! Visit again.', width));
  if (data.stateName) {
    lines.push(padCenter(`Subject to ${data.stateName} jurisdiction`, width));
  }
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
