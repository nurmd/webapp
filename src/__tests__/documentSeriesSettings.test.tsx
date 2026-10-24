import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

// Setup Mock Storage
class TestStorage implements Storage {
  private store: Map<string, string> = new Map();
  get length(): number { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  key(index: number): string | null { return Array.from(this.store.keys())[index] ?? null; }
  removeItem(key: string): void { this.store.delete(key); }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
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

vi.mock('../services/pouchdb.ts', () => ({
  pouch: {
    putDoc: vi.fn().mockResolvedValue({}),
    deleteDoc: vi.fn().mockResolvedValue({}),
    getAllDocs: vi.fn().mockResolvedValue([]),
    syncNow: vi.fn().mockResolvedValue({}),
    subscribe: vi.fn(() => () => {}),
    isConfigured: vi.fn().mockReturnValue(false),
    migrateFromLocalStorage: vi.fn().mockResolvedValue({}),
  },
}));

import { CompanyProfile, DocumentSeriesConfig } from '../models/company.ts';
import {
  formatDocumentNumberPreview,
  getDocumentSeriesConfig,
  generateNextDocumentNumber,
  generateNextInvoiceNumber,
  getFinancialYearString,
} from '../core/utils/invoiceNumber.ts';
import { InvoicePrefixSettingsModal } from '../components/Settings/modals/InvoicePrefixSettingsModal.tsx';

const mockCompany: CompanyProfile = {
  id: 'COMP-1',
  businessName: 'Super Star Enterprises',
  gstin: '27AAAAA0000A1Z5',
  pan: 'AAAAA0000A',
  stateCode: '27',
  address: 'Mumbai',
  pincode: '400001',
  phone: '9876543210',
  email: 'test@example.com',
  invoicePrefix: 'INV-2026-',
};

describe('Full Functional Invoice & Document Prefix Settings', () => {
  it('correctly formats document numbers across year formats, separators, and padding', () => {
    // 1. Calendar year + hyphen + 4 digits
    const cfgCalendar: DocumentSeriesConfig = {
      prefix: 'INV',
      separator: '-',
      yearFormat: 'YYYY',
      paddingDigits: 4,
      startingNumber: 1,
    };
    const testDate = new Date(2026, 9, 15); // Oct 15, 2026
    expect(formatDocumentNumberPreview(cfgCalendar, 1, testDate)).toBe('INV-2026-0001');
    expect(formatDocumentNumberPreview(cfgCalendar, 42, testDate)).toBe('INV-2026-0042');

    // 2. Indian Financial Year (YY-YY) + slash + 4 digits
    const cfgFy: DocumentSeriesConfig = {
      prefix: 'TAX',
      separator: '/',
      yearFormat: 'YY_YY',
      paddingDigits: 4,
      startingNumber: 1,
    };
    // Oct 2026 is in FY 26-27
    expect(formatDocumentNumberPreview(cfgFy, 5, testDate)).toBe('TAX/26-27/0005');

    // 3. Simple sequential (no year) + hyphen + 3 digits
    const cfgSimple: DocumentSeriesConfig = {
      prefix: 'POS',
      separator: '-',
      yearFormat: 'NONE',
      paddingDigits: 3,
      startingNumber: 10,
    };
    expect(formatDocumentNumberPreview(cfgSimple, 10, testDate)).toBe('POS-010');

    // 4. Compact minimal (no separator, no year)
    const cfgCompact: DocumentSeriesConfig = {
      prefix: 'EST',
      separator: '',
      yearFormat: 'NONE',
      paddingDigits: 4,
      startingNumber: 1,
    };
    expect(formatDocumentNumberPreview(cfgCompact, 1, testDate)).toBe('EST0001');
  });

  it('generateNextDocumentNumber respects custom startingNumber and increments sequentially', () => {
    const customCompany: CompanyProfile = {
      ...mockCompany,
      documentSeries: {
        SALES_INVOICE: {
          prefix: 'INV',
          separator: '-',
          yearFormat: 'YYYY',
          paddingDigits: 4,
          startingNumber: 501, // Starts from 501
        },
      },
    };

    const next1 = generateNextDocumentNumber('SALES_INVOICE', customCompany, []);
    expect(next1).toBe('INV-2026-0501');

    // When 501 exists, next should be 502
    const next2 = generateNextDocumentNumber('SALES_INVOICE', customCompany, [
      { id: '1', invoiceNumber: 'INV-2026-0501' },
    ]);
    expect(next2).toBe('INV-2026-0502');
  });

  it('generateNextDocumentNumber isolates numbering across document types', () => {
    const customCompany: CompanyProfile = {
      ...mockCompany,
      documentSeries: {
        SALES_INVOICE: {
          prefix: 'INV',
          separator: '-',
          yearFormat: 'YYYY',
          paddingDigits: 4,
          startingNumber: 1,
        },
        POS_INVOICE: {
          prefix: 'POS',
          separator: '-',
          yearFormat: 'NONE',
          paddingDigits: 4,
          startingNumber: 1,
        },
        ESTIMATE: {
          prefix: 'EST',
          separator: '-',
          yearFormat: 'YYYY',
          paddingDigits: 4,
          startingNumber: 1,
        },
        CREDIT_NOTE: {
          prefix: 'CN',
          separator: '-',
          yearFormat: 'YYYY',
          paddingDigits: 4,
          startingNumber: 1,
        },
      },
    };

    const existingInvoices = [
      { id: '1', invoiceNumber: 'INV-2026-0001' },
      { id: '2', invoiceNumber: 'INV-2026-0002' },
      { id: '3', invoiceNumber: 'POS-0001' },
    ];

    const nextSales = generateNextDocumentNumber('SALES_INVOICE', customCompany, existingInvoices);
    const nextPos = generateNextDocumentNumber('POS_INVOICE', customCompany, existingInvoices);
    const nextEst = generateNextDocumentNumber('ESTIMATE', customCompany, existingInvoices);
    const nextCn = generateNextDocumentNumber('CREDIT_NOTE', customCompany, existingInvoices);

    expect(nextSales).toBe('INV-2026-0003');
    expect(nextPos).toBe('POS-0002');
    expect(nextEst).toBe('EST-2026-0001');
    expect(nextCn).toBe('CN-2026-0001');
  });

  it('correctly parses legacy invoicePrefix "INV/26-27/" without duplicating financial year', () => {
    const legacyCompany: Partial<CompanyProfile> = {
      ...mockCompany,
      invoicePrefix: 'INV/26-27/',
      documentSeries: undefined,
    };

    // 1. With empty invoices: returns INV/26-27/0001 (NOT INV/26-27/2026/0001)
    const next1 = generateNextDocumentNumber('SALES_INVOICE', legacyCompany, []);
    expect(next1).toBe('INV/26-27/0001');

    // 2. Increments sequentially when prior number exists
    const next2 = generateNextDocumentNumber('SALES_INVOICE', legacyCompany, [
      { id: '1', invoiceNumber: 'INV/26-27/0001' },
    ]);
    expect(next2).toBe('INV/26-27/0002');

    // 3. Preserves unrelated numbers like BHW-2026-0001
    const next3 = generateNextDocumentNumber('SALES_INVOICE', legacyCompany, [
      { id: 'bhw-1', invoiceNumber: 'BHW-2026-0001' },
    ]);
    expect(next3).toBe('INV/26-27/0001');

    // 4. generateNextInvoiceNumber utility also handles INV/26-27/
    const nextLegacyHelper = generateNextInvoiceNumber('INV/26-27/', []);
    expect(nextLegacyHelper).toBe('INV/26-27/0001');
  });

  it('preserves legacy prefix pattern like "BHW-2026-" and increments sequentially', () => {
    const bhwCompany: Partial<CompanyProfile> = {
      ...mockCompany,
      invoicePrefix: 'BHW-2026-',
      documentSeries: undefined,
    };

    const next1 = generateNextDocumentNumber('SALES_INVOICE', bhwCompany, []);
    expect(next1).toBe('BHW-2026-0001');

    const next2 = generateNextDocumentNumber('SALES_INVOICE', bhwCompany, [
      { id: '1', invoiceNumber: 'BHW-2026-0001' },
    ]);
    expect(next2).toBe('BHW-2026-0002');
  });

  it('InvoicePrefixSettingsModal renders, allows switching document tabs, and saves settings', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    let savedProfile: CompanyProfile | null = null;
    const handleSave = (updated: CompanyProfile) => {
      savedProfile = updated;
    };

    await act(async () => {
      root.render(
        <InvoicePrefixSettingsModal
          isOpen={true}
          onClose={() => {}}
          profile={mockCompany}
          onSave={handleSave}
        />
      );
    });

    // 1. Verify modal title and document selector tabs
    expect(container.textContent).toContain('Document Numbering & Prefix Settings');
    expect(container.textContent).toContain('Tax Invoice');
    expect(container.textContent).toContain('POS');
    expect(container.textContent).toContain('Quotation / Estimate');
    expect(container.textContent).toContain('Delivery Challan');
    expect(container.textContent).toContain('Credit Note');
    expect(container.textContent).toContain('Debit Note');
    expect(container.textContent).toContain('Purchase Bill');
    expect(container.textContent).toContain('Receipt / Payment Voucher');

    // 2. Click preset "GST Standard"
    const gstBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('GST Standard')
    );
    expect(gstBtn).toBeDefined();

    await act(async () => {
      gstBtn?.click();
    });

    // Should now show slash format in preview
    expect(container.textContent).toContain(`INV/${getFinancialYearString()}/0001`);

    // 3. Click Save All Series Settings
    const saveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save All Series Settings')
    );
    expect(saveBtn).toBeDefined();

    await act(async () => {
      saveBtn?.click();
    });

    expect(savedProfile).not.toBeNull();
    const result = savedProfile as unknown as CompanyProfile;
    expect(result.documentSeries?.SALES_INVOICE?.separator).toBe('/');
    expect(result.documentSeries?.SALES_INVOICE?.yearFormat).toBe('YY_YY');
  });
});
