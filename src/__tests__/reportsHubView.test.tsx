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
import { BankAccount, CashBankTransaction } from '../models/bankAccount.ts';
import { LoanAccount, LoanTransaction } from '../models/loan.ts';

// Mock pouchdb
vi.mock('../services/pouchdb.ts', () => ({
  pouch: {
    putDoc: vi.fn(),
    deleteDoc: vi.fn(),
    getSyncState: vi.fn(),
    syncNow: vi.fn(),
    startSync: vi.fn(),
    migrateFromLocalStorage: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock browser APIs
const mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
const mockRevokeObjectURL = vi.fn();
const mockPrint = vi.fn();
const mockOpen = vi.fn();

describe('Reports Hub & Dedicated Pages Redesign Integration Suite (reportsHubView.test.tsx)', () => {
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
      partyAddress: 'Main Road, Mumbai',
      partyStateCode: '27',
      isIntraState: true,
      placeOfSupplyStateCode: '27',
      totalGrossAmount: 10000,
      totalDiscount: 0,
      totalTaxableAmount: 10000,
      totalCgst: 900,
      totalSgst: 900,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 1800,
      roundOff: 0,
      grandTotal: 11800,
      amountInWords: 'Eleven Thousand Eight Hundred Only',
      paidAmount: 6800,
      balanceAmount: 5000,
      paymentStatus: 'PARTIAL',
      paymentMode: 'UPI',
      items: [
        {
          itemId: 'item-1',
          name: 'LED Panel 40W',
          hsnSacCode: '8539',
          unit: 'PCS',
          quantity: 10,
          unitPrice: 1000,
          taxableAmount: 10000,
          gstRate: 18,
          cgstAmount: 900,
          sgstAmount: 900,
          igstAmount: 0,
          cessAmount: 0,
          totalAmount: 11800,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const mockPurchases: PurchaseBill[] = [
    {
      id: 'pur-1',
      billNumber: 'PUR-8801',
      date: new Date().toISOString().split('T')[0],
      supplierId: 'party-supp-1',
      supplierName: 'Bajaj Electricals Ltd',
      supplierGstin: '27BBBBB0000B1Z6',
      supplierAddress: 'MIDC, Pune',
      supplierStateCode: '27',
      placeOfSupplyStateCode: '27',
      isIntraState: true,
      itcEligibility: 'ELIGIBLE_INPUTS',
      isRcm: false,
      totalGrossAmount: 15000,
      totalDiscount: 0,
      totalTaxableAmount: 15000,
      totalCgst: 1350,
      totalSgst: 1350,
      totalIgst: 0,
      totalCess: 0,
      totalTax: 2700,
      roundOff: 0,
      grandTotal: 17700,
      paidAmount: 9700,
      balanceAmount: 8000,
      paymentStatus: 'PARTIAL',
      paymentMode: 'BANK',
      items: [
        {
          itemId: 'item-1',
          name: 'LED Panel 40W',
          hsnSacCode: '8539',
          unit: 'PCS',
          quantity: 25,
          unitPrice: 600,
          taxableAmount: 15000,
          gstRate: 18,
          cgstAmount: 1350,
          sgstAmount: 1350,
          igstAmount: 0,
          cessAmount: 0,
          totalAmount: 17700,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const mockExpenses: Expense[] = [
    {
      id: 'exp-1',
      category: 'Rent & Utilities',
      title: 'Shop Rent October',
      amount: 25000,
      taxableAmount: 25000,
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
    {
      id: 'exp-2',
      category: 'Electricity & Water',
      title: 'Commercial Power Bill',
      amount: 4500,
      taxableAmount: 4500,
      gstRate: 0,
      taxAmount: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      date: new Date().toISOString().split('T')[0],
      paymentMode: 'CASH',
      itcEligible: false,
      createdAt: new Date().toISOString(),
    },
  ];

  const mockBankAccounts: BankAccount[] = [
    {
      id: 'acc-cash',
      accountName: 'Cash in Hand',
      accountType: 'CASH',
      openingBalance: 15000,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
    {
      id: 'acc-bank-1',
      accountName: 'State Bank of India',
      accountType: 'BANK',
      bankName: 'State Bank of India',
      accountNumber: '32109876543',
      ifscCode: 'SBIN0001234',
      openingBalance: 100000,
      isDefault: true,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
  ];

  const mockCashBankTxns: CashBankTransaction[] = [
    {
      id: 'txn-1',
      txnNumber: 'TXN-001',
      date: new Date().toISOString().split('T')[0],
      type: 'DEPOSIT',
      fromAccountId: 'acc-cash',
      toAccountId: 'acc-bank-1',
      amount: 5000,
      description: 'Cash deposited to SBI',
      createdAt: '2026-10-01T00:00:00Z',
    },
  ];

  const mockLoans: LoanAccount[] = [
    {
      id: 'loan-1',
      lenderName: 'HDFC Bank Term Loan',
      accountNumber: '5010045678',
      loanType: 'TERM_LOAN',
      sanctionAmount: 500000,
      disbursedDate: '2026-04-01',
      interestRateAnnual: 10.5,
      tenorMonths: 36,
      emiAmount: 16250,
      currentPrincipalOutstanding: 420000,
      status: 'ACTIVE',
      createdAt: '2026-04-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
  ];

  const mockLoanTransactions: LoanTransaction[] = [
    {
      id: 'ltxn-1',
      loanId: 'loan-1',
      date: new Date().toISOString().split('T')[0],
      type: 'EMI_PAYMENT',
      principalPaid: 12500,
      interestPaid: 3750,
      totalAmount: 16250,
      paymentMode: 'BANK',
      referenceNo: 'EMI-OCT-2026',
      remainingPrincipal: 420000,
      createdAt: '2026-10-01T00:00:00Z',
    },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    global.URL.createObjectURL = mockCreateObjectURL;
    global.URL.revokeObjectURL = mockRevokeObjectURL;
    window.open = mockOpen;
    window.print = mockPrint;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it('1. Mounts Reports Hub with Top Business Performance Card displaying all 6 core metrics', async () => {
    await act(async () => {
      root.render(
        <BusinessReportsView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
          bankAccounts={mockBankAccounts}
          cashBankTxns={mockCashBankTxns}
          loans={mockLoans}
          loanTransactions={mockLoanTransactions}
        />
      );
    });

    // Check Top Performance Card header
    expect(container.textContent).toContain('Business Performance & Profit');
    expect(container.textContent).toContain('Trading Formula:');

    // Check all 6 requested metrics exist in the card:
    // 1. Gross Profit
    expect(container.textContent).toContain('Gross Profit');
    // 2. Net Profit
    expect(container.textContent).toContain('Net Profit (Bottom Line)');
    // 3. Total Sales
    expect(container.textContent).toContain('Total Sales');
    // 4. Total Purchases
    expect(container.textContent).toContain('Total Purchases');
    // 5. Opening Stock
    expect(container.textContent).toContain('Opening Stock');
    // 6. Closing Stock
    expect(container.textContent).toContain('Closing Stock');
  });

  it('2. Renders all 10 selectable navigation report cards across Operations and Financials', async () => {
    await act(async () => {
      root.render(
        <BusinessReportsView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
          bankAccounts={mockBankAccounts}
          cashBankTxns={mockCashBankTxns}
          loans={mockLoans}
          loanTransactions={mockLoanTransactions}
        />
      );
    });

    // Section 1: Operations & Tax Compliance
    expect(container.textContent).toContain('Operations & Tax Compliance');
    expect(container.textContent).toContain('GST & Tax Compliance');
    expect(container.textContent).toContain('Sales & Revenue');
    expect(container.textContent).toContain('Purchases & Expenses');
    expect(container.textContent).toContain('Party & Khata Dues');
    expect(container.textContent).toContain('Inventory & Stock Valuation');

    // Section 2: Financial Statements & Banking
    expect(container.textContent).toContain('Financial Statements & Banking');
    expect(container.textContent).toContain('Cash Flow Statement');
    expect(container.textContent).toContain('Balance Sheet');
    expect(container.textContent).toContain('Bank Statement');
    expect(container.textContent).toContain('Loan Statement & EMIs');
    expect(container.textContent).toContain('Accounting Daybook');
  });

  it('3. Navigates to dedicated GST & Tax Compliance page, switches sub-reports, and navigates back to Hub', async () => {
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

    // Click GST & Tax Compliance report card
    const gstCard = Array.from(container.querySelectorAll('[role="button"]')).find((c) =>
      c.textContent?.includes('GST & Tax Compliance')
    ) as HTMLElement | undefined;
    expect(gstCard).toBeDefined();

    await act(async () => {
      gstCard?.click();
    });

    // Verify we are on dedicated page with Back button
    expect(container.textContent).toContain('Reports Hub');
    expect(container.textContent).toContain('GSTR-1 Outward');
    expect(container.textContent).toContain('GSTR-3B Tax Offset');
    expect(container.textContent).toContain('HSN/SAC Summary');

    // Switch to GSTR-3B sub-report
    const gstr3bTab = Array.from(container.querySelectorAll('[role="tab"]')).find((b) =>
      b.textContent?.includes('GSTR-3B Tax Offset')
    ) as HTMLElement | undefined;
    await act(async () => {
      gstr3bTab?.click();
    });

    expect(container.textContent).toContain('Table 3.1: Details of Outward Supplies & Liabilities');
    expect(container.textContent).toContain('Table 4: Eligible Input Tax Credit');

    // Click Back to Reports Hub
    const backBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Reports Hub')
    );
    expect(backBtn).toBeDefined();

    await act(async () => {
      backBtn?.click();
    });

    // Verify we are back on Reports Hub
    expect(container.textContent).toContain('Business Performance & Profit');
    expect(container.textContent).toContain('Operations & Tax Compliance');
  });

  it('4. Navigates to dedicated Sales & Revenue page and verifies bill-wise profit', async () => {
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

    // Click Sales & Revenue card
    const salesCard = Array.from(container.querySelectorAll('[role="button"]')).find((c) =>
      c.textContent?.includes('Sales & Revenue')
    ) as HTMLElement | undefined;

    await act(async () => {
      salesCard?.click();
    });

    expect(container.textContent).toContain('Sales & Revenue Reports');
    expect(container.textContent).toContain('Sales Register');
    expect(container.textContent).toContain('Item-Wise Sales & Margin');
    expect(container.textContent).toContain('INV-2026-001');
    expect(container.textContent).toContain('Apex Infotech');
    expect(container.textContent).toContain('40.0%'); // Margin
  });

  it('5. Navigates to dedicated Cash Flow Statement page and displays Operating & Net Cash Flow', async () => {
    await act(async () => {
      root.render(
        <BusinessReportsView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
          bankAccounts={mockBankAccounts}
          cashBankTxns={mockCashBankTxns}
        />
      );
    });

    // Click Cash Flow Statement card
    const cashFlowCard = Array.from(container.querySelectorAll('[role="button"]')).find((c) =>
      c.textContent?.includes('Cash Flow Statement')
    ) as HTMLElement | undefined;

    await act(async () => {
      cashFlowCard?.click();
    });

    expect(container.textContent).toContain('Opening Liquid Balance');
    expect(container.textContent).toContain('Operating Cash Flow');
    expect(container.textContent).toContain('Net Cash Flow');
    expect(container.textContent).toContain('Closing Liquid Balance');
    expect(container.textContent).toContain('Sales Receipt (INV-2026-001)');
  });

  it('6. Navigates to dedicated Balance Sheet page and verifies Balance invariant', async () => {
    await act(async () => {
      root.render(
        <BusinessReportsView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
          bankAccounts={mockBankAccounts}
          cashBankTxns={mockCashBankTxns}
          loans={mockLoans}
        />
      );
    });

    // Click Balance Sheet card
    const bsCard = Array.from(container.querySelectorAll('[role="button"]')).find((c) =>
      c.textContent?.includes('Balance Sheet')
    ) as HTMLElement | undefined;

    await act(async () => {
      bsCard?.click();
    });

    expect(container.textContent).toContain('Balance Sheet Statement');
    expect(container.textContent).toContain('1. ASSETS');
    expect(container.textContent).toContain('2. LIABILITIES & EQUITY');
    expect(container.textContent).toContain('Balanced');
    expect(container.textContent).toContain('Current Assets');
    expect(container.textContent).toContain('Closing Inventory');
    expect(container.textContent).toContain('Sundry Creditors');
  });

  it('7. Navigates to dedicated Bank Statement page and displays passbook ledger with running balance', async () => {
    await act(async () => {
      root.render(
        <BusinessReportsView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
          bankAccounts={mockBankAccounts}
          cashBankTxns={mockCashBankTxns}
        />
      );
    });

    // Click Bank Statement card
    const bankCard = Array.from(container.querySelectorAll('[role="button"]')).find((c) =>
      c.textContent?.includes('Bank Statement')
    ) as HTMLElement | undefined;

    await act(async () => {
      bankCard?.click();
    });

    expect(container.textContent).toContain('Bank Statement & Passbook');
    expect(container.textContent).toContain('Select Bank Account / Register');
    expect(container.textContent).toContain('State Bank of India');
    expect(container.textContent).toContain('Total Deposits (Credit)');
    expect(container.textContent).toContain('Total Withdrawals (Debit)');
  });

  it('8. Navigates to dedicated Loan Statement page and renders borrowings overview and EMI schedule', async () => {
    await act(async () => {
      root.render(
        <BusinessReportsView
          company={mockCompany}
          invoices={mockInvoices}
          purchases={mockPurchases}
          expenses={mockExpenses}
          items={mockItems}
          parties={mockParties}
          bankAccounts={mockBankAccounts}
          loans={mockLoans}
          loanTransactions={mockLoanTransactions}
        />
      );
    });

    // Click Loan Statement card
    const loanCard = Array.from(container.querySelectorAll('[role="button"]')).find((c) =>
      c.textContent?.includes('Loan Statement & EMIs')
    ) as HTMLElement | undefined;

    await act(async () => {
      loanCard?.click();
    });

    expect(container.textContent).toContain('Loan Statement & EMIs');
    expect(container.textContent).toContain('Total Sanctioned Principal');
    expect(container.textContent).toContain('Total Outstanding Debt');
    expect(container.textContent).toContain('HDFC Bank Term Loan');
    expect(container.textContent).toContain('10.5% p.a.');
  });

  it('9. Triggers Export Excel and Export PDF correctly from a dedicated page', async () => {
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

    // Open GST page
    const gstCard = Array.from(container.querySelectorAll('[role="button"]')).find((c) =>
      c.textContent?.includes('GST & Tax Compliance')
    ) as HTMLElement | undefined;
    await act(async () => {
      gstCard?.click();
    });

    // Click Export Excel
    const exportExcelBtn = container.querySelector('button[aria-label="Export report to Excel or CSV"]') as HTMLButtonElement;
    expect(exportExcelBtn).toBeDefined();

    await act(async () => {
      exportExcelBtn?.click();
    });

    expect(mockCreateObjectURL).toHaveBeenCalled();

    // Click Export PDF
    const exportPdfBtn = container.querySelector('button[aria-label="Export report to printable PDF"]') as HTMLButtonElement;
    expect(exportPdfBtn).toBeDefined();

    await act(async () => {
      exportPdfBtn?.click();
    });

    expect(
      mockOpen.mock.calls.length > 0 ||
      container.querySelector('[data-testid="report-pdf-preview-modal"]') !== null
    ).toBe(true);
  });

  it('10. Business Performance Card is collapsed to two columns by default, hides graph, and toggles expand/collapse', async () => {
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

    // Verify Expand button is present
    const toggleBtn = container.querySelector('button[aria-label="Expand performance details"]') as HTMLButtonElement;
    expect(toggleBtn).toBeDefined();
    expect(toggleBtn.textContent).toContain('Expand');

    // Verify graph is NOT present when collapsed
    expect(container.querySelector('svg.cursor-crosshair')).toBeNull();

    // Verify two columns exist across all tabs in collapsed view
    const twoColGrids = container.querySelectorAll('.grid-cols-2');
    expect(twoColGrids.length).toBeGreaterThanOrEqual(3);

    // Slide 0: Gross Profit & Net Profit
    expect(twoColGrids[0]?.textContent).toContain('Gross Profit');
    expect(twoColGrids[0]?.textContent).toContain('Net Profit');
    expect(twoColGrids[0]?.textContent).not.toContain('Total Revenue:');

    // Slide 1: Total Sales & Total Purchases
    expect(twoColGrids[1]?.textContent).toContain('Total Sales');
    expect(twoColGrids[1]?.textContent).toContain('Total Purchases');
    expect(twoColGrids[1]?.textContent).not.toContain('Avg Bill:');

    // Slide 2: Opening Stock & Closing Stock
    expect(twoColGrids[2]?.textContent).toContain('Opening Stock');
    expect(twoColGrids[2]?.textContent).toContain('Closing Stock');
    expect(twoColGrids[2]?.textContent).not.toContain('Valuation Basis:');

    // Verify horizontal carousel is present
    const carousel = container.querySelector('.overflow-x-auto');
    expect(carousel).not.toBeNull();

    // Click Expand
    await act(async () => {
      toggleBtn.click();
    });

    // Now button should say Collapse
    const collapseBtn = container.querySelector('button[aria-label="Collapse performance details"]') as HTMLButtonElement;
    expect(collapseBtn).toBeDefined();
    expect(collapseBtn.textContent).toContain('Collapse');

    // Chart and full tabs are now rendered
    expect(container.querySelector('svg.cursor-crosshair')).not.toBeNull();
    expect(container.textContent).toContain('Profits & Margins');
    expect(container.textContent).toContain('Sales & Purchases');
    expect(container.textContent).toContain('Stock Valuation');

    // Click Collapse again
    await act(async () => {
      collapseBtn.click();
    });

    // Graph is hidden again and button says Expand
    expect(container.querySelector('svg.cursor-crosshair')).toBeNull();
    expect(container.querySelector('button[aria-label="Expand performance details"]')).not.toBeNull();
  });
});
