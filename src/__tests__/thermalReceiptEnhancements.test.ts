import { describe, it, expect } from 'vitest';
import { formatThermalReceiptText, ThermalReceiptData } from '../core/printer/escpos.ts';
import { buildThermalReceiptBinary } from '../core/printer/escposBinary.ts';

const mockReceiptData: ThermalReceiptData = {
  companyName: 'Apex Retail Stores',
  companyAddress: '101 MG Road, Mumbai 400001',
  gstin: '27AABCU9603R1ZN',
  phone: '9876543210',
  receiptTitle: 'RETAIL TAX INVOICE',
  invoiceNo: 'POS-2026-0042',
  date: '10-Oct-2026',
  customerName: 'Dinesh Sharma',
  customerPhone: '9820098200',
  items: [
    {
      name: 'Basmati Rice 5kg',
      qty: 2,
      rate: 450.0,
      amount: 900.0,
    },
    {
      name: 'Sunflower Cooking Oil 1L',
      qty: 3,
      rate: 160.0,
      amount: 480.0,
    },
  ],
  taxableAmount: 1380.0,
  cgstAmount: 34.5,
  sgstAmount: 34.5,
  igstAmount: 0,
  grandTotal: 1449.0,
  paidAmount: 1449.0,
  balanceAmount: 0,
  partyBalance: 250.0,
};

describe('Thermal Receipt Layout & Metadata Enhancements', () => {
  describe('R1: Columnar Item Layout (No redundant qtyxrate)', () => {
    it('formats 32-column receipt with columnar alignment and without "2x450"', () => {
      const text = formatThermalReceiptText(mockReceiptData, 32);

      // Verify header columns
      expect(text).toContain('QTY');
      expect(text).toContain('RATE');
      expect(text).toContain('TOTAL');

      // Verify redundant "2x450" or "3x160" is NOT printed
      expect(text).not.toContain('2x450');
      expect(text).not.toContain('3x160');

      // Verify quantities, unit rates, and totals are printed in separate columns
      expect(text).toContain('2    450.00      900.00');
      expect(text).toContain('3    160.00      480.00');
    });

    it('formats 48-column receipt with dedicated tabular columns', () => {
      const text = formatThermalReceiptText(mockReceiptData, 48);

      expect(text).toContain('ITEM DESCRIPTION     ');
      expect(text).toContain('QTY');
      expect(text).toContain('RATE');
      expect(text).toContain('TOTAL');

      expect(text).not.toContain('2x450');
      expect(text).not.toContain('3x160');

      // 48-column row check
      expect(text).toContain('2    450.00     900.00');
      expect(text).toContain('3    160.00     480.00');
    });
  });

  describe('R2: Customer Phone Number Display', () => {
    it('prints customer phone number when provided', () => {
      const text = formatThermalReceiptText(mockReceiptData, 32);
      expect(text).toContain('Customer: Dinesh Sharma');
      expect(text).toContain('Mobile  : 9820098200');
    });

    it('omits customer phone line when customerPhone is absent', () => {
      const withoutPhone = { ...mockReceiptData, customerPhone: undefined };
      const text = formatThermalReceiptText(withoutPhone, 32);
      expect(text).toContain('Customer: Dinesh Sharma');
      expect(text).not.toContain('Mobile  :');
    });
  });

  describe('R3: Dynamic Receipt Title Configuration', () => {
    it('honors custom receipt title override instead of static "TAX INVOICE"', () => {
      const customTitleData = { ...mockReceiptData, receiptTitle: 'ESTIMATE / CASH MEMO' };
      const text = formatThermalReceiptText(customTitleData, 32);
      expect(text).toContain('ESTIMATE / CASH MEMO');
      expect(text).not.toContain('TAX INVOICE');
    });

    it('falls back to TAX INVOICE when GSTIN is present and receiptTitle is empty', () => {
      const defaultTitleData = { ...mockReceiptData, receiptTitle: '' };
      const text = formatThermalReceiptText(defaultTitleData, 32);
      expect(text).toContain('TAX INVOICE');
    });

    it('falls back to RETAIL INVOICE when GSTIN is empty and receiptTitle is empty', () => {
      const retailData = { ...mockReceiptData, gstin: '', receiptTitle: '' };
      const text = formatThermalReceiptText(retailData, 32);
      expect(text).toContain('RETAIL INVOICE');
    });
  });

  describe('R4: ESC/POS Binary Command Stream', () => {
    it('builds binary receipt containing dynamic title and customer phone', () => {
      const binary = buildThermalReceiptBinary(mockReceiptData, { width: 32 });
      expect(binary).toBeInstanceOf(Uint8Array);
      expect(binary.length).toBeGreaterThan(100);

      const decoded = new TextDecoder().decode(binary);
      expect(decoded).toContain('RETAIL TAX INVOICE');
      expect(decoded).toContain('Dinesh Sharma');
      expect(decoded).toContain('9820098200');
      expect(decoded).not.toContain('2x450');
    });
  });
});
