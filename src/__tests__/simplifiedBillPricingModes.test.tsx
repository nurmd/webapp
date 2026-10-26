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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { SimplifiedInvoiceModal } from '../components/Invoicing/SimplifiedInvoiceModal.tsx';
import { SimplifiedPurchaseModal } from '../components/Purchases/SimplifiedPurchaseModal.tsx';
import { BulkPrintModal } from '../components/Printing/BulkPrintModal.tsx';
import { Invoice } from '../models/invoice.ts';
import { PurchaseBill } from '../models/purchase.ts';
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
  isCompositionScheme: false,
};

const nonGstCompany: CompanyProfile = {
  ...gstCompany,
  isGstEnabled: false,
};

const inclusiveSalesInvoice: Invoice = {
  id: 'INV-101',
  invoiceNumber: 'INV-101',
  invoiceType: 'B2B',
  date: '2026-10-26',
  partyName: 'Customer One',
  partyGstin: '27AAACR7191R1Z8',
  partyAddress: '123 Test St, Mumbai',
  partyStateCode: '27',
  placeOfSupplyStateCode: '27',
  isIntraState: true,
  isGstInvoice: true,
  items: [
    {
      id: 'item-1',
      itemId: 'item-1',
      name: 'Inclusive Product',
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

const inclusivePurchaseBill: PurchaseBill = {
  id: 'PUR-101',
  billNumber: 'PUR-101',
  date: '2026-10-26',
  supplierId: 'SUP-1',
  supplierName: 'Supplier One',
  supplierGstin: '27AABCT1234F1Z5',
  supplierAddress: '456 Supply Road, Mumbai',
  supplierStateCode: '27',
  placeOfSupplyStateCode: '27',
  isIntraState: true,
  itcEligibility: 'ELIGIBLE_INPUTS',
  isRcm: false,
  items: [
    {
      id: 'pitem-1',
      itemId: 'pitem-1',
      name: 'Inward Inclusive Product',
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
  paymentMode: 'CASH',
  paymentStatus: 'PAID',
  paidAmount: 130,
  balanceAmount: 0,
  createdAt: '2026-10-26T10:00:00.000Z',
  updatedAt: '2026-10-26T10:00:00.000Z',
};

describe('Simplified Bill Previews & Bulk Print GST Modes (Phase 5C)', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    resetBackNavigationForTesting();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
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
    resetBackNavigationForTesting();
  });

  it('1. SimplifiedInvoiceModal renders inclusive sales line with 100.00, 118.00, CESS 12%, CESS, 12.00, 130', async () => {
    await act(async () => {
      root!.render(
        <SimplifiedInvoiceModal
          invoice={inclusiveSalesInvoice}
          company={gstCompany}
          onClose={vi.fn()}
        />
      );
    });

    const text = container?.textContent || '';
    expect(text).toContain('100.00');
    expect(text).toContain('118.00');
    expect(text).toContain('CESS 12%');
    expect(text).toContain('CESS');
    expect(text).toContain('12.00');
    expect(text).toContain('130');
  });

  it('2. SimplifiedPurchaseModal renders inclusive purchase line with 100.00, 118.00, CESS 12%, CESS, 12.00, 130', async () => {
    await act(async () => {
      root!.render(
        <SimplifiedPurchaseModal
          bill={inclusivePurchaseBill}
          company={gstCompany}
          onClose={vi.fn()}
        />
      );
    });

    const text = container?.textContent || '';
    expect(text).toContain('100.00');
    expect(text).toContain('118.00');
    expect(text).toContain('CESS 12%');
    expect(text).toContain('CESS');
    expect(text).toContain('12.00');
    expect(text).toContain('130');
  });

  it('3. GST-inactive sales and purchase previews show no Incl. and no CESS', async () => {
    // 3a. Inactive sales
    await act(async () => {
      root!.render(
        <SimplifiedInvoiceModal
          invoice={inclusiveSalesInvoice}
          company={nonGstCompany}
          onClose={vi.fn()}
        />
      );
    });

    let text = container?.textContent || '';
    expect(text).not.toContain('Incl.');
    expect(text).not.toContain('CESS');

    // 3b. Inactive purchase
    await act(async () => {
      root!.render(
        <SimplifiedPurchaseModal
          bill={inclusivePurchaseBill}
          company={nonGstCompany}
          onClose={vi.fn()}
        />
      );
    });

    text = container?.textContent || '';
    expect(text).not.toContain('Incl.');
    expect(text).not.toContain('CESS');
  });

  it('4. BulkPrintModal renders inclusive invoice with Incl. and CESS 12%', async () => {
    await act(async () => {
      root!.render(
        <BulkPrintModal
          isOpen={true}
          company={gstCompany}
          invoices={[inclusiveSalesInvoice]}
          onClose={vi.fn()}
        />
      );
    });

    const text = container?.textContent || '';
    expect(text).toContain('Incl.');
    expect(text).toContain('CESS 12%');
  });
});
