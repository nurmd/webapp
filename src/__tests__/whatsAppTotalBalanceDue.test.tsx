import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getPartyTotalBalanceDue,
  buildWhatsAppMessage,
  getWhatsAppShareUrl,
} from '../core/utils/upiAndShare.ts';
import { formatINR } from '../core/utils/formatters.ts';
import { CompanyProfile } from '../models/company.ts';
import { Invoice } from '../models/invoice.ts';
import { Party } from '../models/party.ts';
import { PurchaseBill } from '../models/purchase.ts';
import { BankAccount, CashBankTransaction, UnifiedLedgerEntry } from '../models/bankAccount.ts';
import { CashBankTransactionDetailModal } from '../components/CashBank/CashBankTransactionDetailModal.tsx';
import { WhatsAppShareModal as FolderWhatsAppShareModal } from '../components/WhatsApp/WhatsAppShareModal.tsx';
import { DashboardView } from '../components/Dashboard/DashboardView.tsx';
import { DashboardVoucherModal } from '../components/Dashboard/DashboardVoucherModal.tsx';
import { formatWhatsAppMessage } from '../services/whatsappService.ts';
import { Voucher } from '../core/accounting/voucherTypes.ts';

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
  upiId: 'apex@upi',
};

const mockCustomer: Party = {
  id: 'PARTY-CUST-1',
  name: 'Tata Motors Limited',
  type: 'CUSTOMER',
  phone: '9876543210',
  stateCode: '27',
  billingAddress: 'Pune Industrial Complex',
  currentBalance: 14500, // Positive receivable
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

const mockSupplier: Party = {
  id: 'PARTY-SUPP-1',
  name: 'Kirloskar Pneumatics',
  type: 'SUPPLIER',
  phone: '9123456789',
  stateCode: '27',
  billingAddress: 'Hadapsar, Pune',
  currentBalance: -8000, // Negative payable
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

const mockInvoice: Invoice = {
  id: 'INV-101',
  invoiceNumber: 'INV-2026-101',
  invoiceType: 'B2B',
  date: '2026-10-28',
  partyId: 'PARTY-CUST-1',
  partyName: 'Tata Motors Limited',
  partyPhone: '9876543210',
  partyAddress: 'Pune, Maharashtra',
  partyStateCode: '27',
  placeOfSupplyStateCode: '27',
  isIntraState: true,
  items: [],
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
  paidAmount: 2000,
  balanceAmount: 3900,
  amountInWords: 'Five Thousand Nine Hundred Only',
  paymentStatus: 'PARTIAL',
  paymentMode: 'CASH',
  createdAt: '2026-10-28T09:00:00Z',
  updatedAt: '2026-10-28T09:00:00Z',
};

const mockPurchaseBill: PurchaseBill = {
  id: 'PUR-001',
  billNumber: 'PB-2026-001',
  date: '2026-10-28',
  supplierId: 'PARTY-SUPP-1',
  supplierName: 'Kirloskar Pneumatics',
  supplierAddress: 'Pune, Maharashtra',
  supplierStateCode: '27',
  placeOfSupplyStateCode: '27',
  isIntraState: true,
  itcEligibility: 'ALL_OTHER_ITC',
  isRcm: false,
  items: [],
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
  paidAmount: 3000,
  balanceAmount: 8800,
  paymentStatus: 'PARTIAL',
  paymentMode: 'CASH',
  createdAt: '2026-10-28T10:00:00Z',
  updatedAt: '2026-10-28T10:00:00Z',
};

const mockVoucher: Voucher = {
  id: 'VOUCHER-001',
  voucherNumber: 'V-2026-001',
  voucherType: 'RECEIPT',
  date: '2026-10-28',
  partyId: 'PARTY-CUST-1',
  partyName: 'Tata Motors Limited',
  narration: 'Received against invoice',
  totalAmount: 5000,
  entries: [
    {
      accountId: 'ACC_BANK',
      accountName: 'SBI Current A/C',
      debit: 5000,
      credit: 0,
    },
    {
      accountId: 'PARTY-CUST-1',
      accountName: 'Tata Motors Limited',
      debit: 0,
      credit: 5000,
    },
  ],
  createdAt: '2026-10-28T10:00:00Z',
};

const mockAccounts: BankAccount[] = [
  {
    id: 'ACC_CASH',
    accountName: 'Cash in Hand',
    accountType: 'CASH',
    openingBalance: 10000,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
  {
    id: 'ACC_BANK',
    accountName: 'SBI Current A/C',
    accountType: 'BANK',
    openingBalance: 25000,
    isDefault: true,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
];

describe('WhatsApp Total Balance Due Suite', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  describe('1. getPartyTotalBalanceDue Helper', () => {
    it('customer party with positive currentBalance produces exact receivable due', () => {
      expect(getPartyTotalBalanceDue(mockCustomer)).toBe(14500);
    });

    it('customer party with negative advance balance produces 0 due', () => {
      const advCust: Party = { ...mockCustomer, currentBalance: -1500 };
      expect(getPartyTotalBalanceDue(advCust)).toBe(0);
    });

    it('supplier party with negative currentBalance produces positive payable due', () => {
      expect(getPartyTotalBalanceDue(mockSupplier)).toBe(8000);
    });

    it('supplier party with positive advance paid produces 0 due', () => {
      const advSupp: Party = { ...mockSupplier, currentBalance: 2500 };
      expect(getPartyTotalBalanceDue(advSupp)).toBe(0);
    });

    it('returns null for missing party or non-finite balance', () => {
      expect(getPartyTotalBalanceDue(null)).toBeNull();
      expect(getPartyTotalBalanceDue(undefined)).toBeNull();
      expect(getPartyTotalBalanceDue({ ...mockCustomer, currentBalance: NaN })).toBeNull();
    });
  });

  describe('2. buildWhatsAppMessage & getWhatsAppShareUrl Total Balance Due Integration', () => {
    it('invoice with a customer party (currentBalance = 14500) includes Total Balance Due with 14,500', () => {
      const res = buildWhatsAppMessage(
        mockCompany,
        { invoice: mockInvoice, party: mockCustomer },
        { template: 'INVOICE_DELIVERY', language: 'EN' }
      );

      expect(res.text).toContain('Balance Due:* ₹3,900');
      expect(res.text).toContain('📊 *Total Balance Due:* ₹14,500');
      expect(res.text).toContain('Payment Status:* PARTIAL');
    });

    it('invoice delivery message in Hindi includes vernacular कुल बकाया राशि', () => {
      const res = buildWhatsAppMessage(
        mockCompany,
        { invoice: mockInvoice, party: mockCustomer },
        { template: 'INVOICE_DELIVERY', language: 'HI' }
      );

      expect(res.text).toContain('⚠️ *बकाया राशि:* ₹3,900');
      expect(res.text).toContain('📊 *कुल बकाया राशि:* ₹14,500');
    });

    it('invoice without linked party falls back to invoice balanceAmount for Total Balance Due', () => {
      const res = buildWhatsAppMessage(
        mockCompany,
        { invoice: mockInvoice },
        { template: 'INVOICE_DELIVERY', language: 'EN' }
      );

      expect(res.text).toContain('Balance Due:* ₹3,900');
      expect(res.text).toContain('📊 *Total Balance Due:* ₹3,900');
    });

    it('getWhatsAppShareUrl passes party into buildWhatsAppMessage and generates valid link', () => {
      const url = getWhatsAppShareUrl(mockInvoice, mockCompany, mockCustomer.phone, mockCustomer);
      expect(url).toContain('https://wa.me/919876543210?text=');
      const decoded = decodeURIComponent(url);
      expect(decoded).toContain('📊 *Total Balance Due:* ₹14,500');
    });
  });

  describe('3. Payment Detail Modal (CashBankTransactionDetailModal)', () => {
    it('includes Total Balance Due when a non-transfer transaction has a linked party', async () => {
      const mockOpenWhatsApp = vi.fn();
      (window as any).AndroidBridge = { openWhatsAppUrl: mockOpenWhatsApp };

      const entryWithParty: UnifiedLedgerEntry = {
        id: 'LEDGER-1',
        date: '2026-10-28',
        type: 'PARTY_RECEIPT',
        category: 'BANK',
        accountId: 'ACC_BANK',
        accountName: 'SBI Current A/C',
        counterpartyOrTitle: 'Tata Motors Limited',
        flow: 'IN',
        amount: 5000,
        mode: 'NEFT',
        partyId: 'PARTY-CUST-1',
      };

      await act(async () => {
        root.render(
          <CashBankTransactionDetailModal
            isOpen={true}
            onClose={vi.fn()}
            entry={entryWithParty}
            accounts={mockAccounts}
            company={mockCompany}
            parties={[mockCustomer]}
          />
        );
      });

      const shareBtn = container.querySelector('[data-testid="cash-bank-share-whatsapp"]') as HTMLButtonElement;
      expect(shareBtn).toBeDefined();

      await act(async () => {
        shareBtn.click();
      });

      expect(mockOpenWhatsApp).toHaveBeenCalledTimes(1);
      const url = mockOpenWhatsApp.mock.calls[0][0];
      const decoded = decodeURIComponent(url);
      expect(decoded).toContain('Payment Received - Apex Supplies');
      expect(decoded).toContain('*Amount:* ₹ 5,000.00');
      expect(decoded).toContain(`*Total Balance Due:* ${formatINR(14500)}`);
    });

    it('omits Total Balance Due when transaction has no linked party', async () => {
      const mockOpenWhatsApp = vi.fn();
      (window as any).AndroidBridge = { openWhatsAppUrl: mockOpenWhatsApp };

      const directEntry: UnifiedLedgerEntry = {
        id: 'LEDGER-2',
        date: '2026-10-28',
        type: 'DIRECT_IN',
        category: 'BANK',
        accountId: 'ACC_BANK',
        accountName: 'SBI Current A/C',
        counterpartyOrTitle: 'Direct Capital',
        flow: 'IN',
        amount: 25000,
        mode: 'NEFT',
      };

      await act(async () => {
        root.render(
          <CashBankTransactionDetailModal
            isOpen={true}
            onClose={vi.fn()}
            entry={directEntry}
            accounts={mockAccounts}
            company={mockCompany}
            parties={[mockCustomer]}
          />
        );
      });

      const shareBtn = container.querySelector('[data-testid="cash-bank-share-whatsapp"]') as HTMLButtonElement;
      await act(async () => {
        shareBtn.click();
      });

      const url = mockOpenWhatsApp.mock.calls[0][0];
      const decoded = decodeURIComponent(url);
      expect(decoded).not.toContain('Total Balance Due');
    });

    it('omits Total Balance Due for contra transfers even if a party is passed', async () => {
      const mockOpenWhatsApp = vi.fn();
      (window as any).AndroidBridge = { openWhatsAppUrl: mockOpenWhatsApp };

      const contraEntry: UnifiedLedgerEntry = {
        id: 'LEDGER-3',
        date: '2026-10-28',
        type: 'CONTRA',
        category: 'CASH',
        accountId: 'ACC_CASH',
        accountName: 'Cash in Hand',
        counterpartyOrTitle: 'Cash Deposit',
        flow: 'OUT',
        amount: 3000,
        mode: 'CONTRA',
        fromAccountId: 'ACC_CASH',
        toAccountId: 'ACC_BANK',
        partyId: 'PARTY-CUST-1',
      };

      await act(async () => {
        root.render(
          <CashBankTransactionDetailModal
            isOpen={true}
            onClose={vi.fn()}
            entry={contraEntry}
            accounts={mockAccounts}
            company={mockCompany}
            parties={[mockCustomer]}
          />
        );
      });

      const shareBtn = container.querySelector('[data-testid="cash-bank-share-whatsapp"]') as HTMLButtonElement;
      await act(async () => {
        shareBtn.click();
      });

      const url = mockOpenWhatsApp.mock.calls[0][0];
      const decoded = decodeURIComponent(url);
      expect(decoded).toContain('Cash / Bank Transfer');
      expect(decoded).not.toContain('Total Balance Due');
    });

    it('resolves linked customer from rawInvoiceId for a SALE passbook entry without partyId', async () => {
      const mockOpenWhatsApp = vi.fn();
      (window as any).AndroidBridge = { openWhatsAppUrl: mockOpenWhatsApp };

      const saleEntry: UnifiedLedgerEntry = {
        id: 'LEDGER-SALE-1',
        date: '2026-10-28',
        type: 'SALE',
        category: 'BANK',
        accountId: 'ACC_BANK',
        accountName: 'SBI Current A/C',
        counterpartyOrTitle: 'Tata Motors Limited',
        flow: 'IN',
        amount: 5900,
        mode: 'NEFT',
        rawInvoiceId: 'INV-101',
      };

      await act(async () => {
        root.render(
          <CashBankTransactionDetailModal
            isOpen={true}
            onClose={vi.fn()}
            entry={saleEntry}
            accounts={mockAccounts}
            company={mockCompany}
            parties={[mockCustomer]}
            invoices={[mockInvoice]}
          />
        );
      });

      const shareBtn = container.querySelector('[data-testid="cash-bank-share-whatsapp"]') as HTMLButtonElement;
      await act(async () => {
        shareBtn.click();
      });

      expect(mockOpenWhatsApp).toHaveBeenCalledTimes(1);
      const url = mockOpenWhatsApp.mock.calls[0][0];
      const decoded = decodeURIComponent(url);
      expect(decoded).toContain('Payment Received - Apex Supplies');
      expect(decoded).toContain(`*Total Balance Due:* ${formatINR(14500)}`);
    });

    it('resolves linked supplier from rawPurchaseId for a PURCHASE passbook entry without partyId', async () => {
      const mockOpenWhatsApp = vi.fn();
      (window as any).AndroidBridge = { openWhatsAppUrl: mockOpenWhatsApp };

      const purchaseEntry: UnifiedLedgerEntry = {
        id: 'LEDGER-PUR-1',
        date: '2026-10-28',
        type: 'PURCHASE',
        category: 'BANK',
        accountId: 'ACC_BANK',
        accountName: 'SBI Current A/C',
        counterpartyOrTitle: 'Kirloskar Pneumatics',
        flow: 'OUT',
        amount: 11800,
        mode: 'NEFT',
        rawPurchaseId: 'PUR-001',
      };

      await act(async () => {
        root.render(
          <CashBankTransactionDetailModal
            isOpen={true}
            onClose={vi.fn()}
            entry={purchaseEntry}
            accounts={mockAccounts}
            company={mockCompany}
            parties={[mockSupplier]}
            purchases={[mockPurchaseBill]}
          />
        );
      });

      const shareBtn = container.querySelector('[data-testid="cash-bank-share-whatsapp"]') as HTMLButtonElement;
      await act(async () => {
        shareBtn.click();
      });

      expect(mockOpenWhatsApp).toHaveBeenCalledTimes(1);
      const url = mockOpenWhatsApp.mock.calls[0][0];
      const decoded = decodeURIComponent(url);
      expect(decoded).toContain('Payment Made - Apex Supplies');
      expect(decoded).toContain(`*Total Balance Due:* ${formatINR(8000)}`);
    });
  });

  describe('4. Folder WhatsApp Modal & formatWhatsAppMessage', () => {
    it('Folder WhatsApp modal with explicit totalBalanceDue displays the value in preview', () => {
      act(() => {
        root.render(
          <FolderWhatsAppShareModal
            invoice={mockInvoice}
            company={mockCompany}
            onClose={vi.fn()}
            totalBalanceDue={24500}
          />
        );
      });

      expect(container.textContent).toContain('Total Balance Due');
      expect(container.textContent).toContain('24,500');
    });

    it('appends Hindi कुल बकाया राशि label when language is hi', () => {
      const msg = formatWhatsAppMessage(mockCompany, mockInvoice, {
        language: 'hi',
        totalBalanceDue: 14500,
      });

      expect(msg).toContain('📊 *कुल बकाया राशि:* ₹ 14,500.00');
      expect(msg).not.toContain('Total Balance Due');
    });

    it('appends English Total Balance Due label when language is en', () => {
      const msg = formatWhatsAppMessage(mockCompany, mockInvoice, {
        language: 'en',
        totalBalanceDue: 14500,
      });

      expect(msg).toContain('📊 *Total Balance Due:* ₹ 14,500.00');
    });
  });

  describe('5. Dashboard Purchase Share with Supplier Total Due', () => {
    it('purchase share includes the supplier total balance due', async () => {
      const mockOpenWhatsApp = vi.fn();
      (window as any).AndroidBridge = { openWhatsAppUrl: mockOpenWhatsApp };

      await act(async () => {
        root.render(
          <DashboardView
            company={mockCompany}
            invoices={[]}
            items={[]}
            parties={[mockSupplier]}
            purchases={[mockPurchaseBill]}
            expenses={[]}
            vouchers={[]}
            onNavigateTab={vi.fn()}
            onNewInvoice={vi.fn()}
            onQuickPos={vi.fn()}
            onViewInvoice={vi.fn()}
            onRecordPartyPayment={vi.fn()}
          />
        );
      });

      // Find share button on the purchase activity card
      const shareBtn = (container.querySelector('button[title="Share Receipt"]') ||
        container.querySelector('button[aria-label="Share receipt"]')) as HTMLButtonElement;
      expect(shareBtn).toBeDefined();

      await act(async () => {
        shareBtn.click();
      });

      expect(mockOpenWhatsApp).toHaveBeenCalledTimes(1);
      const url = mockOpenWhatsApp.mock.calls[0][0];
      const decoded = decodeURIComponent(url);
      expect(decoded).toContain('Purchase Bill Summary - Apex Supplies');
      expect(decoded).toContain('*Balance Due:* ₹ 8,800.00');
      expect(decoded).toContain(`*Total Balance Due:* ${formatINR(8000)}`);
    });
  });

  describe('6. Dashboard Voucher Detail Modal (DashboardVoucherModal)', () => {
    it('includes Total Balance Due when voucher party is provided and has due', async () => {
      const mockOpenWhatsApp = vi.fn();
      (window as any).AndroidBridge = { openWhatsAppUrl: mockOpenWhatsApp };

      await act(async () => {
        root.render(
          <DashboardVoucherModal
            voucher={mockVoucher}
            company={mockCompany}
            parties={[mockCustomer]}
            onClose={vi.fn()}
          />
        );
      });

      const shareBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Share')
      );
      expect(shareBtn).toBeDefined();

      await act(async () => {
        shareBtn?.click();
      });

      expect(mockOpenWhatsApp).toHaveBeenCalledTimes(1);
      const url = mockOpenWhatsApp.mock.calls[0][0];
      const decoded = decodeURIComponent(url);
      expect(decoded).toContain('Voucher Receipt - Apex Supplies');
      expect(decoded).toContain('*Voucher No:* V-2026-001');
      expect(decoded).toContain('*Amount:* ₹ 5,000.00');
      expect(decoded).toContain(`*Total Balance Due:* ${formatINR(14500)}`);
    });

    it('omits Total Balance Due when voucher party is not in parties list', async () => {
      const mockOpenWhatsApp = vi.fn();
      (window as any).AndroidBridge = { openWhatsAppUrl: mockOpenWhatsApp };

      await act(async () => {
        root.render(
          <DashboardVoucherModal
            voucher={mockVoucher}
            company={mockCompany}
            parties={[]}
            onClose={vi.fn()}
          />
        );
      });

      const shareBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Share')
      );

      await act(async () => {
        shareBtn?.click();
      });

      const url = mockOpenWhatsApp.mock.calls[0][0];
      const decoded = decodeURIComponent(url);
      expect(decoded).toContain('*Amount:* ₹ 5,000.00');
      expect(decoded).not.toContain('Total Balance Due');
    });
  });
});
