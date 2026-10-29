import { describe, it, expect } from 'vitest';
import {
  buildInvoiceWhatsAppMessage,
  buildPurchaseWhatsAppMessage,
  buildPaymentVoucherWhatsAppMessage,
} from '../core/utils/whatsAppMessageBuilders.ts';
import { CompanyProfile } from '../models/company.ts';
import { Invoice } from '../models/invoice.ts';
import { PurchaseBill } from '../models/purchase.ts';
import { Party } from '../models/party.ts';
import { Voucher } from '../core/accounting/voucherTypes.ts';
import { UnifiedLedgerEntry } from '../models/bankAccount.ts';
import { formatINR } from '../core/utils/formatters.ts';

const mockCompany: CompanyProfile = {
  id: 'COMP-1',
  businessName: 'Acme Traders PVT LTD',
  tradeName: 'Acme Traders',
  phone: '9876543210',
  address: 'Mumbai',
  stateCode: '27',
  upiId: 'acme@upi',
  gstin: '27AAAAA0000A1Z5',
  pan: 'AAAAA0000A',
  pincode: '400001',
  email: 'test@acme.com',
};

const mockCustomer: Party = {
  id: 'PARTY-CUST-1',
  name: 'Tata Motors',
  type: 'CUSTOMER',
  phone: '9876543210',
  stateCode: '27',
  billingAddress: 'Mumbai',
  currentBalance: 12500, // Positive receivable
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

const mockSupplier: Party = {
  id: 'PARTY-SUPP-1',
  name: 'Kirloskar Pneumatics',
  type: 'SUPPLIER',
  phone: '9123456789',
  stateCode: '27',
  billingAddress: 'Pune',
  currentBalance: -8000, // Negative payable
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

const mockInvoice = {
  id: 'INV-1',
  invoiceNumber: 'INV-2026-001',
  invoiceType: 'B2B',
  date: '2026-10-28',
  partyName: 'Tata Motors',
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
  amountInWords: 'Five Thousand Nine Hundred',
  paymentStatus: 'PARTIAL',
  partyAddress: 'Mumbai',
  partyStateCode: '27',
  placeOfSupplyStateCode: '27',
  isIntraState: true,
  paymentMode: 'UPI',
  createdAt: '2026-10-28T09:00:00Z',
  updatedAt: '2026-10-28T09:00:00Z',
} as unknown as Invoice;

const mockBill = {
  id: 'PUR-1',
  billNumber: 'PB-2026-001',
  date: '2026-10-28',
  supplierName: 'Kirloskar Pneumatics',
  grandTotal: 10000,
  paidAmount: 2000,
  balanceAmount: 8000,
  paymentStatus: 'PARTIAL',
  items: [],
  createdAt: '2026-10-28T09:00:00Z',
  updatedAt: '2026-10-28T09:00:00Z',
} as unknown as PurchaseBill;

describe('Shared WhatsApp Message Builders (Phase 1)', () => {
  describe('buildInvoiceWhatsAppMessage', () => {
    it('builds message with customer total balance due when party provided', () => {
      const msg = buildInvoiceWhatsAppMessage(mockInvoice, mockCompany, mockCustomer);
      expect(msg).toContain('Tata Motors');
      expect(msg).toContain('Acme Traders');
      expect(msg).toContain('INV-2026-001');
      expect(msg).toContain('📊 *Total Balance Due:* ₹ 12,500.00');
    });

    it('falls back to invoice.balanceAmount when party has no balance or is omitted', () => {
      const msg = buildInvoiceWhatsAppMessage(mockInvoice, mockCompany, null);
      expect(msg).toContain('📊 *Total Balance Due:* ₹ 3,900.00');
    });

    it('uses explicitly passed totalBalanceDue override', () => {
      const msg = buildInvoiceWhatsAppMessage(mockInvoice, mockCompany, mockCustomer, 50000);
      expect(msg).toContain('📊 *Total Balance Due:* ₹ 50,000.00');
    });
  });

  describe('buildPurchaseWhatsAppMessage', () => {
    it('builds purchase summary with supplier total balance due', () => {
      const msg = buildPurchaseWhatsAppMessage(mockBill, mockCompany, mockSupplier);
      expect(msg).toContain('Purchase Bill Summary - Acme Traders');
      expect(msg).toContain('*Bill No:* PB-2026-001');
      expect(msg).toContain('*Supplier:* Kirloskar Pneumatics');
      expect(msg).toContain('*Amount:* ₹ 10,000.00');
      expect(msg).toContain('*Balance Due:* ₹ 8,000.00');
      expect(msg).toContain(`*Total Balance Due:* ${formatINR(8000)}`);
      expect(msg).toContain('*Status:* PARTIAL');
    });

    it('omits Total Balance Due line when totalBalanceDue is explicitly null', () => {
      const msg = buildPurchaseWhatsAppMessage(mockBill, mockCompany, null, null);
      expect(msg).not.toContain('Total Balance Due');
      expect(msg).toContain('*Balance Due:* ₹ 8,000.00');
    });
  });

  describe('buildPaymentVoucherWhatsAppMessage', () => {
    it('builds payment received message with party total balance due', () => {
      const entry: any = {
        txnNumber: 'TXN-101',
        type: 'PARTY_RECEIPT',
        flow: 'IN',
        amount: 5000,
        mode: 'UPI',
        date: '28/10/2026',
      };

      const msg = buildPaymentVoucherWhatsAppMessage(entry, mockCustomer, mockCompany);
      expect(msg).toContain('Payment Received - Acme Traders');
      expect(msg).toContain('*Txn No:* TXN-101');
      expect(msg).toContain('*Amount:* ₹ 5,000.00');
      expect(msg).toContain(`*Total Balance Due:* ${formatINR(12500)}`);
    });

    it('omits Total Balance Due for contra transfers even if a party is passed', () => {
      const contraEntry: any = {
        txnNumber: 'TXN-CONTRA-1',
        type: 'CONTRA',
        mode: 'CONTRA',
        amount: 3000,
        date: '28/10/2026',
      };

      const msg = buildPaymentVoucherWhatsAppMessage(contraEntry, mockCustomer, mockCompany, null, {
        fromAccountName: 'Cash in Hand',
        toAccountName: 'HDFC Current A/C',
        isContra: true,
      });

      expect(msg).toContain('Cash / Bank Transfer - Acme Traders');
      expect(msg).toContain('*From:* Cash in Hand');
      expect(msg).toContain('*To:* HDFC Current A/C');
      expect(msg).not.toContain('Total Balance Due');
    });

    it('formats accounting voucher receipts correctly', () => {
      const voucher: Voucher = {
        id: 'V-1',
        voucherNumber: 'V-2026-001',
        voucherType: 'RECEIPT',
        date: '2026-10-28',
        totalAmount: 5000,
        narration: 'Settlement for invoice',
        entries: [],
        createdAt: '2026-10-28T00:00:00Z',
      };

      const msg = buildPaymentVoucherWhatsAppMessage(voucher, mockCustomer, mockCompany);
      expect(msg).toContain('Voucher Receipt - Acme Traders');
      expect(msg).toContain('*Voucher No:* V-2026-001');
      expect(msg).toContain('*Type:* RECEIPT');
      expect(msg).toContain('*Date:* 2026-10-28');
      expect(msg).toContain('*Amount:* ₹ 5,000.00');
      expect(msg).toContain(`*Total Balance Due:* ${formatINR(12500)}`);
      expect(msg).toContain('*Narration:* Settlement for invoice');
    });

    it('omits Total Balance Due when party is null or has no balance due', () => {
      const voucher: Voucher = {
        id: 'V-2',
        voucherNumber: 'V-2026-002',
        voucherType: 'PAYMENT',
        date: '2026-10-28',
        totalAmount: 2000,
        narration: '',
        entries: [],
        createdAt: '2026-10-28T00:00:00Z',
      };

      const msg = buildPaymentVoucherWhatsAppMessage(voucher, null, mockCompany);
      expect(msg).not.toContain('Total Balance Due');
    });
  });
});
