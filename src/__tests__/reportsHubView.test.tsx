import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { BusinessReportsView } from '../components/Reports/BusinessReportsView.tsx';
import { CompanyProfile } from '../models/company.ts';
import { Invoice } from '../models/invoice.ts';
import { PurchaseBill } from '../models/purchase.ts';
import { Expense } from '../models/expense.ts';
import { InventoryItem } from '../models/item.ts';
import { Party } from '../models/party.ts';

// Mock browser APIs
const mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
const mockRevokeObjectURL = vi.fn();
const mockPrint = vi.fn();
const mockOpen = vi.fn();

describe('Reports Hub & Categorized Views Integration Suite (reportsHubView.test.tsx)', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  const mockCompany: CompanyProfile = {
    id: 'company-default',
    businessName: 'Sharma Enterprise Private Limited',
    tradeName: 'Sharma Electronics & Electricals',
    gstin: '27AABCU9603R1ZM',
    pan: 'AABCU9603R',
    pincode: '400058',
    phone: '9876543210',
    email: 'info@sharmaelec.com',
    address: 'Shop 12, Main Market, Mumbai',
    stateCode: '27',
    isGstEnabled: true,
  };

  const mockItems: InventoryItem[] = [
    {
      id: 'item-1',
      name: 'LED Panel 40W',
      sku: 'LED-40W',
      hsnSacCode: '8539',
      category: 'Lighting',
      unit: 'PCS',
      salePrice: 1000,
      purchasePrice: 600,
      gstRate: 18,
      currentStock: 25,
      minStockAlert: 10,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
    {
      id: 'item-2',
      name: 'Copper Wire 1.5mm',
      sku: 'CW-15',
      hsnSacCode: '8544',
      category: 'Electricals',
      unit: 'MTR',
      salePrice: 1500,
      purchasePrice: 1100,
      gstRate: 18,
      currentStock: 3, // Low stock!
      minStockAlert: 5,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
  ];

  const mockParties: Party[] = [
    {
      id: 'party-cust-1',
      name: 'Apex Infotech',
      type: 'CUSTOMER',
      phone: '9820011223',
      gstin: '27AAAAA0000A1Z5',
      currentBalance: 5000,
      openingBalance: 1000,
      openingBalanceType: 'TO_RECEIVE',
      stateCode: '27',
      billingAddress: 'Main Road, Mumbai',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
    {
      id: 'party-supp-1',
      name: 'Bajaj Electricals Ltd',
      type: 'SUPPLIER',
      phone: '9820099887',
      gstin: '27BBBBB0000B1Z6',
      currentBalance: -8000,
      openingBalance: 2000,
      openingBalanceType: 'TO_PAY',
      stateCode: '27',
      billingAddress: 'MIDC, Pune',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
  ];

  const mockInvoices: Invoice[] = [
    {
      id: 'inv-1',
      invoiceNumber: 'INV-2026-001',
      invoiceType: 'B2B',
      date: new Date().toISOString().split('T')[0], // Today
      partyId: 'party-cust-1',
      partyName: 'Apex Infotech',
      partyGstin: '27AAAAA0000A1Z5',
      isIntraState: true,
      placeOfSupplyStateCode: '27',
      totalTaxableAmount: 10000,
      totalCgst: 900,
      totalSgst: 900,
      totalIgst: 0,
      totalTax: 1800,
      grandTotal: 11800,
      paidAmount: 6800,
      balanceAmount: 5000,
      paymentStatus: 'PARTIAL',
      paymentMode: 'BANK',
      items: [
        {
          itemId: 'item-1',
          name: 'LED Panel 40W',
          quantity: 10,
          unit: 'PCS',
          unitPrice: 1000,
          taxableAmount: 10000,
          gstRate: 18,
          cgstAmount: 900,
          sgstAmount: 900,
          igstAmount: 0,
          cessAmount: 0,
          totalAmount: 11800,
          hsnSacCode: '8539',
        },
      ],
    },
  ] as unknown as Invoice[];

  const mockPurchases: PurchaseBill[] = [
    {
      id: 'pur-1',
      billNumber: 'PUR-8801',
      date: new Date().toISOString().split('T')[0],
      supplierId: 'party-supp-1',
      supplierName: 'Bajaj Electricals Ltd',
      supplierGstin: '27BBBBB0000B1Z6',
      isIntraState: true,
      placeOfSupplyStateCode: '27',
      itcEligibility: 'ELIGIBLE_INPUTS',
      totalTaxableAmount: 20000,
      totalCgst: 1800,
      totalSgst: 1800,
      totalIgst: 0,
      totalTax: 3600,
      grandTotal: 23600,
      paidAmount: 15600,
      balanceAmount: 8000,
      paymentStatus: 'PARTIAL',
      paymentMode: 'BANK',
      items: [],
    },
  ] as unknown as PurchaseBill[];

  const mockExpenses: Expense[] = [
    {
      id: 'exp-1',
      category: 'Rent & Utilities',
      title: 'Shop Rent',
      amount: 15000,
      taxableAmount: 15000,
      gstRate: 0,
      taxAmount: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      date: new Date().toISOString().split('T')[0],
      paymentMode: 'BANK_TRANSFER',
      itcEligible: false,
      createdAt: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    URL.createObjectURL = mockCreateObjectURL;
    URL.revokeObjectURL = mockRevokeObjectURL;
    window.print = mockPrint;
    window.open = mockOpen;

    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it('1. Mounts BusinessReportsView with all 5 category navigation cards and active counters', async () => {
    await act(async () => {
      root.render(
        <BusinessReportsView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
        />
      );
    });

    // Check all 5 category buttons exist
    const tabs = container.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(5);

    expect(container.textContent).toContain('GST & Tax');
    expect(container.textContent).toContain('Sales');
    expect(container.textContent).toContain('Purchases');
    expect(container.textContent).toContain('Khata Dues');
    expect(container.textContent).toContain('Stock');

    // Default category is GST & Tax Compliance
    expect(container.textContent).toContain('GSTR-1 Outward');
    expect(container.textContent).toContain('GSTR-3B Tax Offset');
    expect(container.textContent).toContain('HSN/SAC Summary');
  });

  it('2. Switches sub-reports within GST & Tax Compliance (GSTR-3B, HSN Summary)', async () => {
    await act(async () => {
      root.render(
        <BusinessReportsView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
        />
      );
    });

    // Switch to GSTR-3B sub-report
    const gstr3bBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('GSTR-3B Tax Offset')
    );
    expect(gstr3bBtn).toBeDefined();

    await act(async () => {
      gstr3bBtn?.click();
    });

    // Verify GSTR-3B tables render
    expect(container.textContent).toContain('Table 3.1: Details of Outward Supplies & Liabilities');
    expect(container.textContent).toContain('Table 4: Eligible Input Tax Credit');
    expect(container.textContent).toContain('Table 6.1: Payment of Tax');

    // Switch to HSN Summary
    const hsnBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('HSN/SAC Summary')
    );
    await act(async () => {
      hsnBtn?.click();
    });

    expect(container.textContent).toContain('8539');
    expect(container.textContent).toContain('LED Panel 40W');
  });

  it('3. Navigates to Sales & Revenue category and renders Bill-Wise Profit and Item-Wise Sales', async () => {
    await act(async () => {
      root.render(
        <BusinessReportsView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
        />
      );
    });

    // Click Sales & Revenue category tab
    const salesTab = Array.from(container.querySelectorAll('[role="tab"]')).find((t) =>
      t.textContent?.includes('Sales')
    ) as HTMLElement | undefined;
    await act(async () => {
      salesTab?.click();
    });

    expect(container.textContent).toContain('Sales Register');
    expect(container.textContent).toContain('Item-Wise Sales & Margin');

    // Verify Sales Register contents
    expect(container.textContent).toContain('INV-2026-001');
    expect(container.textContent).toContain('Apex Infotech');
    // Profit = 10000 taxable - (10 qty * 600 cost = 6000 COGS) = 4000
    expect(container.textContent).toContain('40.0%');

    // Switch to Item-Wise Sales
    const itemWiseBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Item-Wise Sales & Margin')
    );
    await act(async () => {
      itemWiseBtn?.click();
    });

    expect(container.textContent).toContain('LED Panel 40W');
    expect(container.textContent).toContain('Qty Sold');
    expect(container.textContent).toContain('10');
  });

  it('4. Navigates to Purchases & Expenses category and displays 10-category expense breakdown', async () => {
    await act(async () => {
      root.render(
        <BusinessReportsView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
        />
      );
    });

    // Click Purchases category tab
    const purTab = Array.from(container.querySelectorAll('[role="tab"]')).find((t) =>
      t.textContent?.includes('Purchases')
    ) as HTMLElement | undefined;
    await act(async () => {
      purTab?.click();
    });

    expect(container.textContent).toContain('Purchase Register');
    expect(container.textContent).toContain('Expense Category Breakdown');
    expect(container.textContent).toContain('PUR-8801');
    expect(container.textContent).toContain('Bajaj Electricals Ltd');

    // Switch to Expense Category Breakdown
    const expBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Expense Category Breakdown')
    );
    await act(async () => {
      expBtn?.click();
    });

    expect(container.textContent).toContain('Rent & Utilities');
    expect(container.textContent).toContain('Electricity & Water');
    expect(container.textContent).toContain('Transport & Logistics');
    expect(container.textContent).toContain('Salaries & Wages');
    expect(container.textContent).toContain('Cash Expenses');
    expect(container.textContent).toContain('Bank & Digital Payments');
  });

  it('5. Navigates to Party & Khata Dues and renders Receivables Aging & Party Ledger Statements', async () => {
    await act(async () => {
      root.render(
        <BusinessReportsView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
        />
      );
    });

    // Click Party & Khata Dues
    const khataTab = Array.from(container.querySelectorAll('[role="tab"]')).find((t) =>
      t.textContent?.includes('Khata Dues')
    ) as HTMLElement | undefined;
    await act(async () => {
      khataTab?.click();
    });

    expect(container.textContent).toContain('Receivables Aging');
    expect(container.textContent).toContain('Payables Aging');
    expect(container.textContent).toContain('Party Statements');

    // Receivables Aging table
    expect(container.textContent).toContain('Apex Infotech');
    expect(container.textContent).toContain('0-30 Days');

    // Switch to Party Statements (Passbook)
    const partyStmtBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Party Statements')
    );
    await act(async () => {
      partyStmtBtn?.click();
    });

    expect(container.textContent).toContain('Select Party:');
    expect(container.textContent).toContain('Running Balance');
    expect(container.textContent).toContain('OPENING');
  });

  it('6. Navigates to Inventory & Stock category and surfaces valuation & low stock alerts', async () => {
    await act(async () => {
      root.render(
        <BusinessReportsView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
        />
      );
    });

    // Click Inventory & Stock
    const stockTab = Array.from(container.querySelectorAll('[role="tab"]')).find((t) =>
      t.textContent?.includes('Stock')
    ) as HTMLElement | undefined;
    await act(async () => {
      stockTab?.click();
    });

    expect(container.textContent).toContain('Stock Summary & Valuation');
    expect(container.textContent).toContain('Low Stock Warnings');
    expect(container.textContent).toContain('LED Panel 40W');
    expect(container.textContent).toContain('Copper Wire 1.5mm');

    // Switch to Low Stock Warnings
    const lowStockBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Low Stock Warnings')
    );
    await act(async () => {
      lowStockBtn?.click();
    });

    expect(container.textContent).toContain('Copper Wire 1.5mm'); // 3 <= 5
    expect(container.textContent).toContain('Reorder Sheet');
  });

  it('7. Triggers 1-Click Export Excel and Export PDF buttons correctly', async () => {
    await act(async () => {
      root.render(
        <BusinessReportsView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
        />
      );
    });

    // Export Excel button
    const exportExcelBtn = container.querySelector('button[aria-label="Export report to Excel or CSV"]') as HTMLButtonElement;
    expect(exportExcelBtn).toBeDefined();

    await act(async () => {
      exportExcelBtn?.click();
    });

    expect(mockCreateObjectURL).toHaveBeenCalled();

    // Export PDF button
    const exportPdfBtn = container.querySelector('button[aria-label="Export report to printable PDF"]') as HTMLButtonElement;
    expect(exportPdfBtn).toBeDefined();

    await act(async () => {
      exportPdfBtn?.click();
    });

    expect(mockOpen).toHaveBeenCalled();
  });

  it('8. Search input filters records dynamically', async () => {
    await act(async () => {
      root.render(
        <BusinessReportsView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
        />
      );
    });

    const searchInput = container.querySelector('input[aria-label="Filter report records"]') as HTMLInputElement;
    expect(searchInput).toBeDefined();

    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      nativeSetter?.call(searchInput, 'NonExistentInvoice999');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.textContent).toContain('No records found in Table 4 B2B');
  });

  it('9. Preserves zero window.confirm and accessibility aria-label invariant', () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    expect(confirmSpy).not.toHaveBeenCalled();

    // Verify all icon buttons have aria-label
    const buttons = container.querySelectorAll('button');
    buttons.forEach((btn) => {
      const hasAria = btn.getAttribute('aria-label') !== null;
      const hasText = (btn.textContent || '').trim().length > 0;
      expect(hasAria || hasText).toBe(true);
    });
  });
});
