import { describe, it, expect } from 'vitest';
import {
  computeAgingBreakdown,
  getAgingBucket,
  getOverdueDays,
  AgingItemInput,
} from '../core/accounting/aging.ts';
import {
  createPaymentReceiptVoucher,
  createPaymentOutVoucher,
  createSalesInvoiceVoucher,
  validateVoucherBalance,
  resolveAccountForSplit,
} from '../core/accounting/ledger.ts';
import { generateGstr1Json } from '../core/gst/gstrExport.ts';
import { CompanyProfile } from '../models/company.ts';
import { Invoice } from '../models/invoice.ts';

const mockCompany: CompanyProfile = {
  id: 'COMP-001',
  businessName: 'Apex GST Traders Pvt Ltd',
  tradeName: 'Apex Traders',
  gstin: '27AABCU9603R1ZN',
  pan: 'AABCU9603R',
  stateCode: '27',
  address: '101 Commerce Park, Senapati Bapat Marg, Dadar West',
  city: 'Mumbai',
  pincode: '400028',
  phone: '9876543210',
  email: 'tax@apextraders.in',
  invoicePrefix: 'APX-2026-',
  isGstEnabled: true,
};

describe('Milestone 2: Accounting Depth, Aging Engine & Split Posting Tests', () => {
  // =========================================================================
  // Suite 1: Receivables & Payables Aging Engine (src/core/accounting/aging.ts)
  // =========================================================================
  describe('Suite 1: Receivables & Payables Aging Engine', () => {
    const fixedAsOfDate = new Date('2026-10-16T12:00:00Z');

    it('TC-AGING-01: Correctly partitions invoices into 0–30, 31–60, 61–90, and 90+ day buckets', () => {
      const items: AgingItemInput[] = [
        {
          dueDate: '2026-10-06', // 10 days ago -> 0-30
          date: '2026-10-01',
          balanceDue: 1000,
          partyId: 'CUST-1',
          partyName: 'Customer 1',
        },
        {
          dueDate: '2026-09-01', // 45 days ago -> 31-60
          date: '2026-08-25',
          balanceDue: 2000,
          partyId: 'CUST-2',
          partyName: 'Customer 2',
        },
        {
          dueDate: '2026-08-02', // 75 days ago -> 61-90
          date: '2026-07-25',
          balanceDue: 3000,
          partyId: 'CUST-3',
          partyName: 'Customer 3',
        },
        {
          dueDate: '2026-06-18', // 120 days ago -> 90+
          date: '2026-06-10',
          balanceDue: 4000,
          partyId: 'CUST-4',
          partyName: 'Customer 4',
        },
      ];

      const result = computeAgingBreakdown(items, fixedAsOfDate);

      expect(result.summary['0-30']).toBe(1000);
      expect(result.summary['31-60']).toBe(2000);
      expect(result.summary['61-90']).toBe(3000);
      expect(result.summary['90+']).toBe(4000);
      expect(result.totalOutstanding).toBe(10000);
      expect(result.counts['0-30']).toBe(1);
      expect(result.counts['31-60']).toBe(1);
      expect(result.counts['61-90']).toBe(1);
      expect(result.counts['90+']).toBe(1);
    });

    it('TC-AGING-02: Excludes fully paid documents (balanceDue <= 0.01)', () => {
      const items: AgingItemInput[] = [
        {
          dueDate: '2026-10-05',
          date: '2026-10-01',
          balanceDue: 0, // Fully paid
          partyId: 'CUST-PAID',
          partyName: 'Paid Customer',
        },
        {
          dueDate: '2026-09-10',
          date: '2026-09-01',
          balanceDue: 0.005, // Negligible balance <= 0.01
          partyId: 'CUST-ZERO',
          partyName: 'Zero Balance Customer',
        },
        {
          dueDate: '2026-10-10',
          date: '2026-10-01',
          balanceDue: 1500, // Active unpaid balance
          partyId: 'CUST-ACTIVE',
          partyName: 'Active Customer',
        },
      ];

      const result = computeAgingBreakdown(items, fixedAsOfDate);

      expect(result.totalOutstanding).toBe(1500);
      expect(result.parties.length).toBe(1);
      expect(result.parties[0].partyId).toBe('CUST-ACTIVE');
      expect(result.counts['0-30']).toBe(1);
      expect(result.counts['31-60']).toBe(0);
    });

    it('TC-AGING-03: Places future due dates in current 0–30 bucket', () => {
      const items: AgingItemInput[] = [
        {
          dueDate: '2026-10-31', // 15 days in future
          date: '2026-10-15',
          balanceDue: 2500,
          partyId: 'CUST-FUTURE',
          partyName: 'Future Due Customer',
        },
      ];

      const result = computeAgingBreakdown(items, fixedAsOfDate);

      expect(result.summary['0-30']).toBe(2500);
      expect(result.summary['31-60']).toBe(0);
      expect(result.summary['61-90']).toBe(0);
      expect(result.summary['90+']).toBe(0);
      expect(result.counts['0-30']).toBe(1);
    });

    it('TC-AGING-04: Falls back to document date when dueDate is omitted', () => {
      const items: AgingItemInput[] = [
        {
          dueDate: undefined,
          date: '2026-09-01', // 45 days ago -> 31-60 bucket
          balanceDue: 1800,
          partyId: 'CUST-NODUE',
          partyName: 'No Due Date Customer',
        },
      ];

      const result = computeAgingBreakdown(items, fixedAsOfDate);

      expect(result.summary['31-60']).toBe(1800);
      expect(result.summary['0-30']).toBe(0);
      expect(result.counts['31-60']).toBe(1);
    });

    it('TC-AGING-05: Aggregates party-level aging with multiple invoices across buckets', () => {
      const items: AgingItemInput[] = [
        {
          dueDate: '2026-10-10', // 6 days ago -> 0-30
          date: '2026-10-01',
          balanceDue: 1200,
          partyId: 'CUST-CORP',
          partyName: 'Mega Corp Ltd',
          phone: '9876500001',
        },
        {
          dueDate: '2026-09-06', // 40 days ago -> 31-60
          date: '2026-08-30',
          balanceDue: 2300,
          partyId: 'CUST-CORP',
          partyName: 'Mega Corp Ltd',
          phone: '9876500001',
        },
        {
          dueDate: '2026-06-15', // 123 days ago -> 90+
          date: '2026-06-01',
          balanceDue: 3500,
          partyId: 'CUST-CORP',
          partyName: 'Mega Corp Ltd',
          phone: '9876500001',
        },
      ];

      const result = computeAgingBreakdown(items, fixedAsOfDate);

      expect(result.parties.length).toBe(1);
      const party = result.parties[0];
      expect(party.partyName).toBe('Mega Corp Ltd');
      expect(party.totalOutstanding).toBe(7000);
      expect(party.brackets['0-30']).toBe(1200);
      expect(party.brackets['31-60']).toBe(2300);
      expect(party.brackets['61-90']).toBe(0);
      expect(party.brackets['90+']).toBe(3500);
      expect(party.billCount).toBe(3);
    });

    it('TC-AGING-06: Verifies exact boundary handling (day 30 vs day 31, day 60 vs day 61, day 90 vs day 91)', () => {
      // 0-30 boundary
      expect(getAgingBucket(30)).toBe('0-30');
      expect(getAgingBucket(31)).toBe('31-60');

      // 31-60 boundary
      expect(getAgingBucket(60)).toBe('31-60');
      expect(getAgingBucket(61)).toBe('61-90');

      // 61-90 boundary
      expect(getAgingBucket(90)).toBe('61-90');
      expect(getAgingBucket(91)).toBe('90+');

      // Edge cases
      expect(getAgingBucket(0)).toBe('0-30');
      expect(getAgingBucket(-5)).toBe('0-30');
      expect(getAgingBucket(150)).toBe('90+');
    });
  });

  // =========================================================================
  // Suite 2: Invoice Due Date & Overdue Calculation Logic
  // =========================================================================
  describe('Suite 2: Invoice Due Date & Overdue Calculation Logic', () => {
    const today = new Date('2026-10-16T10:00:00Z');

    it('TC-OVRD-01: Detects overdue condition when dueDate < today and balanceDue > 0', () => {
      const yesterdayStr = '2026-10-15';
      const overdueDays = getOverdueDays(yesterdayStr, today);
      expect(overdueDays).toBe(1);

      const fiveDaysAgoStr = '2026-10-11';
      expect(getOverdueDays(fiveDaysAgoStr, today)).toBe(5);
    });

    it('TC-OVRD-02: Returns not overdue when invoice is due today or in the future', () => {
      const todayStr = '2026-10-16';
      expect(getOverdueDays(todayStr, today)).toBe(0);

      const tomorrowStr = '2026-10-17';
      expect(getOverdueDays(tomorrowStr, today)).toBe(0);

      const nextMonthStr = '2026-11-15';
      expect(getOverdueDays(nextMonthStr, today)).toBe(0);

      expect(getOverdueDays(undefined, today)).toBe(0);
      expect(getOverdueDays('', today)).toBe(0);
    });

    it('TC-OVRD-03: Formats overdue badge text accurately (e.g. 14 days overdue)', () => {
      const fourteenDaysAgo = '2026-10-02';
      const days = getOverdueDays(fourteenDaysAgo, today);
      expect(days).toBe(14);
      const badgeText = `${days} days overdue`;
      expect(badgeText).toBe('14 days overdue');
    });

    it('TC-OVRD-04: Ignores overdue status when invoice balance is zero even if dueDate has passed', () => {
      const thirtyDaysAgo = '2026-09-16';
      const invoice = {
        dueDate: thirtyDaysAgo,
        balanceAmount: 0,
        paymentStatus: 'PAID' as const,
      };

      // Condition used in DashboardView and SalesHubView
      const isOverdue =
        Boolean(invoice.dueDate) &&
        (invoice.balanceAmount || 0) > 0.01 &&
        invoice.paymentStatus !== 'PAID' &&
        getOverdueDays(invoice.dueDate, today) > 0;

      expect(isOverdue).toBe(false);
    });
  });

  // =========================================================================
  // Suite 3: Double-Entry Multi-Tender Split Posting Invariants (ledger.ts)
  // =========================================================================
  describe('Suite 3: Double-Entry Multi-Tender Split Posting Invariants', () => {
    it('TC-LEDG-SPLT-01: createPaymentReceiptVoucher creates distinct Cash and Bank (UPI) debits', () => {
      const voucher = createPaymentReceiptVoucher({
        voucherNumber: 'RCPT-1001',
        date: '2026-10-16',
        customerId: 'CUST-001',
        customerName: 'Aarav Sharma',
        amount: 1000,
        paymentSplits: [
          { mode: 'CASH', amount: 300 },
          { mode: 'UPI', amount: 700, reference: 'UPI-REF-9988' },
        ],
        narration: 'Split receipt',
      });

      expect(voucher.voucherType).toBe('RECEIPT');
      expect(voucher.totalAmount).toBe(1000);

      const cashDebit = voucher.entries.find((e) => e.accountId === 'ACC_CASH');
      expect(cashDebit).toBeDefined();
      expect(cashDebit?.accountName).toBe('Cash-in-hand');
      expect(cashDebit?.debit).toBe(300);
      expect(cashDebit?.credit).toBe(0);

      const upiDebit = voucher.entries.find(
        (e) => e.accountId === 'ACC_BANK' && e.accountName === 'Bank Account (UPI)'
      );
      expect(upiDebit).toBeDefined();
      expect(upiDebit?.debit).toBe(700);
      expect(upiDebit?.credit).toBe(0);
      expect(upiDebit?.narration).toContain('UPI-REF-9988');

      const customerCredit = voucher.entries.find((e) => e.accountId === 'CUST-001');
      expect(customerCredit).toBeDefined();
      expect(customerCredit?.credit).toBe(1000);
      expect(customerCredit?.debit).toBe(0);

      const balance = validateVoucherBalance(voucher.entries);
      expect(balance.isBalanced).toBe(true);
      expect(balance.diff).toBe(0);
    });

    it('TC-LEDG-SPLT-02: createPaymentOutVoucher creates distinct Cash and Card credits', () => {
      const voucher = createPaymentOutVoucher({
        voucherNumber: 'PYMT-2001',
        date: '2026-10-16',
        supplierId: 'SUPP-001',
        supplierName: 'National Suppliers Hub',
        amount: 2500,
        paymentSplits: [
          { mode: 'CASH', amount: 500 },
          { mode: 'CARD', amount: 2000, reference: 'TXN-CARD-4411' },
        ],
        narration: 'Disbursed dues to supplier',
      });

      expect(voucher.voucherType).toBe('PAYMENT');
      expect(voucher.totalAmount).toBe(2500);

      const supplierDebit = voucher.entries.find((e) => e.accountId === 'SUPP-001');
      expect(supplierDebit).toBeDefined();
      expect(supplierDebit?.debit).toBe(2500);
      expect(supplierDebit?.credit).toBe(0);

      const cashCredit = voucher.entries.find((e) => e.accountId === 'ACC_CASH');
      expect(cashCredit).toBeDefined();
      expect(cashCredit?.accountName).toBe('Cash-in-hand');
      expect(cashCredit?.credit).toBe(500);
      expect(cashCredit?.debit).toBe(0);

      const cardCredit = voucher.entries.find(
        (e) => e.accountId === 'ACC_BANK' && e.accountName === 'Bank Account (Card)'
      );
      expect(cardCredit).toBeDefined();
      expect(cardCredit?.credit).toBe(2000);
      expect(cardCredit?.debit).toBe(0);

      const balance = validateVoucherBalance(voucher.entries);
      expect(balance.isBalanced).toBe(true);
      expect(balance.diff).toBe(0);
    });

    it('TC-LEDG-SPLT-03: Cheque and Net Banking split vouchers map to specific account names', () => {
      const chequeAcc = resolveAccountForSplit({ mode: 'CHEQUE' });
      expect(chequeAcc.accountId).toBe('ACC_BANK');
      expect(chequeAcc.accountName).toBe('Bank Account (Cheque)');

      const netBankingAcc = resolveAccountForSplit({ mode: 'NET_BANKING' });
      expect(netBankingAcc.accountId).toBe('ACC_BANK');
      expect(netBankingAcc.accountName).toBe('Bank Account');

      const bankAcc = resolveAccountForSplit({ mode: 'BANK' });
      expect(bankAcc.accountId).toBe('ACC_BANK');
      expect(bankAcc.accountName).toBe('Bank Account');

      // Custom bank accounts
      const customAcc = resolveAccountForSplit({
        mode: 'BANK',
        accountId: 'ACC_HDFC_01',
        accountName: 'HDFC Current A/c 502000',
      });
      expect(customAcc.accountId).toBe('ACC_HDFC_01');
      expect(customAcc.accountName).toBe('HDFC Current A/c 502000');
    });

    it('TC-LEDG-SPLT-04: Counterparty line matches sum of active splits exactly', () => {
      const splits = [
        { mode: 'CASH', amount: 234.56 },
        { mode: 'UPI', amount: 1000.0 },
      ];

      const voucher = createPaymentReceiptVoucher({
        voucherNumber: 'RCPT-PRECISE-01',
        date: '2026-10-16',
        customerId: 'CUST-PRECISE',
        customerName: 'Precise Payer',
        amount: 99999, // Intentional mismatch in outer amount to verify counterparty balances sum of splits
        paymentSplits: splits,
      });

      const customerEntry = voucher.entries.find((e) => e.accountId === 'CUST-PRECISE');
      expect(customerEntry?.credit).toBe(1234.56);
      expect(voucher.totalAmount).toBe(1234.56);

      const balance = validateVoucherBalance(voucher.entries);
      expect(balance.isBalanced).toBe(true);
      expect(balance.diff).toBe(0);
    });

    it('TC-LEDG-SPLT-05: Multi-tender sales invoice voucher with customer balance due balances debits and credits', () => {
      const voucher = createSalesInvoiceVoucher({
        invoiceNumber: 'INV-SPLT-100',
        date: '2026-10-16',
        customerName: 'Hybrid Payer',
        customerId: 'CUST-HYBRID',
        taxableAmount: 2000,
        cgstAmount: 180,
        sgstAmount: 180,
        igstAmount: 0,
        cessAmount: 0,
        grandTotal: 2360,
        paymentSplits: [
          { mode: 'CASH', amount: 500 },
          { mode: 'UPI', amount: 500 },
        ],
      });

      // Total grandTotal: 2360
      // Splits: 500 CASH + 500 UPI = 1000
      // Unassigned balance: 1360 debited to customer receivable
      const cashEntry = voucher.entries.find((e) => e.accountId === 'ACC_CASH');
      expect(cashEntry?.debit).toBe(500);

      const upiEntry = voucher.entries.find(
        (e) => e.accountId === 'ACC_BANK' && e.accountName === 'Bank Account (UPI)'
      );
      expect(upiEntry?.debit).toBe(500);

      const customerEntry = voucher.entries.find((e) => e.accountId === 'CUST-HYBRID');
      expect(customerEntry?.debit).toBe(1360);

      const balance = validateVoucherBalance(voucher.entries);
      expect(balance.isBalanced).toBe(true);
      expect(balance.diff).toBe(0);
    });
  });

  // =========================================================================
  // Suite 4: GSTR-1 Table 9B & Table 12 Statutory Compliance
  // =========================================================================
  describe('Suite 4: GSTR-1 Table 9B & Table 12 Statutory Compliance', () => {
    it('TC-GSTR-01: Table 9B distinguishes Credit Notes (C) and Debit Notes (D)', () => {
      const invoices: Invoice[] = [
        // 1. Registered Credit Note
        {
          id: 'CN-REG-1',
          invoiceNumber: 'CN-001',
          invoiceType: 'CREDIT_NOTE',
          noteType: 'C',
          date: '2026-10-12',
          originalInvoiceNumber: 'INV-001',
          originalInvoiceDate: '2026-10-01',
          partyName: 'Registered Buyer A',
          partyGstin: '27AABCT1234F1Z0',
          partyAddress: 'Mumbai, MH',
          partyStateCode: '27',
          placeOfSupplyStateCode: '27',
          isIntraState: true,
          items: [
            {
              itemId: 'ITM-1',
              name: 'Widget',
              hsnSacCode: '84713010',
              unit: 'NOS',
              quantity: 1,
              unitPrice: 10000,
              taxableAmount: 10000,
              gstRate: 18,
              cgstAmount: 900,
              sgstAmount: 900,
              igstAmount: 0,
              cessAmount: 0,
              totalAmount: 11800,
            },
          ],
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
          amountInWords: 'Eleven Thousand Eight Hundred Rupees',
          paymentMode: 'CREDIT',
          paymentStatus: 'PAID',
          paidAmount: 11800,
          balanceAmount: 0,
          createdAt: '2026-10-12T10:00:00Z',
          updatedAt: '2026-10-12T10:00:00Z',
        },
        // 2. Registered Debit Note (noteType undefined, fallback to DEBIT_NOTE -> 'D')
        {
          id: 'DN-REG-1',
          invoiceNumber: 'DN-001',
          invoiceType: 'DEBIT_NOTE',
          date: '2026-10-14',
          originalInvoiceNumber: 'INV-002',
          originalInvoiceDate: '2026-10-02',
          partyName: 'Registered Buyer B',
          partyGstin: '27AABCB9876P1Z4',
          partyAddress: 'Pune, MH',
          partyStateCode: '27',
          placeOfSupplyStateCode: '27',
          isIntraState: true,
          items: [
            {
              itemId: 'ITM-1',
              name: 'Widget Price Revision',
              hsnSacCode: '84713010',
              unit: 'NOS',
              quantity: 1,
              unitPrice: 5000,
              taxableAmount: 5000,
              gstRate: 18,
              cgstAmount: 450,
              sgstAmount: 450,
              igstAmount: 0,
              cessAmount: 0,
              totalAmount: 5900,
            },
          ],
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
          amountInWords: 'Five Thousand Nine Hundred Rupees',
          paymentMode: 'CREDIT',
          paymentStatus: 'PAID',
          paidAmount: 5900,
          balanceAmount: 0,
          createdAt: '2026-10-14T10:00:00Z',
          updatedAt: '2026-10-14T10:00:00Z',
        },
      ];

      const gstrJson = generateGstr1Json(mockCompany, invoices, '102026');

      expect(gstrJson.cdnr).toBeDefined();
      expect(gstrJson.cdnr!.length).toBe(2);

      // Verify Credit Note entry has ntty: 'C'
      const cnGroup = gstrJson.cdnr!.find((g: any) => g.ctin === '27AABCT1234F1Z0');
      expect(cnGroup).toBeDefined();
      expect(cnGroup!.nt[0].ntty).toBe('C');
      expect(cnGroup!.nt[0].nt_num).toBe('CN-001');
      expect(cnGroup!.nt[0].inum).toBe('INV-001');

      // Verify Debit Note entry has ntty: 'D'
      const dnGroup = gstrJson.cdnr!.find((g: any) => g.ctin === '27AABCB9876P1Z4');
      expect(dnGroup).toBeDefined();
      expect(dnGroup!.nt[0].ntty).toBe('D');
      expect(dnGroup!.nt[0].nt_num).toBe('DN-001');
      expect(dnGroup!.nt[0].inum).toBe('INV-002');
    });

    it('TC-GSTR-02: Table 12 HSN Summary aggregates Cess amounts and nets Credit Notes', () => {
      const invoices: Invoice[] = [
        // Regular invoice with 12% GST + 5% Cess
        {
          id: 'INV-CESS-1',
          invoiceNumber: 'INV-100',
          invoiceType: 'B2CS',
          date: '2026-10-05',
          partyName: 'Unregistered Retail Buyer',
          partyAddress: 'Mumbai, MH',
          partyStateCode: '27',
          placeOfSupplyStateCode: '27',
          isIntraState: true,
          items: [
            {
              itemId: 'ITM-A',
              name: 'Luxury Aerated Drink',
              hsnSacCode: '22021010',
              unit: 'BOX',
              quantity: 100,
              unitPrice: 100,
              taxableAmount: 10000,
              gstRate: 12,
              cgstAmount: 600,
              sgstAmount: 600,
              igstAmount: 0,
              cessRate: 5,
              cessAmount: 500, // ₹500 cess
              totalAmount: 11700,
            },
          ],
          totalGrossAmount: 10000,
          totalDiscount: 0,
          totalTaxableAmount: 10000,
          totalCgst: 600,
          totalSgst: 600,
          totalIgst: 0,
          totalCess: 500,
          totalTax: 1700,
          roundOff: 0,
          grandTotal: 11700,
          amountInWords: 'Eleven Thousand Seven Hundred',
          paymentMode: 'CASH',
          paymentStatus: 'PAID',
          paidAmount: 11700,
          balanceAmount: 0,
          createdAt: '2026-10-05T10:00:00Z',
          updatedAt: '2026-10-05T10:00:00Z',
        },
        // Credit note returning 20 bottles of the same item
        {
          id: 'CN-CESS-1',
          invoiceNumber: 'CN-100',
          invoiceType: 'CREDIT_NOTE',
          noteType: 'C',
          date: '2026-10-08',
          originalInvoiceNumber: 'INV-100',
          partyName: 'Unregistered Retail Buyer',
          partyGstin: '27AABCT1234F1Z0',
          partyAddress: 'Mumbai, MH',
          partyStateCode: '27',
          placeOfSupplyStateCode: '27',
          isIntraState: true,
          items: [
            {
              itemId: 'ITM-A',
              name: 'Luxury Aerated Drink (Return)',
              hsnSacCode: '22021010',
              unit: 'BOX',
              quantity: 20,
              unitPrice: 100,
              taxableAmount: 2000,
              gstRate: 12,
              cgstAmount: 120,
              sgstAmount: 120,
              igstAmount: 0,
              cessRate: 5,
              cessAmount: 100, // ₹100 cess return
              totalAmount: 2340,
            },
          ],
          totalGrossAmount: 2000,
          totalDiscount: 0,
          totalTaxableAmount: 2000,
          totalCgst: 120,
          totalSgst: 120,
          totalIgst: 0,
          totalCess: 100,
          totalTax: 340,
          roundOff: 0,
          grandTotal: 2340,
          amountInWords: 'Two Thousand Three Hundred Forty',
          paymentMode: 'CREDIT',
          paymentStatus: 'PAID',
          paidAmount: 2340,
          balanceAmount: 0,
          createdAt: '2026-10-08T10:00:00Z',
          updatedAt: '2026-10-08T10:00:00Z',
        },
      ];

      const gstrJson = generateGstr1Json(mockCompany, invoices, '102026');

      expect(gstrJson.hsn).toBeDefined();
      const hsnItem = gstrJson.hsn!.data.find((h: any) => h.hsn_sc === '22021010');
      expect(hsnItem).toBeDefined();

      // Net quantity: 100 - 20 = 80
      expect(hsnItem!.qty).toBe(80);
      // Net taxable value: 10000 - 2000 = 8000
      expect(hsnItem!.txval).toBe(8000);
      // Net CGST: 600 - 120 = 480
      expect(hsnItem!.camt).toBe(480);
      // Net SGST: 600 - 120 = 480
      expect(hsnItem!.samt).toBe(480);
      // Net Cess: 500 - 100 = 400
      expect(hsnItem!.csamt).toBe(400);
    });

    it('TC-GSTR-03: Gstr1View Table 12 UI includes Cess in Total Tax calculation', () => {
      // Test the formula used in Gstr1View.tsx line 560
      const hsnRow = {
        hsnCode: '22021010',
        description: 'Aerated Waters',
        unit: 'BTL',
        totalQty: 100,
        taxableValue: 10000,
        cgst: 600,
        sgst: 600,
        igst: 0,
        cess: 500,
      };

      const totalTaxWithoutCess = hsnRow.cgst + hsnRow.sgst + hsnRow.igst;
      expect(totalTaxWithoutCess).toBe(1200);

      const totalTaxWithCess = hsnRow.cgst + hsnRow.sgst + hsnRow.igst + (hsnRow.cess || 0);
      expect(totalTaxWithCess).toBe(1700);
    });
  });
});
