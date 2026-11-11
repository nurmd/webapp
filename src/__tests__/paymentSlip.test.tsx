// @vitest-environment happy-dom
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import fs from 'fs';
import path from 'path';

import {
  PaymentSlipSource,
  PaymentSlipData,
  buildPaymentSlipData,
  formatPaymentSlipText,
  buildPaymentSlipHtml,
} from '../core/printer/paymentSlip.ts';
import { PaymentReceiptSlipModal } from '../components/Parties/PaymentReceiptSlipModal.tsx';
import { VoucherEditorModal } from '../components/Parties/VoucherEditorModal.tsx';
import { PassbookEntry } from '../components/Parties/usePartyPassbook.ts';
import { Party } from '../models/party.ts';
import { CompanyProfile } from '../models/company.ts';
import { Voucher } from '../core/accounting/voucherTypes.ts';
import { formatINR } from '../core/utils/formatters.ts';
import { escapeHtml, printDocument } from '../core/utils/printBridge.ts';

// Mock Storage for happy-dom
class TestStorage implements Storage {
  private store: Map<string, string> = new Map();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

const testStorage = new TestStorage();
Object.defineProperty(globalThis, 'localStorage', {
  value: testStorage,
  writable: true,
  configurable: true,
});
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: testStorage,
    writable: true,
    configurable: true,
  });
}

// Mock printBridge printDocument
vi.mock('../core/utils/printBridge.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/utils/printBridge.ts')>();
  return {
    ...actual,
    printDocument: vi.fn(),
  };
});

describe('Payment Slip Suite', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  const mockCompany: CompanyProfile = {
    id: 'COMP-1',
    businessName: 'Apex Enterprise',
    tradeName: 'Apex Industrial Supplies',
    gstin: '27AABCU9603R1ZM',
    pan: 'AABCU9603R',
    stateCode: '27',
    address: 'Plot 44, MIDC Industrial Area, Pune',
    pincode: '411018',
    phone: '9876543210',
    email: 'apex@example.com',
  };

  const mockParty: Party = {
    id: 'PARTY-1',
    name: 'Tata Motors Limited',
    type: 'CUSTOMER',
    phone: '9822012345',
    stateCode: '27',
    billingAddress: 'Pimpri, Pune',
    currentBalance: 5000,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  beforeEach(() => {
    testStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root!.unmount();
      });
      container.remove();
    }
    container = null;
    root = null;
  });

  it('buildPaymentSlipData titles for PAYMENT_IN and PAYMENT_OUT', () => {
    const inSource: PaymentSlipSource = {
      type: 'PAYMENT_IN',
      docNumber: 'REC-2026-001',
      date: '2026-11-10',
      amount: 1500,
      paymentMode: 'UPI',
      notes: 'Advance receipt',
      allocations: [{ documentNumber: 'INV-101', amount: 1500 }],
    };
    const inData = buildPaymentSlipData(inSource, mockParty, mockCompany, { balanceAfter: 3500 });
    expect(inData.slipTitle).toBe('PAYMENT RECEIPT');
    expect(inData.slipNumber).toBe('REC-2026-001');
    expect(inData.companyName).toBe('Apex Industrial Supplies');
    expect(inData.gstin).toBe('27AABCU9603R1ZM');
    expect(inData.amount).toBe(1500);
    expect(inData.amountInWords).toContain('Rupees');
    expect(inData.allocations).toHaveLength(1);
    expect(inData.balanceAfter).toBe(3500);

    const outSource: PaymentSlipSource = {
      type: 'PAYMENT_OUT',
      docNumber: 'VOUCH-2026-002',
      date: '2026-11-10',
      amount: 2500,
      paymentMode: 'CASH',
    };
    const companyWithoutGstin: CompanyProfile = {
      ...mockCompany,
      tradeName: undefined,
      gstin: '',
    };
    const outData = buildPaymentSlipData(outSource, mockParty, companyWithoutGstin);
    expect(outData.slipTitle).toBe('PAYMENT VOUCHER');
    expect(outData.slipNumber).toBe('VOUCH-2026-002');
    expect(outData.companyName).toBe('Apex Enterprise');
    expect(outData.gstin).toBeUndefined();
    expect(outData.allocations).toEqual([]);
  });

  it('formatPaymentSlipText for width 32 and 48 asserts every line length <= width, contains the slip number, amount formatted with formatINR, one line per allocation, and wraps a 120-character party name', () => {
    // 120-character realistic multi-word party name
    const longPartyName = 'Mahalaxmi Enterprises Logistics Wholesalers Distributors Retail Network Commercial Solutions India Private Limited Extra';
    expect(longPartyName.length).toBe(120);

    const testParty: Party = {
      ...mockParty,
      name: longPartyName,
    };

    const source: PaymentSlipSource = {
      type: 'PAYMENT_IN',
      docNumber: 'SLIP-9988',
      date: '2026-11-10',
      amount: 45000,
      paymentMode: 'NEFT',
      notes: 'Cleared via corporate net banking transfer',
      allocations: [
        { documentNumber: 'INV-1', amount: 20000 },
        { documentNumber: 'INV-2', amount: 25000 },
      ],
    };

    const data: PaymentSlipData = buildPaymentSlipData(source, testParty, mockCompany, {
      balanceAfter: 12500,
    });

    // Test for width 32
    const text32 = formatPaymentSlipText(data, 32);
    const lines32 = text32.split('\n');

    expect(lines32.length).toBeGreaterThan(15);
    for (const line of lines32) {
      expect(line.length).toBeLessThanOrEqual(32);
    }
    expect(text32).toContain('SLIP-9988');
    expect(text32).toContain(formatINR(45000));
    expect(text32).toContain('Against #INV-1');
    expect(text32).toContain('Against #INV-2');
    expect(text32).toContain('20,000.00');
    expect(text32).toContain('25,000.00');

    // Asserts wrapping of 120-character party name across multiple lines <= 32
    const partyNameLines32 = lines32.filter(
      (l) => l.includes('Received from:') || l.includes('Mahalaxmi') || l.includes('Enterprises') || l.includes('Commercial')
    );
    expect(partyNameLines32.length).toBeGreaterThanOrEqual(3);
    for (const pl of partyNameLines32) {
      expect(pl.length).toBeLessThanOrEqual(32);
    }

    // Test for width 48
    const text48 = formatPaymentSlipText(data, 48);
    const lines48 = text48.split('\n');

    expect(lines48.length).toBeGreaterThan(15);
    for (const line of lines48) {
      expect(line.length).toBeLessThanOrEqual(48);
    }
    expect(text48).toContain('SLIP-9988');
    expect(text48).toContain(formatINR(45000));
    expect(text48).toContain('Against #INV-1');
    expect(text48).toContain('Against #INV-2');
    expect(text48).toContain('20,000.00');
    expect(text48).toContain('25,000.00');

    // Asserts wrapping of 120-character party name across multiple lines <= 48
    const partyNameLines48 = lines48.filter(
      (l) => l.includes('Received from:') || l.includes('Mahalaxmi') || l.includes('Enterprises') || l.includes('Commercial')
    );
    expect(partyNameLines48.length).toBeGreaterThanOrEqual(2);
    for (const pl of partyNameLines48) {
      expect(pl.length).toBeLessThanOrEqual(48);
    }
  });

  it('buildPaymentSlipHtml contains @page size 58mm for 32 and 80mm for 48, escapes a party name containing <script> and & characters, and contains the same text as formatPaymentSlipText', () => {
    const specialCharsParty: Party = {
      ...mockParty,
      name: '<script>alert("xss")</script> & Sons Traders',
    };

    const source: PaymentSlipSource = {
      type: 'PAYMENT_IN',
      docNumber: 'REC-5544',
      date: '2026-11-10',
      amount: 1000,
    };

    const data = buildPaymentSlipData(source, specialCharsParty, mockCompany);

    // Width 32 HTML
    const html32 = buildPaymentSlipHtml(data, 32);
    expect(html32).toContain('@page');
    expect(html32).toContain('58mm auto');
    expect(html32).not.toContain('<script>alert');
    expect(html32).toContain('&lt;script&gt;alert');
    expect(html32).toContain('&amp;');
    const expectedRawText32 = formatPaymentSlipText(data, 32);
    expect(html32).toContain(escapeHtml(expectedRawText32));

    // Width 48 HTML
    const html48 = buildPaymentSlipHtml(data, 48);
    expect(html48).toContain('@page');
    expect(html48).toContain('80mm auto');
    expect(html48).not.toContain('<script>alert');
    expect(html48).toContain('&lt;script&gt;alert');
    expect(html48).toContain('&amp;');
    const expectedRawText48 = formatPaymentSlipText(data, 48);
    expect(html48).toContain(escapeHtml(expectedRawText48));
  });

  it('component test renders PaymentReceiptSlipModal with a PAYMENT_IN entry and asserts the preview text appears and clicking payment-slip-print calls printDocument', () => {
    const rawVoucher: Voucher = {
      id: 'VCH-001',
      voucherNumber: 'REC-1001',
      voucherType: 'RECEIPT',
      date: '2026-11-10',
      totalAmount: 3200,
      narration: 'Receipt against invoice 101',
      createdAt: '2026-11-10',
      paymentAllocations: [
        {
          documentType: 'INVOICE',
          documentId: 'INV-101',
          documentNumber: 'INV-101',
          amount: 3200,
        },
      ],
      entries: [],
    };

    const entry: PassbookEntry = {
      id: 'entry-1',
      date: '2026-11-10',
      docNumber: 'REC-1001',
      type: 'PAYMENT_IN',
      description: 'Customer Payment Received',
      debit: 0,
      credit: 3200,
      runningBalance: 1800,
      paymentMode: 'UPI',
      rawVoucher,
    };

    const onClose = vi.fn();

    act(() => {
      root!.render(
        <PaymentReceiptSlipModal
          entry={entry}
          party={mockParty}
          company={mockCompany}
          onClose={onClose}
        />
      );
    });

    const preview = container!.querySelector('[data-testid="thermal-receipt-preview"]');
    expect(preview).not.toBeNull();
    expect(preview!.textContent).toContain('REC-1001');
    expect(preview!.textContent).toContain('PAYMENT RECEIPT');
    expect(preview!.textContent).toContain('Tata Motors');
    expect(preview!.textContent).toContain('Limited');
    expect(preview!.textContent).toContain('Against #INV-101');
    expect(preview!.textContent).toContain('3,200.00');

    const printBtn = container!.querySelector('[data-testid="payment-slip-print"]') as HTMLButtonElement;
    expect(printBtn).not.toBeNull();

    act(() => {
      printBtn.click();
    });

    expect(printDocument).toHaveBeenCalledTimes(1);
    expect(printDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        documentType: 'standalone-html',
        jobName: 'Payment-REC-1001',
        paperSize: 'default',
        html: expect.stringContaining('@page'),
      })
    );
  });

  it('static assertion that VoucherEditorModal imports PaymentReceiptSlipModal and renders data-testid="voucher-print-slip"', () => {
    // 1. Static source code assertion
    const voucherEditorModalPath = path.resolve(__dirname, '../components/Parties/VoucherEditorModal.tsx');
    const sourceCode = fs.readFileSync(voucherEditorModalPath, 'utf-8');

    expect(sourceCode).toMatch(
      /import\s+\{\s*PaymentReceiptSlipModal\s*\}\s+from\s+['"]\.\/PaymentReceiptSlipModal(\.tsx)?['"]/
    );
    expect(sourceCode).toContain('data-testid="voucher-print-slip"');

    // 2. Render assertion confirming data-testid="voucher-print-slip" is rendered when company is present and type is PAYMENT_IN
    const paymentInEntry: PassbookEntry = {
      id: 'pay-in-entry',
      date: '2026-11-10',
      docNumber: 'REC-2020',
      type: 'PAYMENT_IN',
      description: 'Payment in transaction',
      debit: 0,
      credit: 5000,
      runningBalance: 0,
      paymentMode: 'CASH',
    };

    act(() => {
      root!.render(
        <VoucherEditorModal
          party={mockParty}
          company={mockCompany}
          editingLedgerEntry={paymentInEntry}
          onClose={() => {}}
        />
      );
    });

    const slipBtn = container!.querySelector('[data-testid="voucher-print-slip"]') as HTMLButtonElement;
    expect(slipBtn).not.toBeNull();
    expect(slipBtn.textContent).toContain('Print slip');

    // Clicking the Print slip button opens PaymentReceiptSlipModal
    act(() => {
      slipBtn.click();
    });

    const printSlipAction = container!.querySelector('[data-testid="payment-slip-print"]');
    expect(printSlipAction).not.toBeNull();
  });
});
