// @vitest-environment happy-dom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const storage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (k: string) => storage[k] ?? null,
  setItem: (k: string, v: string) => {
    storage[k] = String(v);
  },
  removeItem: (k: string) => {
    delete storage[k];
  },
  clear: () => {
    Object.keys(storage).forEach((k) => delete storage[k]);
  },
};
(globalThis as any).localStorage = mockLocalStorage;
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { value: mockLocalStorage, writable: true });
}

if (typeof ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { InvoicePreviewModal } from '../components/Invoicing/InvoicePreviewModal.tsx';
import { Invoice } from '../models/invoice.ts';
import { CompanyProfile } from '../models/company.ts';
import { resetBackNavigationForTesting } from '../core/utils/backNavigation.ts';

const gstCompany: CompanyProfile = {
  id: 'COMP-1',
  businessName: 'Apex GST Goods',
  tradeName: 'Apex Goods',
  gstin: '27AABCA1234F1Z5',
  pan: 'AABCA1234F',
  phone: '9820098200',
  email: 'test@apex.com',
  address: '123 Test St, Mumbai',
  pincode: '400001',
  stateCode: '27',
  isGstEnabled: true,
};

const inclusiveCessInvoice: Invoice = {
  id: 'INV-INC-1',
  invoiceNumber: 'INV-INC-1',
  invoiceType: 'B2B',
  date: '2026-10-26',
  partyName: 'Buyer Corp',
  partyGstin: '27AAACR7191R1Z8',
  partyAddress: '123 Test St, Mumbai',
  partyStateCode: '27',
  placeOfSupplyStateCode: '27',
  isIntraState: true,
  items: [
    {
      id: 'line-1',
      itemId: 'line-1',
      name: 'Inclusive Item 1',
      hsnSacCode: '1234',
      quantity: 1,
      unit: 'PCS',
      unitPrice: 100,
      unitPriceInclusive: 118,
      priceMode: 'INCLUSIVE',
      gstRate: 18,
      cessRate: 12,
      discountPercent: 0,
      discountAmount: 0,
      taxableAmount: 100,
      cgstAmount: 9,
      sgstAmount: 9,
      igstAmount: 0,
      cessAmount: 12,
      totalAmount: 130,
    },
  ],
  totalGrossAmount: 100,
  totalDiscount: 0,
  totalTaxableAmount: 100,
  totalCgst: 9,
  totalSgst: 9,
  totalIgst: 0,
  totalCess: 12,
  totalTax: 30,
  roundOff: 0,
  grandTotal: 130,
  amountInWords: 'One Hundred Thirty Rupees Only',
  paymentMode: 'CASH',
  paymentStatus: 'PAID',
  paidAmount: 130,
  balanceAmount: 0,
  createdAt: '2026-10-26T10:00:00.000Z',
  updatedAt: '2026-10-26T10:00:00.000Z',
};

const noCessInvoice: Invoice = {
  id: 'INV-REG-1',
  invoiceNumber: 'INV-REG-1',
  invoiceType: 'B2B',
  date: '2026-10-26',
  partyName: 'Buyer Corp',
  partyGstin: '27AAACR7191R1Z8',
  partyAddress: '123 Test St, Mumbai',
  partyStateCode: '27',
  placeOfSupplyStateCode: '27',
  isIntraState: true,
  items: [
    {
      id: 'line-2',
      itemId: 'line-2',
      name: 'Standard Exclusive Item',
      hsnSacCode: '5678',
      quantity: 1,
      unit: 'PCS',
      unitPrice: 100,
      unitPriceInclusive: 118,
      priceMode: 'EXCLUSIVE',
      gstRate: 18,
      cessRate: 0,
      discountPercent: 0,
      discountAmount: 0,
      taxableAmount: 100,
      cgstAmount: 9,
      sgstAmount: 9,
      igstAmount: 0,
      cessAmount: 0,
      totalAmount: 118,
    },
  ],
  totalGrossAmount: 100,
  totalDiscount: 0,
  totalTaxableAmount: 100,
  totalCgst: 9,
  totalSgst: 9,
  totalIgst: 0,
  totalCess: 0,
  totalTax: 18,
  roundOff: 0,
  grandTotal: 118,
  amountInWords: 'One Hundred Eighteen Rupees Only',
  paymentMode: 'CASH',
  paymentStatus: 'PAID',
  paidAmount: 118,
  balanceAmount: 0,
  createdAt: '2026-10-26T10:00:00.000Z',
  updatedAt: '2026-10-26T10:00:00.000Z',
};

describe('InvoicePreviewModal Pricing Modes & CESS Display (Phase 5A)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetBackNavigationForTesting();
    localStorage.clear();
    mockLocalStorage.setItem('defaultPrintOption', 'A4');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('1. Renders A4 preview with inclusive line, showing exclusive rate, inclusive rate, CESS line rate, CESS ledger row, and grand total', () => {
    act(() => {
      root.render(
        <InvoicePreviewModal
          invoice={inclusiveCessInvoice}
          company={gstCompany}
          onClose={vi.fn()}
        />
      );
    });

    const text = container.textContent || '';
    expect(text).toContain('100.00');
    expect(text).toContain('118.00');
    expect(text).toContain('CESS 12%');
    expect(text).toContain('CESS');
    expect(text).toContain('12.00');
    expect(text).toContain('130');
  });

  it('2. A no-CESS invoice renders no CESS text anywhere in the preview', () => {
    act(() => {
      root.render(
        <InvoicePreviewModal
          invoice={noCessInvoice}
          company={gstCompany}
          onClose={vi.fn()}
        />
      );
    });

    const text = container.textContent || '';
    expect(text).not.toContain('CESS');
  });

  it('3. A composition-scheme invoice does not show inclusive/CESS tax details', () => {
    const compositionCompany: CompanyProfile = {
      ...gstCompany,
      isCompositionScheme: true,
    };

    act(() => {
      root.render(
        <InvoicePreviewModal
          invoice={inclusiveCessInvoice}
          company={compositionCompany}
          onClose={vi.fn()}
        />
      );
    });

    const text = container.textContent || '';
    expect(text).not.toContain('CESS');
    expect(text).not.toContain('Incl.');
  });

  it('4. Correctly falls back to derive gross, discountAmount, and taxableAmount for an inclusive line without stored taxableAmount/discountAmount', () => {
    const uncomputedInclusiveInvoice: Invoice = {
      id: 'INV-FALLBACK-1',
      invoiceNumber: 'INV-FALLBACK-1',
      invoiceType: 'B2B',
      date: '2026-10-26',
      partyName: 'Buyer Corp',
      partyGstin: '27AAACR7191R1Z8',
      partyAddress: '123 Test St, Mumbai',
      partyStateCode: '27',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      items: [
        {
          id: 'line-fallback',
          itemId: 'line-fallback',
          name: 'Fallback Inclusive Item',
          hsnSacCode: '9999',
          quantity: 2,
          unit: 'PCS',
          unitPrice: 100,
          // unitPriceInclusive omitted to test derivation from inclusiveFromExclusive(100, 18) -> 118
          priceMode: 'INCLUSIVE',
          gstRate: 18,
          cessRate: 0,
          discountPercent: 10,
          // discountAmount omitted: gross = 118 * 2 = 236, discountAmount = 23.6
          // taxableAmount omitted: (236 - 23.6) / 1.18 = 180
          cessAmount: 0,
          totalAmount: 212.4,
        } as any,
      ],
      totalGrossAmount: 200,
      totalDiscount: 23.6,
      totalTaxableAmount: 180,
      totalCgst: 16.2,
      totalSgst: 16.2,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 32.4,
      roundOff: 0,
      grandTotal: 212.4,
      amountInWords: 'Two Hundred Twelve Rupees and Forty Paise Only',
      paymentMode: 'CASH',
      paymentStatus: 'PAID',
      paidAmount: 212.4,
      balanceAmount: 0,
      createdAt: '2026-10-26T10:00:00.000Z',
      updatedAt: '2026-10-26T10:00:00.000Z',
    };

    act(() => {
      root.render(
        <InvoicePreviewModal
          invoice={uncomputedInclusiveInvoice}
          company={gstCompany}
          onClose={vi.fn()}
        />
      );
    });

    const text = container.textContent || '';
    expect(text).toContain('100.00');
    expect(text).toContain('118.00');
    expect(text).toContain('180.00');
  });
});
