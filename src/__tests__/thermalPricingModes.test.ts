import { describe, it, expect } from 'vitest';
import { formatThermalReceiptText, ThermalReceiptData } from '../core/printer/escpos.ts';
import { buildThermalReceiptBinary } from '../core/printer/escposBinary.ts';

const inclusiveThermalData: ThermalReceiptData = {
  companyName: 'Apex Enterprise',
  companyAddress: '123 Test St, Mumbai',
  gstin: '27AABCA1234F1Z5',
  phone: '9820098200',
  invoiceNo: 'INV-101',
  date: '26/10/2026',
  customerName: 'Customer One',
  customerPhone: '9876543210',
  totalCess: 12,
  items: [
    {
      name: 'Inclusive Product',
      qty: 1,
      rate: 100,
      rateInclusive: 118,
      cessRate: 12,
      amount: 130,
    },
  ],
  taxableAmount: 100,
  cgstAmount: 9,
  sgstAmount: 9,
  igstAmount: 0,
  grandTotal: 130,
  isCompositionScheme: false,
};

const compositionThermalData: ThermalReceiptData = {
  companyName: 'Apex Composition Stores',
  companyAddress: '123 Test St, Mumbai',
  gstin: '27AABCA1234F1Z5',
  phone: '9820098200',
  invoiceNo: 'INV-COMP-1',
  date: '26/10/2026',
  customerName: 'Customer Two',
  totalCess: 0,
  items: [
    {
      name: 'Regular Item',
      qty: 1,
      rate: 100,
      amount: 100,
    },
  ],
  taxableAmount: 100,
  cgstAmount: 0,
  sgstAmount: 0,
  igstAmount: 0,
  grandTotal: 100,
  isCompositionScheme: true,
};

const nonGstThermalData: ThermalReceiptData = {
  ...compositionThermalData,
  gstin: '',
  isCompositionScheme: false,
};

describe('Thermal Pricing Modes & CESS Layout (Phase 5B)', () => {
  it('1. formatThermalReceiptText formats inclusive item and CESS properly respecting line width', () => {
    // Test 32-column
    const text32 = formatThermalReceiptText(inclusiveThermalData, 32);
    expect(text32).toContain('Incl');
    expect(text32).toContain('118.00');
    expect(text32).toContain('CESS');
    expect(text32).toContain('12.00');

    const lines32 = text32.split('\n');
    for (const l of lines32) {
      expect(l.length).toBeLessThanOrEqual(32);
    }

    // Test 48-column
    const text48 = formatThermalReceiptText(inclusiveThermalData, 48);
    expect(text48).toContain('Incl');
    expect(text48).toContain('118.00');
    expect(text48).toContain('CESS');
    expect(text48).toContain('12.00');

    const lines48 = text48.split('\n');
    for (const l of lines48) {
      expect(l.length).toBeLessThanOrEqual(48);
    }
  });

  it('2. buildThermalReceiptBinary generates ESC/POS binary stream containing Incl and CESS', () => {
    expect(() => {
      const binaryBytes32 = buildThermalReceiptBinary(inclusiveThermalData, { width: 32 });
      const decoded32 = new TextDecoder('ascii').decode(binaryBytes32);
      expect(decoded32).toContain('Incl');
      expect(decoded32).toContain('CESS');

      const binaryBytes48 = buildThermalReceiptBinary(inclusiveThermalData, { width: 48 });
      const decoded48 = new TextDecoder('ascii').decode(binaryBytes48);
      expect(decoded48).toContain('Incl');
      expect(decoded48).toContain('CESS');
    }).not.toThrow();
  });

  it('3. Composition and non-GST data with totalCess: 0 suppress CESS and Incl lines', () => {
    // Composition scheme
    const compText = formatThermalReceiptText(compositionThermalData, 32);
    expect(compText).not.toContain('CESS');
    expect(compText).not.toContain('Incl');

    const compBinary = buildThermalReceiptBinary(compositionThermalData, { width: 32 });
    const decodedComp = new TextDecoder('ascii').decode(compBinary);
    expect(decodedComp).not.toContain('CESS');
    expect(decodedComp).not.toContain('Incl');

    // Non-GST
    const nonGstText = formatThermalReceiptText(nonGstThermalData, 32);
    expect(nonGstText).not.toContain('CESS');
    expect(nonGstText).not.toContain('Incl');

    const nonGstBinary = buildThermalReceiptBinary(nonGstThermalData, { width: 32 });
    const decodedNonGst = new TextDecoder('ascii').decode(nonGstBinary);
    expect(decodedNonGst).not.toContain('CESS');
    expect(decodedNonGst).not.toContain('Incl');
  });

  it('4. isGst: true with empty gstin still prints Incl and CESS', () => {
    const dataWithEmptyGstin: ThermalReceiptData = {
      ...inclusiveThermalData,
      items: [
        {
          name: 'Special Product',
          qty: 1,
          rate: 100,
          rateInclusive: 118,
          cessRate: 12,
          amount: 130,
        },
      ],
      gstin: '',
      isGst: true,
    };

    const text32 = formatThermalReceiptText(dataWithEmptyGstin, 32);
    expect(text32).toContain('Incl');
    expect(text32).toContain('CESS');

    const binaryBytes32 = buildThermalReceiptBinary(dataWithEmptyGstin, { width: 32 });
    const decoded32 = new TextDecoder('ascii').decode(binaryBytes32);
    expect(decoded32).toContain('Incl');
    expect(decoded32).toContain('CESS');
  });

  it('5. isGst: false hides Incl and CESS even if stale GSTIN is present', () => {
    const dataWithStaleGstin: ThermalReceiptData = {
      ...inclusiveThermalData,
      items: [
        {
          name: 'Special Product',
          qty: 1,
          rate: 100,
          rateInclusive: 118,
          cessRate: 12,
          amount: 130,
        },
      ],
      gstin: '27AABCA1234F1Z5',
      isGst: false,
    };

    const text32 = formatThermalReceiptText(dataWithStaleGstin, 32);
    expect(text32).not.toContain('Incl');
    expect(text32).not.toContain('CESS');

    const binaryBytes32 = buildThermalReceiptBinary(dataWithStaleGstin, { width: 32 });
    const decoded32 = new TextDecoder('ascii').decode(binaryBytes32);
    expect(decoded32).not.toContain('Incl');
    expect(decoded32).not.toContain('CESS');
  });
});
