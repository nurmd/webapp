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
import { ReportPdfPreviewModal } from '../components/Reports/ReportPdfPreviewModal.tsx';
import { ReportPdfConfig } from '../components/Reports/utils/reportExportUtils.ts';
import { Invoice } from '../models/invoice.ts';
import { CompanyProfile } from '../models/company.ts';
import { resetBackNavigationForTesting } from '../core/utils/backNavigation.ts';

const testCompany: CompanyProfile = {
  id: 'COMP-TEST',
  businessName: 'Apex Enterprise Pvt Ltd',
  tradeName: 'Apex Enterprise',
  gstin: '27AABCA1234F1Z5',
  pan: 'AABCA1234F',
  phone: '9820098200',
  email: 'billing@apexenterprise.in',
  address: 'Plot 42, Tech Park, Andheri East, Mumbai',
  pincode: '400069',
  stateCode: '27',
  isGstEnabled: true,
  bankName: 'HDFC Bank',
  accountNumber: '50200012345678',
  ifscCode: 'HDFC0001234',
  branchName: 'Andheri East',
  upiId: 'apexenterprise@hdfcbank',
  termsAndConditions: '1. Goods once sold cannot be returned.\n2. Payment due within 15 days.',
};

const testInvoice: Invoice = {
  id: 'INV-2026-999',
  invoiceNumber: 'INV-2026-999',
  invoiceType: 'B2B',
  date: '2026-10-19',
  dueDate: '2026-11-03',
  partyId: 'CUST-100',
  partyName: 'Reliance Retail Ltd',
  partyGstin: '27AAACR7191R1Z8',
  partyStateCode: '27',
  partyAddress: 'G Block, BKC, Bandra East, Mumbai - 400051',
  placeOfSupplyStateCode: '27',
  isIntraState: true,
  isRcm: false,
  items: [
    {
      id: 'item-1',
      itemId: 'SKU-1',
      name: 'Wireless Barcode Scanner Pro',
      hsnSacCode: '8471',
      quantity: 2,
      unit: 'NOS',
      unitPrice: 2500,
      discountPercent: 10,
      discountAmount: 500,
      taxableAmount: 4500,
      gstRate: 18,
      cgstAmount: 405,
      sgstAmount: 405,
      igstAmount: 0,
      cessAmount: 0,
      totalAmount: 5310,
    },
    {
      id: 'item-2',
      itemId: 'SKU-2',
      name: 'Thermal Paper Rolls 80mm',
      hsnSacCode: '4802',
      quantity: 10,
      unit: 'PCS',
      unitPrice: 50,
      discountPercent: 0,
      discountAmount: 0,
      taxableAmount: 500,
      gstRate: 12,
      cgstAmount: 30,
      sgstAmount: 30,
      igstAmount: 0,
      cessAmount: 0,
      totalAmount: 560,
    },
  ],
  totalGrossAmount: 5500,
  totalDiscount: 500,
  totalTaxableAmount: 5000,
  totalCgst: 435,
  totalSgst: 435,
  totalIgst: 0,
  totalCess: 0,
  totalTax: 870,
  shippingAmount: 100,
  roundOff: 0,
  grandTotal: 5970,
  paymentMode: 'CASH',
  paymentStatus: 'PARTIAL',
  paidAmount: 2000,
  balanceAmount: 3970,
  amountInWords: 'Five Thousand Nine Hundred Seventy Rupees Only',
  isGstInvoice: true,
  createdAt: '2026-10-19T10:00:00.000Z',
  updatedAt: '2026-10-19T10:00:00.000Z',
};

const testReportConfig: ReportPdfConfig = {
  title: 'Monthly Sales & Tax Audit Report',
  subtitle: 'Generated for October 2026 Quarter Review',
  company: testCompany,
  dateRangeLabel: '01 Oct 2026 to 31 Oct 2026',
  orientation: 'landscape',
  kpis: [
    { label: 'Total Turnover', value: '₹ 12,45,000' },
    { label: 'Total Output Tax', value: '₹ 2,24,100' },
  ],
  headers: ['Invoice #', 'Party Name', 'GSTIN', 'Taxable', 'CGST', 'SGST', 'Total'],
  rows: [
    ['INV-001', 'Reliance Retail Ltd', '27AAACR7191R1Z8', '₹ 50,000', '₹ 4,500', '₹ 4,500', '₹ 59,000'],
    ['INV-002', 'Tata Digital Stores', '27AAACT8888P1Z1', '₹ 80,000', '₹ 7,200', '₹ 7,200', '₹ 94,400'],
  ],
  summaryRow: ['TOTAL', '2 Transactions', '', '₹ 1,30,000', '₹ 11,700', '₹ 11,700', '₹ 1,53,400'],
};

describe('Mobile Clean Previews Suite (Invoice & Reports)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetBackNavigationForTesting();
    localStorage.clear();
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

  describe('1. InvoicePreviewModal Mobile & A4 Dual-Mode Rendering', () => {
    it('renders clean touch-friendly mobile cards view when Mobile mode is selected', () => {
      act(() => {
        root.render(
          <InvoicePreviewModal
            invoice={testInvoice}
            company={testCompany}
            onClose={vi.fn()}
          />
        );
      });

      // Switch to Mobile format explicitly
      const mobileBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.trim().includes('Mobile')
      );
      expect(mobileBtn).toBeDefined();

      act(() => {
        mobileBtn?.click();
      });

      // Verify Header Card elements
      expect(container.textContent).toContain('INV-2026-999');
      expect(container.textContent).toContain('TAX INVOICE');
      expect(container.textContent).toContain('PARTIALLY PAID');

      // Verify Supplier & Buyer party details
      expect(container.textContent).toContain('Apex Enterprise');
      expect(container.textContent).toContain('Reliance Retail Ltd');
      expect(container.textContent).toContain('27AAACR7191R1Z8');

      // Verify Itemized Cards
      expect(container.textContent).toContain('Wireless Barcode Scanner Pro');
      expect(container.textContent).toContain('HSN/SAC: 8471');
      expect(container.textContent).toContain('Thermal Paper Rolls 80mm');

      // Verify Tax & Totals Breakdown Card
      expect(container.textContent).toContain('Tax & Amount Breakdown');
      expect(container.textContent).toContain('₹5000.00');
      expect(container.textContent).toContain('₹5970.00');
      expect(container.textContent).toContain('Five Thousand Nine Hundred Seventy Rupees Only');
      expect(container.textContent).toContain('Balance Due');
      expect(container.textContent).toContain('₹3970.00');

      // Verify Payment & Banking card
      expect(container.textContent).toContain('Payment Information');
      expect(container.textContent).toContain('apexenterprise@hdfcbank');
      expect(container.textContent).toContain('HDFC Bank');
      expect(container.textContent).toContain('50200012345678');
    });

    it('renders Mobile tab in format selector and renders mobile view by default, while supporting initialViewMode', () => {
      act(() => {
        root.render(
          <InvoicePreviewModal
            invoice={testInvoice}
            company={testCompany}
            onClose={vi.fn()}
          />
        );
      });

      // Verify format selector has Mobile tab
      const mobileBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.trim().includes('Mobile')
      );
      expect(mobileBtn).toBeDefined();

      // Verify A4 Laser tab is removed from format selector
      const a4Btn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.trim().includes('A4 Laser')
      );
      expect(a4Btn).toBeUndefined();

      // By default renders Mobile mode
      expect(container.textContent).toContain('INV-2026-999');

      // Re-render with initialViewMode="A4" to verify A4 printable sheet still renders when requested
      act(() => {
        root.render(
          <InvoicePreviewModal
            invoice={testInvoice}
            company={testCompany}
            onClose={vi.fn()}
            initialViewMode="A4"
          />
        );
      });
      const a4Sheet = container.querySelector('.printable-invoice');
      expect(a4Sheet).not.toBeNull();

      // Re-render with initialViewMode="THERMAL" to verify thermal slip still renders when requested
      act(() => {
        root.render(
          <InvoicePreviewModal
            invoice={testInvoice}
            company={testCompany}
            onClose={vi.fn()}
            initialViewMode="THERMAL"
          />
        );
      });
      expect(container.textContent).toContain('GRAND TOTAL');
    });

    it('invokes window.print when Print / PDF button is clicked in Mobile mode', () => {
      const printSpy = vi.fn();
      window.print = printSpy;

      act(() => {
        root.render(
          <InvoicePreviewModal
            invoice={testInvoice}
            company={testCompany}
            onClose={vi.fn()}
          />
        );
      });

      // Switch to Mobile
      const mobileBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.trim().includes('Mobile')
      );
      act(() => {
        mobileBtn?.click();
      });

      // Click Print / PDF
      const printBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Print / PDF')
      );
      expect(printBtn).toBeDefined();

      act(() => {
        printBtn?.click();
      });

      expect(printSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. ReportPdfPreviewModal Mobile Cards & A4 Sheet Modes', () => {
    it('renders structured mobile cards with KPIs, records, and totals in Cards mode', () => {
      act(() => {
        root.render(
          <ReportPdfPreviewModal
            isOpen={true}
            config={testReportConfig}
            onClose={vi.fn()}
          />
        );
      });

      // Switch to Cards mode
      const cardsBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.trim().includes('Cards')
      );
      expect(cardsBtn).toBeDefined();

      act(() => {
        cardsBtn?.click();
      });

      // Check header info
      expect(container.textContent).toContain('Monthly Sales & Tax Audit Report');
      expect(container.textContent).toContain('Apex Enterprise');

      // Check KPIs
      expect(container.textContent).toContain('Total Turnover');
      expect(container.textContent).toContain('₹ 12,45,000');

      // Check Records count and rows
      expect(container.textContent).toContain('Records (2)');
      expect(container.textContent).toContain('INV-001');
      expect(container.textContent).toContain('Reliance Retail Ltd');
      expect(container.textContent).toContain('INV-002');
      expect(container.textContent).toContain('Tata Digital Stores');

      // Check Report Summary & Totals
      expect(container.textContent).toContain('Report Summary & Totals');
      expect(container.textContent).toContain('₹ 1,53,400');
    });

    it('filters rows via mobile search box in Cards mode', () => {
      act(() => {
        root.render(
          <ReportPdfPreviewModal
            isOpen={true}
            config={{
              ...testReportConfig,
              rows: [
                ...testReportConfig.rows,
                ['INV-003', 'Adani Logistics', '27AAAAL1234Z1Z2', '₹ 20,000', '₹ 1,800', '₹ 1,800', '₹ 23,600'],
                ['INV-004', 'Infosys Tech', '27AAAAL5678Z1Z3', '₹ 30,000', '₹ 2,700', '₹ 2,700', '₹ 35,400'],
                ['INV-005', 'Wipro Services', '27AAAAL9999Z1Z4', '₹ 40,000', '₹ 3,600', '₹ 3,600', '₹ 47,200'],
              ],
            }}
            onClose={vi.fn()}
          />
        );
      });

      // Switch to Cards mode
      const cardsBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.trim().includes('Cards')
      );
      act(() => {
        cardsBtn?.click();
      });

      // Search box should appear for > 4 rows
      const searchInput = container.querySelector('input[type="text"]') as HTMLInputElement;
      expect(searchInput).not.toBeNull();

      act(() => {
        const tracker = (searchInput as any)._valueTracker;
        if (tracker) {
          tracker.setValue('');
        }
        searchInput.value = 'Adani';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new Event('change', { bubbles: true }));
      });

      expect(container.textContent).toContain('Records (1)');
      const cardsList = container.querySelector('.space-y-2');
      expect(cardsList?.textContent).toContain('Adani Logistics');
      expect(cardsList?.textContent).not.toContain('Reliance Retail Ltd');
    });
  });
});
