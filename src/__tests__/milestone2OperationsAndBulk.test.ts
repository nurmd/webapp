// @vitest-environment happy-dom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect } from 'vitest';
import {
  cleanIndianPhoneNumber,
  buildWhatsAppMessage,
  getUpiPaymentUrl,
} from '../core/utils/upiAndShare.ts';
import {
  encodeCode128B,
  generateCode128SvgString,
} from '../core/utils/barcode128.ts';
import {
  generateQrMatrix,
  generateQrCodeSvgString,
} from '../core/utils/qrCodeSvg.ts';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useBulkSelection, UseBulkSelectionReturn } from '../core/utils/useBulkSelection.ts';
import { CompanyProfile } from '../models/company.ts';
import { Invoice } from '../models/invoice.ts';
import { Party } from '../models/party.ts';

const mockCompany: CompanyProfile = {
  id: 'comp-1',
  businessName: 'Apex Infotech Solutions',
  tradeName: 'Apex Store',
  gstin: '27AABCU9603R1ZM',
  pan: 'AABCU9603R',
  stateCode: '27',
  address: '101 Commercial Hub, MG Road',
  pincode: '400001',
  phone: '9820098200',
  email: 'accounts@apexstore.in',
  bankName: 'HDFC Bank',
  accountNumber: '50200012345678',
  ifscCode: 'HDFC0001234',
  upiId: 'apexstore@hdfcbank',
};

const mockInvoice: Invoice = {
  id: 'inv-test-1',
  invoiceNumber: 'INV-2026-0042',
  date: '2026-10-15',
  dueDate: '2026-10-25',
  partyId: 'party-1',
  partyName: 'Bharat Electronics',
  partyPhone: '9876543210',
  partyAddress: 'Shop 4, Market Complex',
  partyStateCode: '27',
  placeOfSupplyStateCode: '27',
  isIntraState: true,
  items: [
    {
      id: 'item-1',
      itemId: 'itm-1',
      name: 'Wireless Barcode Scanner',
      hsnSacCode: '84716025',
      hsnCode: '84716025',
      quantity: 2,
      unit: 'NOS',
      unitPrice: 2500,
      discountPercent: 0,
      discountAmount: 0,
      taxableAmount: 5000,
      gstRate: 18,
      cgstAmount: 450,
      sgstAmount: 450,
      igstAmount: 0,
      cessAmount: 0,
      totalAmount: 5900,
    },
  ],
  totalGrossAmount: 5000,
  totalDiscount: 0,
  totalTaxableAmount: 5000,
  totalCgst: 450,
  totalSgst: 450,
  totalIgst: 0,
  totalCess: 0,
  totalTax: 900,
  roundOff: 0,
  grandTotal: 5900,
  amountInWords: 'Five Thousand Nine Hundred Rupees Only',
  paymentMode: 'UPI',
  paidAmount: 2000,
  balanceAmount: 3900,
  paymentStatus: 'PARTIAL',
  invoiceType: 'B2B',
  createdAt: '2026-10-15T00:00:00.000Z',
  updatedAt: '2026-10-15T00:00:00.000Z',
};

const mockParty: Party = {
  id: 'party-1',
  name: 'Bharat Electronics',
  phone: '9876543210',
  gstin: '27AABCB1234F1Z5',
  type: 'CUSTOMER',
  billingAddress: 'Shop 4, Market Complex',
  stateCode: '27',
  currentBalance: 14500,
  openingBalance: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-10-15T00:00:00Z',
};

describe('Milestone 2: Direct WhatsApp Messaging & Payment Reminders', () => {
  it('normalizes Indian phone numbers correctly for WhatsApp URLs', () => {
    expect(cleanIndianPhoneNumber('9876543210')).toBe('919876543210');
    expect(cleanIndianPhoneNumber('+91 98765 43210')).toBe('919876543210');
    expect(cleanIndianPhoneNumber('09876543210')).toBe('919876543210');
    expect(cleanIndianPhoneNumber('')).toBe('');
  });

  it('falls back to a WhatsApp chooser URL for invalid phones instead of emitting a malformed phone parameter', () => {
    const res = buildWhatsAppMessage(
      mockCompany,
      { invoice: mockInvoice },
      { template: 'INVOICE_DELIVERY', language: 'EN', partyPhone: '12345' }
    );

    expect(res.cleanPhone).toBe('');
    expect(res.whatsappUrl).toContain('https://wa.me/?text=');
    expect(res.whatsappUrl).not.toContain('phone=');
    expect(res.whatsappUrl).not.toContain('wa.me/12345');
  });

  it('builds English invoice delivery message with embedded UPI and Bank details', () => {
    const res = buildWhatsAppMessage(
      mockCompany,
      { invoice: mockInvoice },
      { template: 'INVOICE_DELIVERY', language: 'EN' }
    );

    expect(res.cleanPhone).toBe('919876543210');
    expect(res.text).toContain('Bharat Electronics');
    expect(res.text).toContain('INV-2026-0042');
    expect(res.text).toContain('3,900'); // Balance Due
    expect(res.text).toContain('apexstore@hdfcbank'); // UPI Id
    expect(res.text).toContain('50200012345678'); // Account number
    expect(res.whatsappUrl).toContain('https://wa.me/919876543210?text=');
  });

  it('builds Hindi invoice delivery message with correct vernacular titles', () => {
    const res = buildWhatsAppMessage(
      mockCompany,
      { invoice: mockInvoice },
      { template: 'INVOICE_DELIVERY', language: 'HI' }
    );

    expect(res.text).toContain('नमस्ते Bharat Electronics');
    expect(res.text).toContain('टैक्स इनवॉइस');
    expect(res.text).toContain('*बकाया राशि:* ₹3,900');
    expect(res.text).toContain('UPI से तुरंत भुगतान करें');
  });

  it('builds urgent overdue reminder with days overdue count', () => {
    const res = buildWhatsAppMessage(
      mockCompany,
      { party: mockParty, balanceAmount: 14500 },
      { template: 'OVERDUE_URGENT', language: 'EN', overdueDays: 32 }
    );

    expect(res.text).toContain('URGENT PAYMENT NOTICE');
    expect(res.text).toContain('14,500');
    expect(res.text).toContain('32 days overdue');
    expect(res.text).toContain('*Pay Instantly via UPI:* apexstore@hdfcbank');
  });

  it('generates standard UPI deep link', () => {
    const url = getUpiPaymentUrl(mockCompany, mockInvoice);
    expect(url).toContain('upi://pay?pa=apexstore@hdfcbank');
    expect(url).toContain('am=3900.00'); // Pending balance
    expect(url).toContain('cu=INR');
  });
});

describe('Milestone 2: Zero-Dependency Code128 Barcode Generator', () => {
  it('correctly calculates Code128 checksum and modules pattern', () => {
    const text = 'ITEM-100234';
    const { modules, checksum } = encodeCode128B(text);

    expect(modules.length).toBeGreaterThan(50);
    expect(typeof checksum).toBe('number');
    expect(checksum).toBeGreaterThanOrEqual(0);
    expect(checksum).toBeLessThan(103);
    // Code128 ends with 2-module termination bar (both true)
    expect(modules[modules.length - 1]).toBe(true);
    expect(modules[modules.length - 2]).toBe(true);
  });

  it('generates scalable SVG markup for thermal printing', () => {
    const svg = generateCode128SvgString('SKU-9941', {
      height: 40,
      barWidth: 1.5,
      includeText: true,
      fontSize: 10,
    });

    expect(svg).toContain('<svg');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('<rect');
    expect(svg).toContain('<text');
    expect(svg).toContain('SKU-9941');
    expect(svg).toContain('</svg>');
  });
});

describe('Milestone 2: Zero-Dependency QR Code Generator', () => {
  it('generates valid 2D matrix with finder patterns at three corners', () => {
    const matrix = generateQrMatrix('upi://pay?pa=shop@upi&am=500');
    expect(Array.isArray(matrix)).toBe(true);
    const size = matrix.length;
    expect(size).toBeGreaterThanOrEqual(21); // Version 1 is 21x21
    expect(matrix[0].length).toBe(size);

    // Top-left finder pattern center is black
    expect(matrix[3][3]).toBe(true);
    // Top-right finder pattern center is black
    expect(matrix[3][size - 4]).toBe(true);
    // Bottom-left finder pattern center is black
    expect(matrix[size - 4][3]).toBe(true);
  });

  it('generates standalone QR SVG vector markup', () => {
    const svg = generateQrCodeSvgString('https://apexstore.in', {
      size: 100,
      margin: 2,
    });

    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 100 100"');
    expect(svg).toContain('<rect');
    expect(svg).toContain('</svg>');
  });
});

describe('Milestone 2: Bulk Selection Hook', () => {
  it('manages document IDs selection, toggling, and select-all', () => {
    let hookResult: UseBulkSelectionReturn | null = null;
    function TestComponent() {
      hookResult = useBulkSelection();
      return null;
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(React.createElement(TestComponent));
    });

    expect(hookResult!.selectedCount).toBe(0);
    expect(hookResult!.isSelected('doc-1')).toBe(false);

    // Toggle doc-1
    act(() => {
      hookResult!.toggleSelect('doc-1');
    });
    expect(hookResult!.selectedCount).toBe(1);
    expect(hookResult!.isSelected('doc-1')).toBe(true);

    // Toggle doc-2
    act(() => {
      hookResult!.toggleSelect('doc-2');
    });
    expect(hookResult!.selectedCount).toBe(2);

    // Select all available
    const allIds = ['doc-1', 'doc-2', 'doc-3', 'doc-4'];
    act(() => {
      hookResult!.selectAll(allIds);
    });
    expect(hookResult!.selectedCount).toBe(4);
    expect(hookResult!.isAllSelected(allIds)).toBe(true);
    expect(hookResult!.isIndeterminate(allIds)).toBe(false);

    // Clear selection
    act(() => {
      hookResult!.clearSelection();
    });
    expect(hookResult!.selectedCount).toBe(0);
    expect(hookResult!.isAllSelected(allIds)).toBe(false);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
