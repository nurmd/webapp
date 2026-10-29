import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import {
  printHtmlNative,
  printCurrentPageNative,
  generatePdfNative,
  printHtmlDocument,
  printCurrentPage,
  printDocument,
  escapeHtml,
} from '../core/utils/printBridge.ts';
import {
  generateExpenseVoucherHtml,
  printExpenseVoucher,
} from '../core/utils/expenseVoucherPrinter.ts';
import {
  generateAccountingVoucherHtml,
  printAccountingVoucher,
} from '../core/utils/voucherDocumentPrinter.ts';
import {
  generatePurchaseBillHtml,
  printPurchaseBill,
} from '../core/utils/purchaseDocumentPrinter.ts';
import { printEWayBillSlip } from '../core/gst/eWayBillSlipPrinter.ts';
import { printPartyLedgerStatement } from '../core/utils/ledgerStatementPrinter.ts';
import { ThermalPrintModal } from '../components/Printing/ThermalPrintModal.tsx';
import { SimplifiedInvoiceModal } from '../components/Invoicing/SimplifiedInvoiceModal.tsx';
import { InvoicePreviewModal } from '../components/Invoicing/InvoicePreviewModal.tsx';
import { CashBankManagementView } from '../components/CashBank/CashBankManagementView.tsx';
import { CompanyProfile } from '../models/company.ts';
import { Expense } from '../models/expense.ts';
import { Voucher } from '../core/accounting/voucherTypes.ts';
import { PurchaseBill } from '../models/purchase.ts';
import { Invoice } from '../models/invoice.ts';
import { BankAccount, CashBankTransaction } from '../models/bankAccount.ts';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockCompany: CompanyProfile = {
  id: 'COMP-1',
  businessName: 'Apex Industrial Supplies',
  tradeName: 'Apex Supplies',
  gstin: '27AABCU9603R1ZM',
  pan: 'AABCU9603R',
  phone: '9876543210',
  email: 'apex@supplies.com',
  address: 'Plot 44, MIDC Industrial Area, Pune',
  pincode: '411018',
  stateCode: '27',
  isGstEnabled: true,
};

const mockInvoice: Invoice = {
  id: 'INV-101',
  invoiceNumber: 'INV-2026-101',
  invoiceType: 'B2B',
  date: '2026-10-28',
  partyId: 'PARTY-1',
  partyName: 'Tata Motors Limited',
  partyGstin: '27AAACT2727Q1ZW',
  partyAddress: 'Pune Industrial Complex',
  partyStateCode: '27',
  placeOfSupplyStateCode: '27',
  isIntraState: true,
  ewayBillNumber: '231000987654',
  items: [
    {
      itemId: 'ITEM-1',
      name: 'Industrial Valve 2-inch',
      hsnSacCode: '84818030',
      quantity: 2,
      unitPrice: 1500,
      unit: 'PCS',
      taxableAmount: 3000,
      gstRate: 18,
      cgstAmount: 270,
      sgstAmount: 270,
      igstAmount: 0,
      cessAmount: 0,
      total: 3540,
      totalAmount: 3540,
    } as any,
  ],
  totalGrossAmount: 3000,
  totalDiscount: 0,
  totalTaxableAmount: 3000,
  totalCgst: 270,
  totalSgst: 270,
  totalIgst: 0,
  totalCess: 0,
  totalTax: 540,
  roundOff: 0,
  grandTotal: 3540,
  totalPaid: 3540,
  balanceDue: 0,
  paymentStatus: 'PAID',
  paymentMode: 'UPI',
  notes: 'Thank you for your business.',
  terms: 'Payment due within 30 days.',
  bankDetails: {
    accountNumber: '98765432101234',
    ifsc: 'HDFC0001234',
    bankName: 'HDFC Bank',
    branch: 'Pune MIDC',
  },
  upiId: 'apex@upi',
  supplyType: 'INTRA_STATE',
  createdAt: '2026-10-28T09:00:00Z',
  updatedAt: '2026-10-28T09:00:00Z',
} as any;

const mockExpense: Expense = {
  id: 'EXP-1',
  voucherNumber: 'EXP-2026-001',
  date: '2026-10-28',
  title: 'Workshop Machine Lubricant',
  category: 'Repairs & Maintenance',
  amount: 2400,
  paymentMode: 'CASH',
  vendorName: 'Shell Lubricants Depot',
  notes: 'Quarterly maintenance lubrication',
  createdAt: '2026-10-28T09:00:00Z',
} as any;

const mockVoucher: Voucher = {
  id: 'VOUCH-1',
  voucherNumber: 'V-2026-001',
  voucherType: 'PAYMENT',
  date: '2026-10-28',
  totalAmount: 5000,
  narration: 'Office equipment maintenance charges',
  partyName: 'Precision Services',
  entries: [
    {
      accountId: 'ACC-EXP',
      accountName: 'Repairs & Maintenance A/C',
      debit: 5000,
      credit: 0,
    },
    {
      accountId: 'ACC_CASH',
      accountName: 'Cash in Hand',
      debit: 0,
      credit: 5000,
    },
  ],
  createdAt: '2026-10-28T10:00:00Z',
};

const mockPurchase: PurchaseBill = {
  id: 'PUR-1',
  billNumber: 'PB-2026-009',
  purchaseType: 'BILL',
  date: '2026-10-28',
  supplierName: 'Kirloskar Pneumatic Co',
  supplierGstin: '27AAACK1234Q1Z5',
  supplierAddress: 'Hadapsar Industrial Estate, Pune',
  items: [
    {
      name: 'Air Compressor 5HP',
      hsnSacCode: '84148011',
      unit: 'NOS',
      quantity: 1,
      unitPrice: 45000,
      taxableAmount: 45000,
      gstRate: 18,
      cgstAmount: 4050,
      sgstAmount: 4050,
      igstAmount: 0,
      cessAmount: 0,
      totalAmount: 53100,
    } as any,
  ],
  taxableAmount: 45000,
  totalTax: 8100,
  totalGst: 8100,
  totalAmount: 53100,
  totalPaid: 53100,
  balanceDue: 0,
  paymentStatus: 'PAID',
  paymentMode: 'BANK',
  notes: 'Received in sound condition.',
  createdAt: '2026-10-28T09:30:00Z',
  updatedAt: '2026-10-28T09:30:00Z',
} as any;

const mockAccounts: BankAccount[] = [
  {
    id: 'ACC_CASH',
    accountName: 'Cash in Hand',
    accountType: 'CASH',
    bankName: 'Counter Cash',
    accountNumber: '',
    ifscCode: '',
    branchName: '',
    openingBalance: 12000,
    currentBalance: 12000,
    isDefault: false,
    isActive: true,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  } as any,
  {
    id: 'ACC_HDFC',
    accountName: 'HDFC Current A/C',
    accountType: 'BANK',
    bankName: 'HDFC Bank',
    accountNumber: '50200012345678',
    ifscCode: 'HDFC0000001',
    branchName: 'Main Branch',
    openingBalance: 85000,
    currentBalance: 85000,
    isDefault: true,
    isActive: true,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  } as any,
];

const mockTransactions: CashBankTransaction[] = [
  {
    id: 'TXN-1',
    txnNumber: 'TXN-001',
    type: 'ADD_MONEY',
    date: '2026-10-28',
    toAccountId: 'ACC_HDFC',
    amount: 3540,
    referenceNo: 'INV-2026-101',
    description: 'Invoice full payment',
    createdAt: '2026-10-28T09:00:00Z',
  },
  {
    id: 'TXN-2',
    txnNumber: 'TXN-002',
    type: 'DEPOSIT',
    date: '2026-10-28',
    fromAccountId: 'ACC_CASH',
    toAccountId: 'ACC_HDFC',
    amount: 5000,
    referenceNo: 'DEP-01',
    description: 'Excess cash deposited',
    createdAt: '2026-10-28T11:00:00Z',
  },
];

describe('Print Bridge, A4 Native, and Cash & Bank Suite', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    delete (window as any).AndroidBridge;

    const storageStore: Record<string, string> = {};
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (key: string) => storageStore[key] ?? null,
        setItem: (key: string, val: string) => {
          storageStore[key] = String(val);
        },
        removeItem: (key: string) => {
          delete storageStore[key];
        },
        clear: () => {
          Object.keys(storageStore).forEach((k) => delete storageStore[k]);
        },
      },
      writable: true,
      configurable: true,
    });

    vi.restoreAllMocks();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete (window as any).AndroidBridge;
    vi.restoreAllMocks();
  });

  describe('1. Native Print Bridge Helper (printBridge.ts)', () => {
    it('escapes special characters correctly in escapeHtml', () => {
      expect(escapeHtml('<script>alert("test & 1\'2")</script>')).toBe(
        '&lt;script&gt;alert(&quot;test &amp; 1&#39;2&quot;)&lt;/script&gt;'
      );
    });

    it('returns false when AndroidBridge is absent in printHtmlNative', () => {
      expect(printHtmlNative('<h1>Test</h1>', 'Job-1', 'A4')).toBe(false);
    });

    it('calls AndroidBridge.printHtml(html, jobName) for A4 portrait (2 args)', () => {
      const mockPrintHtml = vi.fn();
      (window as any).AndroidBridge = {
        printHtml: mockPrintHtml,
      };

      const res = printHtmlNative('<h1>Invoice</h1>', 'Invoice-101', 'A4');
      expect(res).toBe(true);
      expect(mockPrintHtml).toHaveBeenCalledWith('<h1>Invoice</h1>', 'Invoice-101');
    });

    it('calls AndroidBridge.printHtmlWithPaper for A4-landscape (3 args)', () => {
      const mockPrintHtmlWithPaper = vi.fn();
      (window as any).AndroidBridge = {
        printHtmlWithPaper: mockPrintHtmlWithPaper,
      };

      const res = printHtmlNative('<h1>Report</h1>', 'Report-Oct', 'A4-landscape');
      expect(res).toBe(true);
      expect(mockPrintHtmlWithPaper).toHaveBeenCalledWith('<h1>Report</h1>', 'Report-Oct', 'A4-landscape');
    });

    it('calls AndroidBridge.printHtmlWithPaper for default paper size (3 args)', () => {
      const mockPrintHtmlWithPaper = vi.fn();
      (window as any).AndroidBridge = {
        printHtmlWithPaper: mockPrintHtmlWithPaper,
      };

      const res = printHtmlNative('<h1>Thermal</h1>', 'Receipt', 'default');
      expect(res).toBe(true);
      expect(mockPrintHtmlWithPaper).toHaveBeenCalledWith('<h1>Thermal</h1>', 'Receipt', 'default');
    });

    it('catches AndroidBridge exceptions in printHtmlNative and returns false', () => {
      (window as any).AndroidBridge = {
        printHtml: vi.fn(() => {
          throw new Error('Bridge IPC failed');
        }),
      };

      const res = printHtmlNative('<h1>Error</h1>', 'Fail-Job', 'A4');
      expect(res).toBe(false);
    });

    it('returns false when AndroidBridge is absent in printCurrentPageNative', () => {
      expect(printCurrentPageNative('Job-2', 'A4')).toBe(false);
    });

    it('calls AndroidBridge.printCurrentPage(jobName) for A4 portrait', () => {
      const mockPrintCurrentPage = vi.fn();
      (window as any).AndroidBridge = {
        printCurrentPage: mockPrintCurrentPage,
      };

      const res = printCurrentPageNative('Invoice-Current', 'A4');
      expect(res).toBe(true);
      expect(mockPrintCurrentPage).toHaveBeenCalledWith('Invoice-Current');
    });

    it('calls AndroidBridge.printCurrentPageWithPaper for A4-landscape', () => {
      const mockPrintCurrentPageWithPaper = vi.fn();
      (window as any).AndroidBridge = {
        printCurrentPageWithPaper: mockPrintCurrentPageWithPaper,
      };

      const res = printCurrentPageNative('Report-Current', 'A4-landscape');
      expect(res).toBe(true);
      expect(mockPrintCurrentPageWithPaper).toHaveBeenCalledWith('Report-Current', 'A4-landscape');
    });

    it('catches AndroidBridge exceptions in printCurrentPageNative and returns false', () => {
      (window as any).AndroidBridge = {
        printCurrentPage: vi.fn(() => {
          throw new Error('Bridge IPC failed');
        }),
      };

      const res = printCurrentPageNative('Fail-Job', 'A4');
      expect(res).toBe(false);
    });

    it('returns false when AndroidBridge is absent in generatePdfNative', () => {
      expect(generatePdfNative('Invoice-101')).toBe(false);
    });

    it('calls AndroidBridge.generatePdfFromCurrentPage(jobName) in generatePdfNative', () => {
      const mockGeneratePdf = vi.fn();
      (window as any).AndroidBridge = {
        generatePdfFromCurrentPage: mockGeneratePdf,
      };

      const res = generatePdfNative('Invoice-101');
      expect(res).toBe(true);
      expect(mockGeneratePdf).toHaveBeenCalledWith('Invoice-101');
    });

    it('catches AndroidBridge exceptions in generatePdfNative and returns false', () => {
      (window as any).AndroidBridge = {
        generatePdfFromCurrentPage: vi.fn(() => {
          throw new Error('Bridge IPC failed');
        }),
      };

      const res = generatePdfNative('Invoice-101');
      expect(res).toBe(false);
    });

    it('printCurrentPage falls back to window.print when bridge is absent', () => {
      const mockWindowPrint = vi.spyOn(window, 'print').mockImplementation(() => {});
      printCurrentPage('Browser-Print', 'A4');
      expect(mockWindowPrint).toHaveBeenCalledTimes(1);
    });

    it('printCurrentPage uses native and skips window.print when bridge is available', () => {
      const mockNativePrint = vi.fn();
      const mockWindowPrint = vi.spyOn(window, 'print').mockImplementation(() => {});
      (window as any).AndroidBridge = {
        printCurrentPage: mockNativePrint,
      };

      printCurrentPage('Native-Print', 'A4');
      expect(mockNativePrint).toHaveBeenCalledWith('Native-Print');
      expect(mockWindowPrint).not.toHaveBeenCalled();
    });

    it('printDocument routes documentType invoice-current-page to printCurrentPage', () => {
      const mockNativePrint = vi.fn();
      (window as any).AndroidBridge = {
        printCurrentPage: mockNativePrint,
      };

      printDocument({
        documentType: 'invoice-current-page',
        jobName: 'Inv-Doc-Test',
        paperSize: 'A4',
      });
      expect(mockNativePrint).toHaveBeenCalledWith('Inv-Doc-Test');
    });

    it('printDocument routes documentType standalone-html to printHtmlDocument', () => {
      const mockPrintHtml = vi.fn();
      (window as any).AndroidBridge = {
        printHtml: mockPrintHtml,
      };

      printDocument({
        documentType: 'standalone-html',
        jobName: 'Report-Doc-Test',
        paperSize: 'A4',
        html: '<html><body>Test Report</body></html>',
      });
      expect(mockPrintHtml).toHaveBeenCalledWith('<html><body>Test Report</body></html>', 'Report-Doc-Test');
    });
  });

  describe('2. A4 Voucher, Bill, eWay, and Ledger Document Printers', () => {
    it('generates valid A4 expense voucher HTML and invokes native print', () => {
      const html = generateExpenseVoucherHtml(mockCompany, mockExpense);
      expect(html).toContain('size: A4 portrait');
      expect(html).toContain('Workshop Machine Lubricant');
      expect(html).toContain('Shell Lubricants Depot');
      expect(html).toContain('EXP-2026-001');
      expect(html).toContain('window.print()');
      expect(html).toContain('Print / Save as PDF');
      expect(html).toContain('window.close()');

      const mockNativePrint = vi.fn();
      (window as any).AndroidBridge = {
        printHtml: mockNativePrint,
      };
      printExpenseVoucher(mockCompany, mockExpense);
      expect(mockNativePrint).toHaveBeenCalledWith(expect.stringContaining('EXP-2026-001'), 'Expense-EXP-2026-001');
    });

    it('generates valid A4 accounting voucher HTML and invokes native print', () => {
      const html = generateAccountingVoucherHtml(mockCompany, mockVoucher);
      expect(html).toContain('size: A4 portrait');
      expect(html).toContain('Repairs &amp; Maintenance A/C');
      expect(html).toContain('Cash in Hand');
      expect(html).toContain('V-2026-001');
      expect(html).toContain('PAYMENT');
      expect(html).toContain('window.print()');
      expect(html).toContain('Print / Save as PDF');
      expect(html).toContain('window.close()');

      const mockNativePrint = vi.fn();
      (window as any).AndroidBridge = {
        printHtml: mockNativePrint,
      };
      printAccountingVoucher(mockCompany, mockVoucher);
      expect(mockNativePrint).toHaveBeenCalledWith(expect.stringContaining('V-2026-001'), 'Voucher-V-2026-001');
    });

    it('generates valid A4 purchase bill HTML and invokes native print', () => {
      const html = generatePurchaseBillHtml(mockCompany, mockPurchase);
      expect(html).toContain('size: A4 portrait');
      expect(html).toContain('PURCHASE BILL');
      expect(html).toContain('Kirloskar Pneumatic Co');
      expect(html).toContain('Air Compressor 5HP');
      expect(html).toContain('PB-2026-009');
      expect(html).toContain('window.print()');
      expect(html).toContain('Print / Save as PDF');
      expect(html).toContain('window.close()');

      const mockNativePrint = vi.fn();
      (window as any).AndroidBridge = {
        printHtml: mockNativePrint,
      };
      printPurchaseBill(mockCompany, mockPurchase);
      expect(mockNativePrint).toHaveBeenCalledWith(expect.stringContaining('PB-2026-009'), 'Purchase-PB-2026-009');
    });

    it('eWayBillSlipPrinter prints natively when bridge exists', () => {
      const mockNativePrint = vi.fn();
      (window as any).AndroidBridge = {
        printHtml: mockNativePrint,
      };

      printEWayBillSlip(
        mockCompany,
        mockInvoice,
        {
          vehicleNumber: 'MH12AB1234',
        }
      );

      expect(mockNativePrint).toHaveBeenCalledWith(
        expect.stringContaining('231000987654'),
        'E-Way Bill - INV-2026-101'
      );
    });

    it('ledgerStatementPrinter prints party ledger statement natively when bridge exists', () => {
      const mockNativePrint = vi.fn();
      (window as any).AndroidBridge = {
        printHtml: mockNativePrint,
      };

      printPartyLedgerStatement(
        {
          id: 'PARTY-1',
          name: 'Tata Motors Limited',
          type: 'CUSTOMER',
          gstin: '27AAACT2727Q1ZW',
          phone: '9822001122',
          currentBalance: 13540,
        } as any,
        mockCompany,
        [
          {
            date: '2026-10-28',
            docNumber: 'INV-2026-101',
            type: 'INVOICE',
            description: 'Sales Invoice',
            debit: 3540,
            credit: 0,
            runningBalance: 13540,
          },
        ],
        '01 Oct 2026 to 28 Oct 2026'
      );

      expect(mockNativePrint).toHaveBeenCalledWith(
        expect.stringContaining('Tata Motors Limited'),
        'Ledger Statement - Tata Motors Limited'
      );
    });
  });

  describe('3. Modal A4 Actions and Printing UX', () => {
    it('ThermalPrintModal displays A4 / PDF button when onPrintA4 prop is provided', () => {
      const handlePrintA4 = vi.fn();
      act(() => {
        root.render(
          <ThermalPrintModal
            invoice={mockInvoice}
            company={mockCompany}
            onClose={vi.fn()}
            onPrintA4={handlePrintA4}
          />
        );
      });

      const a4Btn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('A4 / PDF')
      );
      expect(a4Btn).toBeDefined();

      act(() => {
        a4Btn?.click();
      });

      expect(handlePrintA4).toHaveBeenCalledWith(mockInvoice);
    });

    it('SimplifiedInvoiceModal displays A4 / PDF button and calls onOpenFullA4Preview', () => {
      const handleOpenA4 = vi.fn();
      act(() => {
        root.render(
          <SimplifiedInvoiceModal
            invoice={mockInvoice}
            company={mockCompany}
            onClose={vi.fn()}
            onOpenFullA4Preview={handleOpenA4}
          />
        );
      });

      const a4Btn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('A4 / PDF')
      );
      expect(a4Btn).toBeDefined();

      act(() => {
        a4Btn?.click();
      });

      expect(handleOpenA4).toHaveBeenCalledWith(mockInvoice);
    });

    it('InvoicePreviewModal handlePrint prefers direct PDF path via generatePdfNative', () => {
      const mockGeneratePdf = vi.fn();
      const mockPrintCurrentPage = vi.fn();
      (window as any).AndroidBridge = {
        generatePdfFromCurrentPage: mockGeneratePdf,
        printCurrentPage: mockPrintCurrentPage,
      };

      act(() => {
        root.render(
          <InvoicePreviewModal
            invoice={mockInvoice}
            company={mockCompany}
            onClose={vi.fn()}
          />
        );
      });

      const printBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Print / PDF')
      );
      expect(printBtn).toBeDefined();

      act(() => {
        printBtn?.click();
      });

      expect(mockGeneratePdf).toHaveBeenCalledWith('Invoice-INV-2026-101');
      expect(mockPrintCurrentPage).not.toHaveBeenCalled();
    });

    it('InvoicePreviewModal handlePrint falls back to printCurrentPage when generatePdfNative returns false or fails', () => {
      const mockPrintCurrentPage = vi.fn();
      (window as any).AndroidBridge = {
        generatePdfFromCurrentPage: vi.fn(() => {
          throw new Error('Native PDF generation failed');
        }),
        printCurrentPage: mockPrintCurrentPage,
      };

      act(() => {
        root.render(
          <InvoicePreviewModal
            invoice={mockInvoice}
            company={mockCompany}
            onClose={vi.fn()}
          />
        );
      });

      const printBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Print / PDF')
      );
      expect(printBtn).toBeDefined();

      act(() => {
        printBtn?.click();
      });

      expect(mockPrintCurrentPage).toHaveBeenCalledWith('Invoice-INV-2026-101');
    });
  });

  describe('4. Cash & Bank Passbook Mobile Simplification', () => {
    it('preserves header reconcile button, account statement testids, filter pills, and compact contra route', () => {
      const handleOpenStatement = vi.fn();
      const handleViewTxn = vi.fn();

      act(() => {
        root.render(
          <CashBankManagementView
            company={mockCompany}
            expenses={[]}
            accounts={mockAccounts}
            transactions={mockTransactions}
            vouchers={[]}
            invoices={[mockInvoice]}
            purchases={[]}
            onSaveTransaction={vi.fn()}
            onDeleteTransaction={vi.fn()}
            onSaveAccount={vi.fn()}
            onDeleteAccount={vi.fn()}
            onOpenAccountStatement={handleOpenStatement}
            onNavigateTab={vi.fn()}
          />
        );
      });

      // 1. Reconcile button testid preserved
      const reconcileBtn = container.querySelector('[data-testid="cash-bank-reconcile-button"]');
      expect(reconcileBtn).not.toBeNull();

      // 2. Statement buttons testids preserved
      const cashStatementBtn = container.querySelector('[data-testid="account-statement-ACC_CASH"]');
      const bankStatementBtn = container.querySelector('[data-testid="account-statement-ACC_HDFC"]');
      expect(cashStatementBtn).not.toBeNull();
      expect(bankStatementBtn).not.toBeNull();

      act(() => {
        (cashStatementBtn as HTMLButtonElement)?.click();
      });
      expect(handleOpenStatement).toHaveBeenCalledWith('ACC_CASH');

      // 3. Filter pills preserved
      expect(container.textContent).toContain('All Accounts');
      expect(container.textContent).toContain('Cash Only');
      expect(container.textContent).toContain('Bank Only');
      expect(container.textContent).toContain('Money In (+)');
      expect(container.textContent).toContain('Money Out (-)');
      expect(container.textContent).toContain('Transfers');

      // 4. Compact 2-line ledger row & Contra Route cue
      expect(container.textContent).toContain('Cash Deposit to Bank');
      expect(container.textContent).toContain('Cash in Hand → HDFC Current A/C');

      // 5. Ledger row role="button"
      const buttons = container.querySelectorAll('[role="button"]');
      const salesRow = Array.from(buttons).find((b) => b.textContent?.includes('Tata Motors Limited'));
      expect(salesRow).toBeDefined();
    });
  });
});
