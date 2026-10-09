import { ThermalReceiptData } from './escpos.ts';

// ESC/POS Command Byte Constants
export const ESC = 0x1b;
export const FS = 0x1c;
export const GS = 0x1d;

export class EscPosBuilder {
  private buffer: number[] = [];

  constructor() {
    this.init();
  }

  public init(): this {
    this.buffer.push(ESC, 0x40); // ESC @ - Initialize printer
    return this;
  }

  public alignLeft(): this {
    this.buffer.push(ESC, 0x61, 0x00); // ESC a 0
    return this;
  }

  public alignCenter(): this {
    this.buffer.push(ESC, 0x61, 0x01); // ESC a 1
    return this;
  }

  public alignRight(): this {
    this.buffer.push(ESC, 0x61, 0x02); // ESC a 2
    return this;
  }

  public bold(enable: boolean = true): this {
    this.buffer.push(ESC, 0x45, enable ? 0x01 : 0x00); // ESC E n
    return this;
  }

  public doubleSize(enable: boolean = true): this {
    this.buffer.push(GS, 0x21, enable ? 0x11 : 0x00); // GS ! 0x11 (double width + double height)
    return this;
  }

  public text(str: string): this {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    for (const b of bytes) {
      this.buffer.push(b);
    }
    return this;
  }

  public line(str: string = ''): this {
    if (str) this.text(str);
    this.buffer.push(0x0a); // LF
    return this;
  }

  public feed(lines: number = 1): this {
    for (let i = 0; i < lines; i++) {
      this.buffer.push(0x0a);
    }
    return this;
  }

  /**
   * Cash drawer kick pulse on Pin 2 and Pin 5
   * ESC p m t1 t2 (m=0 for pin 2, m=1 for pin 5, t1=25=50ms, t2=250=500ms)
   */
  public pulseDrawer(): this {
    this.buffer.push(ESC, 0x70, 0x00, 0x19, 0xfa);
    this.buffer.push(ESC, 0x70, 0x01, 0x19, 0xfa);
    return this;
  }

  /**
   * Cut paper command (Partial cut with feed)
   */
  public cut(feedLines: number = 3): this {
    if (feedLines > 0) {
      this.feed(feedLines);
    }
    this.buffer.push(GS, 0x56, 0x42, 0x00); // GS V 66 0
    return this;
  }

  /**
   * Standard ESC/POS QR Code generator (Model 2)
   */
  public qrCode(content: string, moduleSize: number = 6): this {
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(content);
    const storeLen = dataBytes.length + 3;
    const pL = storeLen & 0xff;
    const pH = (storeLen >> 8) & 0xff;

    // 1. Select Model (Model 2)
    this.buffer.push(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);

    // 2. Set Module Size
    this.buffer.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, Math.min(Math.max(moduleSize, 3), 8));

    // 3. Set Error Correction Level (Level M = 49)
    this.buffer.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31);

    // 4. Store Data into QR Symbol Storage Area
    this.buffer.push(GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30);
    for (const b of dataBytes) {
      this.buffer.push(b);
    }

    // 5. Print Symbol
    this.buffer.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);

    return this;
  }

  public toUint8Array(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

/**
 * Builds binary ESC/POS stream for an invoice receipt.
 */
export function buildThermalReceiptBinary(
  data: ThermalReceiptData,
  options: {
    width?: 32 | 48;
    kickDrawer?: boolean;
    printQr?: boolean;
    autoCut?: boolean;
    extraFeedLines?: number;
    showPartyBalance?: boolean;
  } = {}
): Uint8Array {
  const width = options.width || 32;
  const builder = new EscPosBuilder();

  if (options.kickDrawer) {
    builder.pulseDrawer();
  }

  // Header
  builder.alignCenter().doubleSize(true).bold(true).line(data.companyName).doubleSize(false).bold(false);

  if (data.companyAddress) {
    builder.line(data.companyAddress);
  }
  if (data.gstin) {
    builder.line(`GSTIN: ${data.gstin}`);
  }
  if (data.phone) {
    builder.line(`Ph: ${data.phone}`);
  }

  builder.bold(true).line('TAX INVOICE').bold(false);
  builder.line('='.repeat(width));

  // Invoice Meta
  builder.alignLeft();
  builder.line(`Bill No : ${data.invoiceNo}`);
  builder.line(`Date    : ${data.date}`);
  if (data.customerName) {
    builder.line(`Customer: ${data.customerName}`);
  }
  builder.line('-'.repeat(width));

  // Table Columns
  if (width === 32) {
    builder.bold(true).line('ITEM            QTY  RATE  TOTAL').bold(false);
  } else {
    builder.bold(true).line('ITEM DESCRIPTION        QTY     RATE      TOTAL').bold(false);
  }
  builder.line('-'.repeat(width));

  // Line items
  const padRow = (left: string, right: string, len: number) => {
    const space = len - left.length - right.length;
    if (space <= 0) return left.substring(0, len - right.length) + right;
    return left + ' '.repeat(space) + right;
  };

  for (const item of data.items) {
    const name = item.name.length > 14 ? item.name.substring(0, 14) : item.name;
    const qtyRate = `${item.qty}x${item.rate.toFixed(0)}`;
    const amt = item.amount.toFixed(2);
    builder.line(padRow(`${name.padEnd(14)} ${qtyRate}`, amt, width));
  }
  builder.line('-'.repeat(width));

  // Totals
  builder.line(padRow('Taxable Amount:', `Rs. ${data.taxableAmount.toFixed(2)}`, width));
  if (data.cgstAmount > 0) {
    builder.line(padRow('CGST Total:', `Rs. ${data.cgstAmount.toFixed(2)}`, width));
  }
  if (data.sgstAmount > 0) {
    builder.line(padRow('SGST Total:', `Rs. ${data.sgstAmount.toFixed(2)}`, width));
  }
  if (data.igstAmount > 0) {
    builder.line(padRow('IGST Total:', `Rs. ${data.igstAmount.toFixed(2)}`, width));
  }

  builder.line('='.repeat(width));
  builder.bold(true).doubleSize(true).alignCenter();
  builder.line(`TOTAL: Rs. ${data.grandTotal.toFixed(2)}`);
  builder.doubleSize(false).bold(false);
  builder.line('='.repeat(width));

  if (data.paymentSplits && data.paymentSplits.length > 1) {
    data.paymentSplits.forEach((s) => {
      if (s.mode !== 'CREDIT' && s.amount > 0) {
        builder.line(padRow(`Paid (${s.mode}):`, `Rs. ${s.amount.toFixed(2)}`, width));
      }
    });
  } else if (typeof data.paidAmount === 'number' && data.paidAmount > 0) {
    builder.line(padRow('Paid Amount:', `Rs. ${data.paidAmount.toFixed(2)}`, width));
  }
  if (typeof data.balanceAmount === 'number' && data.balanceAmount > 0) {
    builder.line(padRow('Bill Balance Due:', `Rs. ${data.balanceAmount.toFixed(2)}`, width));
  }
  if (options.showPartyBalance !== false && typeof data.partyBalance === 'number') {
    const balText = data.partyBalance > 0
      ? `Rs. ${data.partyBalance.toFixed(2)} Dr`
      : data.partyBalance < 0
      ? `Rs. ${Math.abs(data.partyBalance).toFixed(2)} Cr`
      : 'Rs. 0.00';
    builder.line(padRow('Total Party Bal:', balText, width));
    builder.line('-'.repeat(width));
  }

  // UPI Dynamic QR Code
  if (options.printQr !== false && data.upiId) {
    const upiUri = `upi://pay?pa=${data.upiId}&pn=${encodeURIComponent(
      data.companyName
    )}&am=${data.grandTotal.toFixed(2)}&cu=INR&tn=Invoice_${data.invoiceNo}`;

    builder.alignCenter().line('Scan UPI to Pay:');
    try {
      builder.qrCode(upiUri, width === 48 ? 6 : 5);
      builder.feed(1);
    } catch (e) {
      builder.line(`UPI: ${data.upiId}`);
    }
  }

  // Footer notes
  builder.alignCenter().line(data.terms || 'Thank you! Visit again.');

  // Extra Feed Lines so the receipt clears the physical tear bar
  const extraFeeds = options.extraFeedLines ?? (width === 48 ? 2 : 4);
  builder.feed(Math.max(1, extraFeeds));

  // Cut Paper: Only execute automatic cut if enabled AND paper is 80mm
  // (58mm portable printers do not have physical cutters; sending GS V can freeze printer firmware)
  if (options.autoCut !== false && width === 48) {
    builder.cut(0);
  }

  return builder.toUint8Array();
}

/**
 * Direct Web Bluetooth ESC/POS Thermal Printer Connection Handler
 */
export async function printViaWebBluetooth(binaryData: Uint8Array): Promise<{ success: boolean; error?: string }> {
  try {
    if (!('bluetooth' in navigator)) {
      throw new Error('Web Bluetooth is not supported on this browser/device.');
    }

    const device = await (navigator as any).bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [
        '000018f0-0000-1000-8000-00805f9b34fb', // Standard POS Service
        'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Star Micronics
        '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC transparent
      ],
    });

    if (!device.gatt) {
      throw new Error('Bluetooth GATT server unavailable.');
    }

    const server = await device.gatt.connect();

    // Look for writable characteristic across available services
    let targetChar: any = null;
    const services = await server.getPrimaryServices();

    for (const service of services) {
      const chars = await service.getCharacteristics();
      for (const ch of chars) {
        if (ch.properties.write || ch.properties.writeWithoutResponse) {
          targetChar = ch;
          break;
        }
      }
      if (targetChar) break;
    }

    if (!targetChar) {
      throw new Error('No writable ESC/POS characteristic found on this printer.');
    }

    // Send chunks (128 bytes per packet for BLE MTU safety and microcontroller buffer pacing)
    const CHUNK_SIZE = 128;
    for (let i = 0; i < binaryData.length; i += CHUNK_SIZE) {
      const chunk = binaryData.slice(i, i + CHUNK_SIZE);
      if (targetChar.properties.writeWithoutResponse) {
        await targetChar.writeValueWithoutResponse(chunk);
      } else {
        await targetChar.writeValue(chunk);
      }
      // Pacing delay between BLE packets to prevent buffer overflow
      await new Promise((resolve) => setTimeout(resolve, 30));
    }

    return { success: true };
  } catch (err: any) {
    console.error('Web Bluetooth ESC/POS Print Error:', err);
    return { success: false, error: err.message || 'Bluetooth connection failed.' };
  }
}
