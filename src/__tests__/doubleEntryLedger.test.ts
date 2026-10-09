import { describe, it, expect } from 'vitest';
import {
  validateVoucherBalance,
  createSalesInvoiceVoucher,
  createPurchaseInvoiceVoucher,
  createPaymentReceiptVoucher,
  createPaymentOutVoucher,
} from '@/core/accounting/ledger';

describe('Suite 3: Double-Entry Vouchers & Balancing', () => {
  it('TC-LEDG-01: validateVoucherBalance returns { isBalanced: true, diff: 0 } when debits equal credits', () => {
    const res = validateVoucherBalance([
      { accountId: 'ACC_CASH', accountName: 'Cash', debit: 1180, credit: 0 },
      { accountId: 'ACC_SALES', accountName: 'Sales', debit: 0, credit: 1000 },
      { accountId: 'ACC_OUTPUT_CGST', accountName: 'CGST', debit: 0, credit: 90 },
      { accountId: 'ACC_OUTPUT_SGST', accountName: 'SGST', debit: 0, credit: 90 },
    ]);
    expect(res.isBalanced).toBe(true);
    expect(res.diff).toBe(0);
  });

  it('TC-LEDG-02: validateVoucherBalance returns { isBalanced: false, diff: > 0 } when debits do not equal credits', () => {
    const res = validateVoucherBalance([
      { accountId: 'ACC_CASH', accountName: 'Cash', debit: 1000, credit: 0 },
      { accountId: 'ACC_SALES', accountName: 'Sales', debit: 0, credit: 1100 },
    ]);
    expect(res.isBalanced).toBe(false);
    expect(res.diff).toBe(100);
  });

  it('TC-LEDG-03: Cash sales invoice voucher debits ACC_CASH and credits ACC_SALES + Output tax accounts', () => {
    const voucher = createSalesInvoiceVoucher({
      invoiceNumber: 'INV-101',
      date: '2026-10-01',
      customerName: 'Cash Customer',
      customerId: 'CUST-001',
      taxableAmount: 2000,
      cgstAmount: 180,
      sgstAmount: 180,
      igstAmount: 0,
      cessAmount: 0,
      grandTotal: 2360,
      isCashSale: true,
    });
    expect(voucher.voucherType).toBe('SALES');
    const cashEntry = voucher.entries.find((e) => e.accountId === 'ACC_CASH');
    expect(cashEntry).toBeDefined();
    expect(cashEntry?.debit).toBe(2360);
    expect(voucher.entries.find((e) => e.accountId === 'ACC_SALES')?.credit).toBe(2000);
    const balance = validateVoucherBalance(voucher.entries);
    expect(balance.isBalanced).toBe(true);
  });

  it('TC-LEDG-04: Credit sales invoice voucher debits customer ledger and credits ACC_SALES + Output tax accounts', () => {
    const voucher = createSalesInvoiceVoucher({
      invoiceNumber: 'INV-102',
      date: '2026-10-01',
      customerName: 'Acme Traders',
      customerId: 'CUST-ACME',
      taxableAmount: 5000,
      cgstAmount: 450,
      sgstAmount: 450,
      igstAmount: 0,
      cessAmount: 0,
      grandTotal: 5900,
      isCashSale: false,
    });
    const debtorEntry = voucher.entries.find((e) => e.accountId === 'CUST-ACME');
    expect(debtorEntry).toBeDefined();
    expect(debtorEntry?.debit).toBe(5900);
    const balance = validateVoucherBalance(voucher.entries);
    expect(balance.isBalanced).toBe(true);
  });

  it('TC-LEDG-05: Intra-state sales voucher credits both ACC_OUTPUT_CGST and ACC_OUTPUT_SGST', () => {
    const voucher = createSalesInvoiceVoucher({
      invoiceNumber: 'INV-103',
      date: '2026-10-01',
      customerName: 'Local Buyer',
      customerId: 'CUST-LOC',
      taxableAmount: 1000,
      cgstAmount: 90,
      sgstAmount: 90,
      igstAmount: 0,
      cessAmount: 0,
      grandTotal: 1180,
      isCashSale: true,
    });
    expect(voucher.entries.find((e) => e.accountId === 'ACC_OUTPUT_CGST')?.credit).toBe(90);
    expect(voucher.entries.find((e) => e.accountId === 'ACC_OUTPUT_SGST')?.credit).toBe(90);
    expect(voucher.entries.find((e) => e.accountId === 'ACC_OUTPUT_IGST')).toBeUndefined();
    expect(validateVoucherBalance(voucher.entries).isBalanced).toBe(true);
  });

  it('TC-LEDG-06: Inter-state sales voucher credits ACC_OUTPUT_IGST with zero CGST/SGST entries', () => {
    const voucher = createSalesInvoiceVoucher({
      invoiceNumber: 'INV-104',
      date: '2026-10-01',
      customerName: 'Interstate Buyer',
      customerId: 'CUST-INT',
      taxableAmount: 1000,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 180,
      cessAmount: 0,
      grandTotal: 1180,
      isCashSale: true,
    });
    expect(voucher.entries.find((e) => e.accountId === 'ACC_OUTPUT_IGST')?.credit).toBe(180);
    expect(voucher.entries.find((e) => e.accountId === 'ACC_OUTPUT_CGST')).toBeUndefined();
    expect(voucher.entries.find((e) => e.accountId === 'ACC_OUTPUT_SGST')).toBeUndefined();
    expect(validateVoucherBalance(voucher.entries).isBalanced).toBe(true);
  });

  it('TC-LEDG-07: Sales voucher with cess credits ACC_OUTPUT_CESS', () => {
    const voucher = createSalesInvoiceVoucher({
      invoiceNumber: 'INV-105',
      date: '2026-10-01',
      customerName: 'Cess Buyer',
      customerId: 'CUST-CESS',
      taxableAmount: 10000,
      cgstAmount: 1400,
      sgstAmount: 1400,
      igstAmount: 0,
      cessAmount: 1200,
      grandTotal: 14000,
      isCashSale: true,
    });
    expect(voucher.entries.find((e) => e.accountId === 'ACC_OUTPUT_CESS')?.credit).toBe(1200);
    expect(validateVoucherBalance(voucher.entries).isBalanced).toBe(true);
  });

  it('TC-LEDG-08: Sales voucher with round-off balances debits and credits via ACC_ROUND_OFF', () => {
    // Net: 1179.60, Grand Total: 1180.00, roundOff: +0.40
    const voucherPlus = createSalesInvoiceVoucher({
      invoiceNumber: 'INV-106A',
      date: '2026-10-01',
      customerName: 'Rounding Buyer',
      customerId: 'CUST-RND',
      taxableAmount: 1000,
      cgstAmount: 89.80,
      sgstAmount: 89.80,
      igstAmount: 0,
      cessAmount: 0,
      grandTotal: 1180,
      isCashSale: true,
      roundOff: 0.40,
    });
    const roundOffCredit = voucherPlus.entries.find((e) => e.accountId === 'ACC_ROUND_OFF');
    expect(roundOffCredit).toBeDefined();
    expect(roundOffCredit?.credit).toBe(0.40);
    expect(validateVoucherBalance(voucherPlus.entries).isBalanced).toBe(true);

    // Net: 1180.40, Grand Total: 1180.00, roundOff: -0.40
    const voucherMinus = createSalesInvoiceVoucher({
      invoiceNumber: 'INV-106B',
      date: '2026-10-01',
      customerName: 'Rounding Buyer',
      customerId: 'CUST-RND',
      taxableAmount: 1000,
      cgstAmount: 90.20,
      sgstAmount: 90.20,
      igstAmount: 0,
      cessAmount: 0,
      grandTotal: 1180,
      isCashSale: true,
      roundOff: -0.40,
    });
    const roundOffDebit = voucherMinus.entries.find((e) => e.accountId === 'ACC_ROUND_OFF');
    expect(roundOffDebit).toBeDefined();
    expect(roundOffDebit?.debit).toBe(0.40);
    expect(validateVoucherBalance(voucherMinus.entries).isBalanced).toBe(true);
  });

  it('TC-LEDG-09: Multi-tender split payment sales voucher debits Cash + Bank + Customer credit proportionately', () => {
    const voucher = createSalesInvoiceVoucher({
      invoiceNumber: 'INV-107',
      date: '2026-10-01',
      customerName: 'Split Customer',
      customerId: 'CUST-SPLIT',
      taxableAmount: 1000,
      cgstAmount: 90,
      sgstAmount: 90,
      igstAmount: 0,
      cessAmount: 0,
      grandTotal: 1180,
      isCashSale: false,
      paymentSplits: [
        { mode: 'CASH', amount: 500 },
        { mode: 'BANK', amount: 500 },
        { mode: 'CREDIT', amount: 180 },
      ],
    });
    expect(voucher.entries.find((e) => e.accountId === 'ACC_CASH')?.debit).toBe(500);
    expect(voucher.entries.find((e) => e.accountId === 'ACC_BANK')?.debit).toBe(500);
    expect(voucher.entries.find((e) => e.accountId === 'CUST-SPLIT')?.debit).toBe(180);
    expect(validateVoucherBalance(voucher.entries).isBalanced).toBe(true);
  });

  it('TC-LEDG-10: Cash purchase bill voucher debits ACC_PURCHASE + Input tax accounts and credits ACC_CASH', () => {
    const voucher = createPurchaseInvoiceVoucher({
      billNumber: 'BILL-001',
      date: '2026-10-01',
      supplierName: 'Hardware Store',
      supplierId: 'SUP-001',
      taxableAmount: 3000,
      cgstAmount: 270,
      sgstAmount: 270,
      igstAmount: 0,
      cessAmount: 0,
      grandTotal: 3540,
      isCashPurchase: true,
    });
    expect(voucher.voucherType).toBe('PURCHASE');
    expect(voucher.entries.find((e) => e.accountId === 'ACC_PURCHASE')?.debit).toBe(3000);
    expect(voucher.entries.find((e) => e.accountId === 'ACC_CASH')?.credit).toBe(3540);
    expect(validateVoucherBalance(voucher.entries).isBalanced).toBe(true);
  });

  it('TC-LEDG-11: Credit purchase bill voucher debits ACC_PURCHASE + Input tax accounts and credits supplier ledger', () => {
    const voucher = createPurchaseInvoiceVoucher({
      billNumber: 'BILL-002',
      date: '2026-10-01',
      supplierName: 'Wholesale Supplier',
      supplierId: 'SUP-WHOLE',
      taxableAmount: 10000,
      cgstAmount: 900,
      sgstAmount: 900,
      igstAmount: 0,
      cessAmount: 0,
      grandTotal: 11800,
      isCashPurchase: false,
    });
    expect(voucher.entries.find((e) => e.accountId === 'SUP-WHOLE')?.credit).toBe(11800);
    expect(validateVoucherBalance(voucher.entries).isBalanced).toBe(true);
  });

  it('TC-LEDG-12: Purchase voucher with input CGST and SGST debits both input tax asset accounts', () => {
    const voucher = createPurchaseInvoiceVoucher({
      billNumber: 'BILL-003',
      date: '2026-10-01',
      supplierName: 'Tech Distro',
      supplierId: 'SUP-TECH',
      taxableAmount: 5000,
      cgstAmount: 450,
      sgstAmount: 450,
      igstAmount: 0,
      cessAmount: 0,
      grandTotal: 5900,
      isCashPurchase: true,
    });
    expect(voucher.entries.find((e) => e.accountId === 'ACC_INPUT_CGST')?.debit).toBe(450);
    expect(voucher.entries.find((e) => e.accountId === 'ACC_INPUT_SGST')?.debit).toBe(450);
    expect(validateVoucherBalance(voucher.entries).isBalanced).toBe(true);
  });

  it('TC-LEDG-13: Payment receipt voucher debits ACC_CASH / ACC_BANK and credits customer ledger', () => {
    const voucher = createPaymentReceiptVoucher({
      receiptNumber: 'RCPT-001',
      date: '2026-10-01',
      customerName: 'Customer A',
      customerId: 'CUST-A',
      amount: 1500,
      paymentMode: 'CASH',
    });
    expect(voucher.voucherType).toBe('RECEIPT');
    expect(voucher.entries.find((e) => e.accountId === 'ACC_CASH')?.debit).toBe(1500);
    expect(voucher.entries.find((e) => e.accountId === 'CUST-A')?.credit).toBe(1500);
    expect(validateVoucherBalance(voucher.entries).isBalanced).toBe(true);
  });

  it('TC-LEDG-14: Payment receipt voucher with split tender debits multiple bank/cash accounts and balances', () => {
    const voucher = createPaymentReceiptVoucher({
      receiptNumber: 'RCPT-002',
      date: '2026-10-01',
      customerName: 'Customer B',
      customerId: 'CUST-B',
      amount: 2000,
      paymentMode: 'SPLIT',
      paymentSplits: [
        { mode: 'CASH', amount: 800 },
        { mode: 'UPI', amount: 1200 },
      ],
    });
    expect(voucher.entries.find((e) => e.accountId === 'ACC_CASH')?.debit).toBe(800);
    expect(voucher.entries.find((e) => e.accountId === 'ACC_BANK')?.debit).toBe(1200);
    expect(voucher.entries.find((e) => e.accountId === 'CUST-B')?.credit).toBe(2000);
    expect(validateVoucherBalance(voucher.entries).isBalanced).toBe(true);
  });

  it('TC-LEDG-15: Payment out voucher debits supplier ledger and credits ACC_CASH / ACC_BANK', () => {
    const voucher = createPaymentOutVoucher({
      voucherNumber: 'PYMT-001',
      date: '2026-10-01',
      supplierName: 'Vendor X',
      supplierId: 'SUP-X',
      amount: 4000,
      paymentMode: 'BANK',
    });
    expect(voucher.voucherType).toBe('PAYMENT');
    expect(voucher.entries.find((e) => e.accountId === 'SUP-X')?.debit).toBe(4000);
    expect(voucher.entries.find((e) => e.accountId === 'ACC_BANK')?.credit).toBe(4000);
    expect(validateVoucherBalance(voucher.entries).isBalanced).toBe(true);
  });

  it('TC-LEDG-16: Payment out voucher with split tender credits multiple bank/cash accounts and balances', () => {
    const voucher = createPaymentOutVoucher({
      voucherNumber: 'PYMT-002',
      date: '2026-10-01',
      supplierName: 'Vendor Y',
      supplierId: 'SUP-Y',
      amount: 5000,
      paymentMode: 'SPLIT',
      paymentSplits: [
        { mode: 'CASH', amount: 2000 },
        { mode: 'NET_BANKING', amount: 3000 },
      ],
    });
    expect(voucher.entries.find((e) => e.accountId === 'SUP-Y')?.debit).toBe(5000);
    expect(voucher.entries.find((e) => e.accountId === 'ACC_CASH')?.credit).toBe(2000);
    expect(voucher.entries.find((e) => e.accountId === 'ACC_BANK')?.credit).toBe(3000);
    expect(validateVoucherBalance(voucher.entries).isBalanced).toBe(true);
  });
});
